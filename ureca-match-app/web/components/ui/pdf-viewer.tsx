"use client";
/** Read-only PDF viewer for signed Storage links (REQ-VRANK-3 applicant drawer). No download button.
 *  pdfjs-dist is loaded on first use, so pages that never show a PDF do not pay for it. */
import { useEffect, useRef, useState } from "react";
import { I } from "@/components/shell/icons";

type Props = { url: string; title: string; height?: number };

export function PdfViewer({ url, title, height = 460 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setState("loading");
    el.replaceChildren();

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const task = pdfjs.getDocument({ url });
      destroy = () => void task.destroy();
      const pdf = await task.promise;
      const width = el.clientWidth || 440;
      const ratio = window.devicePixelRatio || 1;
      for (let i = 1; i <= pdf.numPages && !cancelled; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.className = "block mx-auto mb-2 bg-white shadow-sm";
        canvas.setAttribute("aria-label", `${title}, page ${i} of ${pdf.numPages}`);
        el.appendChild(canvas);
        await page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] }).promise;
        if (i === 1 && !cancelled) setState("ready");
      }
    })().catch(() => {
      if (!cancelled) setState("error");
    });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url, title]);

  return (
    <div className="relative border-t border-border bg-sunken" style={{ height }} role="document" aria-label={title} aria-busy={state === "loading"}>
      <div ref={box} className="h-full overflow-y-auto p-2" />
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[18px] h-[18px] rounded-full border-[2.5px] border-accent-border border-t-accent" style={{ animation: "spin 0.8s linear infinite" }} />
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[13px] text-muted px-6 text-center">
          <I.Alert size={18} />
          This document could not be shown. The link may have expired; close the drawer and open it again.
        </div>
      )}
    </div>
  );
}
