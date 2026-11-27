use std::collections::BTreeSet;

use serde_json::Value;

use crate::message::{Message, decode_line, encode_call, encode_response};
use crate::{JsonRpcId, JsonRpcResponse, TransportError};

// The protocol can also be used by a JavaScript client, so keep generated IDs exact.
const MAX_REQUEST_ID: u64 = 9_007_199_254_740_991;

/// A request ID and its JSONL frame, ready to write to the child process.
#[derive(Debug, PartialEq, Eq)]
pub struct OutboundRequest {
    pub id: u64,
    pub line: String,
}

/// A server frame routed to its client-side consumer.
#[derive(Debug, PartialEq, Eq)]
pub enum ServerEvent {
    Response {
        id: u64,
        response: JsonRpcResponse,
    },
    Notification {
        method: String,
        params: Option<Value>,
    },
    Request {
        id: JsonRpcId,
        method: String,
        params: Option<Value>,
    },
}

/// Correlates JSONL messages for a connection supplied by the caller.
pub struct CodexTransport {
    /// Cleared when the caller closes the connection.
    pending: Option<BTreeSet<u64>>,
    next_request_id: u64,
}

impl CodexTransport {
    /// Creates an open connection with its own request IDs.
    pub fn new() -> Self {
        Self {
            pending: Some(BTreeSet::new()),
            next_request_id: 1,
        }
    }

    /// Registers a call before yielding the frame to the writer.
    pub fn request(
        &mut self,
        method: &str,
        params: Option<Value>,
    ) -> Result<OutboundRequest, TransportError> {
        let pending = self.pending.as_mut().ok_or(TransportError::Closed)?;
        let id = self.next_request_id;
        if id > MAX_REQUEST_ID {
            return Err(TransportError::RequestIdsExhausted);
        }
        self.next_request_id += 1;
        pending.insert(id);
        Ok(OutboundRequest {
            id,
            line: encode_call(Some(id), method, params),
        })
    }

    /// Formats a notification to send without registering a pending call.
    pub fn notify(&self, method: &str, params: Option<Value>) -> Result<String, TransportError> {
        self.require_open()?;
        Ok(encode_call(None, method, params))
    }

    /// Formats the reply to a server-initiated request, such as an approval.
    pub fn respond(
        &self,
        id: JsonRpcId,
        response: JsonRpcResponse,
    ) -> Result<String, TransportError> {
        self.require_open()?;
        Ok(encode_response(id, response))
    }

    /// Routes a decoded response once, leaving server calls independent of client IDs.
    pub fn receive_line(&mut self, line: &str) -> Result<Option<ServerEvent>, TransportError> {
        let pending = self.pending.as_mut().ok_or(TransportError::Closed)?;
        let event = match decode_line(line)? {
            Some(Message::Reply { id, response }) => {
                let Some(id) = pending_request_id(id) else {
                    return Ok(None);
                };
                if !pending.remove(&id) {
                    return Ok(None);
                }
                ServerEvent::Response { id, response }
            }
            Some(Message::Call {
                id: Some(id),
                method,
                params,
            }) => ServerEvent::Request { id, method, params },
            Some(Message::Call {
                id: None,
                method,
                params,
            }) => ServerEvent::Notification { method, params },
            None => return Ok(None),
        };
        Ok(Some(event))
    }

    /// Discards a call that the caller has timed out or failed to write.
    pub fn discard_request(&mut self, id: u64) -> bool {
        self.pending.as_mut().is_some_and(|ids| ids.remove(&id))
    }

    /// Closes the transport and returns the IDs whose callers must be rejected.
    pub fn close(&mut self) -> Vec<u64> {
        match self.pending.take() {
            Some(ids) => ids.into_iter().collect(),
            None => Vec::new(),
        }
    }

    /// Checks whether the connection can send more frames.
    fn require_open(&self) -> Result<(), TransportError> {
        match self.pending {
            Some(_) => Ok(()),
            None => Err(TransportError::Closed),
        }
    }
}

impl Default for CodexTransport {
    fn default() -> Self {
        Self::new()
    }
}

/// Matches integral JSON numbers by value, including decimal forms such as 1.0.
fn pending_request_id(id: JsonRpcId) -> Option<u64> {
    let JsonRpcId::Number(number) = id else {
        return None;
    };
    let value = number.as_f64()?;
    if !(1.0..=MAX_REQUEST_ID as f64).contains(&value) || value.fract() != 0.0 {
        return None;
    }
    Some(value as u64)
}
