import { createServer } from "node:http";

/** Minimal HTTP metadata, independently testable without network access. */
export interface PreviewHttpRequest {
  url: string;
  host: string;
  method: string;
  range?: string;
}

/** Complete bounded response; media byte ranges do not reread the source file. */
export interface PreviewHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

/** Owns only the ephemeral loopback listener, never a filesystem root. */
export interface PreviewListener {
  origin: string;
  close(): Promise<void>;
}

/** Binds IPv4 loopback only and delegates all authorization to the preview service. */
export async function listenPreview(
  handle: (request: PreviewHttpRequest) => Promise<PreviewHttpResponse>
): Promise<PreviewListener> {
  const server = createServer((request, response) => {
    void handle({ url: request.url ?? "", host: request.headers.host ?? "",
      method: request.method ?? "", range: request.headers.range }).then(result => {
      response.writeHead(result.status, result.headers);
      response.end(request.method === "HEAD" ? undefined : result.body);
    }).catch(() => {
      response.writeHead(500, { "Cache-Control": "no-store" });
      response.end();
    });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  server.unref();
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Preview listener has no TCP address.");
  return { origin: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close(error => { if (error !== undefined) reject(error); else resolve(); });
        server.closeAllConnections();
      });
    } };
}

/** Implements one RFC-style byte range for native audio seeking, including suffix ranges. */
export function previewByteResponse(data: Buffer, headers: Record<string, string>, range?: string): PreviewHttpResponse {
  const common = { ...headers, "Accept-Ranges": "bytes" };
  if (range === undefined) return { status: 200, headers: { ...common, "Content-Length": String(data.length) }, body: data };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  let start = 0;
  let end = data.length - 1;
  if (match !== null && match[1] === "" && match[2] !== "") start = Math.max(0, data.length - Number(match[2]));
  else if (match !== null) {
    start = Number(match[1]);
    if (match[2] !== "") end = Math.min(end, Number(match[2]));
  }
  if (match === null || (match[1] === "" && match[2] === "") || !Number.isSafeInteger(start)
    || !Number.isSafeInteger(end) || start > end || start >= data.length) {
    return { status: 416, headers: { ...common, "Content-Range": `bytes */${data.length}`, "Content-Length": "0" }, body: Buffer.alloc(0) };
  }
  const body = data.subarray(start, end + 1);
  return { status: 206, headers: { ...common, "Content-Range": `bytes ${start}-${end}/${data.length}`,
    "Content-Length": String(body.length) }, body };
}
