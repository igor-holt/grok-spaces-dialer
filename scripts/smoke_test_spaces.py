#!/usr/bin/env python3
"""Quick smoke test for SpacesClient. Requires X_BEARER_TOKEN."""

import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from spaces_client import search_spaces_tool

def main():
    query = sys.argv[1] if len(sys.argv) > 1 else "AI"
    print(f"Searching live Spaces for: {query!r}")
    try:
        out = search_spaces_tool(query, state="live", max_results=5)
        print("\n--- Spoken summary (for voice agent) ---")
        print(out["spoken_summary"])
        print(f"\nCount: {out['count']}")
        if out["count"] > 0:
            print("\nFirst result IDs:")
            for s in (out["raw"].get("data") or [])[:3]:
                print(f"  - {s.get('id')}: {s.get('title')}")
    except Exception as e:
        print(f"FAILED: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
