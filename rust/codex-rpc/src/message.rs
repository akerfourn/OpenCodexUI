use serde_json::{Number, Value, json};

use crate::TransportError;

/// A wire ID, including the string IDs used for some server-initiated requests.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum JsonRpcId {
    Number(Number),
    String(String),
}

impl JsonRpcId {
    /// Validates a wire ID while preserving the original JSON type.
    fn read(value: Value) -> Result<Self, TransportError> {
        match value {
            Value::Number(id) => Ok(Self::Number(id)),
            Value::String(id) => Ok(Self::String(id)),
            _ => Err(TransportError::InvalidMessage(
                "JSON-RPC id must be a string or number.",
            )),
        }
    }

    /// Produces the original JSON ID when replying to a server request.
    fn into_value(self) -> Value {
        match self {
            Self::Number(id) => Value::Number(id),
            Self::String(id) => Value::String(id),
        }
    }
}

/// A reply payload preserved as JSON for the caller's method-specific decoding.
#[derive(Debug, PartialEq, Eq)]
pub enum JsonRpcResponse {
    Success(Value),
    Error(Value),
}

/// A decoded frame whose direction and correlation are handled by the transport.
pub(crate) enum Message {
    Reply {
        id: JsonRpcId,
        response: JsonRpcResponse,
    },
    Call {
        id: Option<JsonRpcId>,
        method: String,
        params: Option<Value>,
    },
}

/// Decodes one server line using the same field checks as the TypeScript client.
pub(crate) fn decode_line(line: &str) -> Result<Option<Message>, TransportError> {
    let text = line.trim();
    if text.is_empty() {
        return Err(TransportError::InvalidMessage(
            "Received an empty JSON-RPC line.",
        ));
    }
    let value = serde_json::from_str(text).map_err(TransportError::InvalidJson)?;
    let Value::Object(mut frame) = value else {
        return Err(TransportError::InvalidMessage(
            "JSON-RPC line must be an object.",
        ));
    };
    if let Some(version) = frame.remove("jsonrpc")
        && version.as_str() != Some("2.0")
    {
        return Err(TransportError::InvalidMessage(
            "JSON-RPC message must use version 2.0.",
        ));
    }

    let method = frame.remove("method").map(read_method).transpose()?;
    let id = frame.remove("id").map(JsonRpcId::read).transpose()?;
    let response = frame
        .remove("error")
        .map(JsonRpcResponse::Error)
        .or_else(|| frame.remove("result").map(JsonRpcResponse::Success));

    match (id, method, response) {
        (Some(id), _, Some(response)) => Ok(Some(Message::Reply { id, response })),
        (id, Some(method), _) => Ok(Some(Message::Call {
            id,
            method,
            params: frame.remove("params"),
        })),
        _ => Ok(None),
    }
}

/// Reads a method name, including when a reply also carries a method field.
fn read_method(value: Value) -> Result<String, TransportError> {
    match value {
        Value::String(method) => Ok(method),
        _ => Err(TransportError::InvalidMessage(
            "JSON-RPC method must be a string.",
        )),
    }
}

/// Encodes a request or notification, omitting optional fields supplied as absent.
pub(crate) fn encode_call(id: Option<u64>, method: &str, params: Option<Value>) -> String {
    let mut frame = json!({ "jsonrpc": "2.0", "method": method });
    if let Some(id) = id {
        frame["id"] = Value::from(id);
    }
    if let Some(params) = params {
        frame["params"] = params;
    }
    encode_line(frame)
}

/// Encodes a response using the ID provided by the server.
pub(crate) fn encode_response(id: JsonRpcId, response: JsonRpcResponse) -> String {
    let mut frame = json!({ "jsonrpc": "2.0", "id": id.into_value() });
    match response {
        JsonRpcResponse::Success(result) => frame["result"] = result,
        JsonRpcResponse::Error(error) => frame["error"] = error,
    }
    encode_line(frame)
}

/// Terminates a JSON document so it can be flushed as a single message.
fn encode_line(value: Value) -> String {
    let mut line = value.to_string();
    line.push('\n');
    line
}
