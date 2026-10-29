/** "3" + "days left", "5" + "hours left", "20" + "min left", or null once it has passed. Uses the app's clock (phase.now), not the machine's. */
export function timeLeft(endsAt: string | null | undefined, now: string | undefined): { n: number; unit: string } | null {
  if (!endsAt || !now) return null;
  const ms = Date.parse(endsAt) - Date.parse(now);
  if (ms <= 0) return null;
  const min = Math.round(ms / 60000);
  if (min < 60) return { n: min, unit: "min left" };
  const h = Math.round(min / 60);
  if (h < 48) return { n: h, unit: h === 1 ? "hour left" : "hours left" };
  return { n: Math.round(h / 24), unit: "days left" };
}
