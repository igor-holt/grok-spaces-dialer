/**
 * Local preview of the discovery Worker. Does not deploy and does not print secrets.
 *
 *   node scripts/dev_worker.mjs
 *   X_BEARER_TOKEN=... node scripts/dev_worker.mjs
 */

import http from "node:http";
import { handleRequest } from "../workers/grok-spaces-dialer.js";

const port = Number(process.env.PORT || 8787);
const host = "127.0.0.1";
const token = (process.env.X_BEARER_TOKEN || "").trim();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else {
        headers.set(key, value);
      }
    }
    const request = new Request(url, { method: req.method, headers });
    const response = await handleRequest(request, process.env);
    const buffer = Buffer.from(await response.arrayBuffer());
    const outgoing = {};
    response.headers.forEach((value, key) => {
      outgoing[key] = value;
    });
    res.writeHead(response.status, outgoing);
    res.end(buffer);
  } catch (error) {
    console.error("preview error", error && error.name ? error.name : "error");
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Preview server error");
  }
});

server.listen(port, host, () => {
  console.log(`Discovery preview at http://${host}:${port}`);
  console.log(
    token
      ? "X_BEARER_TOKEN is set: searches call the X API."
      : "X_BEARER_TOKEN is not set: searches return labeled sample data.",
  );
});
