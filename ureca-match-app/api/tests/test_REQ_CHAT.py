"""Slice E. Chat between a student and a supervisor (REQ-CHAT-1..6, added after the SRS).

Seed links used here: stu-1 applied to lst-2 (sup-1) and lst-10 (sup-5), and has nothing with sup-2.
stu-9 sent sup-1 a proposal (prp-2); their conversation cnv-1 ends with a message sup-1 has not read.
"""

from __future__ import annotations

import pytest

from app.db.store import MockStore, SupabaseStore
from app.models import AccountStatus, ApplicationStatus, NotificationEvent
from tests.fake_supabase import FakeDB


def start(client, user_id: str):
    return client.post("/me/conversations", json={"user_id": user_id})


def send(client, conversation_id: str, body: str):
    return client.post(f"/me/conversations/{conversation_id}/messages", json={"body": body})


def message_notices(store, user_id: str) -> list:
    return [n for n in store.notifications_for(user_id) if n.event == NotificationEvent.message_received]


# ------------------------------------------------------------------ REQ-CHAT-1: who may message whom


def test_REQ_CHAT_1_student_who_applied_can_start(as_student):
    r = start(as_student, "sup-1")
    assert r.status_code == 200
    assert r.json()["supervisor_id"] == "sup-1" and r.json()["student_id"] == "stu-1"


def test_REQ_CHAT_1_supervisor_can_start_with_an_applicant(as_supervisor):
    assert start(as_supervisor, "stu-1").status_code == 200


def test_REQ_CHAT_1_a_proposal_links_the_pair(client_for):
    assert start(client_for("stu-9"), "sup-1").status_code == 200


def test_REQ_CHAT_1_no_application_or_proposal_is_refused(as_student, client_for):
    r = start(as_student, "sup-2")
    assert r.status_code == 403 and r.json()["code"] == "forbidden"
    assert start(client_for("sup-2"), "stu-1").status_code == 403


def test_REQ_CHAT_1_any_application_status_counts(fresh_store, as_student):
    for a in fresh_store.applications_for(student_id="stu-1", listing_id="lst-2"):
        a.status = ApplicationStatus.withdrawn
    assert start(as_student, "sup-1").status_code == 200


def test_REQ_CHAT_1_same_role_and_admin_targets_are_refused(as_student, as_supervisor):
    assert start(as_student, "stu-2").status_code == 403
    assert start(as_supervisor, "sup-2").status_code == 403
    assert start(as_student, "adm-1").status_code == 403


def test_REQ_CHAT_1_admins_have_no_access(as_admin):
    assert as_admin.get("/me/conversations").status_code == 403
    assert as_admin.get("/me/conversations/contacts").status_code == 403
    assert start(as_admin, "stu-1").status_code == 403
    assert as_admin.get("/me/conversations/cnv-1").status_code == 403
    assert send(as_admin, "cnv-1", "Hello").status_code == 403
    assert as_admin.get("/me").json()["unread_messages"] == 0


def test_REQ_CHAT_1_inactive_account_cannot_be_messaged(fresh_store, client_for):
    stu9 = client_for("stu-9")
    fresh_store.user("sup-1").status = AccountStatus.inactive
    assert start(stu9, "sup-1").status_code == 403
    r = send(stu9, "cnv-1", "Are you there?")
    assert r.status_code == 403
    # The history stays readable, and the screen is told why it cannot reply.
    thread = stu9.get("/me/conversations/cnv-1").json()
    assert thread["messages"] and thread["conversation"]["can_send"] is False
    assert "no longer active" in thread["conversation"]["blocked_reason"]
    assert all(c["user_id"] != "sup-1" for c in stu9.get("/me/conversations/contacts").json())


def test_REQ_CHAT_1_contacts_list_only_linked_people(as_student, as_supervisor):
    mine = {c["user_id"] for c in as_student.get("/me/conversations/contacts").json()}
    assert mine == {"sup-1", "sup-5"}
    theirs = {c["user_id"] for c in as_supervisor.get("/me/conversations/contacts").json()}
    assert {"stu-1", "stu-9"} <= theirs and all(u.startswith("stu-") for u in theirs)


# ------------------------------------------------------------------ REQ-CHAT-2: one per pair, names and projects


def test_REQ_CHAT_2_one_conversation_per_pair(as_student, as_supervisor):
    first = start(as_student, "sup-1").json()["id"]
    assert start(as_student, "sup-1").json()["id"] == first
    assert start(as_supervisor, "stu-1").json()["id"] == first


def test_REQ_CHAT_2_each_side_sees_the_other_and_the_linking_projects(as_student, as_supervisor):
    c = start(as_student, "sup-1").json()
    assert c["other_id"] == "sup-1" and c["other_name"] == "Prof. Marcus Chua"
    assert c["projects"] == ["Explainable AI for Clinical Decision Support"]
    send(as_student, c["id"], "Hello Prof. Chua")
    theirs = next(x for x in as_supervisor.get("/me/conversations").json() if x["id"] == c["id"])
    assert theirs["other_id"] == "stu-1" and theirs["other_name"] == "Wei Ling Tan"
    assert theirs["projects"] == c["projects"]


def test_REQ_CHAT_2_proposal_title_links_the_pair(client_for):
    c = client_for("stu-9").get("/me/conversations/cnv-1").json()["conversation"]
    assert "Self-Supervised Pretraining for Retinal OCT" in c["projects"]


def test_REQ_CHAT_2_empty_conversation_is_listed_under_contacts(as_student):
    c = start(as_student, "sup-1").json()
    assert all(x["id"] != c["id"] for x in as_student.get("/me/conversations").json())
    contact = next(x for x in as_student.get("/me/conversations/contacts").json() if x["user_id"] == "sup-1")
    assert contact["conversation_id"] == c["id"]


def test_REQ_CHAT_2_list_is_newest_first(as_supervisor, client_for):
    c = start(client_for("stu-1"), "sup-1").json()["id"]
    send(client_for("stu-1"), c, "Newer than the seeded chat")
    ids = [x["id"] for x in as_supervisor.get("/me/conversations").json()]
    assert ids[:2] == [c, "cnv-1"]


# ------------------------------------------------------------------ REQ-CHAT-3: plain text, 1 to 2000 after trimming


def test_REQ_CHAT_3_blank_message_is_refused(as_student):
    c = start(as_student, "sup-1").json()["id"]
    for body in ("", "   \n\t  "):
        r = send(as_student, c, body)
        assert r.status_code == 422 and r.json()["code"] == "empty_message" and r.json()["field"] == "body"


def test_REQ_CHAT_3_length_is_counted_after_trimming(as_student):
    c = start(as_student, "sup-1").json()["id"]
    ok = send(as_student, c, "  " + "a" * 2000 + "\n\n")
    assert ok.status_code == 200 and ok.json()["body"] == "a" * 2000
    long = send(as_student, c, "a" * 2001)
    assert long.status_code == 422 and long.json()["code"] == "message_too_long" and long.json()["field"] == "body"
    assert send(as_student, c, " x ").json()["body"] == "x"


def test_REQ_CHAT_3_text_is_kept_as_written(as_student):
    c = start(as_student, "sup-1").json()["id"]
    body = "<b>Hi</b> & <script>alert(1)</script>\nSecond line"
    assert send(as_student, c, body).json()["body"] == body


def test_REQ_CHAT_3_messages_keep_their_order_on_a_frozen_clock(as_student):
    c = start(as_student, "sup-1").json()["id"]
    for word in ("one", "two", "three"):
        send(as_student, c, word)
    assert [m["body"] for m in as_student.get(f"/me/conversations/{c}").json()["messages"]] == ["one", "two", "three"]


# ------------------------------------------------------------------ REQ-CHAT-4: only the two participants


def test_REQ_CHAT_4_outsiders_cannot_read_or_post(client_for):
    for outsider in ("stu-1", "sup-2"):
        c = client_for(outsider)
        assert c.get("/me/conversations/cnv-1").status_code == 404
        assert send(c, "cnv-1", "Let me in").status_code == 404
        assert all(x["id"] != "cnv-1" for x in c.get("/me/conversations").json())


def test_REQ_CHAT_4_unknown_conversation_is_not_found(as_student):
    assert as_student.get("/me/conversations/cnv-nope").status_code == 404


# ------------------------------------------------------------------ REQ-CHAT-5: read state and unread counts


def test_REQ_CHAT_5_seeded_unread_shows_in_list_and_badge(as_supervisor, client_for):
    assert as_supervisor.get("/me").json()["unread_messages"] == 1
    c = next(x for x in as_supervisor.get("/me/conversations").json() if x["id"] == "cnv-1")
    assert c["unread"] == 1 and c["last_message"]["sender_id"] == "stu-9"
    assert client_for("stu-9").get("/me").json()["unread_messages"] == 0  # your own messages are never unread


def test_REQ_CHAT_5_opening_marks_it_read(as_supervisor):
    as_supervisor.get("/me/conversations/cnv-1")
    assert as_supervisor.get("/me").json()["unread_messages"] == 0
    assert next(x for x in as_supervisor.get("/me/conversations").json() if x["id"] == "cnv-1")["unread"] == 0


def test_REQ_CHAT_5_counts_are_per_conversation(as_supervisor, client_for):
    stu1 = client_for("stu-1")
    c = start(stu1, "sup-1").json()["id"]
    send(stu1, c, "First")
    send(stu1, c, "Second")
    counts = {x["id"]: x["unread"] for x in as_supervisor.get("/me/conversations").json()}
    assert counts[c] == 2 and counts["cnv-1"] == 1
    assert as_supervisor.get("/me").json()["unread_messages"] == 3


# ------------------------------------------------------------------ REQ-CHAT-6: one notification until read


def test_REQ_CHAT_6_recipient_is_notified_with_a_link(fresh_store, as_student):
    c = start(as_student, "sup-1").json()["id"]
    before = len(message_notices(fresh_store, "sup-1"))
    send(as_student, c, "Hello Prof. Chua, may I ask about the project scope?")
    notices = message_notices(fresh_store, "sup-1")
    assert len(notices) == before + 1
    n = notices[-1]
    assert n.link == f"/messages/{c}" and n.title == "New message from Wei Ling Tan"
    assert not message_notices(fresh_store, "stu-1")  # the sender is not notified


def test_REQ_CHAT_6_no_second_notice_until_read(fresh_store, as_student, as_supervisor):
    c = start(as_student, "sup-1").json()["id"]
    send(as_student, c, "One")
    send(as_student, c, "Two")
    count = len(message_notices(fresh_store, "sup-1"))
    send(as_student, c, "Three")
    assert len(message_notices(fresh_store, "sup-1")) == count
    as_supervisor.get(f"/me/conversations/{c}")  # read
    send(as_student, c, "Four")
    assert len(message_notices(fresh_store, "sup-1")) == count + 1


def test_REQ_CHAT_6_seeded_unread_already_has_its_notice(fresh_store, client_for):
    count = len(message_notices(fresh_store, "sup-1"))
    send(client_for("stu-9"), "cnv-1", "One more thing")
    assert len(message_notices(fresh_store, "sup-1")) == count


def test_REQ_CHAT_6_long_message_is_shortened_in_the_notice(fresh_store, as_student):
    c = start(as_student, "sup-1").json()["id"]
    send(as_student, c, "word " * 100)
    n = message_notices(fresh_store, "sup-1")[-1]
    assert len(n.message) == 120 and n.message.endswith("...")


# ------------------------------------------------------------------ the same rules on the Supabase store


def supabase_store(db: FakeDB) -> SupabaseStore:
    s = SupabaseStore.__new__(SupabaseStore)
    MockStore.__init__(s, seed=False)
    s.client = db.client()
    return s


@pytest.fixture
def db() -> FakeDB:
    from app.db.seed_db import seed_database

    d = FakeDB()
    seed_database(d.client())
    return d


def test_REQ_CHAT_supabase_store_reads_and_writes_chat(db):
    from datetime import UTC, datetime

    from app.models import Message

    s = supabase_store(db)
    assert {c.id for c in s.conversations_for("sup-1")} == {"cnv-1"}
    assert s.unread_message_counts("sup-1") == {"cnv-1": 1}
    assert [m.id for m in s.messages_in("cnv-1")] == ["msg-1", "msg-2", "msg-3"]

    now = datetime(2026, 9, 7, 10, tzinfo=UTC)
    c = s.open_conversation("stu-1", "sup-1", "cnv-a", now)
    assert s.open_conversation("stu-1", "sup-1", "cnv-b", now).id == c.id == "cnv-a"  # REQ-CHAT-2
    s.add_message(Message(id="msg-a", conversation_id=c.id, sender_id="stu-1", body="Hi", created_at=now))
    assert s.conversation(c.id).last_message_at == now
    assert s.unread_message_counts("sup-1") == {"cnv-1": 1, "cnv-a": 1}
    assert s.unread_message_counts("sup-1", "cnv-a") == {"cnv-a": 1}
    s.mark_messages_read("cnv-a", "sup-1")
    assert s.unread_message_counts("sup-1") == {"cnv-1": 1}


def test_REQ_CHAT_2_two_servers_opening_at_once_share_one_conversation(db, monkeypatch):
    """The first lookup misses on both, both insert, the unique pair rejects one, which then reads the winner."""
    from datetime import UTC, datetime

    now = datetime(2026, 9, 7, 10, tzinfo=UTC)
    a, b = supabase_store(db), supabase_store(db)
    real = SupabaseStore._conversation_between
    misses = {"left": 1}

    def stale_once(self, student_id, supervisor_id):
        if self is b and misses["left"]:
            misses["left"] -= 1
            return None
        return real(self, student_id, supervisor_id)

    monkeypatch.setattr(SupabaseStore, "_conversation_between", stale_once)
    first = a.open_conversation("stu-1", "sup-1", "cnv-a", now)
    second = b.open_conversation("stu-1", "sup-1", "cnv-b", now)
    assert first.id == second.id == "cnv-a"
    assert [r["id"] for r in db.rows("conversations") if r["student_id"] == "stu-1"] == ["cnv-a"]
