/** Academic titles for project supervisors. Same list and rules as api/app/services/titles.py. */
export const TITLES = ["Prof.", "Assoc. Prof.", "Asst. Prof.", "Dr."] as const;

const PREFIX = /^(?:(Assoc|Asst)\.?\s+)?(Prof(?:essor)?|Dr)\.?\s+/i;

/** "Assoc. Prof. Mei Lin Tan" -> ["Assoc. Prof.", "Mei Lin Tan"]. A name with no title gives ["", name]. */
export function splitTitle(name: string): [string, string] {
  const n = name.trim();
  const m = PREFIX.exec(n);
  const rest = m ? n.slice(m[0].length).trim() : "";
  if (!m || !rest) return ["", n];
  const kind = m[2].toLowerCase() === "dr" ? "Dr." : "Prof.";
  const level = m[1] ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : "";
  return [level ? `${level}. ${kind}` : kind, rest];
}

export const composeName = (title: string, name: string) => (title ? `${title} ${name.trim()}` : name.trim());
