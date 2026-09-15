import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { capturePayPalOrder } from "@/lib/paypal";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bookingId = url.searchParams.get("booking");
  const orderId = url.searchParams.get("token");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  if (!bookingId || !orderId) return NextResponse.redirect(`${appUrl}/?payment=invalid`);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.redirect(`${appUrl}/?payment=config`);

  try {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, paypal_order_id, total_cents, status")
      .eq("id", bookingId)
      .single();

    if (!booking || booking.paypal_order_id !== orderId) throw new Error("Order mismatch");
    if (booking.status === "paid") return NextResponse.redirect(`${appUrl}/success?booking=${bookingId}`);

    // Atomically make sure this booking still owns the stand before money is captured.
    const { error: holdError } = await supabase.rpc("prepare_booking_capture", {
      p_booking_id: bookingId,
    });
    if (holdError) throw holdError;

    const capture = await capturePayPalOrder(orderId);
    const captureData = capture?.purchase_units?.[0]?.payments?.captures?.[0];
    const paidValue = Math.round(Number(captureData?.amount?.value || "0") * 100);
    if (capture.status !== "COMPLETED" || paidValue !== booking.total_cents) throw new Error("Payment not completed");

    const { error } = await supabase.rpc("confirm_paid_booking", {
      p_booking_id: bookingId,
      p_paypal_capture_id: captureData.id,
    });
    if (error) throw error;

    return NextResponse.redirect(`${appUrl}/success?booking=${bookingId}`);
  } catch {
    return NextResponse.redirect(`${appUrl}/?payment=failed`);
  }
}
