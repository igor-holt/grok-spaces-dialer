"""Live X Spaces client tests. HTTP is mocked; these tests do not call api.x.com."""

import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import requests

from spaces_client import (
    SpacesApiError,
    SpacesClient,
    search_spaces_tool,
)


def response(status, payload, headers=None):
    resp = MagicMock()
    resp.status_code = status
    resp.headers = headers or {}
    resp.json.return_value = payload
    return resp


class SpacesClientTests(unittest.TestCase):
    def _client(self, resp=None, side_effect=None):
        session = MagicMock()
        if side_effect is not None:
            session.get.side_effect = side_effect
        else:
            session.get.return_value = resp
        patcher = patch("spaces_client.requests.Session", return_value=session)
        patcher.start()
        self.addCleanup(patcher.stop)
        client = SpacesClient("test-token")
        return client, session

    def test_missing_token_does_not_open_a_session(self):
        with patch.dict(os.environ, {"X_BEARER_TOKEN": "   "}), patch(
            "spaces_client.requests.Session"
        ) as session:
            with self.assertRaises(ValueError):
                SpacesClient(None)
            session.assert_not_called()

    def test_blank_argument_does_not_fall_back_to_the_environment(self):
        with patch.dict(os.environ, {"X_BEARER_TOKEN": "real-token"}):
            with self.assertRaises(ValueError):
                SpacesClient("  ")

    def test_search_calls_the_spaces_search_endpoint(self):
        payload = {
            "data": [{"id": "abc123", "title": "Agents", "state": "live"}],
            "includes": {"users": []},
        }
        client, session = self._client(response(200, payload))
        result = client.search("  AI agents  ", state="scheduled", max_results=5)
        self.assertEqual(result["data"][0]["id"], "abc123")
        url = session.get.call_args.args[0]
        params = session.get.call_args.kwargs["params"]
        self.assertEqual(url, "https://api.x.com/2/spaces/search")
        self.assertEqual(params["query"], "AI agents")
        self.assertEqual(params["state"], "scheduled")
        self.assertEqual(params["max_results"], 5)
        self.assertIn("participant_count", params["space.fields"])
        self.assertEqual(params["expansions"], "creator_id,host_ids")
        self.assertEqual(params["user.fields"], "name,username")
        self.assertFalse(session.get.call_args.kwargs["allow_redirects"])
        self.assertEqual(session.get.call_args.kwargs["timeout"], 15)
        self.assertNotIn("test-token", url)
        self.assertNotIn("test-token", str(params))
        headers = session.headers.update.call_args.args[0]
        self.assertEqual(headers["Authorization"], "Bearer test-token")
        self.assertIn("GrokSpacesDialer", headers["User-Agent"])

    def test_search_rejects_a_bad_state_before_the_request(self):
        client, session = self._client(response(200, {"data": []}))
        with self.assertRaises(ValueError):
            client.search("AI", state="ended")
        session.get.assert_not_called()

    def test_search_clamps_max_results_and_rejects_booleans(self):
        client, session = self._client(response(200, {"data": []}))
        client.search("AI", max_results=0)
        self.assertEqual(session.get.call_args.kwargs["params"]["max_results"], 1)
        client.search("AI", max_results=500)
        self.assertEqual(session.get.call_args.kwargs["params"]["max_results"], 100)
        with self.assertRaises(ValueError):
            client.search("AI", max_results=True)

    def test_rate_limit_is_a_typed_error(self):
        client, _session = self._client(
            response(429, {"title": "Too Many Requests"}, {"Retry-After": "12"})
        )
        with self.assertRaises(SpacesApiError) as caught:
            client.search("AI")
        self.assertEqual(caught.exception.status_code, 429)
        self.assertEqual(caught.exception.retry_after, "12")
        self.assertIn("rate limit", str(caught.exception).lower())

    def test_redirect_is_not_followed(self):
        client, session = self._client(response(302, {}))
        with self.assertRaises(SpacesApiError) as caught:
            client.search("AI")
        self.assertEqual(caught.exception.status_code, 302)
        self.assertEqual(session.get.call_count, 1)

    def test_http_error_uses_a_short_detail(self):
        client, _session = self._client(
            response(401, {"detail": "Unauthorized token super-secret should stay server side"})
        )
        with self.assertRaises(SpacesApiError) as caught:
            client.search("AI")
        self.assertEqual(caught.exception.status_code, 401)
        self.assertIn("Unauthorized", str(caught.exception))

    def test_network_error(self):
        client, _session = self._client(side_effect=requests.ConnectionError("dns failed"))
        with self.assertRaises(SpacesApiError) as caught:
            client.search("AI")
        self.assertIsNone(caught.exception.status_code)
        self.assertIn("dns failed", str(caught.exception))

    def test_non_json_success_is_an_error(self):
        resp = response(200, {})
        resp.json.side_effect = ValueError("not json")
        client, _session = self._client(resp)
        with self.assertRaises(SpacesApiError):
            client.search("AI")

    def test_lookup_and_creator_endpoints(self):
        client, session = self._client(response(200, {"data": []}))
        client.get_by_ids("abc123", expansions=["host_ids", "creator_id"])
        self.assertEqual(session.get.call_args.args[0], "https://api.x.com/2/spaces")
        params = session.get.call_args.kwargs["params"]
        self.assertEqual(params["ids"], "abc123")
        self.assertEqual(params["expansions"], "host_ids,creator_id")
        self.assertEqual(params["user.fields"], "name,username")

        client.get_by_creators(["111", "222"])
        self.assertEqual(
            session.get.call_args.args[0], "https://api.x.com/2/spaces/by/creator_ids"
        )
        self.assertEqual(session.get.call_args.kwargs["params"]["user_ids"], "111,222")

    def test_lookup_requires_an_id(self):
        client, session = self._client(response(200, {"data": []}))
        with self.assertRaises(ValueError):
            client.get_by_ids([])
        with self.assertRaises(ValueError):
            client.get_by_creators("   ")
        session.get.assert_not_called()

    def test_spoken_summary_names_the_host_and_link(self):
        client, _session = self._client(response(200, {"data": []}))
        text = client.format_for_voice(
            {
                "data": [
                    {
                        "id": "abc123",
                        "title": "Agents",
                        "state": "live",
                        "participant_count": 8,
                        "host_ids": ["99"],
                        "speaker_ids": ["99", "100"],
                    }
                ],
                "includes": {"users": [{"id": "99", "name": "Ada", "username": "ada"}]},
            }
        )
        self.assertIn("Option 1: Agents", text)
        self.assertIn("currently live", text)
        self.assertIn("@ada", text)
        self.assertIn("About 8 participants", text)
        self.assertIn("https://x.com/i/spaces/abc123", text)
        self.assertNotIn("connected", text.lower())
        self.assertNotIn("bridge", text.lower())

    def test_spoken_summary_omits_an_unsafe_id(self):
        client, _session = self._client(response(200, {"data": []}))
        text = client.format_for_voice(
            {"data": [{"id": "javascript:alert(1)", "title": "Bad", "state": "live"}]}
        )
        self.assertIn("Bad", text)
        self.assertNotIn("javascript:", text)
        self.assertNotIn("http", text)

    def test_spoken_summary_when_nothing_matches(self):
        client, _session = self._client(response(200, {"data": []}))
        self.assertIn("couldn't find", client.format_for_voice({"data": []}))

    def test_tool_wrapper_returns_live_summary(self):
        payload = {
            "data": [
                {
                    "id": "abc123",
                    "title": "Agents",
                    "state": "live",
                    "participant_count": 4,
                    "host_ids": ["9"],
                }
            ],
            "includes": {"users": [{"id": "9", "name": "Ada", "username": "ada"}]},
        }
        session = MagicMock()
        session.get.return_value = response(200, payload)
        with patch.dict(os.environ, {"X_BEARER_TOKEN": "tool-token"}), patch(
            "spaces_client.requests.Session", return_value=session
        ):
            out = search_spaces_tool("AI", state="live", max_results=5)
        self.assertEqual(out["source"], "live")
        self.assertEqual(out["count"], 1)
        self.assertIn("@ada", out["spoken_summary"])
        self.assertIn("https://x.com/i/spaces/abc123", out["spoken_summary"])
        self.assertNotIn("connected", out["spoken_summary"].lower())


if __name__ == "__main__":
    unittest.main()
