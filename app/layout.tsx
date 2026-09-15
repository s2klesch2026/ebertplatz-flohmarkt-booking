import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stand buchen – Flohmarkt am Ebertplatz",
  description: "Wähle deinen Standplatz auf dem Ebertplatz und bezahle direkt online.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
