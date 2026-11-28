use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

const TEST_TIMEOUT: Duration = Duration::from_secs(8);

#[test]
fn test_daemon_should_adapt_paginated_catalog_requests_alongside_raw_calls() {
    let mut relay = TestRelay::start();
    relay.open();
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/codex-rpc/thread-catalog.json"
    ))
    .unwrap();

    relay.send(json!({
        "id": "first", "method": "opencodex/threads/list",
        "params": { "pageSize": 1, "sortBy": "updatedAt", "sortDirection": "desc",
                    "workingDirectories": ["C:\\Work\\Project"], "archived": false,
                    "sourceKinds": ["subAgent"], "searchTerm": "Worker", "ancestorThreadId": "parent" }
    }));
    relay.send(json!({ "id": 2, "method": "test/catalog-filters" }));
    assert_eq!(relay.receive()["result"], fixture["daemonPages"][0]);
    assert_eq!(
        relay.receive()["result"],
        json!({
            "limit": 1, "sortKey": "updated_at", "sortDirection": "desc", "cwd": "C:\\Work\\Project",
            "archived": false, "sourceKinds": ["subAgent"], "searchTerm": "Worker", "ancestorThreadId": "parent"
        })
    );

    let cursor = &fixture["daemonPages"][0]["nextCursor"];
    relay.send(
        json!({ "id": 3, "method": "opencodex/threads/list", "params": { "cursor": cursor } }),
    );
    relay.send(json!({ "id": 4, "method": "thread/list", "params": { "cursor": cursor } }));
    assert_eq!(
        relay.receive(),
        json!({
            "jsonrpc": "2.0", "id": 3, "result": fixture["daemonPages"][1]
        })
    );
    assert_eq!(relay.receive()["result"], fixture["codexPages"][1]);
    relay.expect_clean_shutdown();
}

#[test]
fn test_daemon_should_return_catalog_errors_without_closing_the_session() {
    let mut relay = TestRelay::start();
    relay.open();
    relay.send(json!({
        "id": "bad-filter", "method": "opencodex/threads/list", "params": { "sortBy": "unknown" }
    }));
    let reply = relay.receive();
    assert_eq!(reply["id"], "bad-filter");
    assert_eq!(reply["error"]["code"], -32602);
    relay.send(json!({
        "id": "bad-cursor", "method": "opencodex/threads/list", "params": { "cursor": "expired" }
    }));
    assert_eq!(
        relay.receive(),
        json!({
            "jsonrpc": "2.0", "id": "bad-cursor",
            "error": { "code": -32052, "message": "Invalid cursor", "data": { "cursor": "expired" } }
        })
    );
    relay.send(json!({ "id": "retry", "method": "opencodex/threads/list" }));
    assert_eq!(relay.receive()["result"]["threads"][0]["id"], "worker");
    relay.expect_clean_shutdown();
}

#[test]
fn test_daemon_should_initialize_codex_before_forwarding_client_requests() {
    let mut relay = TestRelay::start();
    relay.open();

    relay.send(json!({ "id": "probe", "method": "test/initialization" }));

    assert_eq!(
        relay.receive()["result"],
        json!({
            "initializeRequest": {
                "jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": {
                    "clientInfo": { "name": "OpenCodexUI", "version": "fixture" },
                    "capabilities": { "experimentalApi": false, "requestAttestation": false },
                },
            },
            "downstreamId": 2,
        })
    );
    relay.expect_clean_shutdown();
}

#[test]
fn test_daemon_should_forward_a_server_request_while_opening() {
    let mut relay = TestRelay::with_server("request-during-initialize", 120_000);
    relay.request_open(1);
    assert_eq!(
        relay.receive(),
        json!({ "id": 1, "method": "test/startup-request" })
    );

    relay.send(json!({ "id": 1, "result": { "confirmed": true } }));

    relay.expect_ready();
    relay.expect_clean_shutdown();
}

#[test]
fn test_daemon_should_preserve_error_details_when_codex_refuses_initialization() {
    let mut relay = TestRelay::with_server("deny-initialize", 120_000);

    relay.request_open(1);

    assert_eq!(
        relay.receive(),
        json!({
            "jsonrpc": "2.0", "id": "open", "error": {
                "code": -32042, "message": "Initialization refused", "data": { "reason": "fixture" }
            },
        })
    );
    assert_ne!(relay.exit_code(), 0);
}

#[test]
fn test_daemon_should_report_failure_when_codex_closes_before_initialize_reply() {
    let mut relay = TestRelay::with_server("exit-during-initialize", 120_000);

    relay.request_open(1);

    assert_eq!(
        relay.receive()["error"]["message"],
        "Codex app-server closed its output during initialization."
    );
    assert_ne!(relay.exit_code(), 0);
}

#[test]
fn test_daemon_should_stop_a_server_that_does_not_finish_initialization() {
    let mut relay = TestRelay::with_server("stall-initialize", 350);

    relay.request_open(1);

    // The server may report startup progress before the deadline on a fast runner.
    let mut reply = relay.receive();
    if reply["method"] == "test/initialization-pending" {
        reply = relay.receive();
    }
    assert_eq!(reply["id"], "open");
    assert_eq!(
        reply["error"]["message"],
        "Timed out initializing Codex app-server."
    );
    assert_ne!(relay.exit_code(), 0);
}

#[test]
fn test_daemon_should_stop_opening_when_the_client_disconnects() {
    let mut relay = TestRelay::with_server("stall-initialize", 120_000);
    relay.request_open(1);
    assert_eq!(relay.receive()["method"], "test/initialization-pending");

    drop(relay.process.stdin.take());

    assert_ne!(relay.exit_code(), 0);
}

#[test]
fn test_daemon_should_reject_an_unsupported_session_protocol_version() {
    let mut relay = TestRelay::start();

    relay.request_open(2);

    assert_eq!(
        relay.receive(),
        json!({
            "jsonrpc": "2.0", "id": "open", "error": {
                "code": -32602, "message": "Unsupported daemon session protocol version."
            },
        })
    );
    assert_ne!(relay.exit_code(), 0);
}

#[test]
fn test_daemon_should_relay_a_streaming_turn_when_the_server_requests_approval() {
    let mut relay = TestRelay::start();
    relay.open();
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
    relay.expect_clean_shutdown();
}

#[test]
fn test_daemon_should_stop_its_server_when_it_ignores_client_eof() {
    let mut relay = TestRelay::start();
    relay.open();
    relay.send(json!({ "id": "stall", "method": "test/stall" }));
    assert_eq!(relay.receive()["id"], "stall");

    drop(relay.process.stdin.take());

    assert_ne!(relay.exit_code(), 0);
}

#[test]
fn test_daemon_should_close_its_client_pipes_when_the_server_exits_with_pending_calls() {
    let mut relay = TestRelay::start();
    relay.open();
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
        Self::with_server("normal", 120_000)
    }

    /// Runs one synthetic startup behavior with a bounded initialization deadline.
    fn with_server(behavior: &str, timeout_ms: u64) -> Self {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/fixtures/codex-rpc/app-server.mjs");
        // Launch Node itself so forced shutdown cannot leave a runtime behind a package-manager shim.
        let resolved_node = Command::new("node")
            .args(["-p", "process.execPath"])
            .output()
            .expect("Node must be available to run the synthetic app-server");
        assert!(
            resolved_node.status.success(),
            "could not resolve the Node executable"
        );
        let node = std::str::from_utf8(&resolved_node.stdout).unwrap().trim();
        let mut process = Command::new(env!("CARGO_BIN_EXE_opencodex-daemon"))
            .arg("--codex-stdio")
            .arg(timeout_ms.to_string())
            .arg(node)
            .arg(fixture)
            .arg(behavior)
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

    /// Opens the daemon session and waits for the readiness reply.
    fn open(&mut self) {
        self.request_open(1);
        self.expect_ready();
    }

    /// Sends only the daemon-side open request, leaving the Codex handshake to Rust.
    fn request_open(&mut self, protocol_version: u64) {
        self.send(json!({
            "jsonrpc": "2.0", "id": "open", "method": "opencodex/session/open",
            "params": {
                "protocolVersion": protocol_version,
                "clientInfo": { "name": "OpenCodexUI", "version": "fixture" },
                "experimentalApi": false,
            },
        }));
    }

    /// Checks the complete daemon readiness response without consuming later notifications.
    fn expect_ready(&self) {
        assert_eq!(
            self.receive(),
            json!({
                "jsonrpc": "2.0", "id": "open", "result": { "status": "ready", "codexHome": "synthetic-home" },
            })
        );
    }

    /// Closes the client input and waits for a graceful app-server shutdown.
    fn expect_clean_shutdown(&mut self) {
        drop(self.process.stdin.take());
        assert_eq!(self.exit_code(), 0);
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
