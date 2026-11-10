/**
 * Grok Spaces Dialer — public discovery Worker.
 *
 * Cloudflare Access exposes only these paths (a trailing slash is accepted):
 *   GET /
 *   GET /privacy
 *   GET /terms
 *   GET /api/search
 *   GET /favicon.ico
 *   GET /assets/* and /static/* are public at Access, but this build inlines
 *   its CSS and JavaScript and does not depend on them.
 *
 * Secret: X_BEARER_TOKEN, an app-only bearer token for api.x.com.
 * When that secret is missing, GET /api/search returns labeled sample Spaces
 * and does not call X. Sample data is never used as a stand-in for an API error.
 *
 * This Worker does not join, stream, or bridge Space audio.
 */

import {
  CACHE_TTL_SECONDS,
  DISCLAIMER,
  PUBLIC_MAX_RESULTS,
  RATE_LIMIT_PER_MINUTE,
  SPACE_FIELDS,
  TOKEN_SECRET_NAME,
} from "./constants.js";
import { renderHome, renderPrivacy, renderTerms } from "./pages.js";

const X_ORIGIN = "https://api.x.com";
const SAMPLE_NOTICE =
  "Sample data. X_BEARER_TOKEN is not configured on this server, so these are not live Spaces and the X API was not called.";

const memoryCache = new Map();
const rateBuckets = new Map();

const FAVICON_BASE64 =
  "AAABAAEAEBAAAAEAIABxAAAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAAQAAAAEAgGAAAAH/P/YQAAADhJREFUeNpjuHvp8H9KMAOI+P/rM1l4kBogKyWGFxNlAC4bSTKgX1cLBY9EAygKRIqicYgmZUowAKEqZNJvfzWCAAAAAElFTkSuQmCC";

export function resetStateForTests() {
  memoryCache.clear();
  rateBuckets.clear();
}

export async function handleRequest(request, env = {}, _ctx) {
  const config = env && typeof env === "object" ? env : {};
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return json({ error: "bad_request", message: "Bad request URL.", audio_bridge: false, disclaimer: DISCLAIMER }, 400);
  }
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();

  if (path === "/") {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET, HEAD");
    return html(renderHome(), method, true);
  }
  if (path === "/privacy") {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET, HEAD");
    return html(renderPrivacy(), method, false);
  }
  if (path === "/terms") {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET, HEAD");
    return html(renderTerms(), method, false);
  }
  if (path === "/favicon.ico") {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET, HEAD");
    return favicon(method);
  }
  if (path === "/api/search") {
    if (method !== "GET") {
      return json(
        baseBody({
          source: dataSource(config),
          query: "",
          state: "all",
          spaces: [],
          error: "method_not_allowed",
          message: "Use GET.",
        }),
        405,
        { allow: "GET" },
      );
    }
    return handleSearch(request, url, config);
  }
  return json(
    {
      error: "not_found",
      message: "Nothing is published at this path.",
      audio_bridge: false,
      disclaimer: DISCLAIMER,
    },
    404,
  );
}

async function handleSearch(request, url, env) {
  const source = dataSource(env);
  const cleaned = cleanQuery(url.searchParams.get("q") ?? url.searchParams.get("query") ?? "");
  if (cleaned.error) {
    return json(baseBody({ source, query: cleaned.value, state: "all", spaces: [], error: cleaned.error, message: cleaned.message }), 400);
  }
  const query = cleaned.value;
  const stateParam = (url.searchParams.get("state") || "all").trim().toLowerCase();
  if (stateParam !== "live" && stateParam !== "scheduled" && stateParam !== "all") {
    return json(
      baseBody({
        source,
        query,
        state: stateParam,
        spaces: [],
        error: "bad_state",
        message: "State must be live, scheduled, or all.",
      }),
      400,
    );
  }
  const maxResults = parseMaxResults(url.searchParams.get("max_results"));
  if (maxResults.error) {
    return json(baseBody({ source, query, state: stateParam, spaces: [], error: maxResults.error, message: maxResults.message }), 400);
  }

  if (!allowRequest(clientKey(request))) {
    return json(
      baseBody({
        source,
        query,
        state: stateParam,
        spaces: [],
        error: "slow_down",
        message: "Too many searches from this network. Wait a minute and try again.",
        spoken_summary: "Too many searches. Wait a minute and try again.",
      }),
      429,
      { "retry-after": "60" },
    );
  }

  if (!token(env)) {
    const spaces = sampleSpaces(query, stateParam).slice(0, maxResults.value);
    return json(
      baseBody({
        source: "sample",
        query,
        state: stateParam,
        spaces,
        notice: SAMPLE_NOTICE,
        host_lookup: "not_applicable",
      }),
      200,
      { "x-spaces-cache": "none" },
    );
  }

  const cacheKey = `https://grok-spaces-dialer.internal/api/search?q=${encodeURIComponent(query)}&state=${stateParam}&n=${maxResults.value}`;
  const cached = await readCache(cacheKey);
  if (cached) return json(cached, 200, { "x-spaces-cache": "hit" });

  const result = await searchLive(env, query, stateParam, maxResults.value);
  if (result.status === 200 && !result.body.error) await writeCache(cacheKey, result.body);
  const extra = { "x-spaces-cache": "miss" };
  if (result.retryAfter) extra["retry-after"] = result.retryAfter;
  return json(result.body, result.status, extra);
}

async function searchLive(env, query, state, maxResults) {
  const params = {
    query,
    state,
    max_results: String(maxResults),
    "space.fields": SPACE_FIELDS,
    expansions: "creator_id,host_ids",
    "user.fields": "name,username",
  };
  const searched = await xGet(env, "/2/spaces/search", params);
  if (!searched.ok) {
    console.error("x spaces search failed", searched.status);
    return failFromX(searched, query, state);
  }

  const payload = searched.body && typeof searched.body === "object" ? searched.body : {};
  let raw = Array.isArray(payload.data) ? payload.data : [];
  if (!raw.length && Array.isArray(payload.errors) && payload.errors.length) {
    return {
      status: 200,
      body: baseBody({
        source: "live",
        query,
        state,
        spaces: [],
        error: "x_api_error",
        message: "The X API returned no Spaces for that search.",
        spoken_summary: "I couldn't find any matching Spaces right now.",
      }),
    };
  }

  let users = indexUsers(payload);
  let hostLookup = "skipped";
  if (raw.some((space) => needsHostLookup(space, users))) {
    const ids = raw.map((space) => space && space.id).filter(safeId).slice(0, maxResults);
    if (ids.length) {
      const looked = await xGet(env, "/2/spaces", {
        ids: ids.join(","),
        "space.fields": SPACE_FIELDS,
        expansions: "creator_id,host_ids",
        "user.fields": "name,username",
      });
      if (looked.ok && looked.body && typeof looked.body === "object") {
        hostLookup = "ok";
        const extra = new Map(
          (Array.isArray(looked.body.data) ? looked.body.data : []).map((space) => [space && space.id, space]),
        );
        raw = raw.map((space) => mergeSpace(space, extra.get(space && space.id)));
        for (const [id, user] of indexUsers(looked.body)) users.set(id, user);
      } else {
        hostLookup = "unavailable";
        console.error("x spaces lookup failed", looked.status);
      }
    }
  }

  const spaces = raw.map((space) => presentLive(space, users)).filter(Boolean).slice(0, maxResults);
  return {
    status: 200,
    body: baseBody({ source: "live", query, state, spaces, host_lookup: hostLookup }),
  };
}

function failFromX(result, query, state) {
  let status = 502;
  let error = "x_api_error";
  let message = "The X API did not return Spaces for that search. No substitute Spaces are shown.";
  if (result.status === 429) {
    status = 429;
    error = "rate_limited";
    message = "The X API is rate limiting searches. Try again shortly. No substitute Spaces are shown.";
  } else if (result.timeout) {
    status = 504;
    error = "timeout";
    message = "The X API took too long to answer. Try again shortly.";
  } else if (result.redirect) {
    error = "bad_upstream";
    message = "The X API redirected the request. This server did not follow it.";
  } else if (result.status === 401 || result.status === 403) {
    // HTTP 401 here would look like a Cloudflare Access challenge on this hostname.
    error = "unauthorized";
    message = "The X API rejected this app's credentials.";
  }
  return {
    status,
    retryAfter: result.retryAfter || null,
    body: baseBody({
      source: "live",
      query,
      state,
      spaces: [],
      error,
      message,
      spoken_summary: message,
    }),
  };
}

async function xGet(env, path, params) {
  const url = new URL(X_ORIGIN + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${token(env)}`,
        Accept: "application/json",
        "User-Agent": "GrokSpacesDialer/0.2 (+https://github.com/igor-holt/grok-spaces-dialer)",
      },
    });
  } catch (error) {
    const aborted = Boolean(error && error.name === "AbortError");
    return { ok: false, status: aborted ? 504 : 502, timeout: aborted, network: !aborted, body: null, retryAfter: null };
  }
  if (response.status >= 300 && response.status < 400) {
    return { ok: false, status: response.status, redirect: true, body: null, retryAfter: null };
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    body,
    retryAfter: response.headers.get("retry-after"),
  };
}

function presentLive(space, users) {
  if (!space || !safeId(space.id)) return null;
  const count = space.participant_count;
  return {
    id: space.id,
    title: typeof space.title === "string" && space.title.trim() ? space.title.trim() : "Untitled Space",
    state: typeof space.state === "string" && space.state ? space.state : "unknown",
    host: hostFor(space, users),
    participant_count: typeof count === "number" && Number.isFinite(count) ? count : null,
    scheduled_start: typeof space.scheduled_start === "string" ? space.scheduled_start : null,
    x_url: `https://x.com/i/spaces/${space.id}`,
  };
}

function presentSample(space) {
  return {
    id: space.id,
    title: space.title,
    state: space.state,
    host: space.host,
    participant_count: space.participant_count,
    scheduled_start: space.scheduled_start || null,
    x_url: null,
    sample: true,
  };
}

const SAMPLE_CATALOG = [
  {
    id: "sample-ai",
    title: "Sample: AI office hours",
    state: "live",
    host: { name: "Sample Host", username: "sample_host" },
    participant_count: 12,
    topics: ["ai", "agents", "grok", "machine learning"],
  },
  {
    id: "sample-music",
    title: "Sample: evening listening room",
    state: "scheduled",
    host: { name: "Sample Host", username: "sample_host" },
    participant_count: null,
    scheduled_start: "2099-01-01T23:00:00.000Z",
    topics: ["music", "listening", "radio"],
  },
  {
    id: "sample-science",
    title: "Sample: science questions",
    state: "live",
    host: { name: "Sample Host", username: "sample_host" },
    participant_count: 3,
    topics: ["science", "astronomy"],
  },
  {
    id: "sample-markets",
    title: "Sample: markets notebook",
    state: "live",
    host: { name: "Sample Host", username: "sample_host" },
    participant_count: 4,
    topics: ["crypto", "markets", "bitcoin"],
  },
];

function sampleSpaces(query, state) {
  const needle = query.toLowerCase();
  const words = needle.split(" ").filter((word) => word.length >= 2);
  return SAMPLE_CATALOG.filter((space) => {
    if (state !== "all" && space.state !== state) return false;
    const hay = [space.title, space.host.name, space.host.username, ...space.topics].join(" ").toLowerCase();
    if (hay.includes(needle)) return true;
    return words.some((word) => hay.includes(word));
  }).map(presentSample);
}

function spokenSummary(spaces, source) {
  if (source === "sample" && spaces.length === 0) {
    return "This is sample data, not a live result from X. No sample Space matches that topic. An X API token is not configured on this server.";
  }
  if (spaces.length === 0) return "I couldn't find any matching Spaces right now.";
  const prefix = source === "sample" ? "This is sample data, not a live result from X. " : "";
  const lines = spaces.slice(0, 3).map((space, index) => {
    let line = `Option ${index + 1}: ${space.title}. It is currently ${space.state}.`;
    if (space.host && space.host.username) line += ` Hosted by @${space.host.username}.`;
    else if (space.host && space.host.name) line += ` Hosted by ${space.host.name}.`;
    if (typeof space.participant_count === "number") line += ` About ${space.participant_count} participants.`;
    if (source === "sample") line += " This sample has no live X link.";
    return line;
  });
  return prefix + lines.join(" ");
}

function baseBody(fields) {
  const spaces = Array.isArray(fields.spaces) ? fields.spaces : [];
  const body = {
    source: fields.source,
    query: fields.query ?? "",
    state: fields.state ?? "all",
    count: spaces.length,
    audio_bridge: false,
    disclaimer: DISCLAIMER,
    spoken_summary: fields.spoken_summary || spokenSummary(spaces, fields.source),
    spaces,
  };
  if (fields.notice) body.notice = fields.notice;
  if (fields.error) {
    body.error = fields.error;
    body.message = fields.message || "";
  }
  if (fields.host_lookup) body.host_lookup = fields.host_lookup;
  if (fields.retry_after) body.retry_after = fields.retry_after;
  return body;
}

function token(env) {
  const value = env && env[TOKEN_SECRET_NAME];
  return typeof value === "string" ? value.trim() : "";
}

function dataSource(env) {
  return token(env) ? "live" : "sample";
}

function cleanQuery(raw) {
  const value = String(raw || "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!value) return { error: "missing_query", message: "Type a topic to search.", value: "" };
  if (value.length > 80) return { error: "query_too_long", message: "Keep the topic under 80 characters.", value };
  return { value };
}

function parseMaxResults(raw) {
  if (raw == null || raw === "") return { value: PUBLIC_MAX_RESULTS };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > PUBLIC_MAX_RESULTS) {
    return { error: "bad_max_results", message: `max_results must be an integer from 1 to ${PUBLIC_MAX_RESULTS}.` };
  }
  return { value: parsed };
}

function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function clientKey(request) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) return "unknown";
  return ip.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 64) || "unknown";
}

function allowRequest(key) {
  const now = Date.now();
  if (rateBuckets.size > 5000) rateBuckets.clear();
  const prev = (rateBuckets.get(key) || []).filter((stamp) => now - stamp < 60_000);
  if (prev.length >= RATE_LIMIT_PER_MINUTE) {
    rateBuckets.set(key, prev);
    return false;
  }
  prev.push(now);
  rateBuckets.set(key, prev);
  return true;
}

function indexUsers(payload) {
  const map = new Map();
  const users = payload && payload.includes && Array.isArray(payload.includes.users) ? payload.includes.users : [];
  for (const user of users) {
    if (user && user.id != null) map.set(String(user.id), user);
  }
  return map;
}

function hostFor(space, users) {
  const ids = [];
  if (Array.isArray(space.host_ids)) ids.push(...space.host_ids);
  if (space.creator_id != null) ids.push(space.creator_id);
  for (const id of ids) {
    const user = users.get(String(id));
    if (user && (user.username || user.name)) {
      return { id: String(user.id), name: user.name || null, username: user.username || null };
    }
  }
  if (ids.length) return { id: String(ids[0]), name: null, username: null };
  return null;
}

function needsHostLookup(space, users) {
  if (!space || !safeId(space.id)) return false;
  const host = hostFor(space, users);
  if (host && host.username) return false;
  return Boolean((Array.isArray(space.host_ids) && space.host_ids.length) || space.creator_id);
}

function mergeSpace(space, extra) {
  if (!extra || typeof extra !== "object") return space;
  const merged = { ...space };
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null) merged[key] = value;
  }
  return merged;
}

function safeId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_]{1,30}$/.test(id);
}

async function readCache(key) {
  const now = Date.now();
  const hit = memoryCache.get(key);
  if (hit && hit.expires > now) return hit.body;
  if (hit) memoryCache.delete(key);
  try {
    if (typeof caches !== "undefined" && caches && caches.default) {
      const match = await caches.default.match(new Request(key));
      if (match) {
        const body = await match.json();
        remember(key, body);
        return body;
      }
    }
  } catch {
    // The Cache API is not available in every runtime. Memory cache still applies.
  }
  return null;
}

async function writeCache(key, body) {
  remember(key, body);
  try {
    if (typeof caches !== "undefined" && caches && caches.default) {
      const response = new Response(JSON.stringify(body), {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
        },
      });
      await caches.default.put(new Request(key), response);
    }
  } catch {
    // Ignore cache write failures. The caller still gets the live response.
  }
}

function remember(key, body) {
  if (memoryCache.has(key)) memoryCache.delete(key);
  memoryCache.set(key, { expires: Date.now() + CACHE_TTL_SECONDS * 1000, body });
  while (memoryCache.size > 200) {
    const oldest = memoryCache.keys().next().value;
    memoryCache.delete(oldest);
  }
}

function html(body, method, allowScript) {
  const headers = baseHeaders();
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-cache");
  headers.set("content-security-policy", contentSecurityPolicy(allowScript));
  if (method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(body, { status: 200, headers });
}

function favicon(method) {
  const binary = atob(FAVICON_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const headers = baseHeaders();
  headers.set("content-type", "image/x-icon");
  headers.set("cache-control", "public, max-age=86400");
  if (method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(bytes, { status: 200, headers });
}

function json(body, status, extra) {
  const headers = baseHeaders();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", status === 200 && body && body.source === "live" ? "public, max-age=60" : "no-store");
  headers.set("x-spaces-source", body && body.source ? body.source : "none");
  headers.set("cross-origin-resource-policy", "same-origin");
  if (extra) {
    for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function methodNotAllowed(allow) {
  return json(
    {
      error: "method_not_allowed",
      message: "Use GET.",
      source: "none",
      audio_bridge: false,
      disclaimer: DISCLAIMER,
      spaces: [],
      count: 0,
    },
    405,
    { allow },
  );
}

function baseHeaders() {
  const headers = new Headers();
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-frame-options", "DENY");
  headers.set("permissions-policy", "microphone=(), camera=(), geolocation=()");
  return headers;
}

function contentSecurityPolicy(allowScript) {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    allowScript ? "script-src 'unsafe-inline'" : "script-src 'none'",
    "img-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
