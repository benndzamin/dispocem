import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED_ROLES = ["wb_supervisor", "wb_operator"];

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Niste prijavljeni." }, 401);
  }

  // Klijent koji djeluje u ime pozivaoca - koristi se samo da se utvrdi ko
  // poziva funkciju (na osnovu njegovog JWT-a), ne za privilegovane upise.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  // getUser() mora dobiti token eksplicitno - klijent nema aktivnu sesiju
  // (kreiran je samo sa proslijeđenim headerom), pa bez argumenta baca
  // "Auth session missing!" umjesto da pročita Authorization header.
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser(token);

  if (callerError || !caller) {
    return jsonResponse({ error: "Nevažeća sesija." }, 401);
  }

  // Service-role klijent - zaobilazi RLS, koristi se za sve privilegovane
  // provjere i upise nakon što je pozivalac identifikovan.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("users")
    .select("rola")
    .eq("id", caller.id)
    .single();

  if (callerProfileError || callerProfile?.rola !== "admin") {
    return jsonResponse(
      { error: "Nemate dozvolu za kreiranje naloga osoblja." },
      403,
    );
  }

  let payload: { email?: string; password?: string; rola?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Neispravan zahtjev." }, 400);
  }

  const { email, password, rola } = payload;

  if (!email || !password) {
    return jsonResponse({ error: "Email i lozinka su obavezni." }, 400);
  }

  if (!ALLOWED_ROLES.includes(rola ?? "")) {
    return jsonResponse(
      { error: "Uloga mora biti supervisor ili operater." },
      400,
    );
  }

  const { data: created, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !created?.user) {
    return jsonResponse(
      { error: createError?.message || "Nije moguće kreirati nalog." },
      400,
    );
  }

  const { error: profileError } = await adminClient.from("users").insert([
    {
      id: created.user.id,
      email,
      rola,
    },
  ]);

  if (profileError) {
    // Profil nije upisan - očisti auth korisnika da ne ostane osiroteli nalog.
    await adminClient.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: profileError.message }, 400);
  }

  return jsonResponse({ id: created.user.id, email, rola }, 200);
});
