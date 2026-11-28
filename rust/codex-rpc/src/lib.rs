//! JSONL transport state for a single Codex app-server connection.

mod error;
mod message;
mod relay;
mod transport;

pub use error::TransportError;
pub use message::{JsonRpcId, JsonRpcResponse};
pub use relay::{CallAdaptation, ClientFrame, CodexRelay};
pub use transport::{CodexTransport, OutboundRequest, ServerEvent};
