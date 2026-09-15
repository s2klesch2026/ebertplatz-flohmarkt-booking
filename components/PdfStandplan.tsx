"use client";

import { useEffect, useRef, useState } from "react";

const WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs";

export default function PdfStandplan() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let pdfDocument: any = null;
    let renderTask: any = null;
    let frame = 0;
    let lastWidth = 0;

    const render = async () => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas || disposed) return;

      const cssWidth = Math.max(1, Math.round(wrap.clientWidth));
      if (Math.abs(cssWidth - lastWidth) < 3 && ready) return;
      lastWidth = cssWidth;

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;

        if (!pdfDocument) {
          pdfDocument = await pdfjs.getDocument({ url: "/api/standplan" }).promise;
        }
        const page = await pdfDocument.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = cssWidth / baseViewport.width;
        const outputScale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
        const viewport = page.getViewport({ scale: cssScale * outputScale });

        if (renderTask) {
          try { renderTask.cancel(); } catch { /* nothing to cancel */ }
        }

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${Math.round(baseViewport.height * cssScale)}px`;

        renderTask = page.render({ canvas, viewport });
        await renderTask.promise;
        if (!disposed) {
          setReady(true);
          setFailed(false);
        }
      } catch (error: any) {
        if (error?.name === "RenderingCancelledException") return;
        console.error("Standplan PDF render failed", error);
        if (!disposed) setFailed(true);
      }
    };

    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => void render());
    };

    schedule();
    const observer = new ResizeObserver(schedule);
    if (wrapRef.current) observer.observe(wrapRef.current);

    return () => {
      disposed = true;
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      try { renderTask?.cancel(); } catch { /* ignore */ }
      try { pdfDocument?.destroy(); } catch { /* ignore */ }
    };
  }, [ready]);

  return (
    <div ref={wrapRef} className="pdfStandplan" aria-hidden="true">
      {!ready && !failed && <div className="mapLoading">Standplan wird scharf geladen …</div>}
      <canvas ref={canvasRef} className={ready ? "pdfCanvas ready" : "pdfCanvas"} />
      {failed && <img className="mapFallback" src="/standplan.webp" alt="" />}
    </div>
  );
}
