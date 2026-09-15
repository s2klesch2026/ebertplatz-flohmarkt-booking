"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./PdfStandplan.module.css";

const WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs";
const PAGE_WIDTH = 841.92;
const PAGE_HEIGHT = 595.44;

type Section = "A" | "B" | "C";

type SectionInfo = {
  title: string;
  text: string;
  color: string;
  path: string;
  popupX: number;
  popupY: number;
};

const sectionInfo: Record<Section, SectionInfo> = {
  A: {
    title: "Passage",
    text: "Vor Sonne und Regen geschützt 🙂",
    color: "#b7d93d",
    popupX: 505,
    popupY: 125,
    path: "M 208.632 252.188 C 205.675 256.985 204.747 262.760 206.053 268.242 C 212.346 294.654 231.814 376.368 244.801 430.876 C 246.811 439.313 253.753 445.677 262.332 446.949 C 270.911 448.220 279.400 444.143 283.771 436.653 C 323.952 367.791 395.546 245.098 397.633 241.520 C 397.664 241.467 397.695 241.413 397.726 241.360 C 398.970 239.184 425.163 193.381 440.178 167.125 C 445.921 157.084 442.563 144.293 432.628 138.367 C 407.764 123.536 363.019 96.846 338.119 81.993 C 328.159 76.051 315.272 79.208 309.186 89.081 C 284.526 129.081 225.564 224.723 208.632 252.188 Z",
  },
  B: {
    title: "Tiefebene",
    text: "Hier ist die Musik unseres Flohmarkt DJs am besten zu hören, Tanzlaune garantiert!",
    color: "#4c50df",
    popupX: 115,
    popupY: 410,
    path: "M 420.311 264.316 C 415.557 260.153 409.195 258.325 402.956 259.331 C 396.717 260.336 391.251 264.070 388.045 269.516 C 356.322 323.405 276.327 459.298 260.010 487.017 C 258.089 490.280 257.077 493.996 257.077 497.782 L 257.077 513.302 C 257.077 518.930 259.312 524.327 263.292 528.307 C 267.271 532.286 272.669 534.522 278.296 534.522 L 425.180 534.522 C 436.900 534.522 446.400 525.021 446.400 513.302 L 446.400 296.786 C 446.400 290.670 443.761 284.852 439.160 280.823 C 434.063 276.359 426.986 270.161 420.311 264.316 Z",
  },
  C: {
    title: "Hochebene",
    text: "Brunnengeplätscher und Kaffeeduft aus dem Gastro-Container",
    color: "#ff0a78",
    popupX: 705,
    popupY: 220,
    path: "M 468.804 280.125 C 463.955 280.125 459.304 282.052 455.876 285.480 C 452.447 288.909 450.521 293.560 450.521 298.409 L 450.521 541.439 C 450.521 551.537 458.706 559.722 468.804 559.722 L 737.247 559.722 C 747.345 559.722 755.530 551.537 755.530 541.439 L 755.530 511.963 C 755.530 507.114 753.604 502.464 750.175 499.035 C 746.747 495.606 742.096 493.680 737.247 493.680 L 655.178 493.680 C 650.329 493.680 645.679 491.754 642.250 488.325 C 638.821 484.896 636.895 480.246 636.895 475.397 L 636.895 298.409 C 636.895 293.560 634.969 288.909 631.540 285.480 C 628.111 282.052 623.461 280.125 618.612 280.125 Z",
  },
};

export default function PdfStandplan() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [hoveredArea, setHoveredArea] = useState<Section | null>(null);
  const [popupPosition, setPopupPosition] = useState({ left: 50, top: 50 });

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

  useEffect(() => {
    const areaFromTarget = (target: EventTarget | null): Section | null => {
      if (!(target instanceof SVGPathElement) || !target.classList.contains("areaHit")) return null;
      const label = target.getAttribute("aria-label") || "";
      const match = label.match(/^Bereich\s+([ABC]):/);
      return match ? (match[1] as Section) : null;
    };

    const positionPopup = (area: Section) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const info = sectionInfo[area];
      const rect = wrap.getBoundingClientRect();
      setPopupPosition({
        left: (info.popupX / PAGE_WIDTH) * rect.width,
        top: (info.popupY / PAGE_HEIGHT) * rect.height,
      });
    };

    const handlePointerOver = (event: PointerEvent) => {
      const area = areaFromTarget(event.target);
      if (!area) return;
      setHoveredArea(area);
      positionPopup(area);
    };

    const handlePointerOut = (event: PointerEvent) => {
      const area = areaFromTarget(event.target);
      if (!area) return;
      setHoveredArea(null);
    };

    const handleFocusIn = (event: FocusEvent) => {
      const area = areaFromTarget(event.target);
      if (!area) return;
      setHoveredArea(area);
      positionPopup(area);
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (areaFromTarget(event.target)) setHoveredArea(null);
    };

    document.addEventListener("pointerover", handlePointerOver);
    document.addEventListener("pointerout", handlePointerOut);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("pointerout", handlePointerOut);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  const hoverInfo = hoveredArea ? sectionInfo[hoveredArea] : null;
  const areaColorClass = hoveredArea === "A" ? styles.areaA : hoveredArea === "B" ? styles.areaB : styles.areaC;

  return (
    <div ref={wrapRef} className="pdfStandplan" aria-hidden="true">
      {!ready && !failed && <div className="mapLoading">Standplan wird scharf geladen …</div>}
      <canvas ref={canvasRef} className={ready ? "pdfCanvas ready" : "pdfCanvas"} />
      {failed && <img className="mapFallback" src="/standplan.webp" alt="" />}

      {hoveredArea && hoverInfo && (
        <>
          <svg className={styles.hoverFrost} viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`} preserveAspectRatio="none">
            <defs>
              <mask id="hoverFocusMask">
                <rect x="0" y="0" width={PAGE_WIDTH} height={PAGE_HEIGHT} fill="white" />
                <path d={hoverInfo.path} fill="black" />
              </mask>
            </defs>
            <foreignObject x="0" y="0" width={PAGE_WIDTH} height={PAGE_HEIGHT} mask="url(#hoverFocusMask)">
              <div className={styles.hoverFrostLayer} />
            </foreignObject>
          </svg>

          <div
            className={`${styles.areaHoverPopup} ${areaColorClass}`}
            style={{ left: popupPosition.left, top: popupPosition.top }}
          >
            <span className={styles.areaHoverKicker}>Bereich {hoveredArea}</span>
            <strong>{hoverInfo.title}</strong>
            <span>{hoverInfo.text}</span>
            <small>Klicken, um Standplätze auszuwählen</small>
          </div>
        </>
      )}
    </div>
  );
}
