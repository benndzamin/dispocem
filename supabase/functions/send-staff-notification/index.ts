import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const CEMENTARA_EMAIL = Deno.env.get("CEMENTARA_EMAIL");

// Isti javni kljuc kao VITE_VAPID_PUBLIC_KEY u .env.local - nije tajna, sigurno za commit.
const VAPID_PUBLIC_KEY =
  "BO3_hMcN3dKC1WVCoF11Aa9VautnQyi9XCoLuuvzaVWWNVDnBd1EGWIG8hYXPAaCth8uRlBDHUR3f2DhiUoyXIc";

// Osoblje koje ima push (rukovodilac mlina ga nema).
const STAFF_ROLES = ["wb_supervisor", "silo_viewer", "wb_operator"];

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Admin šalje obavijest svom osoblju (npr. rad na sistemu, sistem ažuriran).
// Za razliku od ostalih push funkcija, ovdje se provjerava da je pozivalac
// stvarno admin - inače bi bilo ko s anon ključem mogao slati osoblju.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Niste prijavljeni." }, 401);
  }

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser(token);

  if (callerError || !caller) {
    return jsonResponse({ error: "Nevažeća sesija." }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerProfile } = await supabase
    .from("users")
    .select("rola")
    .eq("id", caller.id)
    .single();

  if (callerProfile?.rola !== "admin") {
    return jsonResponse(
      { error: "Samo admin može slati obavijesti osoblju." },
      403,
    );
  }

  let payload: { title?: string; message?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Neispravan zahtjev." }, 400);
  }

  const title = payload.title?.trim() || "Obavijest sistema";
  const message = payload.message?.trim();
  if (!message) {
    return jsonResponse({ error: "Nedostaje tekst obavijesti." }, 400);
  }

  // Ključ se postavlja tek ovdje (ne pri učitavanju modula) da bi funkcija
  // vratila jasnu grešku umjesto da padne kad ključ nije podešen.
  if (!VAPID_PRIVATE_KEY) {
    return jsonResponse({ error: "VAPID ključ nije podešen na serveru." }, 500);
  }
  webpush.setVapidDetails(
    `mailto:${CEMENTARA_EMAIL || "admin@dispocem.local"}`,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );

  const { data: recipients, error: recipientsError } = await supabase
    .from("users")
    .select("id, push_subscriptions(id, endpoint, p256dh, auth)")
    .in("rola", STAFF_ROLES);

  if (recipientsError) {
    return jsonResponse({ error: recipientsError.message }, 500);
  }

  const subscriptions = (recipients || []).flatMap(
    (u) => u.push_subscriptions || [],
  );
  const recipientsWithPush = (recipients || []).filter(
    (u) => (u.push_subscriptions || []).length > 0,
  ).length;

  const notificationPayload = JSON.stringify({ title, body: message, url: "/" });

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

  return jsonResponse(
    {
      sent,
      total: subscriptions.length,
      recipients: recipients?.length ?? 0,
      recipientsWithPush,
      cleaned: staleIds.length,
    },
    200,
  );
});
