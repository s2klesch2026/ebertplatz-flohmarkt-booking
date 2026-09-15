export default function CancelPage() {
  return (
    <main>
      <section className="resultPage">
        <p className="eyebrow">Zahlung abgebrochen</p>
        <h1>Noch nichts gebucht.</h1>
        <p>Die PayPal-Zahlung wurde nicht abgeschlossen. Dein Platz bleibt nur bis zum Ende der Reservierungsfrist blockiert.</p>
        <a href="/">Anderen Stand auswählen oder Zahlung neu starten</a>
      </section>
    </main>
  );
}
