import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { euro } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function DemoPayPalPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const { booking: bookingId } = await searchParams;
  const supabase = getSupabaseAdmin();

  if (!bookingId || !supabase) {
    return (
      <main className="demoPayPalPage">
        <section className="demoPayPalCard">
          <div className="demoPayPalBody">
            <h1>Demo-Zahlung nicht verfügbar</h1>
            <p>Bitte gehe zurück zur Standplatz-Auswahl und starte die Buchung erneut.</p>
            <a className="demoPayPalCancel" href="/">Zurück zur Buchung</a>
          </div>
        </section>
      </main>
    );
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, stand_id, stand_ids, total_cents, status, held_until")
    .eq("id", bookingId)
    .single();

  if (!booking) {
    return (
      <main className="demoPayPalPage">
        <section className="demoPayPalCard">
          <div className="demoPayPalBody">
            <h1>Buchung nicht gefunden</h1>
            <a className="demoPayPalCancel" href="/">Zurück zur Buchung</a>
          </div>
        </section>
      </main>
    );
  }

  const standIds = Array.isArray(booking.stand_ids) && booking.stand_ids.length
    ? booking.stand_ids
    : [booking.stand_id];
  const expired = booking.status !== "held" || new Date(booking.held_until).getTime() < Date.now();

  return (
    <main className="demoPayPalPage">
      <section className="demoPayPalCard">
        <div className="demoPayPalHead">
          <span className="demoPayPalBadge">Demo Checkout</span>
          <p className="demoPayPalBrand">PayPal</p>
        </div>

        <div className="demoPayPalBody">
          <h1>Standplatz bezahlen</h1>
          <p>
            So sieht der Bezahl-Schritt später aus. In dieser Demo wird kein echtes Geld abgebucht.
          </p>

          <div className="demoPayPalOrder">
            <div><span>{standIds.length === 1 ? "Standplatz" : "Standplätze"}</span><strong>{standIds.join(" + ")}</strong></div>
            <div className="demoTotal"><span>Gesamt</span><strong>{euro(booking.total_cents)}</strong></div>
          </div>

          {expired ? (
            <>
              <p>Die 10-Minuten-Reservierung ist bereits abgelaufen.</p>
              <a className="demoPayPalCancel" href="/">Stand erneut auswählen</a>
            </>
          ) : (
            <>
              <form action="/api/paypal/demo/complete" method="post">
                <input type="hidden" name="bookingId" value={booking.id} />
                <button className="demoPayPalButton" type="submit">Demo-Zahlung bestätigen</button>
              </form>
              <a className="demoPayPalCancel" href={`/checkout/cancel?booking=${booking.id}`}>Abbrechen</a>
              <p className="demoPayPalNote">Nur zum Testen · keine echte PayPal-Transaktion</p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
