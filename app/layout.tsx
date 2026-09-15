import type { Metadata } from "next";
import MobileStandConfirm from "@/components/MobileStandConfirm";
import "./globals.css";
import "./fresh.css";
import "./header-refresh.css";
import "./mobile-map.css";
import "./mobile-sheet.css";

export const metadata: Metadata = {
  title: "Stand buchen – Flohmarkt am Ebertplatz",
  description: "Wähle deinen Standplatz auf dem Ebertplatz und bezahle direkt online.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>
        {children}
        <MobileStandConfirm />
      </body>
    </html>
  );
}
