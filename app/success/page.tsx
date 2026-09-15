export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const { booking } = await searchParams;
  return (
    <main>
      <section className="resultPage">
        <p className="eyebrow">Buchung bestätigt</p>
        <h1>Geschafft!</h1>
        <p>Deine PayPal-Zahlung ist eingegangen und dein Standplatz ist fest für dich gebucht.</p>
        {booking && <p><small>Buchungsnummer: {booking}</small></p>}
        <p>Du erhältst zusätzlich eine Buchungsbestätigung per E-Mail, sobald der Mailversand aktiviert ist.</p>
        <a href="https://www.ebertplatz-flohmarkt.de/">Zurück zur Flohmarkt-Website</a>
      </section>
    </main>
  );
}
