use std::error::Error;
use std::fmt::{self, Display, Formatter};

/// A malformed wire message or an invalid operation on a transport.
#[derive(Debug)]
pub enum TransportError {
    InvalidJson(serde_json::Error),
    InvalidMessage(&'static str),
    Closed,
    RequestIdsExhausted,
}

impl Display for TransportError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidJson(error) => write!(formatter, "Invalid JSON-RPC line: {error}"),
            Self::InvalidMessage(message) => formatter.write_str(message),
            Self::Closed => formatter.write_str("Codex app-server transport is closed."),
            Self::RequestIdsExhausted => {
                formatter.write_str("Codex app-server request IDs are exhausted.")
            }
        }
    }
}

impl Error for TransportError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidJson(error) => Some(error),
            _ => None,
        }
    }
}
