import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ statuses: {}, configured: false });
  }

  const eventSlug = process.env.FLOHMARKT_EVENT_SLUG || "2026-09-19";
  const now = new Date().toISOString();

  await supabase
    .from("bookings")
    .update({ status: "expired", updated_at: now })
    .eq("event_slug", eventSlug)
    .eq("status", "held")
    .lte("held_until", now);

  const { data, error } = await supabase
    .from("bookings")
    .select("stand_id,stand_ids,status")
    .eq("event_slug", eventSlug)
    .in("status", ["held", "paid"]);

  if (error) {
    return NextResponse.json({ error: "Verfügbarkeit konnte nicht geladen werden." }, { status: 500 });
  }

  const statuses: Record<string, "held" | "booked"> = {};
  for (const row of data || []) {
    const ids = Array.isArray(row.stand_ids) && row.stand_ids.length ? row.stand_ids : [row.stand_id];
    for (const id of ids) {
      statuses[id] = row.status === "paid" ? "booked" : "held";
    }
  }

  return NextResponse.json(
    { statuses, configured: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
