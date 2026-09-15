"use client";

import { useEffect, useRef, useState } from "react";

type PendingStand = {
  element: SVGElement;
  id: string;
  meters: string;
  price: string;
  selected: boolean;
};

function detailsFromElement(element: SVGElement): PendingStand {
  const label = element.getAttribute("aria-label") || "";
  const parts = label.split(",").map((part) => part.trim());

  return {
    element,
    id: parts[0] || "Stand",
    meters: parts[1]?.replace("Meter", "m") || "",
    price: parts[2] || "",
    selected: element.classList.contains("selected"),
  };
}

export default function MobileStandConfirm() {
  const [pending, setPending] = useState<PendingStand | null>(null);
  const allowNextClickRef = useRef<SVGElement | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!window.matchMedia("(max-width: 700px)").matches) return;

      const target = event.target instanceof Element ? event.target.closest(".standHit") : null;
      if (!(target instanceof SVGElement)) return;
      if (!target.classList.contains("state-free") || target.classList.contains("filtered")) return;

      if (allowNextClickRef.current === target) {
        allowNextClickRef.current = null;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setPending(detailsFromElement(target));
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  useEffect(() => {
    if (!pending) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPending(null);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pending]);

  if (!pending) return null;

  const confirm = () => {
    const element = pending.element;
    setPending(null);
    allowNextClickRef.current = element;
    window.requestAnimationFrame(() => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    });
  };

  return (
    <div className="standSheetLayer" role="presentation">
      <button className="standSheetBackdrop" type="button" aria-label="Schließen" onClick={() => setPending(null)} />
      <section className="standSheet" role="dialog" aria-modal="true" aria-label={`${pending.id} auswählen`}>
        <div className="standSheetHandle" aria-hidden="true" />
        <button className="standSheetClose" type="button" onClick={() => setPending(null)} aria-label="Schließen">×</button>

        <p className="standSheetKicker">{pending.selected ? "Deine Auswahl" : "Freier Stand"}</p>
        <div className="standSheetHeadline">
          <div>
            <h2>{pending.id}</h2>
            <p>{[pending.meters, pending.price].filter(Boolean).join(" · ")}</p>
          </div>
          <span className={`standSheetStatus ${pending.selected ? "selected" : ""}`}>
            {pending.selected ? "ausgewählt" : "frei"}
          </span>
        </div>

        <p className="standSheetNote">
          {pending.selected
            ? "Diesen Stand wieder aus deiner Auswahl nehmen?"
            : "Passt der Platz? Dann übernimm ihn in deine Buchung."}
        </p>

        <div className="standSheetActions">
          <button className="standSheetSecondary" type="button" onClick={() => setPending(null)}>Weiter schauen</button>
          <button className={`standSheetPrimary ${pending.selected ? "remove" : ""}`} type="button" onClick={confirm}>
            {pending.selected ? "Stand entfernen" : "Stand auswählen"}
          </button>
        </div>
      </section>
    </div>
  );
}
