"use client";
/** Pickers over the reference lists (GET /catalog/...): standard topic tags and NTU course codes.
 *  Used by the listing form, the student profile and the proposal form. The API refuses anything else. */
import { useCallback } from "react";
import { TagPicker, type PickOption } from "@/components/ui";
import { getClient } from "@/lib/api/client";
import type { TopicGroup } from "@/lib/api/models";

type Props = { value: string[]; onChange: (v: string[]) => void; invalid?: boolean; placeholder?: string };

let topicsP: Promise<TopicGroup[]> | null = null; // small and fixed, so loaded once per tab
const loadTopics = () => (topicsP ??= getClient().then((api) => api.topics()).catch((e) => { topicsP = null; throw e; }));

/** NTU titles are upper case: "NEURAL NETWORK & DEEP LEARNING" reads as "Neural Network & Deep Learning".
 *  Roman numerals stay upper case ("Biochemistry II"). */
export const titleCase = (t: string) => t.toLowerCase()
  .replace(/(^|[\s(/-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())
  .replace(/\b(Ii{0,2}|Iv|Vi{0,3}|Ix|Xi{0,3})\b/g, (r) => r.toUpperCase());

/** Standard topics whose name contains every word typed. With nothing typed: every topic, or with `suggest` only the first
 *  couple of each group (a short list to start from). */
export async function searchTopics(q: string, suggest = false): Promise<PickOption[]> {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = await loadTopics();
  if (!words.length && suggest) return groups.flatMap((g) => g.topics.slice(0, 2).map((t) => ({ value: t, group: g.name })));
  return groups.flatMap((g) => g.topics.filter((t) => words.every((w) => t.toLowerCase().includes(w))).map((t) => ({ value: t, group: g.name })));
}

export function TopicPicker({ placeholder = "Search topics, e.g. Machine Learning", ...rest }: Props) {
  const search = useCallback((q: string): Promise<PickOption[]> => searchTopics(q), []);
  return <TagPicker {...rest} search={search} placeholder={placeholder} none="No standard topic matches" />;
}

export function CoursePicker({ placeholder = "Search by code or title, e.g. SC4001", ...rest }: Props) {
  const search = useCallback(async (q: string): Promise<PickOption[]> => {
    if (!q.trim()) return [];
    const found = await (await getClient()).courses(q, 20);
    return found.map((c) => ({ value: c.code, note: titleCase(c.title) }));
  }, []);
  return <TagPicker {...rest} search={search} placeholder={placeholder} idle="Type a course code or title" none="No NTU course matches" />;
}
