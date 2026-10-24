"""Runtime settings. Values come from environment variables (see .env.example)."""

from __future__ import annotations

from datetime import UTC, datetime
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    api_mode: str = "mock"  # mock | supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    approved_email_domains: str = "e.ntu.edu.sg,ntu.edu.sg"  # REQ-REG-1
    session_minutes: int = 30  # REQ-AUTH-3
    cron_secret: str = "change-me"
    email_mode: str = "off"  # off | log | smtp | send (NFR 5.1.2); send only in production, smtp never
    smtp_host: str = "localhost"  # EMAIL_MODE=smtp: a local catcher such as Mailpit; plain SMTP, no login
    smtp_port: int = 1025
    app_env: str = ""  # set to production on any real deployment; Vercel's VERCEL_ENV is read too
    vercel_env: str = ""
    resend_api_key: str = ""
    email_from: str = "URECAMatch <onboarding@resend.dev>"
    app_url: str = "http://localhost:3000"  # base for links in e-mails
    gemini_api_key: str = ""  # AI match (REQ-VRANK-1). Empty means local scoring only
    gemini_model: str = "gemini-3.5-flash-lite"
    # Fixed "now" for mock mode so the demo is deterministic: inside Round 2's application window.
    demo_now: datetime = datetime(2026, 9, 7, 10, 0, tzinfo=UTC)
    # Developer tool: lets /debug/clock replace "now" so a cycle can be tested without waiting. Off unless DEBUG_CLOCK=true.
    debug_clock: bool = False
    # Run the schedule (matching, publishing, offer expiry) before every request. Unset means on in mock mode and off in
    # Supabase mode, where /internal/tick is the only driver.
    scheduler_on_request: bool | None = None

    def runs_scheduler_on_request(self) -> bool:
        return self.api_mode == "mock" if self.scheduler_on_request is None else self.scheduler_on_request

    @property
    def is_production(self) -> bool:
        return "production" in (self.app_env.strip().lower(), self.vercel_env.strip().lower())

    @model_validator(mode="after")
    def _no_local_mail_in_production(self) -> Settings:
        if self.email_mode == "smtp" and self.is_production:
            raise ValueError("EMAIL_MODE=smtp is for local testing only. Use EMAIL_MODE=send in production.")
        return self

    @property
    def domains(self) -> list[str]:
        return [d.strip().lower() for d in self.approved_email_domains.split(",") if d.strip()]

    def now(self) -> datetime:
        """The single clock for the whole API. Every window, deadline and timeout reads this."""
        if self.debug_clock and _clock_override is not None:
            return _clock_override
        return self.demo_now if self.api_mode == "mock" else datetime.now(UTC)


# Held in memory for this API process only; a restart returns to the real (or demo) clock.
_clock_override: datetime | None = None


def set_clock_override(value: datetime | None) -> None:
    global _clock_override
    _clock_override = value


@lru_cache
def get_settings() -> Settings:
    return Settings()
