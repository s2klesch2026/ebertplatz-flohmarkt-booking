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
  const stand = stands.find((s) => s.id === body.standId);
  if (!stand) return NextResponse.json({ error: "Unbekannter Standplatz." }, { status: 400 });

  for (const field of ["firstName", "lastName", "email", "street", "postalCode", "city"]) {
    if (!String(body[field] || "").trim()) {
      return NextResponse.json({ error: "Bitte fülle alle Pflichtfelder aus." }, { status: 400 });
    }
  }

  const { data, error } = await supabase.rpc("create_booking_hold", {
    p_stand_id: stand.id,
    p_first_name: String(body.firstName).trim(),
    p_last_name: String(body.lastName).trim(),
    p_email: String(body.email).trim().toLowerCase(),
    p_phone: String(body.phone || "").trim() || null,
    p_street: String(body.street).trim(),
    p_postal_code: String(body.postalCode).trim(),
    p_city: String(body.city).trim(),
    p_subtotal_cents: stand.priceCents,
    p_deposit_cents: stand.depositCents,
    p_event_slug: process.env.FLOHMARKT_EVENT_SLUG || "2026-09-19",
  });

  if (error) {
    const isUnavailable = error.message.includes("STAND_NOT_AVAILABLE");
    return NextResponse.json(
      { error: isUnavailable ? "Dieser Stand wurde gerade von jemand anderem reserviert. Bitte wähle einen anderen Platz." : "Die Reservierung konnte nicht angelegt werden." },
      { status: isUnavailable ? 409 : 500 }
    );
  }

  return NextResponse.json({ bookingId: data });
}
