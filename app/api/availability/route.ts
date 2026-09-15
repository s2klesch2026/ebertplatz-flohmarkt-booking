import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ statuses: {}, configured: false });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id")
    .eq("active", true)
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });
  if (!event) return NextResponse.json({ statuses: {}, configured: true });

  const { data, error } = await supabase
    .from("event_stands")
    .select("stand_id,status,held_until,booking_id")
    .eq("event_id", event.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const expired = (data || []).filter(
    (row) => row.status === "held" && row.held_until && new Date(row.held_until).getTime() <= now
  );

  if (expired.length) {
    await Promise.all(
      expired.map(async (row) => {
        await supabase
          .from("event_stands")
          .update({ status: "free", held_until: null, booking_id: null })
          .eq("event_id", event.id)
          .eq("stand_id", row.stand_id)
          .eq("status", "held");
        if (row.booking_id) {
          await supabase
            .from("bookings")
            .update({ status: "expired" })
            .eq("id", row.booking_id)
            .eq("status", "held");
        }
      })
    );
  }

  const expiredIds = new Set(expired.map((row) => row.stand_id));
  const statuses = Object.fromEntries(
    (data || []).map((row) => [row.stand_id, expiredIds.has(row.stand_id) ? "free" : row.status])
  );

  return NextResponse.json(
    { statuses, configured: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
