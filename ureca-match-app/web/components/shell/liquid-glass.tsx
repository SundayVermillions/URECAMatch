/** Liquid glass selection capsule for the sidebar (the look of Apple's iOS 26 "Liquid Glass").
 *
 *  How it works:
 *  1. An SVG displacement filter (`#lg-refract`) shifts the pixels behind the capsule. A displacement
 *     map that is neutral grey in the middle and graded towards the rim bends content only near the
 *     edges, like looking through the rounded rim of a glass lens.
 *  2. `.liquid-glass` in globals.css applies that filter as a backdrop-filter, adds a top-lit tint,
 *     a bright specular rim and a soft float shadow.
 *  3. The capsule sits ON TOP of the selected label (pointer-events: none) and slides between items.
 *
 *  Browser support: Chrome and Edge refract. Safari and Firefox ignore url() in backdrop-filter and
 *  fall back to the frosted blur declared first in `.liquid-glass`, so nothing breaks.
 *  Same technique as the liquid-glass-react package, without its floating-layout assumptions.
 */

export const GLASS_W = 204; // sidebar 240 - outer inset 12 - aside padding 2 x 12
export const GLASS_H = 40; // nav item height (h-10)
export const GLASS_STEP = 42; // item height + 2 px gap (gap-0.5)
const R = 14; // corner radius
const EDGE = 5; // width of the refracting rim; keep small so the icon and label stay undistorted

/** Displacement map: red = horizontal shift, blue = vertical shift, grey (128) = no shift. */
const map = `<svg xmlns="http://www.w3.org/2000/svg" width="${GLASS_W}" height="${GLASS_H}">
<defs>
  <linearGradient id="x" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#f00"/></linearGradient>
  <linearGradient id="y" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#00f"/></linearGradient>
  <filter id="b"><feGaussianBlur stdDeviation="${EDGE / 3}"/></filter>
</defs>
<rect width="${GLASS_W}" height="${GLASS_H}" fill="#000"/>
<rect width="${GLASS_W}" height="${GLASS_H}" rx="${R}" fill="url(#x)"/>
<rect width="${GLASS_W}" height="${GLASS_H}" rx="${R}" fill="url(#y)" style="mix-blend-mode:difference"/>
<rect x="${EDGE}" y="${EDGE}" width="${GLASS_W - EDGE * 2}" height="${GLASS_H - EDGE * 2}" rx="${R - EDGE / 2}" fill="rgb(128,128,128)" filter="url(#b)"/>
</svg>`;
const mapUri = `data:image/svg+xml;utf8,${encodeURIComponent(map)}`;

/** Render once per page. Invisible; only defines the filter that `.liquid-glass` references. */
export function LiquidGlassFilter() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute pointer-events-none">
      <filter id="lg-refract" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage href={mapUri} x="0" y="0" width={GLASS_W} height={GLASS_H} preserveAspectRatio="none" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="-10" xChannelSelector="R" yChannelSelector="B" />
      </filter>
    </svg>
  );
}

/** The capsule. Place inside a `relative` nav; `index` is the selected item, or -1 for none. */
export function GlassIndicator({ index }: { index: number }) {
  if (index < 0) return null;
  return (
    <div
      aria-hidden
      className="liquid-glass absolute left-0 top-0 z-10 pointer-events-none"
      style={{ width: GLASS_W, height: GLASS_H, transform: `translateY(${index * GLASS_STEP}px)` }}
    />
  );
}
