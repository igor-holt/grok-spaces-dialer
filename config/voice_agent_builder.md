# Voice front end

Not connected. This prototype’s working demo is the website.

Public routes on `https://grok-spaces-dialer.iholt.workers.dev`:

- `GET /`
- `GET /privacy`
- `GET /terms`
- `GET /api/search?q=<topic>&state=live|scheduled|all`
- `GET /favicon.ico`

Cloudflare Access blocks every other path. There is no public `/health` and no public `/tools/*` webhook. Do not register those URLs with a voice agent unless Access is changed on purpose. This repo does not ship a phone bridge.

Live search needs the Worker secret `X_BEARER_TOKEN`. Until it is set, `/api/search` returns `"source": "sample"`.

`config/agent_system_prompt.md` is a script for a future voice front end that still only returns an X link. `config/tools_schema.json` matches that limit: `confirm_selection` accepts `link` only.
