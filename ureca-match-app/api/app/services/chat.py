"""Chat between a student and a supervisor (REQ-CHAT-1..6, added after the SRS). Owner: slice E.

A pair is linked when the student applied to one of the supervisor's projects or sent that supervisor a proposal, in
any status and any cycle. routers/chat.py checks who may read and write; `post` is the only way a message is stored.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from app.db.store import Store
from app.models import AccountStatus, Conversation, Message, NotificationEvent, Role, User
from app.services.notify import notify

MAX_LENGTH = 2000  # REQ-CHAT-3, after trimming
PREVIEW = 120  # characters of the message shown in the notification

NOT_LINKED = (
    "Students and supervisors can message each other once the student has applied to one of the supervisor's "
    "projects or sent them a proposal."
)
INACTIVE = "This account is no longer active, so messages cannot be sent."


def _add(links: dict[str, list[str]], other_id: str, title: str) -> None:
    titles = links.setdefault(other_id, [])
    if title not in titles:
        titles.append(title)


def links(store: Store, user: User) -> dict[str, list[str]]:
    """Everyone this student or supervisor is linked to (REQ-CHAT-1), with the project titles that link them (REQ-CHAT-2).
    Says nothing about whether the other account is still active."""
    out: dict[str, list[str]] = {}
    if user.role == Role.student:
        for a in store.applications_for(student_id=user.id):
            listing = store.listing(a.listing_id)
            if listing is not None:
                _add(out, listing.supervisor_id, listing.title)
        for p in store.proposals_for(student_id=user.id):
            _add(out, p.supervisor_id, p.title)
    elif user.role == Role.supervisor:
        for listing in store.all_listings():
            if listing.supervisor_id == user.id:
                for a in store.applications_for(listing_id=listing.id):
                    _add(out, a.student_id, listing.title)
        for p in store.proposals_for(supervisor_id=user.id):
            _add(out, p.student_id, p.title)
    return out


def check(store: Store, student: User | None, supervisor: User | None) -> tuple[list[str], str | None]:
    """The titles linking the pair, and why they cannot message each other now (None when they can). REQ-CHAT-1"""
    if student is None or supervisor is None or student.role != Role.student or supervisor.role != Role.supervisor:
        return [], NOT_LINKED
    titles = links(store, student).get(supervisor.id, [])
    if not titles:
        return [], NOT_LINKED
    if student.status != AccountStatus.active or supervisor.status != AccountStatus.active:
        return titles, INACTIVE
    return titles, None


def other_id(conversation: Conversation, user: User) -> str:
    return conversation.supervisor_id if user.id == conversation.student_id else conversation.student_id


def view(
    store: Store,
    conversation: Conversation,
    user: User,
    titles: list[str],
    reason: str | None,
    unread: int = 0,
    last: Message | None = None,
) -> Conversation:
    """The conversation as `user` sees it: the other person's name and the titles that link them (REQ-CHAT-2)."""
    other = store.user(other_id(conversation, user))
    return conversation.model_copy(
        update={
            "other_id": other_id(conversation, user),
            "other_name": other.name if other else "Former user",
            "projects": titles,
            "unread": unread,
            "last_message": last,
            "can_send": reason is None,
            "blocked_reason": reason,
        }
    )


def preview(body: str) -> str:
    text = " ".join(body.split())  # one line: the notification and its e-mail show it as a sentence
    return text if len(text) <= PREVIEW else text[: PREVIEW - 3] + "..."


def post(store: Store, conversation: Conversation, sender: User, body: str, now: datetime) -> Message:
    """Store a checked message and tell the recipient, once until they read the conversation (REQ-CHAT-6)."""
    recipient = other_id(conversation, sender)
    already_told = store.unread_message_counts(recipient, conversation.id).get(conversation.id, 0) > 0
    # The demo and debug clocks stand still, so a message is stamped just after the one before to keep the order.
    at = now
    if conversation.last_message_at is not None and at <= conversation.last_message_at:
        at = conversation.last_message_at + timedelta(microseconds=1)
    message = Message(id=store.next_id("msg"), conversation_id=conversation.id, sender_id=sender.id, body=body, created_at=at)
    store.add_message(message)
    if not already_told:
        notify(
            store,
            [recipient],
            NotificationEvent.message_received,
            f"New message from {sender.name}",
            preview(body),
            now,
            link=f"/messages/{conversation.id}",
        )
    return message


def unread_total(store: Store, user: User) -> int:
    """REQ-CHAT-5: the badge beside Messages."""
    if user.role == Role.admin:
        return 0
    return sum(store.unread_message_counts(user.id).values())
