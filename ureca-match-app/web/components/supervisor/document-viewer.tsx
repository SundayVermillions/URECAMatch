"use client";
import { Loading } from "@/components/ui";
import { useApi } from "@/lib/use-api";

/** In-app PDF viewer (REQ-VRANK-3, REQ-REVPROP-1). The API returns a 10-minute signed link; the browser's own PDF viewer renders it.
 *  Used by the applicants drawer and the proposals drawer. */
export function DocumentViewer({ id, name }: { id: string; name: string }) {
  const doc = useApi((api) => api.documentUrl(id), [id]);
  const box = "border-t border-border bg-sunken h-[460px] flex items-center justify-center text-[12px] text-faint px-4 text-center";
  if (doc.loading) return <div className={box}><Loading /></div>;
  if (doc.error) return <div className={box}>{doc.error.message}</div>;
  if (!doc.data?.url) return <div className={box}>This file has not been uploaded yet, so it cannot be shown.</div>;
  return <iframe src={doc.data.url} title={name} className="block w-full h-[460px] border-0 border-t border-border bg-white" />;
}
