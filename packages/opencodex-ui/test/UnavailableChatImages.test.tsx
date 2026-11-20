// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, createTheme } from "@mui/material";
import { ApplicationErrorContext } from "../src/components/app/applicationErrorContext";
import { ApplicationErrorReporter } from "../src/stores/app/ApplicationErrorReporter";
import { ChatImageProvider } from "../src/components/messages/ChatImageProvider";
import { MarkdownMessage } from "../src/components/messages/MarkdownMessage";
import { ChatImage } from "../src/components/messages/ChatImage";
import type { FileRequestPort } from "../src/stores/files/FileDocument";

const translate = (key: string): string => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("unavailable conversation artifacts", () => {
  it.each(["light", "dark"] as const)("should keep expired images local across repeated chat visits in %s mode", async mode => {
    const request = vi.fn().mockResolvedValue({ ok: false, code: "notFound", details: "ENOENT: temporary file deleted" });
    const notify = vi.fn();
    const persist = vi.fn(async () => undefined);
    const reporter = new ApplicationErrorReporter(notify, persist);
    const onOpenLink = vi.fn();
    const reportError = reporter.report.bind(reporter);
    const theme = createTheme({ palette: { mode } });
    for (const visit of [1, 2, 3]) {
      await act(async () => root.render(<ApplicationErrorContext.Provider value={reportError}>
        <ThemeProvider theme={theme}>
          <ChatImageProvider key={visit} port={{ request } as FileRequestPort} sourceId="source" projectPath="/repo"
            onOpenLink={onOpenLink}>
            <MarkdownMessage markdown="![Generated preview](/tmp/preview.png)" onOpenLink={onOpenLink} />
          </ChatImageProvider>
        </ThemeProvider>
      </ApplicationErrorContext.Provider>));
      const fallback = container.querySelector<HTMLElement>("[data-image-unavailable]")!;
      expect(fallback.textContent).toBe("Generated preview");
      expect(getComputedStyle(fallback).color).toBe(theme.palette.error.main.replace(/^#(.{2})(.{2})(.{2})$/,
        (_match, red, green, blue) => `rgb(${parseInt(red, 16)}, ${parseInt(green, 16)}, ${parseInt(blue, 16)})`));
      expect(fallback.querySelector("svg")).not.toBeNull();
      expect(fallback.querySelector("a")?.getAttribute("title")).toBe("message.imageUnavailableHelp");
      expect(fallback.querySelector("a")?.getAttribute("href")).toBe("/tmp/preview.png");
      expect(container.textContent).not.toContain("ENOENT");
      expect(notify).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
    }
    expect(request).toHaveBeenCalledTimes(3);
    await act(async () => container.querySelector<HTMLAnchorElement>("a")!.click());
    expect(onOpenLink).toHaveBeenCalledWith("/tmp/preview.png");
  });

  it("should show failed web images locally without creating an application error", async () => {
    const reportError = vi.fn();
    const onOpenLink = vi.fn();
    await act(async () => root.render(<ApplicationErrorContext.Provider value={reportError}>
      <MarkdownMessage markdown="![Expired web image](https://example.test/expired.png)" onOpenLink={onOpenLink} />
    </ApplicationErrorContext.Provider>));
    await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(container.querySelector("[data-image-unavailable]")?.textContent).toBe("Expired web image");
    expect(container.querySelector("a")?.href).toBe("https://example.test/expired.png");
    expect(reportError).not.toHaveBeenCalled();
  });

  it("should retain failed embedded image labels without creating navigable data URLs", async () => {
    await act(async () => root.render(<ChatImage src="data:image/png;base64,AA==" alt="Embedded image" />));
    await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(container.querySelector("[data-image-unavailable]")?.textContent).toBe("Embedded image");
    expect(container.querySelector("a")).toBeNull();
  });
});
