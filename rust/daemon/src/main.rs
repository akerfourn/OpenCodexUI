use std::io::{self, BufRead, Write};
use std::time::Duration;

mod codex_stdio;

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

/// Serves the launcher ping or relays the private pipes for one Codex source.
fn main() -> io::Result<()> {
    let mut args = std::env::args_os().skip(1);
    let Some(mode) = args.next() else {
        return serve(io::stdin().lock(), io::stdout().lock());
    };
    if mode != "--codex-stdio" {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Unknown daemon mode.",
        ));
    }

    let timeout_ms = args
        .next()
        .and_then(|value| value.to_str().and_then(|value| value.parse::<u64>().ok()))
        .filter(|milliseconds| *milliseconds > 0)
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "Expected a positive Codex request timeout in milliseconds.",
            )
        })?;
    let executable = args.next().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "Expected a Codex executable.")
    })?;
    let status = codex_stdio::relay(executable, args, Duration::from_millis(timeout_ms))?;
    if !status.success() {
        std::process::exit(status.code().unwrap_or(1));
    }
    Ok(())
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
