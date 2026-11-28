use std::io::{self, BufRead, Write};

use codex_rpc::{CodexTransport, JsonRpcResponse, ServerEvent, TransportError};
use serde_json::{Value, json};

const OPEN_METHOD: &str = "opencodex/session/open";
const PROTOCOL_VERSION: u64 = 1;

/// The daemon control request and its corresponding Codex initialization parameters.
pub(crate) struct OpenSession {
    id: Value,
    pub initialize_params: Value,
}

impl OpenSession {
    /// Reads the private control request before any app-server process is started.
    pub fn read(mut input: impl BufRead, mut output: impl Write) -> io::Result<Option<Self>> {
        let mut line = String::new();
        if input.read_line(&mut line)? == 0 {
            return Ok(None);
        }
        let request = parse_frame(&line)?;
        let id = &request["id"];
        if request["jsonrpc"] != "2.0" || request["method"] != OPEN_METHOD || !is_request_id(id) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Expected a daemon session open request.",
            ));
        }
        let params = match initialize_params(&request["params"]) {
            Ok(params) => params,
            Err(message) => {
                write_response(
                    &mut output,
                    id,
                    JsonRpcResponse::Error(json!({ "code": -32602, "message": message })),
                )?;
                return Err(io::Error::new(io::ErrorKind::InvalidData, message));
            }
        };
        Ok(Some(Self {
            id: id.clone(),
            initialize_params: params,
        }))
    }

    /// Gives the client the startup information it needs from this source.
    pub fn ready(&self, output: impl Write, codex_home: Option<&str>) -> io::Result<()> {
        write_response(
            output,
            &self.id,
            JsonRpcResponse::Success(json!({ "status": "ready", "codexHome": codex_home })),
        )
    }

    /// Preserves a Codex initialization error, including its code and data.
    pub fn rejected(&self, output: impl Write, error: Value) -> io::Result<()> {
        write_response(output, &self.id, JsonRpcResponse::Error(error))
    }

    /// Converts a daemon startup failure to an error correlated to the open request.
    pub fn failed(&self, output: impl Write, error: &io::Error) -> io::Result<()> {
        self.rejected(
            output,
            json!({ "code": -32000, "message": error.to_string() }),
        )
    }
}

/// Builds the Codex handshake from the versioned daemon request.
fn initialize_params(params: &Value) -> Result<Value, &'static str> {
    if params["protocolVersion"].as_u64() != Some(PROTOCOL_VERSION) {
        return Err("Unsupported daemon session protocol version.");
    }
    let client_info = &params["clientInfo"];
    let name = client_info["name"]
        .as_str()
        .ok_or("Daemon session open requires a client name.")?;
    let version = client_info["version"]
        .as_str()
        .ok_or("Daemon session open requires a client version.")?;
    let experimental_api = params["experimentalApi"]
        .as_bool()
        .ok_or("Daemon session open requires an experimental API setting.")?;

    Ok(json!({
        "clientInfo": { "name": name, "version": version },
        "capabilities": { "experimentalApi": experimental_api, "requestAttestation": false },
    }))
}

/// Waits for the owned initialize reply and forwards any intervening server requests or events.
pub(crate) fn read_initialize_response(
    mut server: impl BufRead,
    mut client: impl Write,
    transport: &mut CodexTransport,
) -> io::Result<JsonRpcResponse> {
    let mut line = String::new();
    while server.read_line(&mut line)? != 0 {
        match transport.receive_line(&line) {
            Ok(Some(ServerEvent::Response { response, .. })) => return Ok(response),
            Ok(Some(_))
            | Err(TransportError::InvalidJson(_) | TransportError::InvalidMessage(_)) => {
                write_line(&mut client, &line)?;
            }
            Ok(None) => {}
            Err(error) => return Err(io::Error::new(io::ErrorKind::InvalidData, error)),
        }
        line.clear();
    }
    Err(io::Error::new(
        io::ErrorKind::UnexpectedEof,
        "Codex app-server closed its output during initialization.",
    ))
}

/// During startup only replies to app-server requests can cross the client pipe.
pub(crate) fn require_server_reply(line: &str) -> io::Result<()> {
    let frame = parse_frame(line)?;
    if !is_request_id(&frame["id"])
        || frame.get("method").is_some()
        || (frame.get("result").is_none() && frame.get("error").is_none())
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Wait for the daemon session to be ready before sending requests.",
        ));
    }
    Ok(())
}

/// Parses one JSON frame for the daemon control exchange.
fn parse_frame(line: &str) -> io::Result<Value> {
    serde_json::from_str(line).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

/// Identifies a JSON-RPC request ID usable on the local pipes.
fn is_request_id(id: &Value) -> bool {
    id.is_number() || id.is_string()
}

/// Encodes a daemon control response independently of Codex's downstream IDs.
fn write_response(output: impl Write, id: &Value, response: JsonRpcResponse) -> io::Result<()> {
    let frame = match response {
        JsonRpcResponse::Success(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        JsonRpcResponse::Error(error) => json!({ "jsonrpc": "2.0", "id": id, "error": error }),
    };
    write_line(output, &format!("{frame}\n"))
}

/// Flushes a complete frame and adds the delimiter when the sender ended at EOF.
pub(crate) fn write_line(mut output: impl Write, line: &str) -> io::Result<()> {
    if line.ends_with('\n') {
        output.write_all(line.as_bytes())?;
    } else {
        output.write_all(format!("{line}\n").as_bytes())?;
    }
    output.flush()
}
