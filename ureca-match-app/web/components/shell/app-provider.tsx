"use client";
/** Holds the signed-in user (GET /me) for the whole app. `useMe()` anywhere below. */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getClient } from "@/lib/api/client";
import type { Me } from "@/lib/api/models";
import { clearSession, getSession } from "@/lib/session";

type Ctx = { me: Me | null; loading: boolean; refresh: () => Promise<void>; signOut: () => void };
const AppContext = createContext<Ctx>({ me: null, loading: true, refresh: async () => {}, signOut: () => {} });

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  const load = useCallback(async (): Promise<Me | null> => {
    if (!getSession()) return null;
    try {
      return await (await getClient()).me();
    } catch {
      clearSession();
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const m = await load();
    setMe(m);
    setLoading(false);
  }, [load]);

  useEffect(() => {
    let alive = true;
    load().then((m) => {
      if (alive) {
        setMe(m);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [load]);

  // REQ-PROF-1: Profile gate redirect
  useEffect(() => {
    if (loading || !me) return;

    const isStudent = me.user.role === "student";
    const profileIncomplete = isStudent && me.student && !me.student.profile_complete;

    // Public / auth paths that should not be redirected
    const isAuthPath = pathname.startsWith("/sign-in") || pathname.startsWith("/create-account") || pathname.startsWith("/verify");
    const isProfilePath = pathname.startsWith("/profile");

    if (profileIncomplete && !isAuthPath && !isProfilePath) {
      router.replace("/profile");
    }
  }, [loading, me, pathname, router]);

  const signOut = useCallback(() => {
    clearSession();
    setMe(null);
    router.push("/sign-in");
  }, [router]);

  return <AppContext.Provider value={{ me, loading, refresh, signOut }}>{children}</AppContext.Provider>;
}

export const useMe = () => useContext(AppContext);