"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PAGE_SIZE, stands, Stand } from "@/lib/stands";
import { euro } from "@/lib/money";
import PdfStandplan from "@/components/PdfStandplan";

type Availability = "free" | "held" | "booked" | "blocked";
type Section = "A" | "B" | "C";

const sections: Section[] = ["A", "B", "C"];

const sectionInfo: Record<Section, { title: string; text: string; labelX: number; labelY: number }> = {
  A: {
    title: "Passage",
    text: "Vor Sonne und Regen geschützt 🙂",
    labelX: 292,
    labelY: 205,
  },
  B: {
    title: "Tiefebene",
    text: "Hier ist die Musik unseres Flohmarkt DJs am besten zu hören, Tanzlaune garantiert!",
    labelX: 350,
    labelY: 405,
  },
  C: {
    title: "Hochebene",
    text: "Brunnengeplätscher und Kaffeeduft aus dem Gastro-Container",
    labelX: 580,
    labelY: 410,
  },
};

// Die drei Flächen entsprechen den schwarzen Strichellinien im Original-Standplan.
const sectionPaths: Record<Section, string> = {
  A: "M 208.632 252.188 C 205.675 256.985 204.747 262.760 206.053 268.242 C 212.346 294.654 231.814 376.368 244.801 430.876 C 246.811 439.313 253.753 445.677 262.332 446.949 C 270.911 448.220 279.400 444.143 283.771 436.653 C 323.952 367.791 395.546 245.098 397.633 241.520 C 397.664 241.467 397.695 241.413 397.726 241.360 C 398.970 239.184 425.163 193.381 440.178 167.125 C 445.921 157.084 442.563 144.293 432.628 138.367 C 407.764 123.536 363.019 96.846 338.119 81.993 C 328.159 76.051 315.272 79.208 309.186 89.081 C 284.526 129.081 225.564 224.723 208.632 252.188 Z",
  B: "M 420.311 264.316 C 415.557 260.153 409.195 258.325 402.956 259.331 C 396.717 260.336 391.251 264.070 388.045 269.516 C 356.322 323.405 276.327 459.298 260.010 487.017 C 258.089 490.280 257.077 493.996 257.077 497.782 L 257.077 513.302 C 257.077 518.930 259.312 524.327 263.292 528.307 C 267.271 532.286 272.669 534.522 278.296 534.522 L 425.180 534.522 C 436.900 534.522 446.400 525.021 446.400 513.302 L 446.400 296.786 C 446.400 290.670 443.761 284.852 439.160 280.823 C 434.063 276.359 426.986 270.161 420.311 264.316 Z",
  C: "M 468.804 280.125 C 463.955 280.125 459.304 282.052 455.876 285.480 C 452.447 288.909 450.521 293.560 450.521 298.409 L 450.521 541.439 C 450.521 551.537 458.706 559.722 468.804 559.722 L 737.247 559.722 C 747.345 559.722 755.530 551.537 755.530 541.439 L 755.530 511.963 C 755.530 507.114 753.604 502.464 750.175 499.035 C 746.747 495.606 742.096 493.680 737.247 493.680 L 655.178 493.680 C 650.329 493.680 645.679 491.754 642.250 488.325 C 638.821 484.896 636.895 480.246 636.895 475.397 L 636.895 298.409 C 636.895 293.560 634.969 288.909 631.540 285.480 C 628.111 282.052 623.461 280.125 618.612 280.125 Z",
};

export default function BookingApp() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [hoveredSection, setHoveredSection] = useState<Section | null>(null);
  const [meters, setMeters] = useState<"all" | "2" | "3">("all");
  const [statuses, setStatuses] = useState<Record<string, Availability>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = stands.find((stand) => stand.id === selectedId) || null;
  const focusSection = hoveredSection || section;

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/availability", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.statuses) setStatuses(json.statuses);
      } catch {
        // Die API validiert die Verfügbarkeit beim Buchen zusätzlich atomar.
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
    if (section === value) return;
    setSection(value);
    setHoveredSection(null);
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
            <span className="toolbarPrompt">
              {section
                ? `Bereich ${section} ausgewählt – A, B oder C auf der Karte anklicken, um direkt zu wechseln.`
                : "1. Fahre über A, B oder C und wähle deinen Bereich."}
            </span>
            {section && (
              <div className="filterGroup">
                <button className={meters === "all" ? "chip active" : "chip"} onClick={() => setMeters("all")}>Alle Größen</button>
                <button className={meters === "2" ? "chip active" : "chip"} onClick={() => setMeters("2")}>2 m</button>
                <button className={meters === "3" ? "chip active" : "chip"} onClick={() => setMeters("3")}>3 m</button>
              </div>
            )}
          </div>

          <div className="legend">
            {!section ? (
              <span>Die Flächen folgen exakt den schwarzen Strichellinien im Plan.</span>
            ) : (
              <>
                <span><i className="dot green" /> 3 m · 22,50 €</span>
                <span><i className="dot yellow" /> 2 m · 15,00 €</span>
                <span><i className="dot gray" /> nicht verfügbar</span>
              </>
            )}
          </div>

          <div className="mapScroll">
            <div className="mapStage">
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

                {sections.map((value) => {
                  const isSelectedArea = section === value;
                  const isFocused = focusSection === value;
                  return (
                    <g key={value}>
                      <path
                        d={sectionPaths[value]}
                        className={`areaHit ${isFocused ? "focused" : ""}`}
                        tabIndex={isSelectedArea ? -1 : 0}
                        role="button"
                        aria-label={`Bereich ${value}: ${sectionInfo[value].title}. ${sectionInfo[value].text}`}
                        style={{ pointerEvents: isSelectedArea ? "none" : "auto" }}
                        onMouseEnter={() => setHoveredSection(value)}
                        onMouseLeave={() => setHoveredSection(null)}
                        onFocus={() => setHoveredSection(value)}
                        onBlur={() => setHoveredSection(null)}
                        onClick={() => chooseSection(value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") chooseSection(value);
                        }}
                      />

                      {isFocused && (
                        <g
                          className={`areaMapLabel area-${value.toLowerCase()}`}
                          transform={`translate(${sectionInfo[value].labelX} ${sectionInfo[value].labelY})`}
                          pointerEvents="none"
                        >
                          <rect x="-48" y="-15" width="96" height="30" rx="15" />
                          <text textAnchor="middle" dominantBaseline="central">
                            {value} · {sectionInfo[value].title}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {section && stands.map((stand) => {
                  const state = availability(stand);
                  const isVisible = visible.has(stand.id);
                  const isSelected = stand.id === selectedId;
                  const points = stand.points.map((point) => point.join(",")).join(" ");

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
              ? "Beim Hover treten die anderen Bereiche zurück. Klick auf einen Bereich, danach kannst du dort direkt deinen Stand auswählen."
              : `Bereich ${section} ist aktiv. Du kannst trotzdem jederzeit direkt auf einen anderen Bereich klicken.`}
          </p>
        </section>

        <aside className="bookingCard">
          <div className="areaIntro areaSwitcherPanel">
            <p className="eyebrow">Platzbereich</p>
            <h2>{section ? "Bereich wählen oder wechseln" : "Welcher Bereich passt zu dir?"}</h2>
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
                    <small>{freeCount(value)} Standplätze aktuell frei</small>
                  </span>
                  <span className="areaArrow">→</span>
                </button>
              ))}
            </div>
          </div>

          {!section ? (
            <div className="emptyState areaChooseHint">
              <span className="bigArrow">↖</span>
              <h2>Erst einen Bereich anklicken.</h2>
              <p>Danach werden die einzelnen Standplätze in diesem Bereich auswählbar.</p>
            </div>
          ) : !selected ? (
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
        </aside>
      </div>
    </main>
  );
}
