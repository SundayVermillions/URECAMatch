"""Slice E. EMAIL_ALLOWLIST: on a demo over seeded data, only the team's own addresses may receive e-mail (NFR 5.1.2).
Covers both ways mail leaves the API: sign-up codes (REQ-REG-2) and notifications (REQ-NOTIF-1). Nothing is sent."""

import logging

import pytest
import resend

from app.models import NotificationEvent
from app.services.notify import notify
from app.settings import get_settings

SKIPPED = "not on EMAIL_ALLOWLIST"


@pytest.fixture
def sent(fresh_store, monkeypatch) -> list[str]:
    """Every address Resend was asked to send to."""
    to: list[str] = []
    monkeypatch.setattr(resend.Batch, "send", lambda params, options=None: to.extend(a for m in params for a in m["to"]))
    monkeypatch.setattr(get_settings(), "email_mode", "send")
    monkeypatch.setattr(get_settings(), "resend_api_key", "test-key")
    return to


def allow(monkeypatch, value: str) -> None:
    monkeypatch.setattr(get_settings(), "email_allowlist", value)


def register(anon, email: str):
    r = anon.post("/auth/register", json={"name": "Team Member", "email": email, "password": "longpassword1", "role": "student"})
    assert r.status_code == 201
    return r


def test_NFR_5_1_2_a_listed_address_gets_its_sign_up_code(anon, sent, monkeypatch):
    allow(monkeypatch, "me@e.ntu.edu.sg")
    register(anon, "me@e.ntu.edu.sg")
    assert sent == ["me@e.ntu.edu.sg"]


def test_NFR_5_1_2_an_unlisted_address_gets_no_sign_up_code_and_it_is_logged(anon, sent, monkeypatch, caplog):
    allow(monkeypatch, "me@e.ntu.edu.sg")
    with caplog.at_level(logging.INFO, logger="app.services.email"):
        register(anon, "someone.else@e.ntu.edu.sg")  # the account is still created
    assert sent == []
    assert any(SKIPPED in r.getMessage() and "someone.else@e.ntu.edu.sg" in r.getMessage() for r in caplog.records)


def test_NFR_5_1_2_notifications_only_reach_listed_addresses_but_every_one_is_stored(fresh_store, sent, monkeypatch, caplog):
    listed, seeded = fresh_store.user("stu-1"), fresh_store.user("adm-1")  # adm-1 is jonathan.teo@ntu.edu.sg, a seed
    allow(monkeypatch, listed.email)
    with caplog.at_level(logging.INFO, logger="app.services.email"):
        notify(
            fresh_store, [listed.id, seeded.id], NotificationEvent.cycle_changed, "Dates changed", "Moved.", get_settings().now()
        )
    assert sent == [listed.email]
    assert any(SKIPPED in r.getMessage() and seeded.email in r.getMessage() for r in caplog.records)
    for uid in (listed.id, seeded.id):  # REQ-NOTIF-1: the in-app copy does not depend on e-mail
        assert any(n.title == "Dates changed" for n in fresh_store.notifications_for(uid))


def test_NFR_5_1_2_an_empty_list_sends_to_everyone(fresh_store, sent, monkeypatch):
    allow(monkeypatch, "")
    a, b = fresh_store.user("stu-1"), fresh_store.user("adm-1")
    notify(fresh_store, [a.id, b.id], NotificationEvent.cycle_changed, "Dates changed", "Moved.", get_settings().now())
    assert sorted(sent) == sorted([a.email, b.email])


def test_NFR_5_1_2_case_and_spaces_in_the_list_are_ignored(anon, fresh_store, sent, monkeypatch):
    user = fresh_store.user("stu-1")
    allow(monkeypatch, f"  {user.email.upper()} ,  ,ME@E.NTU.EDU.SG  ")
    notify(fresh_store, [user.id], NotificationEvent.cycle_changed, "Dates changed", "Moved.", get_settings().now())
    register(anon, "Me@e.ntu.edu.sg")
    assert sent == [user.email, "Me@e.ntu.edu.sg"]
    assert get_settings().allowed_recipients == {user.email.lower(), "me@e.ntu.edu.sg"}


def test_NFR_5_1_2_the_list_applies_in_log_mode_too(fresh_store, monkeypatch, caplog):
    monkeypatch.setattr(get_settings(), "email_mode", "log")
    allow(monkeypatch, "me@e.ntu.edu.sg")
    with caplog.at_level(logging.INFO, logger="app.services.email"):
        notify(fresh_store, ["adm-1"], NotificationEvent.cycle_changed, "Dates changed", "Moved.", get_settings().now())
    assert not any("EMAIL_MODE=log" in r.getMessage() for r in caplog.records)
    assert any(SKIPPED in r.getMessage() for r in caplog.records)
