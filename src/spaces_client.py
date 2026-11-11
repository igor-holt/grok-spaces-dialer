"""
X API v2 Spaces client for Grok Spaces Dialer.

Search and lookup helpers for public Space discovery. This module does not
join a Space, stream Space audio, or bridge audio to a phone. A result is
metadata plus a link of the form https://x.com/i/spaces/<id>.

Requires an app-only bearer token with access to the Spaces endpoints.
The environment variable name is X_BEARER_TOKEN.
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://api.x.com/2"
SEARCH_PATH = "/spaces/search"
LOOKUP_PATH = "/spaces"
CREATORS_PATH = "/spaces/by/creator_ids"
ALLOWED_STATES = {"live", "scheduled", "all"}
SAFE_SPACE_ID = re.compile(r"^[A-Za-z0-9_]{1,30}$")
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
USER_EXPANSIONS = "creator_id,host_ids"
USER_FIELDS = "name,username"


class SpacesApiError(Exception):
    """The X API did not return a usable Spaces payload."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        retry_after: Optional[str] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after


class SpacesClient:
    def __init__(self, bearer_token: Optional[str] = None):
        raw = bearer_token if bearer_token is not None else os.getenv("X_BEARER_TOKEN")
        self.bearer_token = (raw or "").strip()
        if not self.bearer_token:
            raise ValueError(
                "X_BEARER_TOKEN is required. Set it in the environment or pass it explicitly."
            )
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {self.bearer_token}",
                "User-Agent": "GrokSpacesDialer/0.2",
                "Accept": "application/json",
            }
        )

    def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{BASE_URL}{path}"
        try:
            resp = self.session.get(
                url,
                params=params,
                timeout=15,
                allow_redirects=False,
            )
        except requests.RequestException as exc:
            raise SpacesApiError(f"X API request failed: {exc}") from exc

        if resp.status_code in {301, 302, 303, 307, 308}:
            raise SpacesApiError(
                "X API redirected the request. The client does not follow redirects.",
                status_code=resp.status_code,
            )
        if resp.status_code == 429:
            retry = _header(resp, "Retry-After")
            raise SpacesApiError(
                "X API rate limit reached. Try again shortly.",
                status_code=429,
                retry_after=retry,
            )
        if resp.status_code >= 400:
            raise SpacesApiError(
                f"X API error ({resp.status_code}): {_error_detail(resp)}",
                status_code=resp.status_code,
            )
        try:
            payload = resp.json()
        except ValueError as exc:
            raise SpacesApiError(
                "X API returned a non-JSON response.",
                status_code=resp.status_code,
            ) from exc
        if not isinstance(payload, dict):
            raise SpacesApiError(
                "X API returned an unexpected payload.",
                status_code=resp.status_code,
            )
        return payload

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
        Calls GET /2/spaces/search. Host and creator ids are expanded so the
        caller can show a name when X returns one.
        """
        cleaned = _clean_query(query)
        if state not in ALLOWED_STATES:
            raise ValueError("state must be live, scheduled, or all")
        fields = space_fields or DEFAULT_SPACE_FIELDS
        params = {
            "query": cleaned,
            "state": state,
            "max_results": _clamp_max_results(max_results),
            "space.fields": ",".join(fields),
            "expansions": USER_EXPANSIONS,
            "user.fields": USER_FIELDS,
        }
        return self._get(SEARCH_PATH, params=params)

    def get_by_ids(
        self,
        space_ids: List[str] | str,
        space_fields: Optional[List[str]] = None,
        expansions: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Lookup one or more Spaces by ID. Calls GET /2/spaces?ids=."""
        if isinstance(space_ids, str):
            space_ids = [space_ids]
        ids = [str(space_id).strip() for space_id in space_ids if str(space_id).strip()]
        if not ids:
            raise ValueError("at least one space id is required")
        fields = space_fields or DEFAULT_SPACE_FIELDS
        params: Dict[str, Any] = {
            "ids": ",".join(ids),
            "space.fields": ",".join(fields),
        }
        if expansions:
            params["expansions"] = ",".join(expansions)
            params["user.fields"] = USER_FIELDS
        return self._get(LOOKUP_PATH, params=params)

    def get_by_creators(
        self,
        user_ids: List[str] | str,
        space_fields: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Lookup Spaces created by the given user ids. Calls GET /2/spaces/by/creator_ids."""
        if isinstance(user_ids, str):
            user_ids = [user_ids]
        ids = [str(user_id).strip() for user_id in user_ids if str(user_id).strip()]
        if not ids:
            raise ValueError("at least one user id is required")
        fields = space_fields or DEFAULT_SPACE_FIELDS
        params = {
            "user_ids": ",".join(ids),
            "space.fields": ",".join(fields),
        }
        return self._get(CREATORS_PATH, params=params)

    def format_for_voice(self, search_result: Dict[str, Any], limit: int = 3) -> str:
        """
        Turn an API response into a short spoken summary.

        The summary names the Space and, when X included a host, the host's
        username. It includes an x.com link when the id is a normal Space id.
        It never says the caller has joined or is hearing the Space.
        """
        data = search_result.get("data") or []
        if not data:
            return "I couldn't find any matching Spaces right now."

        users = _user_index(search_result)
        lines = []
        for i, space in enumerate(data[:limit], 1):
            if not isinstance(space, dict):
                continue
            title = space.get("title") or "Untitled Space"
            state = space.get("state", "unknown")
            participants = space.get("participant_count")
            speakers = space.get("speaker_ids") or []
            space_id = str(space.get("id") or "")

            part = f"Option {i}: {title}. It is currently {state}."
            host = _host_from_space(space, users)
            if host and host.get("username"):
                part += f" Hosted by @{host['username']}."
            elif space.get("host_ids"):
                shown = [str(host_id) for host_id in space["host_ids"][:2]]
                part += f" Host IDs: {', '.join(shown)}."
            if participants is not None:
                part += f" About {participants} participants."
            if speakers:
                part += f" Speakers present: {len(speakers)}."
            url = space_url(space_id)
            if url:
                part += f" Open it on X at {url}."
            lines.append(part)

        if not lines:
            return "I couldn't find any matching Spaces right now."
        return " ".join(lines)


def space_url(space_id: str) -> Optional[str]:
    """Public X link for a Space id, or None when the id is not a plain token."""
    if not SAFE_SPACE_ID.fullmatch(space_id or ""):
        return None
    return f"https://x.com/i/spaces/{space_id}"


def search_spaces_tool(query: str, state: str = "live", max_results: int = 5) -> Dict[str, Any]:
    """
    Convenience wrapper for a voice-agent tool.

    Returns live metadata only. There is no sample fallback here: a missing
    token raises ValueError, and an API failure raises SpacesApiError.
    """
    client = SpacesClient()
    result = client.search(query=query, state=state, max_results=max_results)
    spoken = client.format_for_voice(result, limit=min(3, max_results))
    return {
        "source": "live",
        "raw": result,
        "spoken_summary": spoken,
        "count": len(result.get("data") or []),
    }


def _clean_query(query: str) -> str:
    cleaned = " ".join(str(query or "").split())
    if not cleaned:
        raise ValueError("query is required")
    if len(cleaned) > 500:
        raise ValueError("query is too long")
    return cleaned


def _clamp_max_results(max_results: int) -> int:
    if isinstance(max_results, bool) or not isinstance(max_results, int):
        raise ValueError("max_results must be an integer")
    return max(1, min(max_results, 100))


def _header(resp: Any, name: str) -> Optional[str]:
    headers = getattr(resp, "headers", None)
    if not headers:
        return None
    value = headers.get(name)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _error_detail(resp: Any) -> str:
    try:
        payload = resp.json()
    except Exception:
        return "request failed"
    detail = ""
    if isinstance(payload, dict):
        if isinstance(payload.get("detail"), str):
            detail = payload["detail"]
        else:
            errors = payload.get("errors")
            if isinstance(errors, list) and errors and isinstance(errors[0], dict):
                message = errors[0].get("message") or errors[0].get("detail")
                if isinstance(message, str):
                    detail = message
            elif isinstance(payload.get("title"), str):
                detail = payload["title"]
    if not detail:
        return "request failed"
    return " ".join(detail.split())[:180]


def _user_index(search_result: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    includes = search_result.get("includes") or {}
    users = includes.get("users") or []
    index: Dict[str, Dict[str, Any]] = {}
    for user in users:
        if isinstance(user, dict) and user.get("id"):
            index[str(user["id"])] = user
    return index


def _host_from_space(
    space: Dict[str, Any], users: Dict[str, Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    ids: List[str] = []
    for host_id in space.get("host_ids") or []:
        ids.append(str(host_id))
    if space.get("creator_id"):
        ids.append(str(space["creator_id"]))
    for user_id in ids:
        user = users.get(user_id)
        if user and (user.get("username") or user.get("name")):
            return user
    return None


if __name__ == "__main__":
    import json
    import sys

    q = sys.argv[1] if len(sys.argv) > 1 else "AI"
    try:
        out = search_spaces_tool(q)
        print(json.dumps({"spoken_summary": out["spoken_summary"], "count": out["count"]}, indent=2))
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
