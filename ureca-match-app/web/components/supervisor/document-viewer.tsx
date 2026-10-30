"use client";
import { useState } from "react";
import { Button, Loading, PdfViewer } from "@/components/ui";
import { ApiError } from "@/lib/api/models";
import { useApi, useCall } from "@/lib/use-api";

/** Read-only PDF preview and download (REQ-VRANK-3, REQ-REVPROP-1).
 * Used by the applicants drawer and the proposals drawer. */
export function DocumentViewer({ id, name }: { id: string; name: string }) {
  const doc = useApi((api) => api.documentUrl(id), [id]);
  const call = useCall();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      // Recheck access and get a fresh signed link, since the preview may have been open for over ten minutes.
      const current = await call((api) => api.documentUrl(id));
      if (!current.url) throw new Error("missing_file");
      const response = await fetch(current.url);
      if (!response.ok) throw new Error("download_failed");
      // A blob URL also downloads cross-origin Storage files using the original filename.
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      try { link.click(); }
      finally {
        link.remove();
        // Give the browser time to start saving before releasing the blob.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (error) {
      setDownloadError(error instanceof ApiError ? error.message : "The PDF could not be downloaded. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  const box = "border-t border-border bg-sunken h-[460px] flex items-center justify-center text-[12px] text-faint px-4 text-center";
  if (doc.loading) return <div className={box}><Loading /></div>;
  if (doc.error) return <div className={box}>{doc.error.message}</div>;
  if (!doc.data?.url) return <div className={box}>This file has not been uploaded yet, so it cannot be shown.</div>;
  return (
    <div>
      <div className="flex items-center justify-end border-t border-border bg-white px-3 py-2">
        <Button type="button" variant="secondary" size="sm" disabled={downloading} onClick={download}>
          {downloading ? "Downloading..." : "Download PDF"}
        </Button>
      </div>
      {downloadError && <p role="alert" className="border-t border-border px-3 py-2 text-[12.5px] text-bad-ink">{downloadError}</p>}
      <PdfViewer url={doc.data.url} title={name} />
    </div>
  );
}
