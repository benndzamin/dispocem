import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const CEMENTARA_EMAIL = Deno.env.get("CEMENTARA_EMAIL");

// Isti javni kljuc kao VITE_VAPID_PUBLIC_KEY u .env.local - nije tajna, sigurno za commit.
const VAPID_PUBLIC_KEY =
  "BO3_hMcN3dKC1WVCoF11Aa9VautnQyi9XCoLuuvzaVWWNVDnBd1EGWIG8hYXPAaCth8uRlBDHUR3f2DhiUoyXIc";

webpush.setVapidDetails(
  `mailto:${CEMENTARA_EMAIL || "admin@dispocem.local"}`,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const payload = await req.json();

  if (!payload?.firma || !payload?.vrstaCementa) {
    return new Response(
      JSON.stringify({ error: "Nedostaju obavezna polja najave." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Kad operater obrise najavu, ne obavjestavamo druge operatere (peer buku) -
  // ide samo supervizoru. Kreiranje i brisanje od strane admina/supervizora i
  // dalje ide objema ulogama, kao i do sad. Odobrenje najave (iz "čeka
  // odobrenje" u "na čekanju") tiče se samo operatera - oni je tek sad vide.
  const targetRoles =
    payload.action === "approved"
      ? ["wb_operator"]
      : payload.action === "deleted" && payload.deletedByRole === "wb_operator"
        ? ["wb_supervisor"]
        : ["wb_supervisor", "wb_operator"];

  const { data: recipients, error: recipientsError } = await supabase
    .from("users")
    .select("id, push_subscriptions(id, endpoint, p256dh, auth)")
    .in("rola", targetRoles);

  if (recipientsError) {
    return new Response(JSON.stringify({ error: recipientsError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Ko god je napravio promjenu ne treba dobiti notifikaciju o svojoj
  // vlastitoj akciji.
  const subscriptions = (recipients || [])
    .filter((u) => u.id !== payload.actorUserId)
    .flatMap((u) => u.push_subscriptions || []);

  const isDeleted = payload.action === "deleted";
  const isApproved = payload.action === "approved";
  const notificationPayload = JSON.stringify({
    title: isDeleted
      ? "Najava obrisana"
      : isApproved
        ? "Najava odobrena"
        : "Nova najava otpreme",
    body: isDeleted
      ? `${payload.deletedByLabel || payload.firma} je obrisao/la najavu za utovar (${payload.vrstaCementa}).`
      : isApproved
        ? `${payload.firma} — ${payload.vrstaCementa} je odobrena, spremna za utovar.`
        : `${payload.firma} — ${payload.vrstaCementa}`,
    url: "/",
  });

  let sent = 0;
  const staleIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notificationPayload,
        );
        sent++;
      } catch (err) {
        const statusCode = err?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id);
        } else {
          console.error("Push slanje nije uspjelo:", err);
        }
      }
    }),
  );

  if (staleIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleIds);
  }

  return new Response(
    JSON.stringify({ sent, total: subscriptions.length, cleaned: staleIds.length }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
