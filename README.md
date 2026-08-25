# Grok Spaces Dialer

**Phone-first interface to X Spaces powered by xAI Voice Agents**

Call a number → talk to Grok → find live/scheduled Spaces → select one → get connected (discovery + optional audio relay).

## Vision

X Spaces client stability is unreliable. This project moves the hard parts (discovery, session management, optional bridging) into a stable cloud agent. The phone becomes the durable last-mile client.

- Sky (Australia) dials a local AU number.
- You dial a US number.
- Same backend agent answers, searches Spaces, lists hosts/speakers, confirms selection, and either hands off a clean join link or relays audio.

## Current Status (v0.1 Scaffold)

- [x] Project structure & planning docs
- [x] Spaces search client (X API v2)
- [x] Voice agent system prompt & tool schema
- [x] Jupyter prototype notebook
- [ ] Full Twilio / xAI Realtime telephony bridge
- [ ] Production Voice Agent Builder configuration
- [ ] Optional Space join/relay agent (unofficial path)
- [ ] Multi-region number provisioning

## Quick Start (Development)

```bash
# Python path (Spaces search + notebook)
cd grok-spaces-dialer
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Set keys
export X_BEARER_TOKEN="your_x_api_bearer"
export XAI_API_KEY="your_xai_key"

# Run notebook or scripts
jupyter notebook notebooks/spaces_dialer_prototype.ipynb
```

Node/Twilio path (telephony examples based on xAI cookbook):
See `src/telephony/` (coming in next iteration).

## Architecture (High Level)

```
Phone (AU/US/local) 
  → PSTN/SIP (Twilio or xAI provisioned number)
    → xAI Voice Agent / Realtime API
      → Tools: search_spaces, get_space_details, select_space
        → X API v2 Spaces endpoints
      → (Optional) Relay Agent joins Space & bridges audio
```

## Key Docs

- [docs/TODO.md](docs/TODO.md) – Phased task list
- [docs/WORKFLOW.md](docs/WORKFLOW.md) – User & system flows
- [docs/PLAN.md](docs/PLAN.md) – Development & campaign plan
- [notebooks/spaces_dialer_prototype.ipynb](notebooks/spaces_dialer_prototype.ipynb)

## License

MIT (prototype). Production use requires valid X API + xAI access and compliance with platform ToS.
