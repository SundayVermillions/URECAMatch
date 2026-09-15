"""Slice A: register, verify, sign in, me.  REQ-REG-1..3, REQ-AUTH-1..3, REQ-PROF-1."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter

from app.deps import CurrentUser, SettingsDep, StoreDep
from app.errors import ApiError, conflict, invalid
from app.models import (
    AccountStatus,
    Me,
    Ok,
    RegisterRequest,
    Role,
    Session,
    SignInRequest,
    StudentProfile,
    SupervisorProfile,
    User,
    VerifyRequest,
)
from app.services import windows

router = APIRouter(tags=["auth"])


@router.post("/auth/register", response_model=Ok, status_code=201)
def register(body: RegisterRequest, store: StoreDep, settings: SettingsDep) -> Ok:
    domain = body.email.split("@")[-1].lower()
    if domain not in settings.domains:  # REQ-REG-1
        raise invalid("email_domain", "Use your NTU e-mail address (@e.ntu.edu.sg or @ntu.edu.sg).", "email")
    if store.user_by_email(body.email):  # REQ-REG-3
        raise conflict("email_taken", "An account with this e-mail already exists. Sign in instead.")
    if body.role == Role.admin:  # REQ-USER-2
        raise invalid("role_not_allowed", "Admin accounts are created by an existing admin.", "role")
    user = User(
        id=store.next_id(body.role.value[:3]),
        email=body.email,
        name=body.name,
        role=body.role,
        status=AccountStatus.pending_verification,
        created_at=settings.now(),
    )
    store.users.append(user)
    if body.role == Role.student:
        store.students.append(StudentProfile(user_id=user.id, school="", profile_complete=False, documents=[]))
    else:
        store.supervisors.append(SupervisorProfile(user_id=user.id, faculty=""))
    # TODO(slice A): create the Supabase Auth user and send the 6-digit code (REQ-REG-2).
    return Ok()


@router.post("/auth/verify", response_model=Ok)
def verify(body: VerifyRequest, store: StoreDep) -> Ok:
    user = store.user_by_email(body.email)
    if user is None:
        raise invalid("unknown_email", "No account found for this e-mail.", "email")
    if body.code != "000000":  # TODO(slice A): check stored code and 10-minute expiry (REQ-REG-2)
        raise invalid("bad_code", "That code is not correct. Check your e-mail and try again.", "code")
    user.status = AccountStatus.active
    return Ok()


@router.post("/auth/sign-in", response_model=Session)
def sign_in(body: SignInRequest, store: StoreDep, settings: SettingsDep) -> Session:
    user = store.user_by_email(body.email)
    if user is None or body.password != "password":  # TODO(slice A): Supabase Auth sign-in (REQ-AUTH-1)
        raise ApiError(401, "bad_credentials", "E-mail or password is incorrect.")
    if user.status == AccountStatus.inactive:  # REQ-AUTH-2
        raise ApiError(403, "account_inactive", "This account has been deactivated. Contact the URECA office.")
    if user.status == AccountStatus.pending_verification:
        raise ApiError(403, "not_verified", "Verify your e-mail before signing in.")
    user.last_login_at = settings.now()
    # Mock token: the web client sends it back as X-Demo-User. Live mode returns the Supabase JWT.
    return Session(access_token=user.id, expires_at=settings.now() + timedelta(minutes=settings.session_minutes), user=user)


@router.get("/me", response_model=Me)
def me(user: CurrentUser, store: StoreDep, settings: SettingsDep) -> Me:
    unread = sum(1 for n in store.notifications if n.user_id == user.id and not n.read)
    return Me(
        user=user,
        student=store.student(user.id),
        supervisor=store.supervisor(user.id),
        phase=windows.phase(store.cycle, settings.now()),
        unread_notifications=unread,
    )
