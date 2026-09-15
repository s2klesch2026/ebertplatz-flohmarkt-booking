import { NextResponse } from "next/server";

const PDF_URL = "https://ebertplatz-flohmarkt.de/wp-content/uploads/2026/09/Ebiflomi12_Standplan.pdf";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET() {
  const response = await fetch(PDF_URL, {
    next: { revalidate: 86400 },
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Standplan konnte nicht geladen werden." }, { status: 502 });
  }

  const data = await response.arrayBuffer();
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
