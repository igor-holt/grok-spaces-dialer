# Grok Spaces Dialer – Workflows

The working product is discovery. A person searches public X Spaces, hears or reads a short list, and opens the chosen Space on X. This repository does not place phone calls and does not join, stream, or bridge Space audio.

## What works today

1. Open the Worker root, `GET /`.
2. Type a topic and choose live, scheduled, or all.
3. The page calls `GET /api/search?q=...&state=...`.
4. When the Worker secret `X_BEARER_TOKEN` is set, that route calls the X API and returns `"source": "live"`.
5. The page shows title, host, state, participant count when X included `participant_count`, and **Open in X** (`https://x.com/i/spaces/<id>`).
6. **Hear summary** speaks the short list with `speechSynthesis`. The same text is on the page.
7. The person listens on X, in their own client, after they open the link.

Without `X_BEARER_TOKEN`, step 4 does not call X. The response is `"source": "sample"`, the copy says it is sample data, and those rows have no X link.

`GET /privacy` and `GET /terms` are part of the same public site.

## How a search runs

```
Browser  GET /api/search?q=topic&state=all
            |
            v
Cloudflare Worker
            |
            |-- no X_BEARER_TOKEN --> labeled sample Spaces, X is not called
            |
            |-- cache hit (about 60 seconds) --> previous live list
            |
            v
GET https://api.x.com/2/spaces/search
            |
            |-- host username missing on a result
            v
GET https://api.x.com/2/spaces?ids=...
            |
            v
JSON: source, spoken_summary, spaces[].x_url, audio_bridge: false
```

The Python client in `src/spaces_client.py` can make the same X calls, plus `GET /2/spaces/by/creator_ids`, for a script or notebook. It has no sample fallback: a missing token raises, and an HTTP error raises `SpacesApiError`.

## X API endpoints

| Endpoint | Who calls it |
| --- | --- |
| `GET https://api.x.com/2/spaces/search` | Worker `/api/search`, Python `SpacesClient.search` |
| `GET https://api.x.com/2/spaces?ids=` | Worker, when search did not include a host username; Python `get_by_ids` |
| `GET https://api.x.com/2/spaces/by/creator_ids` | Python `get_by_creators` only. Not a public Worker route. |

Requests send `Authorization: Bearer <X_BEARER_TOKEN>`, `space.fields` including `title`, `state`, `host_ids`, `creator_id`, `participant_count`, and `scheduled_start`, and user expansions `creator_id,host_ids` with `user.fields=name,username`. Redirects are not followed. The token is not returned to the browser.

## Errors

- Empty topic: HTTP 400, no call to X.
- No matching Spaces: HTTP 200, `source` live, empty list, spoken “I couldn't find any matching Spaces right now.”
- X HTTP 429: HTTP 429, `source` live, empty list. Sample Spaces are not filled in.
- X auth failure, HTTP 5xx, timeout, or redirect: an error response, `source` live, empty list. Sample Spaces are not filled in.
- Too many searches from one IP in a minute: HTTP 429 from the Worker. The limit is per isolate and is only a cushion; X’s own rate limit still applies.
- No token configured: HTTP 200, `source` sample, fictional rows, or an empty sample list if nothing matches. The spoken summary says it is sample data.

## Not built

These were early ideas. They are not implemented, not deployed, and not something the demo claims:

- A phone number, Twilio, SIP, or an incoming call.
- Playing Space audio on a call, joining a Space from the server, requesting the mic, or a relay account.
- SMS follow-ups, caller accounts, and regional phone routing.

Do not describe a caller as “connected” to a Space. The handoff is the X link.

## Public paths and Access

The demo only needs `/`, `/privacy`, `/terms`, `/api/search`, and `/favicon.ico`. Cloudflare Access already publishes those (trailing slash and the search query string included) plus `/assets/*` and `/static/*`. This build inlines CSS and JavaScript, so it does not fetch `/assets` or `/static`. Other paths, including any future webhook, stay behind Access and are not required for the exhibit.
