# Grok Spaces Dialer – To-Do List

## Phase 0 – Foundation (Done / In Progress)
- [x] Define product concept & user stories
- [x] Research X Spaces API + xAI Voice/Telephony capabilities
- [x] Scaffold repository structure
- [x] Write core planning docs (this file, WORKFLOW, PLAN)
- [x] Implement basic X Spaces search client (Python)
- [x] Create system prompt + tool definitions for voice agent
- [x] Jupyter notebook for interactive prototyping

## Phase 1 – Discovery MVP (1–2 weeks)
- [ ] Obtain / configure X API Bearer Token with Spaces access
- [ ] Harden Spaces search + lookup (error handling, expansions for hosts/speakers)
- [ ] Build voice-agent tool wrappers (`search_spaces`, `get_space`, `list_speakers`)
- [ ] Configure xAI Voice Agent Builder (or Realtime API session) with the tools
- [ ] Provision test phone number (xAI free number or Twilio)
- [ ] End-to-end test: Call → search → list → select → receive join link / confirmation
- [ ] Basic logging, transcript capture, session state

## Phase 2 – Reliability & UX (2–3 weeks)
- [ ] Multi-turn selection dialogue polish (“that’s the one” / “next” / “more details”)
- [ ] Fallback when no results or API errors
- [ ] Rate limiting & caching of live Spaces
- [ ] Support scheduled Spaces + reminders
- [ ] Caller identity / personalization (optional PIN or linked X account)
- [ ] Cost monitoring & session time limits
- [ ] Regional numbers (AU + US) via SIP / Twilio

## Phase 3 – Audio Bridge (Optional / Advanced)
- [ ] Evaluate unofficial Space join SDKs (xspace-agent style) for feasibility & ToS risk
- [ ] Design relay architecture: Agent joins Space → streams audio to phone call
- [ ] STT/TTS or direct media bridging path
- [ ] Request-to-speak flow on behalf of caller
- [ ] Graceful degradation to discovery-only mode
- [ ] Dedicated “relay” X accounts + rotation strategy

## Phase 4 – Production & Scale
- [ ] Move to xAI Voice Agent Builder production settings (guardrails, observability)
- [ ] Multi-tenant support or private instances
- [ ] Analytics dashboard (calls, popular Spaces, drop-off)
- [ ] Legal / compliance review (X ToS, recording consent, privacy)
- [ ] Documentation & open-source release (if desired)
- [ ] Soft launch campaign

## Immediate Next Actions (This Session)
1. Finish Python Spaces client + notebook demos
2. Write agent system prompt and tool JSON schema
3. Create GitHub repo and push scaffold
4. Outline Twilio / xAI Realtime integration skeleton
