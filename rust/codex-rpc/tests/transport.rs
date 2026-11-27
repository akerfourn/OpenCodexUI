use codex_rpc::{CodexTransport, JsonRpcId, JsonRpcResponse, ServerEvent, TransportError};
use serde_json::{Value, json};

#[test]
fn test_transport_should_route_the_same_exchange_as_the_typescript_client() {
    let fixture = include_str!("../../../tests/fixtures/codex-rpc/parallel-exchange.jsonl");
    let mut lines = fixture.lines();
    let mut transport = CodexTransport::new();
    let initialization = transport.request("initialize", None).unwrap();
    assert_eq!(
        transport.receive_line(lines.next().unwrap()).unwrap(),
        Some(ServerEvent::Response {
            id: initialization.id,
            response: JsonRpcResponse::Success(json!({ "codexHome": "synthetic-home" })),
        }),
    );
    let thread = transport.request("thread/read", None).unwrap();
    let models = transport.request("model/list", None).unwrap();

    let events: Vec<_> = lines
        .map(|line| transport.receive_line(line).unwrap().unwrap())
        .collect();

    assert_eq!(
        events,
        vec![
            ServerEvent::Notification {
                method: "item/agentMessage/delta".to_owned(),
                params: Some(json!({ "delta": "Bonjour" })),
            },
            ServerEvent::Request {
                id: JsonRpcId::Number(thread.id.into()),
                method: "item/commandExecution/requestApproval".to_owned(),
                params: Some(json!({ "threadId": "t1" })),
            },
            ServerEvent::Response {
                id: models.id,
                response: JsonRpcResponse::Success(json!({ "data": [] })),
            },
            ServerEvent::Response {
                id: thread.id,
                response: JsonRpcResponse::Error(json!({
                    "code": -32042, "message": "Permission denied", "data": { "reason": "policy" }
                })),
            },
        ]
    );
    assert!(transport.close().is_empty());
}

#[test]
fn test_transport_should_encode_one_line_when_request_contains_newlines() {
    let mut transport = CodexTransport::new();
    let params = json!({ "text": "First line\nSecond line" });

    let request = transport
        .request("turn/start", Some(params.clone()))
        .unwrap();

    assert_eq!(
        frame_value(&request.line),
        json!({
            "jsonrpc": "2.0", "id": request.id, "method": "turn/start", "params": params
        }),
    );
}

#[test]
fn test_transport_should_preserve_optional_params_when_sending_notifications() {
    let transport = CodexTransport::new();

    let initialized = transport.notify("initialized", None).unwrap();
    let explicit_null = transport.notify("demo", Some(Value::Null)).unwrap();

    assert_eq!(
        frame_value(&initialized),
        json!({ "jsonrpc": "2.0", "method": "initialized" })
    );
    assert_eq!(
        frame_value(&explicit_null),
        json!({
            "jsonrpc": "2.0", "method": "demo", "params": null
        })
    );
}

#[test]
fn test_transport_should_correlate_responses_when_they_arrive_out_of_order() {
    let mut transport = CodexTransport::new();
    let first = transport.request("thread/read", None).unwrap();
    let second = transport.request("model/list", None).unwrap();

    assert_eq!(
        transport
            .receive_line(r#"{"id":2,"result":{"data":[]}}"#)
            .unwrap(),
        Some(ServerEvent::Response {
            id: second.id,
            response: JsonRpcResponse::Success(json!({ "data": [] })),
        }),
    );
    assert_eq!(
        transport
            .receive_line(r#"{"jsonrpc":"2.0","id":1,"result":{"thread":{"id":"t1"}}}"#)
            .unwrap(),
        Some(ServerEvent::Response {
            id: first.id,
            response: JsonRpcResponse::Success(json!({ "thread": { "id": "t1" } })),
        }),
    );
    assert!(transport.close().is_empty());
}

#[test]
fn test_transport_should_dispatch_notifications_while_a_request_is_pending() {
    let mut transport = CodexTransport::new();
    let turn = transport.request("turn/start", None).unwrap();

    let event = transport
        .receive_line(concat!(
            r#"{"method":"item/agentMessage/delta","params":{"delta":"Bonjour"}}"#,
            "\r\n",
        ))
        .unwrap();

    assert_eq!(
        event,
        Some(ServerEvent::Notification {
            method: "item/agentMessage/delta".to_owned(),
            params: Some(json!({ "delta": "Bonjour" })),
        }),
    );
    assert_eq!(transport.close(), vec![turn.id]);
}

#[test]
fn test_transport_should_keep_approval_ids_independent_of_pending_client_ids() {
    let mut transport = CodexTransport::new();
    let turn = transport.request("turn/start", None).unwrap();
    let approval = transport.receive_line(
        r#"{"id":1,"method":"item/commandExecution/requestApproval","params":{"threadId":"t1"}}"#,
    ).unwrap();

    let Some(ServerEvent::Request { id, method, params }) = approval else {
        panic!("expected a server request");
    };
    assert_eq!(id, JsonRpcId::Number(turn.id.into()));
    assert_eq!(method, "item/commandExecution/requestApproval");
    assert_eq!(params, Some(json!({ "threadId": "t1" })));

    let reply = transport
        .respond(
            id,
            JsonRpcResponse::Success(json!({ "decision": "decline" })),
        )
        .unwrap();

    assert_eq!(
        frame_value(&reply),
        json!({
            "jsonrpc": "2.0", "id": turn.id, "result": { "decision": "decline" }
        })
    );
    assert_eq!(transport.close(), vec![turn.id]);
}

#[test]
fn test_transport_should_preserve_a_string_id_when_rejecting_a_server_request() {
    let mut transport = CodexTransport::new();
    let reply_to = transport
        .receive_line(r#"{"id":"server-1","method":"item/commandExecution/requestApproval"}"#)
        .unwrap();
    let Some(ServerEvent::Request { id, .. }) = reply_to else {
        panic!("expected a server request");
    };
    let error = json!({ "code": -32000, "message": "Request cancelled" });

    let reply = transport
        .respond(id, JsonRpcResponse::Error(error.clone()))
        .unwrap();

    assert_eq!(
        frame_value(&reply),
        json!({ "jsonrpc": "2.0", "id": "server-1", "error": error })
    );
}

#[test]
fn test_transport_should_preserve_error_payload_when_codex_rejects_a_call() {
    let mut transport = CodexTransport::new();
    let request = transport.request("fs/readFile", None).unwrap();

    let event = transport.receive_line(
        r#"{"id":1,"error":{"code":-32042,"message":"Permission denied","data":{"reason":"policy"}}}"#,
    ).unwrap();

    assert_eq!(
        event,
        Some(ServerEvent::Response {
            id: request.id,
            response: JsonRpcResponse::Error(json!({
                "code": -32042, "message": "Permission denied", "data": { "reason": "policy" }
            })),
        }),
    );
    assert!(transport.close().is_empty());
}

#[test]
fn test_transport_should_match_numeric_ids_by_value_and_ignore_string_ids() {
    let mut transport = CodexTransport::new();
    let request = transport.request("thread/list", None).unwrap();

    assert_eq!(
        transport
            .receive_line(r#"{"id":"1","result":null}"#)
            .unwrap(),
        None
    );
    assert_eq!(
        transport
            .receive_line(r#"{"id":1.0,"result":null}"#)
            .unwrap(),
        Some(ServerEvent::Response {
            id: request.id,
            response: JsonRpcResponse::Success(Value::Null)
        }),
    );
}

#[test]
fn test_transport_should_ignore_late_replies_when_calls_have_finished_or_timed_out() {
    let mut transport = CodexTransport::new();
    let first = transport.request("thread/read", None).unwrap();
    let second = transport.request("model/list", None).unwrap();

    assert!(
        transport
            .receive_line(r#"{"id":1,"result":{}}"#)
            .unwrap()
            .is_some()
    );
    assert!(transport.discard_request(second.id));

    assert_eq!(
        transport.receive_line(r#"{"id":1,"result":{}}"#).unwrap(),
        None
    );
    assert_eq!(
        transport.receive_line(r#"{"id":2,"result":{}}"#).unwrap(),
        None
    );
    assert!(!transport.discard_request(first.id));
    assert!(transport.close().is_empty());
}

#[test]
fn test_transport_should_reject_invalid_frames_without_losing_pending_calls() {
    let mut transport = CodexTransport::new();
    let request = transport.request("thread/read", None).unwrap();

    let error = transport.receive_line(r#"{"id":1,"result":"#).unwrap_err();

    assert!(matches!(error, TransportError::InvalidJson(_)));
    assert!(error.to_string().starts_with("Invalid JSON-RPC line:"));
    assert_eq!(transport.close(), vec![request.id]);
}

#[test]
fn test_transport_should_reject_invalid_wire_fields() {
    let mut transport = CodexTransport::new();
    let examples = [
        (" \r\n", "Received an empty JSON-RPC line."),
        ("[]", "JSON-RPC line must be an object."),
        (
            r#"{"jsonrpc":"1.0"}"#,
            "JSON-RPC message must use version 2.0.",
        ),
        (r#"{"method":42}"#, "JSON-RPC method must be a string."),
        (
            r#"{"id":null,"result":{}}"#,
            "JSON-RPC id must be a string or number.",
        ),
    ];

    for (line, message) in examples {
        let error = transport.receive_line(line).unwrap_err();

        assert!(matches!(error, TransportError::InvalidMessage(_)));
        assert_eq!(error.to_string(), message);
    }
}

#[test]
fn test_transport_should_return_pending_ids_once_when_the_connection_closes() {
    let mut transport = CodexTransport::new();
    transport.request("thread/read", None).unwrap();
    let pending = transport.request("model/list", None).unwrap();
    transport.receive_line(r#"{"id":1,"result":{}}"#).unwrap();

    assert_eq!(transport.close(), vec![pending.id]);
    assert!(transport.close().is_empty());
    let error = transport.request("thread/read", None).unwrap_err();
    assert!(matches!(error, TransportError::Closed));
    assert_eq!(error.to_string(), "Codex app-server transport is closed.");
}

/// Checks that the payload is a single line before decoding it for comparisons.
fn frame_value(line: &str) -> Value {
    assert!(line.ends_with('\n'));
    assert_eq!(line.lines().count(), 1);
    serde_json::from_str(line).unwrap()
}
