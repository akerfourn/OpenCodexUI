use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

const TEST_TIMEOUT: Duration = Duration::from_secs(8);

#[test]
fn test_daemon_should_relay_a_streaming_turn_when_the_server_requests_approval() {
    let mut relay = TestRelay::start();
    relay.initialize();
    relay
        .send(json!({ "id": "resume", "method": "thread/resume", "params": { "threadId": "t1" } }));
    assert_eq!(relay.receive()["result"]["thread"]["id"], "t1");

    relay.send(json!({ "id": "turn", "method": "turn/start", "params": { "threadId": "t1" } }));
    assert_eq!(
        relay.receive(),
        json!({ "method": "item/agentMessage/delta", "params": { "delta": "Bonjour" } }),
    );
    assert_eq!(
        relay.receive(),
        json!({
            "id": "approval-1", "method": "item/commandExecution/requestApproval",
            "params": { "threadId": "t1" },
        }),
    );
    relay.send(json!({ "id": 42, "method": "model/list" }));
    assert_eq!(
        relay.receive(),
        json!({ "jsonrpc": "2.0", "id": 42, "result": { "data": [] } })
    );
    relay.send(json!({ "id": "approval-1", "result": { "decision": "decline" } }));

    assert_eq!(
        relay.receive(),
        json!({
            "jsonrpc": "2.0", "id": "turn", "result": { "turn": { "id": "turn-1" } },
        })
    );
    assert_eq!(relay.receive()["method"], "turn/completed");
    drop(relay.process.stdin.take());
    assert_eq!(relay.exit_code(), 0);
}

#[test]
fn test_daemon_should_stop_its_server_when_it_ignores_client_eof() {
    let mut relay = TestRelay::start();
    relay.initialize();
    relay.send(json!({ "id": "stall", "method": "test/stall" }));
    assert_eq!(relay.receive()["id"], "stall");

    drop(relay.process.stdin.take());

    assert_ne!(relay.exit_code(), 0);
}

#[test]
fn test_daemon_should_close_its_client_pipes_when_the_server_exits_with_pending_calls() {
    let mut relay = TestRelay::start();
    relay.initialize();
    relay.send(json!({ "id": "pending", "method": "test/pending" }));
    relay.send(json!({ "id": "exit", "method": "test/exit" }));

    let output = relay.output.recv_timeout(TEST_TIMEOUT);

    assert!(
        matches!(output, Err(RecvTimeoutError::Disconnected)),
        "{output:?}"
    );
    assert_eq!(relay.exit_code(), 17);
}

/// Drives the real daemon binary with a synthetic server and a bounded test harness.
struct TestRelay {
    process: Child,
    output: Receiver<String>,
}

impl TestRelay {
    /// Starts the relay and reads its stdout independently from the input pipe.
    fn start() -> Self {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/fixtures/codex-rpc/app-server.mjs");
        let mut process = Command::new(env!("CARGO_BIN_EXE_opencodex-daemon"))
            .args(["--codex-stdio", "120000", "node"])
            .arg(fixture)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let stdout = process.stdout.take().unwrap();
        let (sender, output) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                if sender.send(line.unwrap()).is_err() {
                    break;
                }
            }
        });
        Self { process, output }
    }

    /// Completes the standard initialization exchange before running the scenario.
    fn initialize(&mut self) {
        self.send(json!({ "id": "initialize", "method": "initialize" }));
        assert_eq!(
            self.receive(),
            json!({
                "jsonrpc": "2.0", "id": "initialize", "result": { "codexHome": "synthetic-home" },
            })
        );
        self.send(json!({ "method": "initialized" }));
    }

    /// Sends one JSONL frame to the relay.
    fn send(&mut self, frame: Value) {
        writeln!(self.process.stdin.as_mut().unwrap(), "{frame}").unwrap();
    }

    /// Receives one decoded frame within the test deadline.
    fn receive(&self) -> Value {
        serde_json::from_str(&self.output.recv_timeout(TEST_TIMEOUT).unwrap()).unwrap()
    }

    /// Waits for the relay to stop without hanging the test suite on a regression.
    fn exit_code(&mut self) -> i32 {
        let started = Instant::now();
        loop {
            if let Some(status) = self.process.try_wait().unwrap() {
                return status.code().unwrap();
            }
            assert!(started.elapsed() < TEST_TIMEOUT, "relay did not stop");
            thread::sleep(Duration::from_millis(10));
        }
    }
}

impl Drop for TestRelay {
    fn drop(&mut self) {
        drop(self.process.stdin.take());
        if matches!(self.process.try_wait(), Ok(None)) {
            let _ = self.process.kill();
            let _ = self.process.wait();
        }
    }
}
