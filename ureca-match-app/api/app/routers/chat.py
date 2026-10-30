"""Slice E: chat between a student and a supervisor.  REQ-CHAT-1..6 (added after the SRS; docs/srs-updates.md row 56).

Admins have no access (REQ-CHAT-1). Someone else's conversation reads as not found (REQ-CHAT-4).
"""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import ChatUser, SettingsDep, StoreDep
from app.errors import forbidden, invalid, not_found
from app.models import (
    ChatContact,
    Conversation,
    ConversationStart,
    ConversationThread,
    Message,
    MessageCreate,
    Role,
    User,
)
from app.services import chat

router = APIRouter(tags=["messages"])


def _own(store: StoreDep, user: User, conversation_id: str) -> Conversation:
    c = store.conversation(conversation_id)
    if c is None or user.id not in (c.student_id, c.supervisor_id):  # REQ-CHAT-4
        raise not_found("Conversation")
    return c


def _pair(store: StoreDep, c: Conversation) -> tuple[list[str], str | None]:
    return chat.check(store, store.user(c.student_id), store.user(c.supervisor_id))


@router.get("/me/conversations", response_model=list[Conversation])
def mine(user: ChatUser, store: StoreDep) -> list[Conversation]:  # REQ-CHAT-2, 5: newest first, with unread counts
    linked = chat.links(store, user)
    unread = store.unread_message_counts(user.id)
    out = []
    for c in store.conversations_for(user.id):
        if c.last_message_at is None:  # opened but nothing sent yet: listed under contacts instead
            continue
        _, reason = _pair(store, c)
        last = store.messages_in(c.id)[-1:]
        titles = linked.get(chat.other_id(c, user), [])
        out.append(chat.view(store, c, user, titles, reason, unread.get(c.id, 0), last[0] if last else None))
    return sorted(out, key=lambda c: c.last_message_at, reverse=True)


@router.get("/me/conversations/contacts", response_model=list[ChatContact])
def contacts(user: ChatUser, store: StoreDep) -> list[ChatContact]:  # REQ-CHAT-1, 2: who they can start a conversation with
    existing = {chat.other_id(c, user): c.id for c in store.conversations_for(user.id)}
    out = []
    for other_id, titles in chat.links(store, user).items():
        other = store.user(other_id)
        pair = (user, other) if user.role == Role.student else (other, user)
        if chat.check(store, *pair)[1] is None:
            out.append(ChatContact(user_id=other_id, name=other.name, projects=titles, conversation_id=existing.get(other_id)))
    return sorted(out, key=lambda x: x.name)


@router.post("/me/conversations", response_model=Conversation)
def start(body: ConversationStart, user: ChatUser, store: StoreDep, settings: SettingsDep) -> Conversation:
    """REQ-CHAT-2: either side can start it, and there is one per pair, so this returns the existing one if there is."""
    other = store.user(body.user_id)
    student, supervisor = (user, other) if user.role == Role.student else (other, user)
    titles, reason = chat.check(store, student, supervisor)  # REQ-CHAT-1
    if reason:
        raise forbidden(reason)
    c = store.open_conversation(student.id, supervisor.id, store.next_id("cnv"), settings.now())
    unread = store.unread_message_counts(user.id, c.id).get(c.id, 0)
    return chat.view(store, c, user, titles, None, unread)


@router.get("/me/conversations/{conversation_id}", response_model=ConversationThread)
def thread(conversation_id: str, user: ChatUser, store: StoreDep) -> ConversationThread:
    c = _own(store, user, conversation_id)
    store.mark_messages_read(c.id, user.id)  # REQ-CHAT-5: opening a conversation marks it read
    titles, reason = _pair(store, c)  # the history stays readable; can_send says whether they can still write
    return ConversationThread(conversation=chat.view(store, c, user, titles, reason), messages=store.messages_in(c.id))


@router.post("/me/conversations/{conversation_id}/messages", response_model=Message)
def send(conversation_id: str, body: MessageCreate, user: ChatUser, store: StoreDep, settings: SettingsDep) -> Message:
    c = _own(store, user, conversation_id)
    _, reason = _pair(store, c)  # REQ-CHAT-1: still linked, both accounts active
    if reason:
        raise forbidden(reason)
    text = body.body.strip()  # REQ-CHAT-3: plain text, 1 to 2000 characters after trimming
    if not text:
        raise invalid("empty_message", "Write a message before sending.", "body")
    if len(text) > chat.MAX_LENGTH:
        raise invalid(
            "message_too_long", f"Messages can be up to {chat.MAX_LENGTH:,} characters. This one has {len(text):,}.", "body"
        )
    return chat.post(store, c, user, text, settings.now())
