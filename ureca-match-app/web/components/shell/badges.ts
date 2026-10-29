/** The counts beside "Proposals" and "Match approvals" in the supervisor's sidebar. A page that changes them (a decision on a
 *  proposal or a match) calls `refreshBadges()`, and the sidebar asks the API again, so the number is right without a reload. */
export const BADGES_EVENT = "urecamatch:badges";
export const refreshBadges = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(BADGES_EVENT)); };
