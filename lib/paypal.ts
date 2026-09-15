const PAYPAL_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function accessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PayPal is not configured");

  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const json = await res.json();
  return json.access_token as string;
}

export async function createPayPalOrder(args: {
  bookingId: string;
  totalCents: number;
  standIds: string[];
  returnUrl: string;
  cancelUrl: string;
}) {
  const token = await accessToken();
  const standLabel = args.standIds.join(" + ");

  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": args.bookingId,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: args.bookingId,
          custom_id: args.bookingId,
          description: `Flohmarkt am Ebertplatz – Stand ${standLabel}`,
          amount: {
            currency_code: "EUR",
            value: (args.totalCents / 100).toFixed(2),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Flohmarkt am Ebertplatz",
            locale: "de-DE",
            user_action: "PAY_NOW",
            return_url: args.returnUrl,
            cancel_url: args.cancelUrl,
          },
        },
      },
    }),
    cache: "no-store",
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || "Could not create PayPal order");
  return json as { id: string; links?: { href: string; rel: string }[] };
}

export async function capturePayPalOrder(orderId: string) {
  const token = await accessToken();
  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || "Could not capture PayPal order");
  return json;
}
