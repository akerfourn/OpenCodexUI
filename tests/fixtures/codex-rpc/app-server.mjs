import { readFileSync, writeSync } from "node:fs";
import { createInterface } from "node:readline";

let initialized = false;
let initializeRequest;
let waitingForStartupReply = false;
let turnId;
const startupMode = process.argv[2];
const { codexPages } = JSON.parse(readFileSync(new URL("./thread-catalog.json", import.meta.url), "utf8"));
let lastCatalogFilters;

/** Emits small synthetic frames before returning to the fixture's message loop. */
function send(frame) {
  writeSync(1, JSON.stringify(frame) + "\n");
}

createInterface({ input: process.stdin }).on("line", (line) => {
  const frame = JSON.parse(line);
  if (frame.method === "initialize") {
    if (initializeRequest !== undefined) throw new Error("Received a second initialize request.");
    initializeRequest = frame;
    if (startupMode === "deny-initialize") {
      send({ id: frame.id, error: { code: -32042, message: "Initialization refused", data: { reason: "fixture" } } });
      return;
    }
    if (startupMode === "exit-during-initialize") process.exit(17);
    if (startupMode === "stall-initialize") {
      setInterval(() => undefined, 60_000);
      send({ method: "test/initialization-pending" });
      return;
    }
    if (startupMode === "request-during-initialize") {
      waitingForStartupReply = true;
      send({ id: frame.id, method: "test/startup-request" });
      return;
    }
    send({ id: frame.id, result: { codexHome: "synthetic-home" } });
    return;
  }
  if (waitingForStartupReply) {
    if (frame.id !== initializeRequest.id || frame.result?.confirmed !== true) {
      throw new Error("Expected the response to the startup request.");
    }
    waitingForStartupReply = false;
    send({ id: initializeRequest.id, result: { codexHome: "synthetic-home" } });
    return;
  }
  if (frame.method === "initialized") {
    if (initializeRequest === undefined || initialized) throw new Error("Received an unexpected initialized notification.");
    initialized = true;
    return;
  }
  if (!initialized) throw new Error("Expected the initialized notification.");

  switch (frame.method) {
    case "thread/list": {
      lastCatalogFilters = frame.params;
      const cursor = frame.params?.cursor;
      if (cursor != null && cursor !== codexPages[0].nextCursor) {
        send({ id: frame.id, error: { code: -32052, message: "Invalid cursor", data: { cursor } } });
      } else {
        send({ id: frame.id, result: cursor == null ? codexPages[0] : codexPages[1] });
      }
      return;
    }
    case "test/catalog-filters":
      send({ id: frame.id, result: lastCatalogFilters });
      return;
    case "test/initialization":
      send({ id: frame.id, result: { initializeRequest, downstreamId: frame.id } });
      return;
    case "thread/resume":
      send({ id: frame.id, result: { thread: { id: frame.params.threadId, turns: [] } } });
      return;
    case "turn/start":
      turnId = frame.id;
      send({ method: "item/agentMessage/delta", params: { delta: "Bonjour" } });
      send({ id: "approval-1", method: "item/commandExecution/requestApproval", params: { threadId: "t1" } });
      return;
    case "model/list":
      send({ id: frame.id, result: { data: [] } });
      return;
    case "test/pending":
      return;
    case "test/stall":
      // Keep the fake process alive after stdin closes to exercise forced shutdown.
      setInterval(() => undefined, 60_000);
      send({ id: frame.id, result: {} });
      return;
    case "test/exit":
      process.exit(17);
  }

  if (frame.id !== "approval-1" || frame.result?.decision !== "decline" || turnId === undefined) {
    throw new Error("Unexpected fixture request or approval response.");
  }
  send({ id: turnId, result: { turn: { id: "turn-1" } } });
  send({ method: "turn/completed", params: { turn: { id: "turn-1", status: "completed" } } });
});
