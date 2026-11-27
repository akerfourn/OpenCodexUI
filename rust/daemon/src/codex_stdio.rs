use std::ffi::OsString;
use std::io::{self, BufRead, BufReader, Write};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::{Arc, Mutex, mpsc};
use std::thread;
use std::time::{Duration, Instant};

use codex_rpc::CodexRelay;

const SHUTDOWN_GRACE: Duration = Duration::from_millis(600);
const POLL_INTERVAL: Duration = Duration::from_millis(20);

#[derive(Clone, Copy)]
enum Direction {
    Client,
    Server,
}

struct StreamExit {
    direction: Direction,
    result: io::Result<()>,
}

/// Starts the server for one source and owns its pipes until either side disconnects.
pub fn relay(
    executable: OsString,
    args: impl Iterator<Item = OsString>,
    request_timeout: Duration,
) -> io::Result<ExitStatus> {
    let mut command = Command::new(executable);
    command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    hide_window(&mut command);
    let mut server = OwnedServer(command.spawn()?);
    let input = server
        .0
        .stdin
        .take()
        .ok_or_else(|| io::Error::other("Codex app-server stdin is unavailable."))?;
    let output = server
        .0
        .stdout
        .take()
        .ok_or_else(|| io::Error::other("Codex app-server stdout is unavailable."))?;
    let state = Arc::new(Mutex::new(CodexRelay::new(request_timeout)));
    let (finished, stream_exits) = mpsc::channel();
    let started = Instant::now();

    let client_state = Arc::clone(&state);
    let client_finished = finished.clone();
    thread::Builder::new()
        .name("codex-input".into())
        .spawn(move || {
            let result = forward_lines(
                io::stdin().lock(),
                input,
                &client_state,
                started,
                Direction::Client,
            );
            // The supervisor can finish while this thread is still waiting for client input.
            let _ = client_finished.send(StreamExit {
                direction: Direction::Client,
                result,
            });
        })?;

    thread::Builder::new()
        .name("codex-output".into())
        .spawn(move || {
            let result = forward_lines(
                BufReader::new(output),
                io::stdout(),
                &state,
                started,
                Direction::Server,
            );
            let _ = finished.send(StreamExit {
                direction: Direction::Server,
                result,
            });
        })?;

    wait_for_server(&mut server, stream_exits)
}

/// Routes complete lines with a short state lock and flushes each one to the other process.
fn forward_lines(
    mut reader: impl BufRead,
    mut writer: impl Write,
    state: &Mutex<CodexRelay>,
    started: Instant,
    direction: Direction,
) -> io::Result<()> {
    let mut line = String::new();
    while reader.read_line(&mut line)? != 0 {
        let forward = {
            let mut relay = state
                .lock()
                .map_err(|_| io::Error::other("Codex relay state is unavailable."))?;
            let elapsed = started.elapsed();
            match direction {
                Direction::Client => relay.relay_client_line(&line, elapsed),
                Direction::Server => relay.relay_server_line(&line, elapsed),
            }
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?
        };
        if let Some(frame) = forward {
            writer.write_all(frame.as_bytes())?;
            writer.flush()?;
        }
        line.clear();
    }
    Ok(())
}

/// Drains server output and bounds shutdown after EOF, errors, or a process exit.
fn wait_for_server(
    server: &mut OwnedServer,
    stream_exits: mpsc::Receiver<StreamExit>,
) -> io::Result<ExitStatus> {
    let mut output_closed = false;
    let mut closing_since = None;

    loop {
        if let Some(status) = server.0.try_wait()? {
            if output_closed {
                return Ok(status);
            }
            closing_since.get_or_insert_with(Instant::now);
        }

        if closing_since.is_some_and(|since: Instant| since.elapsed() >= SHUTDOWN_GRACE) {
            return server.terminate();
        }

        match stream_exits.recv_timeout(POLL_INTERVAL) {
            Ok(exit) => {
                if let Err(error) = exit.result
                    && error.kind() != io::ErrorKind::BrokenPipe
                {
                    return Err(error);
                }
                if matches!(exit.direction, Direction::Server) {
                    output_closed = true;
                }
                closing_since.get_or_insert_with(Instant::now);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => thread::sleep(POLL_INTERVAL),
        }
    }
}

/// Reaps the server even if setting up or forwarding one of the pipes fails.
struct OwnedServer(Child);

impl OwnedServer {
    /// Terminates only this server and reaps it before the relay exits.
    fn terminate(&mut self) -> io::Result<ExitStatus> {
        if let Some(status) = self.0.try_wait()? {
            return Ok(status);
        }
        self.0.kill()?;
        self.0.wait()
    }
}

impl Drop for OwnedServer {
    fn drop(&mut self) {
        if let Err(error) = self.terminate() {
            eprintln!("Unable to reap the owned Codex app-server: {error}");
        }
    }
}

/// Keeps console programs hidden when Electron launches them on Windows.
fn hide_window(_command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        _command.creation_flags(CREATE_NO_WINDOW);
    }
}
