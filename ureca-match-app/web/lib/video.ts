/** Project videos are YouTube or Vimeo links (routers/listings.py _video_url). The API stores one canonical
 *  form; these helpers check a pasted link and turn it into an embeddable player URL. */
const YOUTUBE = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/;
const VIMEO = /^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(?:video\/)?(\d+)/;

/** Canonical link, null for blank, or undefined when the link is not YouTube or Vimeo. */
export function canonicalVideo(url: string | null | undefined): string | null | undefined {
  const u = (url ?? "").trim();
  if (!u) return null;
  const yt = YOUTUBE.exec(u);
  if (yt) return `https://www.youtube.com/watch?v=${yt[1]}`;
  const vm = VIMEO.exec(u);
  if (vm) return `https://vimeo.com/${vm[1]}`;
  return undefined;
}

/** Player URL for an iframe. youtube-nocookie avoids tracking cookies until the viewer presses play. */
export function embedUrl(url: string): string | null {
  const yt = YOUTUBE.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`;
  const vm = VIMEO.exec(url);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?dnt=1`;
  return null;
}
