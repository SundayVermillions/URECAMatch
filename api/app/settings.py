"""Runtime settings. Values come from environment variables (see .env.example)."""

from __future__ import annotations

from datetime import UTC, datetime
from functools import lru_cache

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
    # Fixed "now" for mock mode so the demo is deterministic: inside Round 2's application window.
    demo_now: datetime = datetime(2026, 9, 7, 10, 0, tzinfo=UTC)

    @property
    def domains(self) -> list[str]:
        return [d.strip().lower() for d in self.approved_email_domains.split(",") if d.strip()]

    def now(self) -> datetime:
        return self.demo_now if self.api_mode == "mock" else datetime.now(UTC)


@lru_cache
def get_settings() -> Settings:
    return Settings()
