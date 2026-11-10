import webpush from "npm:web-push@3.6.7";
import {
  corsHeaders,
  createAdminClient,
  jsonResponse,
  requireCaller,
} from "../_shared/caller.ts";

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

  const supabase = createAdminClient();

  // Obavijest svim kupcima šalje samo admin/supervizor/voditelj prodaje.
  const caller = await requireCaller(req, supabase, [
    "admin",
    "wb_supervisor",
    "silo_viewer",
  ]);
  if (caller instanceof Response) return caller;

  let payload;
  try {
    payload = (await req.json()) ?? {};
  } catch {
    return jsonResponse({ error: "Neispravan zahtjev." }, 400);
  }
  payload.actorUserId = caller.id;

  if (!payload?.message) {
    return new Response(
      JSON.stringify({ error: "Nedostaje tekst obavijesti." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Svi kupci, bez obzira na rolu ostalih (za razliku od send-push-notification
  // koji cilja osoblje po akciji).
  const { data: recipients, error: recipientsError } = await supabase
    .from("users")
    .select("id, push_subscriptions(id, endpoint, p256dh, auth)")
    .eq("rola", "buyer");

  if (recipientsError) {
    return new Response(JSON.stringify({ error: recipientsError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Ko god je poslao obavijest ne treba dobiti notifikaciju o svojoj
  // vlastitoj akciji (isti obrazac kao send-push-notification).
  const subscriptions = (recipients || [])
    .filter((u) => u.id !== payload.actorUserId)
    .flatMap((u) => u.push_subscriptions || []);

  const notificationPayload = JSON.stringify({
    title: "Obavijest",
    body: payload.message,
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
