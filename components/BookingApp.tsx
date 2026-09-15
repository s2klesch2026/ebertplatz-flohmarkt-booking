"use client";

import { FormEvent, TouchEvent as ReactTouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { PAGE_SIZE, stands, Stand } from "@/lib/stands";
import { euro } from "@/lib/money";
import PdfStandplan from "@/components/PdfStandplan";

type Availability = "free" | "held" | "booked" | "blocked";
type Section = "A" | "B" | "C";
type StandCount = 1 | 2;
type MeterFilter = "all" | "2" | "3";

const sections: Section[] = ["A", "B", "C"];
const MAX_ZOOM = 3.5;

const sectionInfo: Record<Section, { title: string; text: string }> = {
  A: { title: "Passage", text: "Vor Sonne und Regen geschützt 🙂" },
  B: { title: "Tiefebene", text: "Hier ist die Musik unseres Flohmarkt DJs am besten zu hören, Tanzlaune garantiert!" },
  C: { title: "Hochebene", text: "Brunnengeplätscher und Kaffeeduft aus dem Gastro-Container" },
};

const sectionPaths: Record<Section, string> = {
  A: "M 208.632 252.188 C 205.675 256.985 204.747 262.760 206.053 268.242 C 212.346 294.654 231.814 376.368 244.801 430.876 C 246.811 439.313 253.753 445.677 262.332 446.949 C 270.911 448.220 279.400 444.143 283.771 436.653 C 323.952 367.791 395.546 245.098 397.633 241.520 C 397.664 241.467 397.695 241.413 397.726 241.360 C 398.970 239.184 425.163 193.381 440.178 167.125 C 445.921 157.084 442.563 144.293 432.628 138.367 C 407.764 123.536 363.019 96.846 338.119 81.993 C 328.159 76.051 315.272 79.208 309.186 89.081 C 284.526 129.081 225.564 224.723 208.632 252.188 Z",
  B: "M 420.311 264.316 C 415.557 260.153 409.195 258.325 402.956 259.331 C 396.717 260.336 391.251 264.070 388.045 269.516 C 356.322 323.405 276.327 459.298 260.010 487.017 C 258.089 490.280 257.077 493.996 257.077 497.782 L 257.077 513.302 C 257.077 518.930 259.312 524.327 263.292 528.307 C 267.271 532.286 272.669 534.522 278.296 534.522 L 425.180 534.522 C 436.900 534.522 446.400 525.021 446.400 513.302 L 446.400 296.786 C 446.400 290.670 443.761 284.852 439.160 280.823 C 434.063 276.359 426.986 270.161 420.311 264.316 Z",
  C: "M 468.804 280.125 C 463.955 280.125 459.304 282.052 455.876 285.480 C 452.447 288.909 450.521 293.560 450.521 298.409 L 450.521 541.439 C 450.521 551.537 458.706 559.722 468.804 559.722 L 737.247 559.722 C 747.345 559.722 755.530 551.537 755.530 541.439 L 755.530 511.963 C 755.530 507.114 753.604 502.464 750.175 499.035 C 746.747 495.606 742.096 493.680 737.247 493.680 L 655.178 493.680 C 650.329 493.680 645.679 491.754 642.250 488.325 C 638.821 484.896 636.895 480.246 636.895 475.397 L 636.895 298.409 C 636.895 293.560 634.969 288.909 631.540 285.480 C 628.111 282.052 623.461 280.125 618.612 280.125 Z",
};

function naturalStandSort(a: Stand, b: Stand) {
  return a.id.localeCompare(b.id, "de", { numeric: true });
}

function center(stand: Stand) {
  const points = stand.points;
  const usable = points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]
    ? points.slice(0, -1)
    : points;
  return {
    x: usable.reduce((sum, point) => sum + point[0], 0) / usable.length,
    y: usable.reduce((sum, point) => sum + point[1], 0) / usable.length,
  };
}

function distance(a: Stand, b: Stand) {
  const ac = center(a);
  const bc = center(b);
  return Math.hypot(ac.x - bc.x, ac.y - bc.y);
}

function touchDistance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function isMobileMapViewport() {
  return typeof window !== "undefined" && window.innerWidth <= 700;
}

export default function BookingApp() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [standCount, setStandCountState] = useState<StandCount>(1);
  const [section, setSection] = useState<Section | null>(null);
  const [hoveredSection, setHoveredSection] = useState<Section | null>(null);
  const [meters, setMeters] = useState<MeterFilter>("all");
  const [statuses, setStatuses] = useState<Record<string, Availability>>({});
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mapScrollRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{
    startDistance: number;
    startZoom: number;
    contentX: number;
    contentY: number;
  } | null>(null);

  const selected = selectedIds.map((id) => stands.find((stand) => stand.id === id)).filter(Boolean) as Stand[];
  const focusSection = hoveredSection || section;
  const selectedTotal = selected.reduce((sum, stand) => sum + stand.priceCents + stand.depositCents, 0);
  const selectedSubtotal = selected.reduce((sum, stand) => sum + stand.priceCents, 0);
  const selectedDeposit = selected.reduce((sum, stand) => sum + stand.depositCents, 0);

  const availability = (stand: Stand): Availability => statuses[stand.id] || "free";

  const freeCandidates = (value: Section, filter: MeterFilter = meters) =>
    stands
      .filter((stand) => stand.section === value)
      .filter((stand) => filter === "all" || String(stand.meters) === filter)
      .filter((stand) => availability(stand) === "free")
      .sort(naturalStandSort);

  const autoPick = (value: Section, count: StandCount, filter: MeterFilter = meters, keepId?: string) => {
    const candidates = freeCandidates(value, filter);
    if (!candidates.length) return [];

    if (count === 1) {
      if (keepId && candidates.some((stand) => stand.id === keepId)) return [keepId];
      return [candidates[0].id];
    }

    if (keepId) {
      const first = candidates.find((stand) => stand.id === keepId);
      if (first) {
        const second = candidates
          .filter((stand) => stand.id !== keepId)
          .sort((a, b) => distance(first, a) - distance(first, b))[0];
        return second ? [keepId, second.id] : [keepId];
      }
    }

    let best: [Stand, Stand] | null = null;
    let bestDistance = Infinity;
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const current = distance(candidates[i], candidates[j]);
        if (current < bestDistance) {
          bestDistance = current;
          best = [candidates[i], candidates[j]];
        }
      }
    }
    return best ? best.map((stand) => stand.id) : [candidates[0].id];
  };

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/availability", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.statuses) setStatuses(json.statuses);
      } catch {
        // Server validates availability atomically again at checkout.
      }
    };

    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedIds.length) return;
    const unavailable = selectedIds.filter((id) => statuses[id] && statuses[id] !== "free");
    if (!unavailable.length) return;

    const stillFree = selectedIds.filter((id) => !statuses[id] || statuses[id] === "free");
    setSelectedIds(stillFree);
    setMessage(
      unavailable.length === 1
        ? `Stand ${unavailable[0]} ist inzwischen nicht mehr verfügbar. Bitte wähle einen anderen.`
        : "Ein Teil deiner Auswahl ist inzwischen nicht mehr verfügbar. Bitte ergänze deine Auswahl."
    );
  }, [statuses, selectedIds]);

  const visible = useMemo(
    () =>
      new Set(
        stands
          .filter((stand) => section && stand.section === section)
          .filter((stand) => meters === "all" || String(stand.meters) === meters)
          .map((stand) => stand.id)
      ),
    [section, meters]
  );

  const freeCount = (value: Section) => freeCandidates(value, meters).length;

  function resetMapView() {
    pinchRef.current = null;
    setZoom(1);
    window.requestAnimationFrame(() => mapScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" }));
  }

  function focusMapOnStandIds(ids: string[], targetZoom = 1.85) {
    const targets = ids
      .map((id) => stands.find((stand) => stand.id === id))
      .filter(Boolean) as Stand[];
    if (!targets.length) return;

    const targetCenters = targets.map(center);
    const point = {
      x: targetCenters.reduce((sum, item) => sum + item.x, 0) / targetCenters.length,
      y: targetCenters.reduce((sum, item) => sum + item.y, 0) / targetCenters.length,
    };

    setZoom(targetZoom);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const scroller = mapScrollRef.current;
        if (!scroller) return;
        const left = (point.x / PAGE_SIZE.width) * scroller.scrollWidth - scroller.clientWidth / 2;
        const top = (point.y / PAGE_SIZE.height) * scroller.scrollHeight - scroller.clientHeight / 2;
        scroller.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: "smooth" });
      });
    });
  }

  function changeZoom(direction: -1 | 1) {
    const scroller = mapScrollRef.current;
    const centerX = scroller && scroller.scrollWidth
      ? (scroller.scrollLeft + scroller.clientWidth / 2) / scroller.scrollWidth
      : 0.5;
    const centerY = scroller && scroller.scrollHeight
      ? (scroller.scrollTop + scroller.clientHeight / 2) / scroller.scrollHeight
      : 0.5;
    const next = Math.min(MAX_ZOOM, Math.max(1, Math.round((zoom + direction * 0.25) * 100) / 100));
    setZoom(next);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const current = mapScrollRef.current;
        if (!current || next <= 1) return;
        current.scrollTo({
          left: Math.max(0, centerX * current.scrollWidth - current.clientWidth / 2),
          top: Math.max(0, centerY * current.scrollHeight - current.clientHeight / 2),
          behavior: "smooth",
        });
      });
    });
  }

  function handlePinchStart(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 2) return;
    const scroller = mapScrollRef.current;
    if (!scroller) return;

    const first = event.touches[0];
    const second = event.touches[1];
    const rect = scroller.getBoundingClientRect();
    const midpointX = (first.clientX + second.clientX) / 2 - rect.left;
    const midpointY = (first.clientY + second.clientY) / 2 - rect.top;

    pinchRef.current = {
      startDistance: touchDistance(first, second),
      startZoom: zoom,
      contentX: scroller.scrollWidth ? (scroller.scrollLeft + midpointX) / scroller.scrollWidth : 0.5,
      contentY: scroller.scrollHeight ? (scroller.scrollTop + midpointY) / scroller.scrollHeight : 0.5,
    };
  }

  function handlePinchMove(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    event.preventDefault();

    const scroller = mapScrollRef.current;
    if (!scroller) return;
    const first = event.touches[0];
    const second = event.touches[1];
    const currentDistance = touchDistance(first, second);
    if (!currentDistance || !pinchRef.current.startDistance) return;

    const ratio = currentDistance / pinchRef.current.startDistance;
    const rawZoom = pinchRef.current.startZoom * ratio;
    const next = Math.min(MAX_ZOOM, Math.max(1, Math.round(rawZoom * 100) / 100));
    const anchor = pinchRef.current;
    const rect = scroller.getBoundingClientRect();
    const midpointX = (first.clientX + second.clientX) / 2 - rect.left;
    const midpointY = (first.clientY + second.clientY) / 2 - rect.top;

    setZoom(next);
    window.requestAnimationFrame(() => {
      const current = mapScrollRef.current;
      if (!current) return;
      if (next <= 1.01) {
        current.scrollTo({ left: 0, top: 0 });
        return;
      }
      current.scrollTo({
        left: Math.max(0, anchor.contentX * current.scrollWidth - midpointX),
        top: Math.max(0, anchor.contentY * current.scrollHeight - midpointY),
      });
    });
  }

  function handlePinchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2) pinchRef.current = null;
  }

  function chooseSection(value: Section) {
    const keep = section === value ? selectedIds[0] : undefined;
    const next = autoPick(value, standCount, meters, keep);
    setSection(value);
    setHoveredSection(null);
    setMessage(null);
    setSelectedIds(next);

    if (isMobileMapViewport() && next.length) {
      focusMapOnStandIds(next);
    } else {
      resetMapView();
    }
  }

  function setStandCount(value: StandCount) {
    setStandCountState(value);
    setMessage(null);
    if (!section) {
      setSelectedIds([]);
      return;
    }

    const next = autoPick(section, value, meters, selectedIds[0]);
    setSelectedIds(next);
    if (isMobileMapViewport() && next.length) focusMapOnStandIds(next);
    if (value === 2 && next.length < 2) {
      setMessage("In diesem Bereich ist gerade kein zweiter passender freier Stand verfügbar.");
    }
  }

  function setMeterFilter(value: MeterFilter) {
    setMeters(value);
    setMessage(null);
    if (section) {
      const next = autoPick(section, standCount, value);
      setSelectedIds(next);
      if (isMobileMapViewport() && next.length) focusMapOnStandIds(next);
      if (next.length < standCount) {
        setMessage("Für diese Standgröße sind aktuell nicht genug freie Plätze verfügbar.");
      }
    }
  }

  function selectStand(stand: Stand) {
    if (!section || stand.section !== section || availability(stand) !== "free" || !visible.has(stand.id)) return;
    setMessage(null);

    if (selectedIds.includes(stand.id)) {
      setSelectedIds(selectedIds.filter((id) => id !== stand.id));
      return;
    }

    if (standCount === 1) {
      setSelectedIds([stand.id]);
      return;
    }

    if (selectedIds.length < 2) {
      setSelectedIds([...selectedIds, stand.id]);
      return;
    }

    setSelectedIds([selectedIds[0], stand.id]);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selected.length !== standCount) {
      setMessage(`Bitte wähle ${standCount === 1 ? "einen Stand" : "zwei Stände"} aus.`);
      return;
    }

    setBusy(true);
    setMessage(null);

    const form = new FormData(e.currentTarget);
    const payload = {
      standIds: selected.map((stand) => stand.id),
      firstName: String(form.get("firstName") || ""),
      lastName: String(form.get("lastName") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      street: String(form.get("street") || ""),
      postalCode: String(form.get("postalCode") || ""),
      city: String(form.get("city") || ""),
    };

    try {
      const reservation = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const reservationJson = await reservation.json();
      if (!reservation.ok) throw new Error(reservationJson.error || "Reservierung fehlgeschlagen");

      const order = await fetch("/api/paypal/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: reservationJson.bookingId }),
      });
      const orderJson = await order.json();
      if (!order.ok) throw new Error(orderJson.error || "PayPal konnte nicht gestartet werden");

      window.location.href = orderJson.approveUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Etwas ist schiefgegangen.");
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="hero">
        <a className="brandLogo" href="https://www.ebertplatz-flohmarkt.de/" aria-label="Flohmarkt am Ebertplatz">
          <img src="/flohmarkt-logo.svg" alt="Flohmarkt am Ebertplatz" />
        </a>
        <div className="heroCopy">
          <p className="eyebrow">Standplatz buchen</p>
          <h1>Such dir deinen Platz aus.</h1>
          <p className="heroText">19.09.2026 · 11–16 Uhr · Ebertplatz Köln</p>
        </div>
      </header>

      <section className="steps" aria-label="Buchungsablauf">
        <span className={!section ? "active" : "done"}><b>1</b> Bereich</span>
        <span className={section && selected.length < standCount ? "active" : section ? "done" : ""}><b>2</b> Stand</span>
        <span className={selected.length === standCount ? "active" : ""}><b>3</b> Daten & PayPal</span>
        <span><b>4</b> Fertig</span>
      </section>

      <div className="workspace">
        <section className="mapCard">
          <div className="toolbar">
            <span className="toolbarPrompt">
              {section
                ? `Bereich ${section} · ${standCount === 1 ? "1 Stand" : "2 Stände"}. Die Vorauswahl kannst du direkt im Plan ändern.`
                : "Wähle A, B oder C – danach schlagen wir dir automatisch einen freien Stand vor."}
            </span>
            <div className="zoomControls" role="group" aria-label="Karte zoomen">
              <button type="button" onClick={() => changeZoom(-1)} disabled={zoom <= 1} aria-label="Karte verkleinern">−</button>
              <button type="button" className="zoomValue" onClick={resetMapView} title="Gesamtansicht">{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => changeZoom(1)} disabled={zoom >= MAX_ZOOM} aria-label="Karte vergrößern">+</button>
              <button type="button" className="fitButton" onClick={resetMapView}>Gesamt</button>
            </div>
          </div>

          <div className="legend">
            {!section ? (
              <span>Gesamtansicht zuerst – bei Bedarf mit + / − in die Karte hineinzoomen.</span>
            ) : (
              <>
                <span><i className="dot free" /> frei</span>
                <span><i className="dot selectedDot" /> ausgewählt</span>
                <span><i className="dot unavailable" /> nicht verfügbar</span>
                <span className="priceLegend">2 m · 15 € &nbsp; / &nbsp; 3 m · 22,50 €</span>
              </>
            )}
          </div>

          <div className="mapViewportWrap">
            <div className="mobileZoomControls" role="group" aria-label="Karte auf dem Handy zoomen">
              <button type="button" onClick={() => changeZoom(-1)} disabled={zoom <= 1} aria-label="Karte verkleinern">−</button>
              <button type="button" className="mobileZoomValue" onClick={resetMapView}>{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => changeZoom(1)} disabled={zoom >= MAX_ZOOM} aria-label="Karte vergrößern">+</button>
              <button type="button" className="mobileFitButton" onClick={resetMapView}>Gesamt</button>
            </div>

            <div
              ref={mapScrollRef}
              className={`mapScroll ${zoom > 1 ? "zoomed" : "fitView"}`}
              onWheel={(event) => {
                if (!(event.ctrlKey || event.metaKey)) return;
                event.preventDefault();
                changeZoom(event.deltaY > 0 ? -1 : 1);
              }}
              onTouchStart={handlePinchStart}
              onTouchMove={handlePinchMove}
              onTouchEnd={handlePinchEnd}
              onTouchCancel={handlePinchEnd}
            >
              <div className="mapStage" style={{ width: `${zoom * 100}%` }}>
                <PdfStandplan />
                <svg
                  viewBox={`0 0 ${PAGE_SIZE.width} ${PAGE_SIZE.height}`}
                  className="standOverlay"
                  role="group"
                  aria-label={section ? `Standplätze in Bereich ${section}` : "Platzbereiche A, B und C"}
                >
                  <defs>
                    <filter id="softArea" x="-10%" y="-10%" width="120%" height="120%">
                      <feGaussianBlur stdDeviation="1.35" />
                    </filter>
                  </defs>

                  {focusSection && sections.map((value) => value !== focusSection && (
                    <path key={`dim-${value}`} d={sectionPaths[value]} className="areaDim" filter="url(#softArea)" />
                  ))}

                  {focusSection && (
                    <path
                      d={sectionPaths[focusSection]}
                      className={`areaFocus area-${focusSection.toLowerCase()} ${hoveredSection ? "hovering" : "selected"}`}
                    />
                  )}

                  {sections.map((value) => (
                    <path
                      key={value}
                      d={sectionPaths[value]}
                      className={`areaHit ${focusSection === value ? "focused" : ""}`}
                      tabIndex={section === value ? -1 : 0}
                      role="button"
                      aria-label={`Bereich ${value}: ${sectionInfo[value].title}. ${sectionInfo[value].text}`}
                      style={{ pointerEvents: section === value ? "none" : "auto" }}
                      onMouseEnter={() => setHoveredSection(value)}
                      onMouseLeave={() => setHoveredSection(null)}
                      onFocus={() => setHoveredSection(value)}
                      onBlur={() => setHoveredSection(null)}
                      onClick={() => chooseSection(value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") chooseSection(value);
                      }}
                    />
                  ))}

                  {section && stands.map((stand) => {
                    const state = availability(stand);
                    const isVisible = visible.has(stand.id);
                    const isSelected = selectedIds.includes(stand.id);
                    const points = stand.points.map((point) => point.join(",")).join(" ");

                    return (
                      <polygon
                        key={stand.id}
                        points={points}
                        tabIndex={state === "free" && isVisible ? 0 : -1}
                        role="button"
                        aria-label={`${stand.id}, ${stand.meters} Meter, ${euro(stand.priceCents)}, ${state === "free" ? "frei" : "nicht verfügbar"}`}
                        className={[
                          "standHit",
                          `state-${state}`,
                          isSelected ? "selected" : "",
                          isVisible ? "" : "filtered",
                        ].join(" ")}
                        onClick={() => selectStand(stand)}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && state === "free" && isVisible) selectStand(stand);
                        }}
                      />
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>

          <p className="mapHint">
            {!section
              ? "Der ganze Plan ist zuerst sichtbar. Auf dem Handy: Bereich antippen, dann wird automatisch hineingezoomt. Danach mit zwei Fingern stufenlos zoomen oder mit + / − nachjustieren."
              : "Mit zwei Fingern kannst du direkt in die Karte hinein- und herauszoomen. Mit einem Finger verschiebst du den Ausschnitt; „Gesamt“ zeigt wieder den ganzen Platz."}
          </p>
        </section>

        <aside className="bookingCard">
          {selected.length > 0 && (
            <div className="standSummary">
              <div>
                <p className="eyebrow">Deine Auswahl</p>
                <h2>{selected.map((stand) => `Stand ${stand.id}`).join(" + ")}</h2>
                <p>Bereich {selected[0].section} · {selected.map((stand) => `${stand.meters} m`).join(" + ")}</p>
              </div>
              <button className="textButton" onClick={() => setSelectedIds([])}>ändern</button>
            </div>
          )}

          <div className={selected.length ? "compactControls" : "setupControls"}>
            <div className="choiceBlock">
              <div className="choiceLabel">
                <p className="eyebrow">Deine Buchung</p>
                <strong>Wie viel Platz brauchst du?</strong>
              </div>

              <div className="choiceRow">
                <span>Anzahl</span>
                <div className="segmented" role="group" aria-label="Anzahl Standplätze">
                  <button className={standCount === 1 ? "active" : ""} onClick={() => setStandCount(1)}>1 Stand</button>
                  <button className={standCount === 2 ? "active" : ""} onClick={() => setStandCount(2)}>2 Stände</button>
                </div>
              </div>

              <div className="choiceRow sizeChoiceRow">
                <span>Standgröße</span>
                <div className="sizeSegmented" role="group" aria-label="Standgröße">
                  <button className={meters === "all" ? "active" : ""} onClick={() => setMeterFilter("all")}>
                    <b>Egal</b><small>passender freier Platz</small>
                  </button>
                  <button className={meters === "2" ? "active" : ""} onClick={() => setMeterFilter("2")}>
                    <b>2 m</b><small>15 €</small>
                  </button>
                  <button className={meters === "3" ? "active" : ""} onClick={() => setMeterFilter("3")}>
                    <b>3 m</b><small>22,50 €</small>
                  </button>
                </div>
              </div>
            </div>

            {selected.length ? (
              <div className="miniAreaSwitch">
                <span>Bereich wechseln</span>
                <div>
                  {sections.map((value) => (
                    <button
                      key={value}
                      className={`miniArea area-${value.toLowerCase()} ${section === value ? "active" : ""}`}
                      onMouseEnter={() => setHoveredSection(value)}
                      onMouseLeave={() => setHoveredSection(null)}
                      onClick={() => chooseSection(value)}
                    >
                      <b>{value}</b>
                      <small>{sectionInfo[value].title}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="areaIntro areaSwitcherPanel">
                <p className="eyebrow">Platzbereich</p>
                <h2>{section ? "Bereich wechseln" : "Welcher Bereich passt zu dir?"}</h2>
                <div className="areaCards">
                  {sections.map((value) => (
                    <button
                      key={value}
                      className={[
                        "areaCard",
                        `area-${value.toLowerCase()}`,
                        section === value ? "active" : "",
                        hoveredSection === value ? "hovered" : "",
                      ].join(" ")}
                      onMouseEnter={() => setHoveredSection(value)}
                      onMouseLeave={() => setHoveredSection(null)}
                      onFocus={() => setHoveredSection(value)}
                      onBlur={() => setHoveredSection(null)}
                      onClick={() => chooseSection(value)}
                    >
                      <span className="areaLetter">{value}</span>
                      <span className="areaCardCopy">
                        <strong>{sectionInfo[value].title}</strong>
                        <span>{sectionInfo[value].text}</span>
                        <small>{freeCount(value)} passende Standplätze aktuell frei</small>
                      </span>
                      <span className="areaArrow">→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!section ? (
            <div className="emptyState areaChooseHint">
              <span className="bigArrow">↖</span>
              <h2>Wähle zuerst einen Bereich.</h2>
              <p>Größe und Anzahl kannst du schon oben festlegen. Danach schlagen wir automatisch passende freie Plätze vor.</p>
            </div>
          ) : selected.length < standCount ? (
            <div className="emptyState standStep">
              <p className="eyebrow">Auswahl ergänzen</p>
              <h2>{standCount === 2 ? "Noch einen Stand auswählen." : "Stand auswählen."}</h2>
              <p>Klicke direkt auf eine freie Standnummer im Plan.</p>
              {message && <p className="error">{message}</p>}
            </div>
          ) : (
            <>
              <div className="priceBox">
                {selected.map((stand) => (
                  <div key={stand.id}>
                    <span>Stand {stand.id} · {stand.meters} m</span>
                    <strong>{euro(stand.priceCents)}</strong>
                  </div>
                ))}
                <div><span>Müllkaution{selected.length > 1 ? ` (${selected.length}×)` : ""}</span><strong>{euro(selectedDeposit)}</strong></div>
                <div className="total"><span>Gesamt</span><strong>{euro(selectedTotal)}</strong></div>
                <small>Standgebühr {euro(selectedSubtotal)} · Die Kaution kann nach dem Flohmarkt zurückerstattet werden.</small>
              </div>

              <form onSubmit={submit} className="bookingForm">
                <div className="twoCols">
                  <label>Vorname<input name="firstName" required autoComplete="given-name" /></label>
                  <label>Nachname<input name="lastName" required autoComplete="family-name" /></label>
                </div>
                <label>E-Mail<input name="email" required type="email" autoComplete="email" /></label>
                <label>Telefon <span>(optional)</span><input name="phone" autoComplete="tel" /></label>
                <label>Straße + Hausnummer<input name="street" required autoComplete="street-address" /></label>
                <div className="twoCols shortLong">
                  <label>PLZ<input name="postalCode" required inputMode="numeric" autoComplete="postal-code" /></label>
                  <label>Ort<input name="city" required autoComplete="address-level2" defaultValue="Köln" /></label>
                </div>
                <label className="check">
                  <input type="checkbox" required />
                  <span>Ich akzeptiere die Flohmarktsatzung und die Hinweise zur Buchung.</span>
                </label>
                {message && <p className="error">{message}</p>}
                <button className="paypalButton" disabled={busy} type="submit">
                  {busy ? "Einen Moment …" : `Mit PayPal ${euro(selectedTotal)} bezahlen`}
                </button>
                <p className="holdNote">{selected.length === 1 ? "Dein Stand" : "Deine Stände"} werden beim Start der Zahlung 10 Minuten für dich reserviert.</p>
              </form>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
