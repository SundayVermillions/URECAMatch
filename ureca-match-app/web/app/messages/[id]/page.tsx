"use client";
/** Messages (REQ-CHAT-1..6) with one conversation open. Notifications link here (REQ-CHAT-6). */
import { useParams } from "next/navigation";
import { Inbox } from "@/components/chat/inbox";

export default function MessageThread() {
  const { id } = useParams<{ id: string }>();
  return <Inbox selectedId={id} />;
}
