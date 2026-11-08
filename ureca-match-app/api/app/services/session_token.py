"""Session tokens for Supabase mode (REQ-AUTH-3, SRS 5.3.1).

Sign-in issues a token that expires SESSION_MINUTES later. Every request that a token authenticates gets a fresh one
back in the X-Session-Token header, so the session slides: it ends after SESSION_MINUTES without a request, not
SESSION_MINUTES after sign-in. The expiry is checked in deps.current_user.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import jwt

from app.models import User
from app.settings import Settings

TOKEN_HEADER = "X-Session-Token"
EXPIRES_HEADER = "X-Session-Expires"


def issue_session_token(user: User, settings: Settings, now: datetime) -> tuple[str, datetime]:
    """A signed token for `user` and when it expires."""
    expires_at = now + timedelta(minutes=settings.session_minutes)
    payload = {
        "sub": user.id,
        "email": user.email,
        "role": user.role.value,
        "aud": "authenticated",
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256"), expires_at
