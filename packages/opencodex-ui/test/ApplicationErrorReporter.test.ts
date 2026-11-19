import { describe, expect, it, vi } from "vitest";
import { ApplicationErrorReporter } from "../src/stores/app/ApplicationErrorReporter";

describe("application error reporting", () => {
  it("should journal a local failure once while retaining its technical details", async () => {
    const notify = vi.fn();
    const persist = vi.fn(async () => undefined);
    const reporter = new ApplicationErrorReporter(notify, persist);
    const error = new Error("Clipboard unavailable");

    reporter.report(error, "copy file link");
    reporter.report(error, "outer catch");

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("Clipboard unavailable");
    expect(persist).toHaveBeenCalledWith("Clipboard unavailable",
      { stack: error.stack, context: "copy file link" });
  });

  it("should avoid duplicating a backend rejection in a renderer catch", () => {
    const notify = vi.fn();
    const persist = vi.fn(async () => undefined);
    const reporter = new ApplicationErrorReporter(notify, persist);
    const error = new Error("Workspace is locked");

    reporter.markReported(error);
    reporter.report(error);

    expect(notify).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it("should keep a notification visible without recursively reporting journal failure", async () => {
    const notify = vi.fn();
    const persist = vi.fn(async () => { throw new Error("Journal unavailable"); });
    const reporter = new ApplicationErrorReporter(notify, persist);

    reporter.report("Image decoding failed");
    await Promise.resolve();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("Image decoding failed");
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
