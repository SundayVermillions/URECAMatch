"""The one way the API builds a Supabase client.

The default client talks HTTP/2 over a single shared connection. The API serves requests on several threads at once,
and a page fires many calls together, so on Windows those streams collided (WinError 10035, a 500 on /listings).
HTTP/1.1 with a pool gives each thread its own connection."""

from __future__ import annotations

import httpx
import supabase
from supabase.lib.client_options import SyncClientOptions


def make_client(url: str, key: str) -> supabase.Client:
    http = httpx.Client(http2=False, timeout=30.0, limits=httpx.Limits(max_connections=32, max_keepalive_connections=16))
    return supabase.create_client(url, key, options=SyncClientOptions(httpx_client=http))  # looked up late, so tests can swap it
