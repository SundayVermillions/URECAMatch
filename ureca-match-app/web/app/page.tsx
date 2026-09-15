"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession, homeFor } from "@/lib/session";

/** Entry: send signed-in users to their dashboard, everyone else to sign-in. */
export default function Index() {
  const router = useRouter();
  useEffect(() => {
    const s = getSession();
    router.replace(s ? homeFor(s.role) : "/sign-in");
  }, [router]);
  return null;
}
