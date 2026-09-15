/** Browser session. Mock mode stores the demo user id; live mode stores the Supabase access token.
 *  Expiry is 30 minutes of inactivity (REQ-AUTH-3); every API call through useApi() refreshes it. */
import type { Role } from "./api/models";

export type Session = { userId: string; role: Role; name: string; token?: string; expiresAt: number };
const KEY = "urecamatch.session";
const MINUTES = 30;

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (Date.now() > s.expiresAt) { localStorage.removeItem(KEY); return null; }
    return s;
  } catch { return null; }
}
export function setSession(s: Omit<Session, "expiresAt">) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, expiresAt: Date.now() + MINUTES * 60_000 })); } catch {}
}
export function touchSession() {
  const s = getSession();
  if (s) setSession(s);
}
export function clearSession() {
  try { localStorage.removeItem(KEY); } catch {}
}
export const homeFor = (role: Role) => (role === "student" ? "/browse" : role === "supervisor" ? "/projects" : "/dashboard");
