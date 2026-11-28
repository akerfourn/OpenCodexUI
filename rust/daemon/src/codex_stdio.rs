use std::ffi::OsString;
use std::io::{self, BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::sync::{Arc, Mutex, MutexGuard, mpsc};
use std::thread;
use std::time::{Duration, Instant};

use codex_rpc::{CodexRelay, CodexTransport, JsonRpcResponse, TransportError};

use crate::codex_session::{
    OpenSession, read_initialize_response, require_server_reply, write_line,
};

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

enum Phase {
    Opening,
    Ready(CodexRelay),
    Failed,
}

struct Session {
    phase: Mutex<Phase>,
    server_input: Mutex<Option<ChildStdin>>,
}

/// Opens one source and owns its app-server pipes until either side disconnects.
pub fn relay(
    executable: OsString,
    args: impl Iterator<Item = OsString>,
    request_timeout: Duration,
) -> io::Result<Option<ExitStatus>> {
    let Some(open) = OpenSession::read(io::stdin().lock(), io::stdout())? else {
        return Ok(None);
    };
    let started = Instant::now();
    let mut command = Command::new(executable);
    command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    hide_window(&mut command);
    let mut server = match command.spawn() {
        Ok(child) => OwnedServer(child),
        Err(error) => {
            let error = io::Error::new(
                error.kind(),
                format!("Unable to start Codex app-server: {error}"),
            );
            open.failed(io::stdout(), &error)?;
            return Err(error);
        }
    };
    let mut input = server
        .0
        .stdin
        .take()
        .ok_or_else(|| io::Error::other("Codex app-server stdin is unavailable."))?;
    let output = server
        .0
        .stdout
        .take()
        .ok_or_else(|| io::Error::other("Codex app-server stdout is unavailable."))?;
    let mut transport = CodexTransport::new();
    let initialize = transport
        .request("initialize", Some(open.initialize_params.clone()))
        .map_err(invalid_transport)?;
    if let Err(error) = write_line(&mut input, &initialize.line) {
        open.failed(io::stdout(), &error)?;
        return Err(error);
    }

    let session = Arc::new(Session {
        phase: Mutex::new(Phase::Opening),
        server_input: Mutex::new(Some(input)),
    });
    let open = Arc::new(open);
    let (finished, stream_exits) = mpsc::channel();

    let client_session = Arc::clone(&session);
    let client_finished = finished.clone();
    thread::Builder::new()
        .name("codex-input".into())
        .spawn(move || {
            let result = read_lines(io::stdin().lock(), |line| {
                if let Some(frame) = client_session.route_client(line, started.elapsed())? {
                    client_session.write_server(&frame)?;
                }
                Ok(())
            });
            // Closing the input pipe allows the server to exit before the shutdown grace expires.
            let closed = client_session.close_input();
            // The supervisor can finish while this thread is still waiting for client input.
            let _ = client_finished.send(StreamExit {
                direction: Direction::Client,
                result: result.and(closed),
            });
        })?;

    let server_session = Arc::clone(&session);
    let server_open = Arc::clone(&open);
    thread::Builder::new()
        .name("codex-output".into())
        .spawn(move || {
            let result = forward_server(
                BufReader::new(output),
                &server_session,
                &server_open,
                transport,
                started,
                request_timeout,
            );
            let _ = finished.send(StreamExit {
                direction: Direction::Server,
                result,
            });
        })?;

    wait_for_server(
        &mut server,
        stream_exits,
        &session,
        &open,
        started,
        request_timeout,
    )
    .map(Some)
}

/// Finishes initialization before forwarding the remaining server output.
fn forward_server(
    mut server: impl BufRead,
    session: &Session,
    open: &OpenSession,
    transport: CodexTransport,
    started: Instant,
    request_timeout: Duration,
) -> io::Result<()> {
    let mut client = io::stdout();
    match finish_open(
        &mut server,
        &mut client,
        session,
        open,
        transport,
        request_timeout,
    ) {
        Ok(true) => {}
        Ok(false) => return Ok(()),
        Err(error) => {
            if session.fail_open()? {
                open.failed(&mut client, &error)?;
            }
            return Err(error);
        }
    }
    read_lines(server, |line| {
        if let Some(frame) = session.route_server(line, started.elapsed())? {
            write_line(&mut client, &frame)?;
        }
        Ok(())
    })
}

/// Completes the Codex handshake on its own pipe before reporting readiness.
fn finish_open(
    server: impl BufRead,
    mut client: impl Write,
    session: &Session,
    open: &OpenSession,
    mut transport: CodexTransport,
    request_timeout: Duration,
) -> io::Result<bool> {
    let result = match read_initialize_response(server, &mut client, &mut transport)? {
        JsonRpcResponse::Success(result) => result,
        JsonRpcResponse::Error(error) => {
            if session.fail_open()? {
                open.rejected(&mut client, error)?;
            }
            return Err(io::Error::other(
                "Codex app-server rejected initialization.",
            ));
        }
    };
    if !result.is_object() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Codex app-server returned an invalid initialization result.",
        ));
    }
    let initialized = transport
        .notify("initialized", None)
        .map_err(invalid_transport)?;
    session.write_server(&initialized)?;
    if !session.activate(CodexRelay::with_transport(transport, request_timeout))? {
        return Ok(false);
    }
    open.ready(client, result["codexHome"].as_str())?;
    Ok(true)
}

/// Reads complete JSONL frames without discarding bytes already buffered during startup.
fn read_lines(
    mut reader: impl BufRead,
    mut forward: impl FnMut(&str) -> io::Result<()>,
) -> io::Result<()> {
    let mut line = String::new();
    while reader.read_line(&mut line)? != 0 {
        forward(&line)?;
        line.clear();
    }
    Ok(())
}

impl Session {
    /// Retires an incomplete session, giving exactly one worker the right to report failure.
    fn fail_open(&self) -> io::Result<bool> {
        let mut phase = lock(&self.phase)?;
        if !matches!(*phase, Phase::Opening) {
            return Ok(false);
        }
        *phase = Phase::Failed;
        Ok(true)
    }

    /// Enables ordinary relay traffic after the initialized notification was written.
    fn activate(&self, relay: CodexRelay) -> io::Result<bool> {
        let mut phase = lock(&self.phase)?;
        if !matches!(*phase, Phase::Opening) {
            return Ok(false);
        }
        *phase = Phase::Ready(relay);
        Ok(true)
    }

    /// Keeps normal requests behind readiness while allowing replies to startup server requests.
    fn route_client(&self, line: &str, elapsed: Duration) -> io::Result<Option<String>> {
        match &mut *lock(&self.phase)? {
            Phase::Opening => {
                require_server_reply(line)?;
                Ok(Some(line.to_owned()))
            }
            Phase::Ready(relay) => relay
                .relay_client_line(line, elapsed)
                .map_err(invalid_transport),
            Phase::Failed => Ok(None),
        }
    }

    /// Correlates app-server output after the handshake has finished.
    fn route_server(&self, line: &str, elapsed: Duration) -> io::Result<Option<String>> {
        let mut phase = lock(&self.phase)?;
        let Phase::Ready(relay) = &mut *phase else {
            return Ok(None);
        };
        relay
            .relay_server_line(line, elapsed)
            .map_err(invalid_transport)
    }

    /// Serializes control and client frames without holding the phase lock during IO.
    fn write_server(&self, line: &str) -> io::Result<()> {
        let mut input = lock(&self.server_input)?;
        let input = input.as_mut().ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::BrokenPipe,
                "Codex app-server input is closed.",
            )
        })?;
        write_line(input, line)
    }

    /// Releases Codex stdin on client disconnect even if the output worker is still running.
    fn close_input(&self) -> io::Result<()> {
        lock(&self.server_input)?.take();
        Ok(())
    }
}

/// Treats poisoned relay state as a process error instead of continuing with inconsistent state.
fn lock<T>(mutex: &Mutex<T>) -> io::Result<MutexGuard<'_, T>> {
    mutex
        .lock()
        .map_err(|_| io::Error::other("Codex session state is unavailable."))
}

/// Preserves wire parsing and routing errors for the process supervisor.
fn invalid_transport(error: TransportError) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, error)
}

/// Bounds initialization and drains server output after EOF, errors, or a process exit.
fn wait_for_server(
    server: &mut OwnedServer,
    stream_exits: mpsc::Receiver<StreamExit>,
    session: &Session,
    open: &OpenSession,
    started: Instant,
    request_timeout: Duration,
) -> io::Result<ExitStatus> {
    let mut output_closed = false;
    let mut closing_since = None;
    let mut open_timeout = Some(request_timeout);

    loop {
        if open_timeout.is_some_and(|timeout| started.elapsed() >= timeout) {
            open_timeout = None;
            if session.fail_open()? {
                let error = io::Error::new(
                    io::ErrorKind::TimedOut,
                    "Timed out initializing Codex app-server.",
                );
                open.failed(io::stdout(), &error)?;
                return Err(error);
            }
        }
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
