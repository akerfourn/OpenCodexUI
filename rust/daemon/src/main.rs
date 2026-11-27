use std::io::{self, BufRead, Write};

/// Serves the private launcher's health check until the parent closes its input.
fn serve(input: impl BufRead, mut output: impl Write) -> io::Result<()> {
    for line in input.lines() {
        if line? != "ping" {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "expected ping"));
        }

        output.write_all(b"pong\n")?;
        output.flush()?;
    }

    Ok(())
}

/// Uses inherited pipes so the process exits when its parent closes them.
fn main() -> io::Result<()> {
    serve(io::stdin().lock(), io::stdout().lock())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serve_should_reply_to_each_ping_and_exit_at_eof() {
        let mut output = Vec::new();

        serve(&b"ping\nping\r\n"[..], &mut output).unwrap();

        assert_eq!(output, b"pong\npong\n");
    }

    #[test]
    fn test_serve_should_reject_an_unknown_request() {
        let mut output = Vec::new();

        let error = serve(&b"unknown\n"[..], &mut output).unwrap_err();

        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert_eq!(error.to_string(), "expected ping");
        assert!(output.is_empty());
    }
}
