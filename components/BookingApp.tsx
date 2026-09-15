"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PAGE_SIZE, stands, Stand } from "@/lib/stands";
import { euro } from "@/lib/money";
import PdfStandplan from "@/components/PdfStandplan";

type Availability = "free" | "held" | "booked" | "blocked";
type Section = "A" | "B" | "C";
type Point = [number, number];

const sections: Section[] = ["A", "B", "C"];

const sectionInfo: Record<Section, { title: string; text: string }> = {
  A: {
    title: "Passage",
    text: "Vor Sonne und Regen geschützt 🙂",
  },
  B: {
    title: "Tiefebene",
    text: "Hier ist die Musik unseres Flohmarkt DJs am besten zu hören, Tanzlaune garantiert!",
  },
  C: {
    title: "Hochebene",
    text: "Brunnengeplätscher und Kaffeeduft aus dem Gastro-Container",
  },
};

function convexHull(points: Point[]) {
  const unique = Array.from(new Map(points.map((point) => [`${point[0]}:${point[1]}`, point])).values());
  if (unique.length <= 2) return unique;
  unique.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: Point[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }

  const upper: Point[] = [];
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const point = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function centerOf(points: Point[]) {
  const total = points.reduce(
    (acc, point) => ({ x: acc.x + point[0], y: acc.y + point[1] }),
    { x: 0, y: 0 }
  );
  return { x: total.x / points.length, y: total.y / points.length };
}

export default function BookingApp() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [hoveredSection, setHoveredSection] = useState<Section | null>(null);
  const [meters, setMeters] = useState<"all" | "2" | "3">("all");
  const [statuses, setStatuses] = useState<Record<string, Availability>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = stands.find((s) => s.id === selectedId) || null;

  const areaHulls = useMemo(
    () =>
      Object.fromEntries(
        sections.map((value) => {
          const points = stands
            .filter((stand) => stand.section === value)
            .flatMap((stand) => stand.points.map((point) => [point[0], point[1]] as Point));
          return [value, convexHull(points)];
        })
      ) as Record<Section, Point[]>,
    []
  );

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/availability", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.statuses) setStatuses(json.statuses);
      } catch {
        // The server still validates availability atomically when booking.
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
    if (selectedId && statuses[selectedId] && statuses[selectedId] !== "free") {
      setSelectedId(null);
      setMessage("Dieser Stand ist inzwischen nicht mehr verfügbar. Bitte wähle einen anderen Platz.");
    }
  }, [statuses, selectedId]);

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

  const availability = (stand: Stand): Availability => statuses[stand.id] || "free";

  const freeCount = (value: Section) =>
    stands.filter((stand) => stand.section === value && availability(stand) === "free").length;

  function chooseSection(value: Section) {
    setSection(value);
    setHoveredSection(null);
    setSelectedId(null);
    setMeters("all");
    setMessage(null);
  }

  function resetSection() {
    setSection(null);
    setSelectedId(null);
    setMeters("all");
    setMessage(null);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      standId: selected.id,
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
        <a className="brand" href="https://www.ebertplatz-flohmarkt.de/">
          Flohmarkt<br />am Ebertplatz
        </a>
        <div>
          <p className="eyebrow">Standplatz buchen</p>
          <h1>Such dir deinen Platz aus.</h1>
          <p className="heroText">Flohmarkt am Ebertplatz · 19.09.2026 · 11–16 Uhr</p>
        </div>
      </header>

      <section className="steps" aria-label="Buchungsablauf">
        <span className={!section ? "active" : "done"}><b>1</b> Bereich wählen</span>
        <span className={section && !selected ? "active" : section ? "done" : ""}><b>2</b> Stand wählen</span>
        <span className={selected ? "active" : ""}><b>3</b> Daten & PayPal</span>
        <span><b>4</b> Fertig</span>
      </section>

      <div className="workspace">
        <section className="mapCard">
          <div className="toolbar">
            <div className="filterGroup">
              {section ? (
                <button className="backChip" onClick={resetSection}>← Bereich wechseln</button>
              ) : (
                <span className="toolbarPrompt">1. Wähle zuerst einen Platzbereich</span>
              )}
            </div>
            {section && (
              <div className="filterGroup">
                <button className={meters === "all" ? "chip active" : "chip"} onClick={() => setMeters("all")}>Alle Größen</button>
                <button className={meters === "2" ? "chip active" : "chip"} onClick={() => setMeters("2")}>2 m</button>
                <button className={meters === "3" ? "chip active" : "chip"} onClick={() => setMeters("3")}>3 m</button>
              </div>
            )}
          </div>

          <div className="legend">
            {!section && <span>Fahre über A, B oder C und klicke deinen Wunschbereich an.</span>}
            {section && <>
              <span><i className="dot green" /> 3 m · 22,50 €</span>
              <span><i className="dot yellow" /> 2 m · 15,00 €</span>
              <span><i className="dot gray" /> nicht verfügbar</span>
            </>}
          </div>

          <div className="mapScroll">
            <div className="mapStage">
              <PdfStandplan />
              <svg viewBox={`0 0 ${PAGE_SIZE.width} ${PAGE_SIZE.height}`} className="standOverlay" role="group" aria-label={section ? `Standplätze in Bereich ${section}` : "Platzbereiche A, B und C"}>
                {!section && sections.map((value) => {
                  const hull = areaHulls[value];
                  const center = centerOf(hull);
                  const isHovered = hoveredSection === value;
                  return (
                    <g key={value}>
                      <polygon
                        points={hull.map((point) => point.join(",")).join(" ")}
                        className={isHovered ? "areaHit hovered" : "areaHit"}
                        tabIndex={0}
                        role="button"
                        aria-label={`Bereich ${value}: ${sectionInfo[value].title}. ${sectionInfo[value].text}`}
                        onMouseEnter={() => setHoveredSection(value)}
                        onMouseLeave={() => setHoveredSection(null)}
                        onFocus={() => setHoveredSection(value)}
                        onBlur={() => setHoveredSection(null)}
                        onClick={() => chooseSection(value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") chooseSection(value);
                        }}
                      />
                      <g className={isHovered ? "areaLabel hovered" : "areaLabel"} transform={`translate(${center.x} ${center.y})`}>
                        <circle r="20" />
                        <text textAnchor="middle" dominantBaseline="central">{value}</text>
                      </g>
                    </g>
                  );
                })}

                {section && (
                  <polygon
                    points={areaHulls[section].map((point) => point.join(",")).join(" ")}
                    className="selectedAreaOutline"
                  />
                )}

                {section && stands.map((stand) => {
                  const state = availability(stand);
                  const isVisible = visible.has(stand.id);
                  const isSelected = stand.id === selectedId;
                  const points = stand.points.map((p) => p.join(",")).join(" ");
                  return (
                    <polygon
                      key={stand.id}
                      points={points}
                      tabIndex={state === "free" && isVisible ? 0 : -1}
                      role="button"
                      aria-label={`${stand.id}, ${stand.meters} Meter, ${euro(stand.priceCents)}, ${state === "free" ? "frei" : "nicht verfügbar"}`}
                      className={["standHit", `state-${state}`, isSelected ? "selected" : "", isVisible ? "" : "filtered"].join(" ")}
                      onClick={() => {
                        if (state === "free" && isVisible) {
                          setMessage(null);
                          setSelectedId(stand.id);
                        }
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && state === "free" && isVisible) {
                          setMessage(null);
                          setSelectedId(stand.id);
                        }
                      }}
                    />
                  );
                })}
              </svg>
            </div>
          </div>
          <p className="mapHint">
            {!section
              ? "Die Bereiche werden beim Darüberfahren hervorgehoben. Nach dem Klick kannst du dort deinen konkreten Stand auswählen."
              : `Bereich ${section} ist ausgewählt. Klicke jetzt auf eine freie Standnummer.`}
          </p>
        </section>

        <aside className="bookingCard">
          {!section ? (
            <div className="areaIntro">
              <p className="eyebrow">Schritt 1</p>
              <h2>Welcher Bereich passt zu dir?</h2>
              <p className="areaLead">Es gibt 3 Platzbereiche, die zur Auswahl stehen:</p>
              <div className="areaCards">
                {sections.map((value) => (
                  <button
                    key={value}
                    className={hoveredSection === value ? "areaCard hovered" : "areaCard"}
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
                      <small>{freeCount(value)} Standplätze aktuell frei</small>
                    </span>
                    <span className="areaArrow">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="areaContext">
                <div className="areaContextHead">
                  <span className="areaLetter">{section}</span>
                  <div>
                    <p className="eyebrow">Bereich {section}</p>
                    <h2>{sectionInfo[section].title}</h2>
                  </div>
                  <button className="textButton" onClick={resetSection}>wechseln</button>
                </div>
                <p>{sectionInfo[section].text}</p>
              </div>

              {!selected ? (
                <div className="emptyState standStep">
                  <span className="bigArrow">↖</span>
                  <p className="eyebrow">Schritt 2</p>
                  <h2>Jetzt den Stand auswählen.</h2>
                  <p>Klicke direkt auf eine freie Standnummer in Bereich {section}.</p>
                  {message && <p className="error">{message}</p>}
                </div>
              ) : (
                <>
                  <div className="standSummary">
                    <div>
                      <p className="eyebrow">Deine Auswahl</p>
                      <h2>Stand {selected.id}</h2>
                      <p>{selected.meters} Meter · Bereich {selected.section}</p>
                    </div>
                    <button className="textButton" onClick={() => setSelectedId(null)}>ändern</button>
                  </div>
                  <div className="priceBox">
                    <div><span>{selected.meters} Meter Stand</span><strong>{euro(selected.priceCents)}</strong></div>
                    <div><span>Müllkaution</span><strong>{euro(selected.depositCents)}</strong></div>
                    <div className="total"><span>Gesamt</span><strong>{euro(selected.priceCents + selected.depositCents)}</strong></div>
                    <small>Die Kaution kann nach dem Flohmarkt zurückerstattet werden.</small>
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
                      {busy ? "Einen Moment …" : "Mit PayPal bezahlen"}
                    </button>
                    <p className="holdNote">Dein Stand wird beim Start der Zahlung 10 Minuten für dich reserviert.</p>
                  </form>
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
