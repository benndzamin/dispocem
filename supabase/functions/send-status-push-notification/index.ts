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

const STATUS_LABELS: Record<string, string> = {
  awaiting_approval: "Čeka odobrenje",
  pending: "Na čekanju",
  in_progress: "U toku",
  completed: "Završeno",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const payload = await req.json();
  const isDeleted = payload?.action === "deleted";

  if (!payload?.userId || (!isDeleted && !payload?.newStatus)) {
    return new Response(
      JSON.stringify({ error: "Nedostaju obavezna polja." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: subscriptions, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", payload.userId);

  if (subsError) {
    return new Response(JSON.stringify({ error: subsError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const notificationPayload = isDeleted
    ? JSON.stringify({
        title: "Najava obrisana",
        body: payload.vrstaCementa
          ? `Vaša najava (${payload.vrstaCementa}) je obrisana.`
          : "Vaša najava je obrisana.",
        url: "/",
      })
    : JSON.stringify({
        title: "Status najave promijenjen",
        body: payload.vrstaCementa
          ? `Vaša najava (${payload.vrstaCementa}) je sada: ${STATUS_LABELS[payload.newStatus] || payload.newStatus}`
          : `Status vaše najave je sada: ${STATUS_LABELS[payload.newStatus] || payload.newStatus}`,
        url: "/",
      });

  let sent = 0;
  const staleIds: string[] = [];

  await Promise.all(
    (subscriptions || []).map(async (sub) => {
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
    JSON.stringify({
      sent,
      total: (subscriptions || []).length,
      cleaned: staleIds.length,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
