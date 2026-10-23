"""Slice E. EMAIL_MODE=smtp sends the same e-mails over plain SMTP to a local catcher (NFR 5.1.2).
A tiny SMTP server in the test stands in for Mailpit; nothing leaves the machine."""

from __future__ import annotations

import email as emaillib
import os
import socket
import subprocess
import sys
import threading
from email import policy
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.dev import send_samples
from app.models import NotificationEvent
from app.services import email
from app.services.notify import notify
from app.settings import Settings, get_settings

API_DIR = Path(__file__).resolve().parents[1]


class FakeSmtpServer:
    """Accepts mail with no login, like Mailpit, and keeps what it received."""

    def __init__(self) -> None:
        self.sock = socket.socket()
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen()
        self.port = self.sock.getsockname()[1]
        self.messages: list[emaillib.message.EmailMessage] = []
        self.recipients: list[list[str]] = []
        self.commands: list[str] = []
        threading.Thread(target=self._serve, daemon=True).start()

    def _serve(self) -> None:
        while True:
            try:
                conn, _ = self.sock.accept()
            except OSError:
                return
            with conn:
                self._session(conn.makefile("rwb", buffering=0))

    def _session(self, f) -> None:
        def reply(line: str) -> None:
            f.write(line.encode() + b"\r\n")

        reply("220 fake ESMTP")
        rcpts: list[str] = []
        while line := f.readline():
            cmd = line.decode().strip()
            self.commands.append(cmd.split(" ")[0].upper())
            word = cmd.upper()
            if word.startswith("DATA"):
                reply("354 go ahead")
                data = b""
                while not data.endswith(b"\r\n.\r\n"):
                    data += f.readline()
                self.messages.append(emaillib.message_from_bytes(data[:-5], policy=policy.default))
                self.recipients.append(rcpts)
                rcpts = []
                reply("250 queued")
            elif word.startswith("RCPT TO"):
                rcpts.append(cmd.split("<", 1)[1].split(">", 1)[0])
                reply("250 ok")
            elif word.startswith("QUIT"):
                reply("221 bye")
                return
            elif word.startswith("EHLO"):
                reply("250 fake")  # no AUTH offered: the client never logs in
            else:
                reply("250 ok")

    def close(self) -> None:
        self.sock.close()


@pytest.fixture
def smtp(monkeypatch):
    server = FakeSmtpServer()
    s = get_settings()
    monkeypatch.setattr(s, "email_mode", "smtp")
    monkeypatch.setattr(s, "smtp_host", "127.0.0.1")
    monkeypatch.setattr(s, "smtp_port", server.port)
    yield server
    server.close()


def body(msg, kind: str) -> str:
    """The part's text with plain newlines: SMTP carries line breaks as CRLF."""
    return msg.get_body(preferencelist=(kind,)).get_content().replace("\r\n", "\n")


# ------------------------------------------------------------------ the transport


def test_NFR_5_1_2_smtp_mode_sends_to_the_configured_host_and_port(fresh_store, smtp):
    notify(
        fresh_store,
        ["stu-1"],
        NotificationEvent.round_opened,
        "Round 2 open",
        "Apply by 14 Sep.",
        get_settings().now(),
        "/browse",
    )
    assert len(smtp.messages) == 1
    msg = smtp.messages[0]
    assert smtp.recipients == [[fresh_store.user("stu-1").email]]
    assert msg["Subject"] == "Round 2 open" and msg["From"] == get_settings().email_from
    assert "AUTH" not in smtp.commands  # plain SMTP, no login


def test_NFR_5_1_2_smtp_mode_sends_the_same_html_and_text_as_send_mode(fresh_store, smtp):
    created = notify(
        fresh_store,
        ["stu-1"],
        NotificationEvent.offer_received,
        "You have a match offer",
        "Respond by 21 Sep.",
        get_settings().now(),
    )
    subject, html_body, text = email.render(created[0], fresh_store.user("stu-1"))
    msg = smtp.messages[0]
    assert msg["Subject"] == subject
    assert body(msg, "html").strip() == html_body and body(msg, "plain").strip() == text


def test_NFR_5_1_2_smtp_mode_sends_every_recipient_over_one_connection(fresh_store, smtp):
    notify(fresh_store, ["stu-1", "sup-1"], NotificationEvent.cycle_changed, "t", "m", get_settings().now())
    assert [r[0] for r in smtp.recipients] == [fresh_store.user("stu-1").email, fresh_store.user("sup-1").email]
    assert smtp.commands.count("QUIT") == 1


def test_NFR_5_1_2_an_unreachable_smtp_server_keeps_the_notification(fresh_store, monkeypatch, as_student):
    s = get_settings()
    unused = socket.socket()
    unused.bind(("127.0.0.1", 0))  # a port nothing listens on once closed
    port = unused.getsockname()[1]
    unused.close()
    monkeypatch.setattr(s, "email_mode", "smtp")
    monkeypatch.setattr(s, "smtp_host", "127.0.0.1")
    monkeypatch.setattr(s, "smtp_port", port)
    notify(fresh_store, ["stu-1"], NotificationEvent.cycle_changed, "Still stored", "m", s.now())
    assert any(n["title"] == "Still stored" for n in as_student.get("/me/notifications").json())


def test_NFR_5_1_2_log_mode_does_not_touch_smtp(fresh_store, smtp, monkeypatch):
    monkeypatch.setattr(get_settings(), "email_mode", "log")
    notify(fresh_store, ["stu-1"], NotificationEvent.cycle_changed, "t", "m", get_settings().now())
    assert smtp.messages == []


# ------------------------------------------------------------------ never in production


@pytest.mark.parametrize("env", [{"vercel_env": "production"}, {"app_env": "production"}, {"app_env": " Production "}])
def test_NFR_5_1_2_smtp_mode_is_refused_in_production(env):
    with pytest.raises(ValidationError, match="EMAIL_MODE=smtp is for local testing only"):
        Settings(email_mode="smtp", _env_file=None, **env)


@pytest.mark.parametrize(
    ("mode", "env"),
    [
        ("smtp", {}),
        ("smtp", {"vercel_env": "preview"}),
        ("send", {"vercel_env": "production"}),
        ("log", {"app_env": "production"}),
    ],
)
def test_NFR_5_1_2_other_combinations_still_start(mode, env):
    Settings(email_mode=mode, _env_file=None, **env)


def test_NFR_5_1_2_the_app_does_not_start_with_smtp_in_production():
    env = {**os.environ, "EMAIL_MODE": "smtp", "VERCEL_ENV": "production"}
    run = subprocess.run([sys.executable, "-c", "import app.main"], cwd=API_DIR, env=env, capture_output=True, text=True)
    assert run.returncode != 0 and "EMAIL_MODE=smtp is for local testing only" in run.stderr


def test_the_defaults_point_at_mailpit():
    s = Settings(_env_file=None)
    assert (s.smtp_host, s.smtp_port) == ("localhost", 1025)


# ------------------------------------------------------------------ the sign-up code e-mail (REQ-REG-2)


def test_REQ_REG_2_the_code_is_e_mailed_and_matches_the_stored_code(anon, fresh_store, smtp):
    addr = "newstudent@e.ntu.edu.sg"
    res = anon.post("/auth/register", json={"name": "Alice Tan", "email": addr, "role": "student", "password": "password"})
    assert res.status_code == 201
    code, _ = fresh_store.verification_codes[addr]
    assert smtp.recipients == [[addr]]
    msg = smtp.messages[0]
    assert msg["Subject"] == "Your URECAMatch verification code"
    assert code in body(msg, "plain") and code in body(msg, "html") and "Alice Tan" in body(msg, "plain")


def test_REQ_REG_4_resend_sends_the_new_code(anon, fresh_store, smtp):
    addr = "newstudent@e.ntu.edu.sg"
    anon.post("/auth/register", json={"name": "Alice Tan", "email": addr, "role": "student", "password": "password"})
    assert anon.post("/auth/resend", json={"email": addr}).status_code == 200
    code, _ = fresh_store.verification_codes[addr]
    assert len(smtp.messages) == 2 and code in body(smtp.messages[1], "plain")


def test_REQ_REG_2_log_mode_never_logs_the_code(anon, fresh_store, monkeypatch, caplog):
    monkeypatch.setattr(get_settings(), "email_mode", "log")
    addr = "newstudent@e.ntu.edu.sg"
    with caplog.at_level("INFO"):
        anon.post("/auth/register", json={"name": "Alice Tan", "email": addr, "role": "student", "password": "password"})
    code, _ = fresh_store.verification_codes[addr]
    assert "verification code" in caplog.text and code not in caplog.text


def test_REQ_REG_2_off_mode_sends_nothing(anon, smtp, monkeypatch):
    monkeypatch.setattr(get_settings(), "email_mode", "off")
    anon.post(
        "/auth/register",
        json={"name": "Alice Tan", "email": "newstudent@e.ntu.edu.sg", "role": "student", "password": "password"},
    )
    assert smtp.messages == []


# ------------------------------------------------------------------ the sample script


@pytest.mark.parametrize("mode", ["send", "off", "bogus"])
def test_sample_script_refuses_to_run_unless_smtp_or_log(mode, smtp, monkeypatch, capsys):
    monkeypatch.setattr(get_settings(), "email_mode", mode)
    assert send_samples.main(["me@example.com"]) == 1
    assert "Refusing to run" in capsys.readouterr().out and smtp.messages == []


def test_sample_script_refuses_in_production(smtp, monkeypatch, capsys):
    monkeypatch.setattr(get_settings(), "app_env", "production")
    assert send_samples.main(["me@example.com"]) == 1 and smtp.messages == []


def test_sample_script_sends_one_of_every_kind_over_smtp(smtp, capsys):
    assert send_samples.main(["any.address@example.com"]) == 0
    assert len(smtp.messages) == len(send_samples.SAMPLES) + 1
    assert {r[0] for r in smtp.recipients} == {"any.address@example.com"}
    subjects = {m["Subject"] for m in smtp.messages}
    for needed in (
        "You have a match offer",
        "Round 2 results are out",
        "Your URECAMatch verification code",
        "Your proposal was accepted",
    ):
        assert needed in subjects
    assert "Sent 11 of 11" in capsys.readouterr().out


def test_sample_script_covers_every_notification_event():
    assert {event for event, *_ in send_samples.SAMPLES} == set(NotificationEvent)


def test_sample_script_in_log_mode_sends_nothing_over_smtp(smtp, monkeypatch, capsys):
    monkeypatch.setattr(get_settings(), "email_mode", "log")
    assert send_samples.main(["me@example.com"]) == 0 and smtp.messages == []


def test_sample_script_needs_an_address(smtp, capsys):
    assert send_samples.main([]) == 2 and send_samples.main(["not-an-address"]) == 2
