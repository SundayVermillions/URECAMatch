# SRS updates pending

Places where the app now deliberately differs from `LAB2/LAB 2 (SRS).pdf`. The SRS must be updated to match before the next submission. Add a row in the same change that causes the difference. Remove the row once the SRS is updated.

| # | SRS section | SRS says | App now does | Why | Changed in |
|---|---|---|---|---|---|
| 1 | 2.5 / tech stack | Next.js 15 | Next.js 16 | Version installed by the skeleton | skeleton |
| 2 | 3.1.1 Theme colours | OKLCH tonal scales; blue primary `#2171cc`; warm neutrals (`#faf9f6` background) | Apple-style neutrals: background `#f5f5f7`, text `#1d1d1f`, muted `#6e6e73`, borders `#e8e8ed`; accent blue `#0071e3` for buttons, links, focus and badges; in the sidebar the selected item and icons stay neutral graphite; semantic green `#248a3d`, amber `#c77700`, red `#e30000` | Calmer, more premium look; colour is kept for meaning only | design/refresh |
| 3 | 3.1.2 Typography | Plus Jakarta Sans (display), IBM Plex Sans (text), IBM Plex Mono (figures) | Inter for all text; figures use tabular numerals; system monospace | One family, like Apple's SF Pro; hierarchy by size and weight | design/refresh |
| 4 | 3.1.3 Radii | 6 icon, 8 button, 10 row, 12 card, 20 pill | 8 icon, 10 button, 12 row, 16 card, 20 modal, fully round pills | Softer geometry | design/refresh |
| 5 | 3.1.3 Overlays | Drawer 460 px from the right edge, scrim 28% | Drawer 460 px, floating 8 px from the edges with rounded corners; scrim 20% with a light blur. Modal 520 px unchanged | Sheet style as on macOS and iOS | design/refresh |
| 6 | 3.1.3 Shell | Fixed 240 px sidebar against the window edge; content inset 40 px left, 20 px right | 240 px sidebar as a floating frosted-glass panel (translucent, blurred); the selected item is a liquid-glass capsule that slides between items (SVG refraction at the rim in Chrome and Edge, frosted fallback in Safari and Firefox; bright rim, chromatic edge, float shadow), 12 px from the window edge, over a faint ambient colour background; content inset 48 px left, 40 px right, 40 px top | More breathing room | design/refresh |
| 7 | Dialog map (supervisor) | Nav item "Proposals from students" | Nav item "Student proposals" (page title unchanged) | Fits on one line in the sidebar | design/refresh |
| 8 | 3.1.4 UI mockups (Browse projects) | School and topic filters as rows of chips; topic tags as blue pills | Search field plus School and Topic dropdowns with a Clear button; topic tags as grey text or grey pills | Cleaner toolbar; blue reserved for things you can click | design/refresh |
| 9 | 4.9 QueryUrecaListings | Listings show title, organisation and supervisor | Each card also shows open slots ("2 of 3 slots open"), an anonymous avatar stack with the applicant count, and a "High demand" label when more than 5 students apply per open slot. Aggregate counts only, no personal data | Helps students judge their chances | design/refresh |
