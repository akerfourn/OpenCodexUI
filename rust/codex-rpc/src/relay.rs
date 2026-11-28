use std::collections::BTreeMap;
use std::time::Duration;

use crate::message::{Message, decode_line};
use crate::{CodexTransport, JsonRpcId, ServerEvent, TransportError};

/// The original client ID and expiry for a request sent to Codex.
struct PendingClientCall {
    client_id: JsonRpcId,
    expires_at: Duration,
}

/// Relays a single app-server connection while keeping each direction's IDs independent.
pub struct CodexRelay {
    transport: CodexTransport,
    pending: BTreeMap<u64, PendingClientCall>,
    request_timeout: Duration,
}

impl CodexRelay {
    /// Uses the client's request timeout to retire unanswered correlations.
    pub fn new(request_timeout: Duration) -> Self {
        Self::with_transport(CodexTransport::new(), request_timeout)
    }

    /// Continues an initialized connection with the same downstream request ID sequence.
    pub fn with_transport(transport: CodexTransport, request_timeout: Duration) -> Self {
        Self {
            transport,
            pending: BTreeMap::new(),
            request_timeout,
        }
    }

    /// Assigns an app-server ID to a client call and forwards other client frames verbatim.
    pub fn relay_client_line(
        &mut self,
        line: &str,
        elapsed: Duration,
    ) -> Result<Option<String>, TransportError> {
        self.expire_pending(elapsed);
        match decode_line(line)? {
            Some(Message::Call {
                id: Some(client_id),
                method,
                params,
            }) => {
                let request = self.transport.request(&method, params)?;
                self.pending.insert(
                    request.id,
                    PendingClientCall {
                        client_id,
                        expires_at: elapsed.saturating_add(self.request_timeout),
                    },
                );
                Ok(Some(request.line))
            }
            Some(_) => Ok(Some(terminated_line(line))),
            None => Ok(None),
        }
    }

    /// Restores client IDs and passes through server events and wire diagnostics.
    pub fn relay_server_line(
        &mut self,
        line: &str,
        elapsed: Duration,
    ) -> Result<Option<String>, TransportError> {
        self.expire_pending(elapsed);
        match self.transport.receive_line(line) {
            Ok(Some(ServerEvent::Response { id, response })) => {
                let Some(pending) = self.pending.remove(&id) else {
                    return Ok(None);
                };
                self.transport
                    .respond(pending.client_id, response)
                    .map(Some)
            }
            // Let the TypeScript client report malformed Codex lines through its existing diagnostics.
            Ok(Some(_))
            | Err(TransportError::InvalidJson(_) | TransportError::InvalidMessage(_)) => {
                Ok(Some(terminated_line(line)))
            }
            Ok(None) => Ok(None),
            Err(error) => Err(error),
        }
    }

    /// Releases correlations after the caller's deadline, including calls Codex never answers.
    fn expire_pending(&mut self, elapsed: Duration) {
        while let Some((&id, pending)) = self.pending.first_key_value() {
            if pending.expires_at > elapsed {
                break;
            }
            self.pending.pop_first();
            self.transport.discard_request(id);
        }
    }
}

/// Preserves a frame from the other endpoint and supplies its delimiter at EOF.
fn terminated_line(line: &str) -> String {
    let mut frame = line.to_owned();
    if !frame.ends_with('\n') {
        frame.push('\n');
    }
    frame
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    #[test]
    fn test_relay_should_restore_client_ids_when_responses_are_reordered() {
        let mut relay = CodexRelay::new(Duration::from_secs(1));
        let first = relay
            .relay_client_line(
                r#"{"id":"first","method":"thread/read","params":{"threadId":"t1"}}"#,
                Duration::ZERO,
            )
            .unwrap()
            .unwrap();
        let second = relay
            .relay_client_line(r#"{"id":42,"method":"model/list"}"#, Duration::ZERO)
            .unwrap()
            .unwrap();

        assert_eq!(
            value(&first),
            json!({
                "jsonrpc": "2.0", "id": 1, "method": "thread/read", "params": { "threadId": "t1" },
            })
        );
        assert_eq!(value(&second)["id"], 2);

        let model_reply = relay
            .relay_server_line(r#"{"id":2,"result":{"data":[]}}"#, Duration::ZERO)
            .unwrap()
            .unwrap();
        let thread_reply = relay.relay_server_line(
            r#"{"id":1,"error":{"code":-32042,"message":"Permission denied","data":{"reason":"policy"}}}"#,
            Duration::ZERO,
        ).unwrap().unwrap();

        assert_eq!(
            value(&model_reply),
            json!({
                "jsonrpc": "2.0", "id": 42, "result": { "data": [] },
            })
        );
        assert_eq!(
            value(&thread_reply),
            json!({
                "jsonrpc": "2.0", "id": "first",
                "error": { "code": -32042, "message": "Permission denied", "data": { "reason": "policy" } },
            })
        );
    }

    #[test]
    fn test_relay_should_preserve_reverse_request_ids_when_they_overlap_client_calls() {
        let mut relay = CodexRelay::new(Duration::from_secs(1));
        relay
            .relay_client_line(r#"{"id":"turn","method":"turn/start"}"#, Duration::ZERO)
            .unwrap();
        let approval = "{\"id\":1,\"method\":\"item/commandExecution/requestApproval\"}\n";
        let decision = "{\"id\":1,\"result\":{\"decision\":\"decline\"}}\n";

        assert_eq!(
            relay
                .relay_server_line(approval, Duration::ZERO)
                .unwrap()
                .as_deref(),
            Some(approval)
        );
        assert_eq!(
            relay
                .relay_client_line(decision, Duration::ZERO)
                .unwrap()
                .as_deref(),
            Some(decision)
        );

        let reply = relay
            .relay_server_line(r#"{"id":1,"result":{}}"#, Duration::ZERO)
            .unwrap()
            .unwrap();
        assert_eq!(value(&reply)["id"], "turn");
    }

    #[test]
    fn test_relay_should_retain_only_current_correlations_when_a_request_times_out() {
        let mut relay = CodexRelay::new(Duration::from_millis(100));
        relay
            .relay_client_line(r#"{"id":"expired","method":"thread/read"}"#, Duration::ZERO)
            .unwrap();
        relay
            .relay_client_line(
                r#"{"id":"current","method":"model/list"}"#,
                Duration::from_millis(20),
            )
            .unwrap();

        let at_deadline = Duration::from_millis(100);
        assert_eq!(
            relay
                .relay_server_line(r#"{"id":1,"result":{}}"#, at_deadline)
                .unwrap(),
            None
        );
        let reply = relay
            .relay_server_line(r#"{"id":2,"result":{}}"#, at_deadline)
            .unwrap()
            .unwrap();
        assert_eq!(value(&reply)["id"], "current");
    }

    #[test]
    fn test_relay_should_preserve_diagnostics_when_the_server_sends_a_malformed_line() {
        let mut relay = CodexRelay::new(Duration::from_secs(1));
        let invalid = "not JSON\n";

        assert_eq!(
            relay
                .relay_server_line(invalid, Duration::ZERO)
                .unwrap()
                .as_deref(),
            Some(invalid)
        );
    }

    /// Compares wire payloads with field order independent of serialization.
    fn value(frame: &str) -> Value {
        serde_json::from_str(frame).unwrap()
    }
}
