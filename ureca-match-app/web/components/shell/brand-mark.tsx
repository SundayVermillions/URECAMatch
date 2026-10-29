/** The URECAMatch mark: a wireframe earth in the brand blues, with one node lit. A line drawing, so it sits with the nav icons. Decorative. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 32 32" fill="none" strokeLinecap="round" className="shrink-0">
      <circle cx="16" cy="16" r="11" stroke="var(--brand-ink)" strokeWidth="1.6" />
      <g stroke="var(--brand-steel)" strokeWidth="1.15">
        <ellipse cx="16" cy="16" rx="4.6" ry="11" />
        <path d="M5.2 16 Q16 18.4 26.8 16" />
      </g>
      <circle cx="20.4" cy="14.3" r="2" fill="var(--brand-sky)" />
    </svg>
  );
}
