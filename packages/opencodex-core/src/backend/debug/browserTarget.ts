import { get } from "node:http";

/** Resolves an explicitly filtered page and refuses ambiguous browser attach configurations. */
export async function requireSingleBrowserTarget(port: number, filter: string): Promise<string> {
  const pages = await new Promise<Array<{ id: string; type: string; url: string }>>((resolve, reject) => {
    const request = get({ hostname: "127.0.0.1", port, path: "/json/list" }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => {
        body += chunk;
        if (body.length > 1024 * 1024) request.destroy(new Error("Browser target list is too large."));
      });
      response.on("error", reject);
      response.on("end", () => {
        try {
          if (response.statusCode !== 200) throw new Error(`Browser discovery failed (HTTP ${response.statusCode}).`);
          const value: unknown = JSON.parse(body);
          if (!Array.isArray(value)) throw new Error("Invalid browser target list.");
          resolve(value);
        } catch (error) { reject(error); }
      });
    });
    request.setTimeout(5000, () => request.destroy(new Error("Browser discovery timed out.")));
    request.on("error", reject);
  });
  const pattern = new RegExp(`^${filter.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  const matches = pages.filter(page => page.type === "page" && pattern.test(page.url));
  if (matches.length !== 1) throw new Error(`The browser URL filter matches ${matches.length} pages; identify exactly one target.`);
  return matches[0]!.id;
}
