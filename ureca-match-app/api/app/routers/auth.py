"""Slice A: register, verify, sign in, me.  REQ-REG-1..3, REQ-AUTH-1..3, REQ-PROF-1."""

from __future__ import annotations
import jwt
import secrets
from datetime import timedelta

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr

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


class ResendCodeRequest(BaseModel):
    email: EmailStr


def _issue_verification_code(email: str, store: StoreDep, settings: SettingsDep) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = settings.now() + timedelta(minutes=10)
    store.verification_codes[email.lower()] = (code, expires_at)
    if settings.api_mode == "mock":
        print(f"[AUTH] Verification code for {email}: {code} (expires at {expires_at.isoformat()})")
    return code


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

    _issue_verification_code(body.email, store, settings)  # REQ-REG-2
    return Ok()


@router.post("/auth/verify", response_model=Ok)
def verify(body: VerifyRequest, store: StoreDep, settings: SettingsDep) -> Ok:
    user = store.user_by_email(body.email)
    if user is None:
        raise invalid("unknown_email", "No account found for this e-mail.", "email")

    email_key = body.email.lower()
    # 000000 accepted in mock mode only for easy testing/demo
    if settings.api_mode == "mock" and body.code == "000000":
        user.status = AccountStatus.active
        store.verification_codes.pop(email_key, None)
        return Ok()

    stored = store.verification_codes.get(email_key)
    if not stored:
        raise invalid("bad_code", "No active verification code found. Request a new one.", "code")

    code, expires_at = stored
    if settings.now() > expires_at:
        raise invalid("code_expired", "The verification code has expired. Request a new one.", "code")
    if body.code != code:
        raise invalid("bad_code", "That code is not correct. Check your e-mail and try again.", "code")

    user.status = AccountStatus.active
    store.verification_codes.pop(email_key, None)
    return Ok()


@router.post("/auth/resend", response_model=Ok)
def resend(body: ResendCodeRequest, store: StoreDep, settings: SettingsDep) -> Ok:
    user = store.user_by_email(body.email)
    if user is None:
        raise invalid("unknown_email", "No account found for this e-mail.", "email")
    if user.status != AccountStatus.pending_verification:
        raise conflict("already_active", "This account is already active. Sign in instead.")

    _issue_verification_code(body.email, store, settings)
    return Ok()


@router.post("/auth/sign-in", response_model=Session)
def sign_in(body: SignInRequest, store: StoreDep, settings: SettingsDep) -> Session:
    user = store.user_by_email(body.email)
    if user is None or body.password != "password":  # Mock password check for seeded users
        raise ApiError(401, "bad_credentials", "E-mail or password is incorrect.")
    if user.status == AccountStatus.inactive:  # REQ-AUTH-2
        raise ApiError(403, "account_inactive", "This account has been deactivated. Contact the URECA office.")
    if user.status == AccountStatus.pending_verification:
        raise ApiError(403, "not_verified", "Verify your e-mail before signing in.")

    now = settings.now()
    user.last_login_at = now
    store.save_user(user)

    expires_at = now + timedelta(minutes=settings.session_minutes)

    if settings.api_mode == "supabase" and settings.supabase_jwt_secret:
        payload = {
            "sub": user.id,
            "email": user.email,
            "role": user.role.value,
            "aud": "authenticated",
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
        }
        token = jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")
    else:
        token = user.id

    return Session(access_token=token, expires_at=expires_at, user=user)

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
