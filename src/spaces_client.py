"""
X API v2 Spaces client for Grok Spaces Dialer.

Provides search and lookup helpers suitable for use as tools by a voice agent.
Requires a Bearer Token with Spaces access.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://api.x.com/2"
DEFAULT_SPACE_FIELDS = [
    "title",
    "host_ids",
    "speaker_ids",
    "participant_count",
    "state",
    "scheduled_start",
    "started_at",
    "creator_id",
    "lang",
]


class SpacesClient:
    def __init__(self, bearer_token: Optional[str] = None):
        self.bearer_token = bearer_token or os.getenv("X_BEARER_TOKEN")
        if not self.bearer_token:
            raise ValueError(
                "X_BEARER_TOKEN is required. Set it in the environment or pass it explicitly."
            )
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {self.bearer_token}",
                "User-Agent": "GrokSpacesDialer/0.1",
            }
        )

    def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{BASE_URL}{path}"
        resp = self.session.get(url, params=params, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def search(
        self,
        query: str,
        state: str = "live",
        max_results: int = 10,
        space_fields: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Search Spaces by keyword.

        state: "live" | "scheduled" | "all"
        """
        fields = space_fields or DEFAULT_SPACE_FIELDS
        params = {
            "query": query,
            "state": state,
            "max_results": max(1, min(max_results, 100)),
            "space.fields": ",".join(fields),
        }
        return self._get("/spaces/search", params=params)

    def get_by_ids(
        self,
        space_ids: List[str] | str,
        space_fields: Optional[List[str]] = None,
        expansions: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Lookup one or more Spaces by ID. Supports expansions for hosts/speakers."""
        if isinstance(space_ids, str):
            space_ids = [space_ids]
        fields = space_fields or DEFAULT_SPACE_FIELDS
        params: Dict[str, Any] = {
            "ids": ",".join(space_ids),
            "space.fields": ",".join(fields),
        }
        if expansions:
            params["expansions"] = ",".join(expansions)
            # When expanding users we usually want user.fields too
            params["user.fields"] = "name,username,public_metrics"
        return self._get("/spaces", params=params)

    def get_by_creators(
        self,
        user_ids: List[str] | str,
        space_fields: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        if isinstance(user_ids, str):
            user_ids = [user_ids]
        fields = space_fields or DEFAULT_SPACE_FIELDS
        params = {
            "user_ids": ",".join(user_ids),
            "space.fields": ",".join(fields),
        }
        return self._get("/spaces/by/creator_ids", params=params)

    def format_for_voice(self, search_result: Dict[str, Any], limit: int = 3) -> str:
        """
        Turn API response into a short spoken summary the agent can read aloud.
        """
        data = search_result.get("data") or []
        if not data:
            return "I couldn't find any matching Spaces right now."

        lines = []
        for i, space in enumerate(data[:limit], 1):
            title = space.get("title") or "Untitled Space"
            state = space.get("state", "unknown")
            participants = space.get("participant_count")
            hosts = space.get("host_ids") or []
            speakers = space.get("speaker_ids") or []
            space_id = space.get("id", "")

            part = f"Option {i}: {title}. It is currently {state}."
            if participants is not None:
                part += f" About {participants} participants."
            if hosts:
                part += f" Host IDs: {', '.join(hosts[:2])}."
            if speakers:
                part += f" Speakers present: {len(speakers)}."
            part += f" Space ID {space_id}."
            lines.append(part)

        return " ".join(lines)


def search_spaces_tool(query: str, state: str = "live", max_results: int = 5) -> Dict[str, Any]:
    """
    Convenience wrapper intended to be exposed as a voice-agent tool.
    """
    client = SpacesClient()
    result = client.search(query=query, state=state, max_results=max_results)
    spoken = client.format_for_voice(result, limit=min(3, max_results))
    return {
        "raw": result,
        "spoken_summary": spoken,
        "count": len(result.get("data") or []),
    }


if __name__ == "__main__":
    # Quick smoke test (requires X_BEARER_TOKEN)
    import json
    import sys

    q = sys.argv[1] if len(sys.argv) > 1 else "AI"
    try:
        out = search_spaces_tool(q)
        print(json.dumps({"spoken_summary": out["spoken_summary"], "count": out["count"]}, indent=2))
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
