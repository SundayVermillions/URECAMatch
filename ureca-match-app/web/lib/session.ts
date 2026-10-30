/** Browser session. Mock mode stores the demo user id; live mode stores the Supabase access token.
 *  Expiry is 30 minutes of inactivity (REQ-AUTH-3); every API call through useApi() refreshes it.
 *  Kept per tab (sessionStorage), so one browser can hold a student, a supervisor and an admin in separate tabs. */
import type { Role } from "./api/models";

export type Session = { userId: string; role: Role; name: string; token?: string; expiresAt: number };
const KEY = "urecamatch.session";
const MINUTES = 30;

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (Date.now() > s.expiresAt) { sessionStorage.removeItem(KEY); return null; }
    return s;
  } catch { return null; }
}
export function setSession(s: Omit<Session, "expiresAt">) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...s, expiresAt: Date.now() + MINUTES * 60_000 })); } catch {}
}
export function touchSession() {
  const s = getSession();
  if (s) setSession(s);
}
export function clearSession() {
  try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(FRESH); } catch {}
}
export const homeFor = (role: Role) => (role === "student" ? "/browse" : role === "supervisor" ? "/projects" : "/dashboard");

/** Set by the sign-in page and read by the profile gate: a student who has just signed in lands on My profile without a
 *  warning, while one who tried to open another page is told why they were sent back. It stays set until they reach
 *  My profile, because the gate can run more than once on the way there. */
const FRESH = "urecamatch.fresh-sign-in";
export function markFreshSignIn() { try { sessionStorage.setItem(FRESH, "1"); } catch {} }
export function isFreshSignIn(): boolean { try { return sessionStorage.getItem(FRESH) === "1"; } catch { return false; } }
export function clearFreshSignIn() { try { sessionStorage.removeItem(FRESH); } catch {} }
