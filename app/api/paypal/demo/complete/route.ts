import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const form = await request.formData();
  const bookingId = String(form.get("bookingId") || "");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  if (!bookingId) {
    return NextResponse.redirect(`${appUrl}/?payment=invalid`);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.redirect(`${appUrl}/?payment=config`);
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id,status")
    .eq("id", bookingId)
    .single();

  if (!booking) {
    return NextResponse.redirect(`${appUrl}/?payment=invalid`);
  }
  if (booking.status === "paid") {
    return NextResponse.redirect(`${appUrl}/success?booking=${bookingId}&demo=1`);
  }

  const { error: holdError } = await supabase.rpc("prepare_booking_capture", {
    p_booking_id: bookingId,
  });
  if (holdError) {
    return NextResponse.redirect(`${appUrl}/?payment=failed`);
  }

  const demoCaptureId = `DEMO-CAPTURE-${crypto.randomUUID()}`;
  const { error: paidError } = await supabase.rpc("confirm_paid_booking", {
    p_booking_id: bookingId,
    p_paypal_capture_id: demoCaptureId,
  });
  if (paidError) {
    return NextResponse.redirect(`${appUrl}/?payment=failed`);
  }

  return NextResponse.redirect(`${appUrl}/success?booking=${bookingId}&demo=1`);
}
