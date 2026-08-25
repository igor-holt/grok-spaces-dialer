# Grok Spaces Dialer – Workflows

## 1. Primary User Flow (Caller Perspective)

1. **Dial** the assigned number (local AU for Sky, US for others, or international).
2. **Greeting**: Agent answers with short intro  
   “Hi, this is Grok Spaces. Tell me a topic, host, or say ‘what’s live right now’.”
3. **Intent**: Caller speaks request  
   - “Find Spaces about AI agents”  
   - “Is there a Space by @elonmusk live?”  
   - “What’s happening in crypto right now?”
4. **Search & Present**: Agent calls tools, then reads back 1–3 options  
   “There’s a live Space titled ‘…’ hosted by @user, currently speaking: A, B. About 120 listeners. Say ‘that’s the one’, ‘next’, or ‘more details’.”
5. **Selection Loop**:  
   - “That’s the one” → confirm and proceed  
   - “Next” → next result  
   - “More details” → expand speakers / description  
   - “Search again” / new topic
6. **Connect**:
   - **Discovery mode (MVP)**: Agent gives the direct Space link + short instructions (“Open X and paste this, or tap the link I can text you”).
   - **Bridge mode (future)**: “You’re connected. I’m listening with you. Say ‘I want to speak’ if you’d like me to request the mic.”
7. **End / Transfer**: Caller hangs up, says “done”, or agent times out gracefully. Optional summary SMS.

## 2. System / Agent Workflow

```
Incoming Call
    ↓
xAI Voice Agent session starts (Realtime or Builder)
    ↓
System prompt loaded + tools available
    ↓
User utterance → STT → LLM decides tool use
    ↓
Tool: search_spaces(query, state="live")
    ↓
X API v2 /2/spaces/search
    ↓
Results + expansions (hosts, speakers) returned to LLM
    ↓
LLM generates spoken response (TTS)
    ↓
User selects → tool: get_space_details(id) or confirm_selection
    ↓
Final action: return join URL / start relay / log session
```

## 3. Tool Call Sequence (Example)

User: “Live Spaces about artificial intelligence”

1. `search_spaces(query="artificial intelligence", state="live", max_results=5)`
2. For top result: `get_space(id="1DXxy...")` + expand host_ids / speaker_ids
3. Present ranked list
4. On confirm: `finalize_selection(space_id, mode="link")` → returns `https://x.com/i/spaces/{id}`

## 4. Error & Edge Paths

- No results → “Nothing live on that topic right now. Try a broader term or check scheduled Spaces.”
- API rate limit / outage → graceful apology + fallback to cached popular Spaces or “try again in a minute”.
- Ambiguous selection → re-confirm.
- Long silence → gentle prompt or end session.
- Caller wants to speak in Space → (bridge mode) request speaker role via relay account.

## 5. Multi-Region / Multi-Number

- Same agent backend.
- Numbers provisioned per region (Twilio or xAI SIP).
- Caller ID or number used can optionally bias language or default search region (future).
