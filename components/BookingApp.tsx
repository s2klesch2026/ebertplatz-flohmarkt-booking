"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PAGE_SIZE, stands, Stand } from "@/lib/stands";
import { euro } from "@/lib/money";
import PdfStandplan from "@/components/PdfStandplan";

type Availability = "free" | "held" | "booked" | "blocked";

export default function BookingApp() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<"all" | "A" | "B" | "C">("all");
  const [meters, setMeters] = useState<"all" | "2" | "3">("all");
  const [statuses, setStatuses] = useState<Record<string, Availability>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = stands.find((s) => s.id === selectedId) || null;

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
          .filter((s) => section === "all" || s.section === section)
          .filter((s) => meters === "all" || String(s.meters) === meters)
          .map((s) => s.id)
      ),
    [section, meters]
  );

  const availability = (stand: Stand): Availability => statuses[stand.id] || "free";

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
        <span className="active"><b>1</b> Platz wählen</span>
        <span><b>2</b> Daten eingeben</span>
        <span><b>3</b> PayPal</span>
        <span><b>4</b> Fertig</span>
      </section>

      <div className="workspace">
        <section className="mapCard">
          <div className="toolbar">
            <div className="filterGroup">
              <button className={section === "all" ? "chip active" : "chip"} onClick={() => setSection("all")}>Alle</button>
              {(["A", "B", "C"] as const).map((value) => (
                <button key={value} className={section === value ? "chip active" : "chip"} onClick={() => setSection(value)}>
                  Bereich {value}
                </button>
              ))}
            </div>
            <div className="filterGroup">
              <button className={meters === "all" ? "chip active" : "chip"} onClick={() => setMeters("all")}>Alle Größen</button>
              <button className={meters === "2" ? "chip active" : "chip"} onClick={() => setMeters("2")}>2 m</button>
              <button className={meters === "3" ? "chip active" : "chip"} onClick={() => setMeters("3")}>3 m</button>
            </div>
          </div>

          <div className="legend">
            <span><i className="dot green" /> 3 m · 22,50 €</span>
            <span><i className="dot yellow" /> 2 m · 15,00 €</span>
            <span><i className="dot gray" /> nicht verfügbar</span>
          </div>

          <div className="mapScroll">
            <div className="mapStage">
              <PdfStandplan />
              <svg viewBox={`0 0 ${PAGE_SIZE.width} ${PAGE_SIZE.height}`} className="standOverlay" role="group" aria-label="Buchbare Standplätze">
                {stands.map((stand) => {
                  const state = availability(stand);
                  const isVisible = visible.has(stand.id);
                  const isSelected = stand.id === selectedId;
                  const points = stand.points.map((p) => p.join(",")).join(" ");
                  return (
                    <polygon
                      key={stand.id}
                      points={points}
                      tabIndex={state === "free" ? 0 : -1}
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
          <p className="mapHint">Der Plan wird direkt aus der Vektor-PDF gerendert und bleibt dadurch auch auf Retina-Displays scharf. Die Verfügbarkeit aktualisiert sich automatisch.</p>
        </section>

        <aside className="bookingCard">
          {!selected ? (
            <div className="emptyState">
              <span className="bigArrow">↖</span>
              <h2>Wähle einen freien Stand aus.</h2>
              <p>Klicke einfach direkt auf die gewünschte Standnummer im Plan.</p>
              {message && <p className="error">{message}</p>}
            </div>
          ) : (
            <>
              <div className="standSummary">
                <div>
                  <p className="eyebrow">Deine Auswahl</p>
                  <h2>Stand {selected.id}</h2>
                  <p>Bereich {selected.section}{selected.section === "A" ? " · überdacht" : ""}</p>
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
