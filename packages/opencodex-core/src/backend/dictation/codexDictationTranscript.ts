import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";

/** Tracks readiness separately from the RPC acknowledgement, and never accepts assistant text. */
export function createDictationTranscript(client: CodexAppServerClient, threadId: string) {
  let resolveStarted!: () => void;
  let rejectStarted!: (error: Error) => void;
  let resolveResult!: (text: string) => void;
  let rejectResult!: (error: Error) => void;
  let failure: Error | null = null;
  let inputFinished = false;
  let tailPending = false;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  const parts: string[] = [];
  const started = new Promise<void>((resolve, reject) => { resolveStarted = resolve; rejectStarted = reject; });
  const result = new Promise<string>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  // Errors can arrive while an append RPC is still pending.
  void started.catch(() => undefined);
  void result.catch(() => undefined);

  /** Fails both phases; raw Codex errors remain available to the caller. */
  function fail(message: string): void {
    failure = new Error(message);
    rejectStarted(failure);
    rejectResult(failure);
  }

  /** Experimental protocol has no input-commit RPC: wait for finalized segments and quiet. */
  function settleWhenQuiet(): void {
    clearTimeout(quietTimer);
    if (inputFinished && parts.length > 0 && !tailPending) {
      quietTimer = setTimeout(() => resolveResult(parts.join(" ").trim()), 2500);
    }
  }

  const deadline = setTimeout(() => fail("Codex did not finish the transcription. This experimental mode may be unavailable."), 60_000);
  const subscriptions = [
    client.onNotification(({ method, params }) => {
      if (params === null || typeof params !== "object") return;
      const data = params as Record<string, unknown>;
      if (data.threadId !== threadId) return;
      if (method === "thread/realtime/started") resolveStarted();
      if (method === "thread/realtime/error") fail(String(data.message ?? "Codex dictation failed."));
      if (method === "thread/realtime/closed") fail("Codex closed the transcription session.");
      if (method === "turn/started") {
        fail("Codex attempted to start an agent turn during dictation; the isolated session was stopped.");
        void client.stop();
      }
      if (data.role !== "user") return;
      if (method === "thread/realtime/transcript/delta") {
        tailPending = true;
        clearTimeout(quietTimer);
      }
      if (method === "thread/realtime/transcript/done" && typeof data.text === "string") {
        parts.push(data.text);
        tailPending = false;
        settleWhenQuiet();
      }
    }),
    client.onServerRequest((request) => {
      client.rejectServerRequest(request.id, "Tools are unavailable during dictation.");
      fail("Codex requested an action during dictation.");
      void client.stop();
    }),
    client.onError((error) => fail(error.message)),
    client.onClose(() => fail("Codex dictation stopped."))
  ];

  return {
    started, result,
    /** Rejects append loops after an asynchronous notification failure. */
    check(): void { if (failure !== null) throw failure; },
    /** Starts finalization only after all audio was acknowledged. */
    finishInput(): void { inputFinished = true; settleWhenQuiet(); },
    /** Removes all listeners and timers without affecting the normal conversation client. */
    dispose(): void {
      clearTimeout(deadline);
      clearTimeout(quietTimer);
      subscriptions.forEach((subscription) => subscription.dispose());
    }
  };
}
