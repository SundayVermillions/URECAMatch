"""Slice A. The Supabase Auth ban follows the account status, so a reactivated user can sign in again.
REQ-USER-3, REQ-AUTH-2. Fake Supabase client, no network."""

from __future__ import annotations

import logging

import pytest

from app.models import AccountStatus, UserUpdate
from app.routers import users
from app.settings import get_settings
from tests.fake_supabase import FakeDB

BANNED, UNBANNED = {"ban_duration": "876600h"}, {"ban_duration": "none"}


@pytest.fixture
def db(monkeypatch, fresh_store) -> FakeDB:
    """Supabase mode with a fake client on the seeded store. The routes only use the client for Supabase Auth."""
    d = FakeDB()
    fresh_store.client = d.client()
    monkeypatch.setattr(get_settings(), "api_mode", "supabase")
    return d


def _deactivate(store, user_id: str) -> None:
    users.deactivate(user_id, store.user("adm-1"), store, get_settings(), confirm_cleanup=True)


def _set_status(store, user_id: str, status: AccountStatus) -> None:
    users.update_user(user_id, UserUpdate(status=status), store.user("adm-1"), store, get_settings(), confirm_cleanup=True)


def test_REQ_USER_3_deactivate_bans_and_reactivate_lifts_the_ban(db, fresh_store):
    _deactivate(fresh_store, "stu-1")
    assert db.auth_calls == [("stu-1", BANNED)]
    _set_status(fresh_store, "stu-1", AccountStatus.active)
    assert fresh_store.user("stu-1").status == AccountStatus.active
    assert db.auth_calls[-1] == ("stu-1", UNBANNED)


def test_REQ_USER_3_setting_inactive_through_update_also_bans(db, fresh_store):
    _set_status(fresh_store, "stu-1", AccountStatus.inactive)
    assert db.auth_calls == [("stu-1", BANNED)]


def test_REQ_USER_3_unchanged_status_or_unverified_leaves_the_ban_alone(db, fresh_store):
    _set_status(fresh_store, "stu-1", AccountStatus.active)  # already active
    _set_status(fresh_store, "stu-1", AccountStatus.pending_verification)
    assert db.auth_calls == []


def test_REQ_USER_3_auth_error_is_logged_and_the_status_still_changes(db, fresh_store, caplog):
    db.fail_next("auth", "update_user_by_id", RuntimeError("Supabase Auth is down"))
    with caplog.at_level(logging.WARNING, logger="app.routers.users"):
        _deactivate(fresh_store, "stu-1")
    assert fresh_store.user("stu-1").status == AccountStatus.inactive
    assert any("Supabase Auth is down" in r.getMessage() for r in caplog.records)

    db.fail_next("auth", "update_user_by_id", RuntimeError("still down"))
    with caplog.at_level(logging.WARNING, logger="app.routers.users"):
        _set_status(fresh_store, "stu-1", AccountStatus.active)
    assert fresh_store.user("stu-1").status == AccountStatus.active
    assert any("still down" in r.getMessage() for r in caplog.records)


def test_REQ_USER_3_mock_mode_never_calls_supabase_auth(db, fresh_store, monkeypatch):
    monkeypatch.setattr(get_settings(), "api_mode", "mock")
    _deactivate(fresh_store, "stu-1")
    _set_status(fresh_store, "stu-1", AccountStatus.active)
    assert db.auth_calls == []
