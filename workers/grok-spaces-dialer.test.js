import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { RATE_LIMIT_PER_MINUTE } from "./constants.js";
import { handleRequest, resetStateForTests } from "./grok-spaces-dialer.js";
import worker from "./grok-spaces-dialer.js";

const ORIGIN = "https://grok-spaces-dialer.iholt.workers.dev";
const SECRET = "super-secret-token";
const LIVE_ID = "1DXxyRYNejbKM";

function livePayload() {
  return {
    data: [
      {
        id: LIVE_ID,
        title: "Agents in the open",
        state: "live",
        host_ids: ["99"],
        creator_id: "99",
        participant_count: 42,
        scheduled_start: "2026-11-11T18:00:00.000Z",
      },
    ],
    includes: {
      users: [{ id: "99", name: "Ada Host", username: "adahost" }],
    },
  };
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function withFetch(mock, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await fn();
  } finally {
    globalThis.fetch = previous;
  }
}

function send(path, { env = {}, method = "GET", headers = {} } = {}) {
  return handleRequest(new Request(ORIGIN + path, { method, headers }), env);
}

async function bodyOf(response) {
  return response.json();
}

describe("public discovery worker", { concurrency: false }, () => {
  beforeEach(() => {
    resetStateForTests();
  });

  test("home page is the public demo and does not depend on other paths", async () => {
    const response = await send("/");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    assert.match(html, /Find a public X Space by topic, hear a short list, and open it on X/);
    assert.match(html, /Discovery only\. This does not join, stream, or bridge Space audio/);
    assert.match(html, /action="\/api\/search"/);
    assert.match(html, /fetch\('\/api\/search\?'/);
    assert.match(html, /Open in X/);
    assert.match(html, /Hear summary/);
    assert.match(html, /speechSynthesis/);
    assert.match(html, /https:\/\/github\.com\/igor-holt\/grok-spaces-dialer"/);
    assert.match(html, /docs\/WORKFLOW\.md/);
    assert.match(html, /href="\/privacy"/);
    assert.match(html, /href="\/terms"/);
    assert.match(html, /name="viewport"/);
    assert.doesNotMatch(html, /innerHTML/);
    assert.doesNotMatch(html, /\/health/);
    assert.doesNotMatch(html, /\/tools/);
    assert.doesNotMatch(html, /\/api\/spaces/);
    assert.doesNotMatch(html, /\/assets\//);
    assert.doesNotMatch(html, /\/static\//);
    assert.doesNotMatch(html, /[Yy]ou(?:'|’)re connected/);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.match(response.headers.get("content-security-policy"), /script-src 'unsafe-inline'/);
    assert.match(response.headers.get("permissions-policy"), /microphone=\(\)/);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });

  test("head on the home page has no body", async () => {
    const response = await send("/", { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
  });

  test("privacy and terms describe the operator and the data this demo handles", async () => {
    const privacy = await send("/privacy/");
    const terms = await send("/terms");
    assert.equal(privacy.status, 200);
    assert.equal(terms.status, 200);
    const privacyHtml = await privacy.text();
    const termsHtml = await terms.text();
    for (const html of [privacyHtml, termsHtml]) {
      assert.match(html, /Igor Holt/);
      assert.match(html, /Kovach Enterprises/);
      assert.match(html, /Pasadena, Maryland/);
      assert.match(html, /igor@kovachenterprises\.com/);
      assert.match(html, /does not join, stream, or bridge Space audio/);
    }
    assert.match(privacyHtml, /GET \/api\/search/);
    assert.match(privacyHtml, /X API/);
    assert.match(privacyHtml, /participant_count/);
    assert.match(privacyHtml, /No cookies set by this application/);
    assert.match(privacyHtml, /analytics product/);
    assert.match(privacyHtml, /60 seconds/);
    assert.match(privacyHtml, /CF-Connecting-IP/);
    assert.match(privacyHtml, /speechSynthesis/);
    assert.match(privacyHtml, /does not place or receive phone calls/);
    assert.match(privacy.headers.get("content-security-policy"), /script-src 'none'/);
    assert.match(termsHtml, /as-is/);
    assert.match(termsHtml, /X Developer Agreement/);
    assert.match(termsHtml, /X Developer Policy/);
    assert.match(termsHtml, /laws of the State of Maryland/);
    assert.match(termsHtml, /courts located in Maryland/);
    assert.doesNotMatch(termsHtml, /[Yy]ou(?:'|’)re connected/);
  });

  test("favicon is a real icon on the public path", async () => {
    const response = await send("/favicon.ico");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /image\/x-icon/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual([bytes[0], bytes[1], bytes[2], bytes[3]], [0, 0, 1, 0]);
  });

  test("paths outside the public demo are not implemented", async () => {
    assert.equal((await send("/health")).status, 404);
    assert.equal((await send("/api/spaces/search?q=ai")).status, 404);
    assert.equal((await send("/tools/search_spaces", { method: "POST" })).status, 404);
    assert.equal((await send("/assets/app.js")).status, 404);
  });

  test("sample mode is used only when no token is configured", async () => {
    await withFetch(async () => {
      throw new Error("X API should not be called");
    }, async () => {
      const missing = await bodyOf(await send("/api/search?q=AI%20agents"));
      assert.equal(missing.source, "sample");
      assert.equal(missing.audio_bridge, false);
      assert.match(missing.notice, /X_BEARER_TOKEN/);
      assert.match(missing.spoken_summary, /sample data/i);
      assert.ok(missing.spaces.some((space) => space.title.startsWith("Sample:")));
      assert.equal(missing.spaces[0].x_url, null);
      assert.equal(missing.spaces[0].host.username, "sample_host");

      const blank = await bodyOf(await send("/api/search?q=ai", { env: { X_BEARER_TOKEN: "   " } }));
      assert.equal(blank.source, "sample");

      const scheduled = await bodyOf(await send("/api/search/?q=music&state=scheduled"));
      assert.equal(scheduled.count, 1);
      assert.equal(scheduled.spaces[0].state, "scheduled");

      const none = await bodyOf(await send("/api/search?q=zzzz-no-match"));
      assert.equal(none.source, "sample");
      assert.equal(none.count, 0);
      assert.match(none.spoken_summary, /sample data/i);
    });
  });

  test("live search calls the X API and returns an X link", async () => {
    const calls = [];
    await withFetch(async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse(livePayload());
    }, async () => {
      const response = await send("/api/search?q=AI%20agents&state=live", {
        env: { X_BEARER_TOKEN: SECRET },
        headers: { "CF-Connecting-IP": "203.0.113.8" },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-spaces-source"), "live");
      assert.equal(response.headers.get("x-spaces-cache"), "miss");
      assert.match(response.headers.get("cache-control"), /max-age=60/);
      const body = await bodyOf(response);
      assert.equal(body.source, "live");
      assert.equal(body.audio_bridge, false);
      assert.match(body.disclaimer, /does not join, stream, or bridge Space audio/);
      assert.equal(body.count, 1);
      assert.equal(body.spaces[0].title, "Agents in the open");
      assert.equal(body.spaces[0].state, "live");
      assert.equal(body.spaces[0].participant_count, 42);
      assert.equal(body.spaces[0].host.username, "adahost");
      assert.equal(body.spaces[0].host.name, "Ada Host");
      assert.equal(body.spaces[0].x_url, `https://x.com/i/spaces/${LIVE_ID}`);
      assert.match(body.spoken_summary, /@adahost/);
      assert.doesNotMatch(body.spoken_summary, /sample data/i);
      assert.equal(body.host_lookup, "skipped");
      assert.equal(calls.length, 1);
      const target = new URL(calls[0].url);
      assert.equal(target.origin, "https://api.x.com");
      assert.equal(target.pathname, "/2/spaces/search");
      assert.equal(target.searchParams.get("query"), "AI agents");
      assert.equal(target.searchParams.get("state"), "live");
      assert.equal(target.searchParams.get("expansions"), "creator_id,host_ids");
      assert.equal(calls[0].init.redirect, "manual");
      assert.equal(calls[0].init.headers.Authorization, `Bearer ${SECRET}`);
      assert.equal(target.searchParams.has("authorization"), false);
      assert.ok(!calls[0].url.includes(SECRET));
      assert.ok(!JSON.stringify(body).includes(SECRET));
    });
  });

  test("lookup fills host names when search does not expand them", async () => {
    const calls = [];
    await withFetch(async (url) => {
      const href = String(url);
      calls.push(href);
      if (href.includes("/2/spaces/search")) {
        return jsonResponse({
          data: [
            {
              id: LIVE_ID,
              title: "Agents in the open",
              state: "live",
              host_ids: ["99"],
              creator_id: "99",
              participant_count: 42,
            },
          ],
        });
      }
      assert.equal(new URL(href).pathname, "/2/spaces");
      assert.equal(new URL(href).searchParams.get("ids"), LIVE_ID);
      return jsonResponse({
        data: [{ id: LIVE_ID, title: "Agents in the open", state: "live", host_ids: ["99"], participant_count: 42 }],
        includes: { users: [{ id: "99", name: "Ada Host", username: "adahost" }] },
      });
    }, async () => {
      const body = await bodyOf(
        await send("/api/search?query=agents", { env: { X_BEARER_TOKEN: SECRET } }),
      );
      assert.equal(body.source, "live");
      assert.equal(body.host_lookup, "ok");
      assert.equal(body.spaces[0].host.username, "adahost");
      assert.equal(calls.length, 2);
    });
  });

  test("a live failure does not fall back to sample spaces", async () => {
    await withFetch(async () => {
      return jsonResponse({ detail: SECRET, title: "Unauthorized" }, 401);
    }, async () => {
      const response = await send("/api/search?q=ai", { env: { X_BEARER_TOKEN: SECRET } });
      const text = await response.text();
      assert.equal(response.status, 502);
      const body = JSON.parse(text);
      assert.equal(body.source, "live");
      assert.equal(body.error, "unauthorized");
      assert.deepEqual(body.spaces, []);
      assert.equal(body.audio_bridge, false);
      assert.ok(!text.includes(SECRET));
      assert.doesNotMatch(text, /Sample:/);
    });

    await withFetch(async () => {
      return jsonResponse({ title: "Too Many Requests" }, 429, { "retry-after": "12" });
    }, async () => {
      const response = await send("/api/search?q=ai", { env: { X_BEARER_TOKEN: SECRET } });
      assert.equal(response.status, 429);
      assert.equal(response.headers.get("retry-after"), "12");
      const body = await bodyOf(response);
      assert.equal(body.source, "live");
      assert.equal(body.error, "rate_limited");
      assert.deepEqual(body.spaces, []);
      assert.match(body.message, /No substitute Spaces/);
    });

    await withFetch(async () => {
      return new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } });
    }, async () => {
      let calls = 0;
      const response = await send("/api/search?q=ai", { env: { X_BEARER_TOKEN: SECRET } });
      calls += 1;
      const body = await bodyOf(response);
      assert.equal(response.status, 502);
      assert.equal(body.error, "bad_upstream");
      assert.equal(body.source, "live");
      assert.equal(calls, 1);
    });
  });

  test("redirect responses are not fetched a second time", async () => {
    let calls = 0;
    await withFetch(async () => {
      calls += 1;
      return new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } });
    }, async () => {
      const response = await send("/api/search?q=ai", { env: { X_BEARER_TOKEN: SECRET } });
      assert.equal(response.status, 502);
      assert.equal(calls, 1);
    });
  });

  test("timeouts stay on the live path", async () => {
    await withFetch(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }, async () => {
      const response = await send("/api/search?q=ai", { env: { X_BEARER_TOKEN: SECRET } });
      assert.equal(response.status, 504);
      const body = await bodyOf(response);
      assert.equal(body.source, "live");
      assert.equal(body.error, "timeout");
      assert.deepEqual(body.spaces, []);
    });
  });

  test("successful live responses are cached and errors are not", async () => {
    let calls = 0;
    await withFetch(async () => {
      calls += 1;
      return jsonResponse(livePayload());
    }, async () => {
      const first = await send("/api/search?q=cache-me", { env: { X_BEARER_TOKEN: SECRET } });
      assert.equal(first.headers.get("x-spaces-cache"), "miss");
      const second = await send("/api/search?q=cache-me", { env: { X_BEARER_TOKEN: SECRET } });
      assert.equal(second.headers.get("x-spaces-cache"), "hit");
      const body = await bodyOf(second);
      assert.equal(body.spaces[0].x_url, `https://x.com/i/spaces/${LIVE_ID}`);
      assert.equal(calls, 1);
    });

    calls = 0;
    await withFetch(async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ title: "boom" }, 500);
      return jsonResponse(livePayload());
    }, async () => {
      const failed = await send("/api/search?q=retry-me", { env: { X_BEARER_TOKEN: SECRET } });
      assert.equal(failed.status, 502);
      const recovered = await send("/api/search?q=retry-me", { env: { X_BEARER_TOKEN: SECRET } });
      assert.equal(recovered.status, 200);
      assert.equal((await bodyOf(recovered)).source, "live");
      assert.equal(calls, 2);
    });
  });

  test("validation and method errors do not call X", async () => {
    await withFetch(async () => {
      throw new Error("X API should not be called");
    }, async () => {
      const missing = await send("/api/search", { env: { X_BEARER_TOKEN: SECRET } });
      assert.equal(missing.status, 400);
      assert.equal((await bodyOf(missing)).error, "missing_query");
      const state = await send("/api/search?q=ai&state=ended", { env: { X_BEARER_TOKEN: SECRET } });
      assert.equal(state.status, 400);
      const max = await send("/api/search?q=ai&max_results=9", { env: { X_BEARER_TOKEN: SECRET } });
      assert.equal(max.status, 400);
      const posted = await send("/api/search?q=ai", { method: "POST", env: { X_BEARER_TOKEN: SECRET } });
      assert.equal(posted.status, 405);
      const postedBody = await bodyOf(posted);
      assert.equal(postedBody.source, "live");
      assert.equal(postedBody.audio_bridge, false);
    });
  });

  test("the per-IP limit does not serve sample spaces", async () => {
    await withFetch(async () => {
      throw new Error("X API should not be called");
    }, async () => {
      const headers = { "CF-Connecting-IP": "203.0.113.20" };
      for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i += 1) {
        const response = await send("/api/search?q=ai", { headers });
        assert.equal(response.status, 200);
      }
      const blocked = await send("/api/search?q=ai", { headers });
      assert.equal(blocked.status, 429);
      const body = await bodyOf(blocked);
      assert.equal(body.error, "slow_down");
      assert.equal(body.source, "sample");
      assert.deepEqual(body.spaces, []);
      const other = await send("/api/search?q=ai", { headers: { "CF-Connecting-IP": "203.0.113.21" } });
      assert.equal(other.status, 200);
      assert.equal((await bodyOf(other)).source, "sample");
    });
  });

  test("the module fetch handler serves the home page", async () => {
    const response = await worker.fetch(new Request(`${ORIGIN}/`));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Grok Spaces Dialer/);
  });
});
