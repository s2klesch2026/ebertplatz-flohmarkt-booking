import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { stands } from "@/lib/stands";

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Die Buchungsdatenbank ist noch nicht vollständig mit Vercel verbunden." },
      { status: 503 }
    );
  }

  const body = await request.json();
  const requestedIds = Array.isArray(body.standIds)
    ? body.standIds.map((value: unknown) => String(value))
    : body.standId
      ? [String(body.standId)]
      : [];
  const standIds = [...new Set(requestedIds)];

  if (standIds.length < 1 || standIds.length > 2 || standIds.length !== requestedIds.length) {
    return NextResponse.json({ error: "Bitte wähle einen oder zwei unterschiedliche Standplätze." }, { status: 400 });
  }

  const selectedStands = standIds
    .map((id) => stands.find((stand) => stand.id === id))
    .filter(Boolean);

  if (selectedStands.length !== standIds.length) {
    return NextResponse.json({ error: "Mindestens ein Standplatz ist unbekannt." }, { status: 400 });
  }

  const sections = new Set(selectedStands.map((stand) => stand!.section));
  if (sections.size !== 1) {
    return NextResponse.json({ error: "Zwei Standplätze müssen im selben Platzbereich liegen." }, { status: 400 });
  }

  for (const field of ["firstName", "lastName", "email", "street", "postalCode", "city"]) {
    if (!String(body[field] || "").trim()) {
      return NextResponse.json({ error: "Bitte fülle alle Pflichtfelder aus." }, { status: 400 });
    }
  }

  const subtotalCents = selectedStands.reduce((sum, stand) => sum + stand!.priceCents, 0);
  const depositCents = selectedStands.reduce((sum, stand) => sum + stand!.depositCents, 0);

  const { data, error } = await supabase.rpc("create_booking_hold_multi", {
    p_stand_ids: standIds,
    p_first_name: String(body.firstName).trim(),
    p_last_name: String(body.lastName).trim(),
    p_email: String(body.email).trim().toLowerCase(),
    p_phone: String(body.phone || "").trim() || null,
    p_street: String(body.street).trim(),
    p_postal_code: String(body.postalCode).trim(),
    p_city: String(body.city).trim(),
    p_subtotal_cents: subtotalCents,
    p_deposit_cents: depositCents,
    p_event_slug: process.env.FLOHMARKT_EVENT_SLUG || "2026-09-19",
  });

  if (error) {
    const isUnavailable =
      error.message.includes("STAND_NOT_AVAILABLE") ||
      error.message.includes("STAND_TAKEN_AFTER_HOLD");

    return NextResponse.json(
      {
        error: isUnavailable
          ? "Mindestens einer der ausgewählten Stände wurde gerade reserviert. Bitte prüfe deine Auswahl noch einmal."
          : "Die Reservierung konnte nicht angelegt werden.",
      },
      { status: isUnavailable ? 409 : 500 }
    );
  }

  return NextResponse.json({ bookingId: data });
}
