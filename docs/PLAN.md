# Grok Spaces Dialer – Development & Campaign Plan

## Goals

**Primary**: Deliver a reliable phone interface that lets anyone find and join (or be bridged into) X Spaces without fighting the native client.

**Secondary**: Demonstrate xAI Voice Agent + tool-calling power; create a reusable pattern for other “phone-as-client” products.

## Timeline (Aggressive Prototype → Soft Launch)

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Foundation + Discovery MVP | Working call → search → link hand-off |
| 2 | UX polish + regional numbers | AU + US numbers, robust dialogue, logging |
| 3–4 | Bridge experiments | Optional audio relay prototype (high risk/reward) |
| 5 | Hardening + observability | Cost controls, guardrails, analytics |
| 6 | Soft launch | Private beta with selected users (Sky + core circle) |

## Technical Stack

- **Voice / Telephony**: xAI Voice Agent Builder + Realtime API; Twilio or xAI SIP for numbers
- **LLM / Tools**: Grok (via xAI) with function calling
- **Spaces Data**: Official X API v2 Spaces search + lookup
- **Optional Relay**: Headless / cookie-auth agents (evaluate risk)
- **Backend**: Node.js (telephony examples) or Python (search + orchestration); Vercel or dedicated server
- **Observability**: xAI call transcripts + custom logging

## Resource Requirements

- X Developer account with Spaces access (Bearer token)
- xAI API key + Voice Agent access
- Twilio account (or rely on xAI provisioned numbers)
- One or more test X accounts for relay experiments
- Domain / hosting for webhooks if using custom server

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| X API rate limits / access changes | Medium | High | Caching, graceful degradation, multiple apps |
| Unofficial join methods banned | High | Medium (for bridge only) | Keep discovery mode primary; isolate relay accounts |
| Audio latency / quality | Medium | High | Prefer native μ-law paths; measure end-to-end |
| Cost overrun on long calls | Medium | Medium | Hard session limits, prepaid credits, alerts |
| ToS / legal | Medium | High | Clear disclosure, no recording without consent, legal review |

## Campaign / Go-to-Market (Soft)

1. **Internal / Friends & Family**: Sky (AU), core Genesis Conductor / Kovach circle.
2. **X Announcement**: Thread + Space demo once MVP is stable.
3. **Target Users**: Heavy Spaces listeners who complain about stability; people on the go; international users.
4. **Messaging**: “Call Grok. Get into the Space. No app wrestling.”
5. **Pricing Experiment**: Free discovery tier; paid bridge or longer sessions later.
6. **Feedback Loop**: Post-call short survey or “rate this Space finder” prompt.

## Success Metrics (MVP)

- Successful end-to-end discovery calls > 80%
- Average time-to-selection < 45 seconds
- Caller satisfaction (simple 1–5) ≥ 4
- Zero critical outages during beta window

## Next Decision Points

- Commit to discovery-only for v1 or invest in bridge immediately?
- Use pure xAI Voice Agent Builder (lowest ops) vs custom Twilio + Realtime server (more control)?
- Open-source the scaffold or keep private under Genesis Conductor?
