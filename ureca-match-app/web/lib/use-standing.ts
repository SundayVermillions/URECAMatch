"use client";
/** A student's standing this cycle, shared by every screen that offers Apply or Propose.
 *  Placed (an accepted match, whether from an offer or an accepted self-proposal) or no longer eligible
 *  (declined or let an offer time out) makes those screens view only (REQ-OUTCOME-1, 2, 4; REQ-REVPROP-2). */
import { useMe } from "@/components/shell/app-provider";
import type { Match } from "@/lib/api/models";
import { useApi } from "./use-api";

export type Standing = {
  viewOnly: boolean;
  placedIn: string | null; // title of the project the student is registered to
  reason: string; // one sentence for banners and disabled actions; "" when not view only
  loading: boolean;
  match: Match | null; // the student's latest visible match (offer, accepted, declined or timed out)
};

export function useStanding(): Standing {
  const { me } = useMe();
  const isStudent = me?.user.role === "student";
  const match = useApi((api) => (isStudent ? api.myMatch() : Promise.resolve(null)), [isStudent, me?.student?.eligible_for_matching]);
  const placedIn = match.data?.status === "accepted" ? match.data.listing_title : null;
  const ineligible = me?.student?.eligible_for_matching === false;
  const reason = placedIn
    ? `You are registered to ${placedIn}. You can still browse projects, but not apply or propose this cycle.`
    : ineligible
      ? "You declined or did not answer an earlier offer, so you cannot apply or propose again this cycle."
      : "";
  return { viewOnly: !!placedIn || ineligible, placedIn, reason, loading: isStudent && match.loading, match: match.data ?? null };
}
