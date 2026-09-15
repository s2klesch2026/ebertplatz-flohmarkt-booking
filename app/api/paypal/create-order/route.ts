import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createPayPalOrder } from "@/lib/paypal";

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase ist noch nicht vollständig verbunden." }, { status: 503 });
  }

  const { bookingId } = await request.json();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, stand_id, stand_ids, total_cents, status, held_until")
    .eq("id", bookingId)
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: "Buchung nicht gefunden." }, { status: 404 });
  }
  if (booking.status !== "held" || new Date(booking.held_until).getTime() < Date.now()) {
    return NextResponse.json({ error: "Die Reservierung ist abgelaufen. Bitte wähle die Stände erneut." }, { status: 409 });
  }

  const standIds =
    Array.isArray(booking.stand_ids) && booking.stand_ids.length
      ? booking.stand_ids
      : [booking.stand_id];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const order = await createPayPalOrder({
    bookingId: booking.id,
    totalCents: booking.total_cents,
    standIds,
    returnUrl: `${appUrl}/api/paypal/return?booking=${booking.id}`,
    cancelUrl: `${appUrl}/checkout/cancel?booking=${booking.id}`,
  });

  const approveUrl = order.links?.find(
    (link) => link.rel === "payer-action" || link.rel === "approve"
  )?.href;
  if (!approveUrl) {
    return NextResponse.json({ error: "PayPal hat keinen Zahlungslink geliefert." }, { status: 502 });
  }

  const { error: saveError } = await supabase.rpc("set_paypal_order", {
    p_booking_id: booking.id,
    p_paypal_order_id: order.id,
  });
  if (saveError) {
    return NextResponse.json(
      { error: "Die PayPal-Zahlung konnte nicht mit der Buchung verknüpft werden." },
      { status: 409 }
    );
  }

  return NextResponse.json({ approveUrl });
}
