export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string; demo?: string }>;
}) {
  const { booking, demo } = await searchParams;
  const isDemo = demo === "1";

  return (
    <main>
      <section className="resultPage">
        <p className="eyebrow">{isDemo ? "Demo-Buchung bestätigt" : "Buchung bestätigt"}</p>
        <h1>Geschafft!</h1>
        <p>
          {isDemo
            ? "Die Demo-Zahlung wurde bestätigt und deine Standplatz-Auswahl ist jetzt testweise als gebucht markiert."
            : "Deine PayPal-Zahlung ist eingegangen und deine Standplatz-Auswahl ist fest für dich gebucht."}
        </p>
        {booking && <p><small>Buchungsnummer: {booking}</small></p>}
        {isDemo && <p><strong>Hinweis:</strong> Es wurde kein echtes Geld abgebucht.</p>}
        <p>Du erhältst zusätzlich eine Buchungsbestätigung per E-Mail, sobald der Mailversand aktiviert ist.</p>
        <a href="https://www.ebertplatz-flohmarkt.de/">Zurück zur Flohmarkt-Website</a>
      </section>
    </main>
  );
}
