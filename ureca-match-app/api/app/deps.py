"""Request dependencies: current user, role guard, store.

Mock mode: pass `X-Demo-User: <user id>` (e.g. stu-1, sup-1, adm-1) instead of a JWT.
Live mode: `Authorization: Bearer <Supabase access token>`; the JWT is verified with the
project's JWT secret and the user row is loaded (SRS 5.3.2: every request is authorised by role).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Annotated

import jwt
from fastapi import Depends, Header

from app.db.store import Store, get_store
from app.errors import ApiError, forbidden
from app.models import AccountStatus, Role, User
from app.settings import Settings, get_settings

SettingsDep = Annotated[Settings, Depends(get_settings)]
StoreDep = Annotated[Store, Depends(get_store)]


def current_user(
    store: StoreDep,
    settings: SettingsDep,
    authorization: Annotated[str | None, Header()] = None,
    x_demo_user: Annotated[str | None, Header()] = None,
) -> User:
    user: User | None = None
    is_session = False

    if settings.api_mode == "mock" and x_demo_user:
        user = store.user(x_demo_user)
    elif authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
        is_session = True
        if settings.api_mode == "mock":
            user = store.user(token)
        else:
            try:
                claims = jwt.decode(
                    token,
                    settings.supabase_jwt_secret,
                    algorithms=["HS256"],
                    audience="authenticated",
                    # iat and nbf are not checked: the debug clock can run ahead of real time
                    options={"verify_exp": False, "verify_iat": False, "verify_nbf": False},
                )
            except jwt.PyJWTError as e:
                raise ApiError(401, "session_expired", "Your session has expired. Sign in again.") from e
            user = store.user(claims.get("sub", "")) or store.user_by_email(claims.get("email", ""))

    if user is None:
        raise ApiError(401, "unauthenticated", "Sign in to continue.")

    # SRS 5.3.1: Session expires after 30 minutes of inactivity (idle) for bearer sessions
    if is_session:
        now = settings.now()
        last_active = store.last_activity.get(user.id)
        if last_active is not None and (now - last_active) > timedelta(minutes=settings.session_minutes):
            store.last_activity.pop(user.id, None)
            raise ApiError(401, "session_expired", "Your session has expired due to inactivity. Sign in again.")
        store.last_activity[user.id] = now

    if user.status != AccountStatus.active:
        raise ApiError(403, "account_inactive", "This account is not active. Contact the URECA office.")  # REQ-AUTH-2

    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_role(*roles: Role):
    def _check(user: CurrentUser) -> User:
        if user.role not in roles:
            raise forbidden("This action is only available to " + " or ".join(r.value for r in roles) + " accounts.")
        return user

    return _check


StudentUser = Annotated[User, Depends(require_role(Role.student))]
SupervisorUser = Annotated[User, Depends(require_role(Role.supervisor))]
AdminUser = Annotated[User, Depends(require_role(Role.admin))]
