# Grok Spaces Dialer

Find a public X Space by topic, hear a short list, and open it on X.

This is a voice-first **discovery** prototype for the X Developer Exhibit. It searches public Spaces and links to them. It does not join a Space, stream Space audio, or bridge that audio to a phone.

Public demo (after this build is deployed): <https://grok-spaces-dialer.iholt.workers.dev/>

Source: <https://github.com/igor-holt/grok-spaces-dialer>

## What works today

- `GET /` is a mobile-friendly page: topic search, a short list (title, host, live or scheduled, participant count when X sends one), an **Open in X** link to `https://x.com/i/spaces/<id>`, and a spoken-summary preview using the browser’s `speechSynthesis`.
- `GET /api/search` calls the live X API when the Worker secret `X_BEARER_TOKEN` is set.
- The same secret name is used by the Python client in `src/spaces_client.py`.
- Successful live searches are cached for about 60 seconds. X rate limits and other API errors are returned as errors. Sample Spaces are **not** substituted for those errors.
- If `X_BEARER_TOKEN` is missing, `/api/search` returns clearly labeled sample Spaces and does not call X. Every search response includes `"source": "live"` or `"source": "sample"`.
- `GET /privacy` and `GET /terms` describe the prototype operated by Igor Holt / Kovach Enterprises.

## What is not built

Phone dial-in, Twilio or SIP, call audio, and any bridge that would join a Space or play Space audio are not implemented. Nothing in this repo places a call or connects you to a Space. Opening a result happens on X, in your own client.

Earlier notes that describe a phone bridge are plans, not behavior. See [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Public routes

Cloudflare Access already allows only these paths on `grok-spaces-dialer.iholt.workers.dev`. This build uses that list and no other public path:

| Path | Purpose |
| --- | --- |
| `GET /` | Landing page and demo |
| `GET /privacy` | Privacy policy |
| `GET /terms` | Terms of use |
| `GET /api/search?q=&state=` | Search. `state` is `live`, `scheduled`, or `all` (default `all`). |
| `GET /favicon.ico` | Icon |

A trailing slash is accepted on `/`, `/privacy`, `/terms`, and `/api/search`. `/assets/*` and `/static/*` are public at Access, but the pages inline their CSS and JavaScript and do not request them. `/health`, `/tools/*`, and any other path are not part of the demo. Access keeps them private.

`participant_count` is the count X returns. The page labels it “participants”. There is no separate listener field.

## How it uses the X API

The Worker sends `Authorization: Bearer <X_BEARER_TOKEN>` to `https://api.x.com` and does not follow redirects.

1. `GET /2/spaces/search` with `query`, `state` (`live`, `scheduled`, or `all`), `max_results` (at most 5 on the public route), `space.fields` (`title`, `host_ids`, `creator_id`, `speaker_ids`, `participant_count`, `state`, `scheduled_start`, `started_at`, `lang`), `expansions=creator_id,host_ids`, and `user.fields=name,username`.
2. `GET /2/spaces?ids=` with the same fields and expansions, only when search results still lack a host username.

The Python client also implements `GET /2/spaces/by/creator_ids`. The public Worker does not expose that call.

The app-only bearer token stays in the Worker secret. It is not sent to the browser. Search responses set `audio_bridge` to `false`.

## Local preview

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
node scripts/dev_worker.mjs
```

Open <http://127.0.0.1:8787>. Without a token the list is sample data. With a token:

```bash
X_BEARER_TOKEN="your app-only bearer token" node scripts/dev_worker.mjs
```

The preview process does not print the token. `npx wrangler dev` reads the same name from `.dev.vars` (see `.dev.vars.example`).

Python smoke test against the live API:

```bash
X_BEARER_TOKEN="..." python scripts/smoke_test_spaces.py "AI"
```

## Tests

```bash
node --test --test-concurrency=1 workers/grok-spaces-dialer.test.js
python3 -m unittest discover -s tests -v
```

Worker tests mock `fetch`. Python tests mock `requests`. Neither suite calls the X API.

## Deploy

From a machine logged into the Cloudflare account that owns this Worker. Do not rename it: Access is attached to `grok-spaces-dialer`.

```bash
npx wrangler deploy
npx wrangler secret put X_BEARER_TOKEN
```

When prompted, paste the app-only bearer token from the X developer portal (a token that can read Spaces). The secret name is exactly `X_BEARER_TOKEN`. `wrangler secret put` stores it and redeploys. The Worker has no other required secret. There is no token in the repo.

Until that secret exists, the public page still loads and labels results as sample data.

Access does not need to be removed. Keep the existing bypass for `/`, `/privacy`, `/terms`, `/api/search` (query string included, trailing slash included), `/favicon.ico`, `/assets/*`, and `/static/*`. Leave every other path behind Access. A private window on <https://grok-spaces-dialer.iholt.workers.dev/> should load without an Access login. If that URL redirects to `iholt.cloudflareaccess.com`, the bypass for `/` is missing.

This environment did not deploy. The hostname keeps serving the previous Worker until the commands above are run.
