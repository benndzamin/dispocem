const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const CEMENTARA_EMAIL = Deno.env.get("CEMENTARA_EMAIL");
const FROM_ADDRESS = "Dispocem <onboarding@resend.dev>";

function buildDetailsHtml(payload: Record<string, unknown>) {
  const rows = [
    ["Firma", payload.firma],
    ["Vrsta cementa", payload.vrstaCementa],
    ["Datum planiranja otpreme", payload.datumPlaniranja],
    ["Vozač", [payload.imeVozaca, payload.prezimeVozaca].filter(Boolean).join(" ") || "-"],
    ["Registarske oznake", payload.registarskeOznake || "-"],
  ];

  return `<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td style="color:#6b7280;font-weight:600">${label}</td><td>${value}</td></tr>`,
      )
      .join("")}
  </table>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend error ${response.status}: ${errorBody}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const payload = await req.json();

  if (!payload?.firma || !payload?.vrstaCementa || !payload?.datumPlaniranja) {
    return new Response(
      JSON.stringify({ error: "Nedostaju obavezna polja najave." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const detailsHtml = buildDetailsHtml(payload);

  const result = {
    buyerSent: false,
    cementaraSent: false,
    buyerError: null as string | null,
    cementaraError: null as string | null,
  };

  if (payload.buyerEmail) {
    try {
      await sendEmail(
        payload.buyerEmail,
        "Potvrda najave otpreme",
        `<p>Vaša najava otpreme je uspješno primljena.</p>${detailsHtml}`,
      );
      result.buyerSent = true;
    } catch (err) {
      result.buyerError = err instanceof Error ? err.message : String(err);
    }
  }

  if (CEMENTARA_EMAIL) {
    try {
      await sendEmail(
        CEMENTARA_EMAIL,
        `Nova najava otpreme - ${payload.firma}`,
        `<p>Kreirana je nova najava otpreme.</p>${detailsHtml}`,
      );
      result.cementaraSent = true;
    } catch (err) {
      result.cementaraError = err instanceof Error ? err.message : String(err);
    }
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
