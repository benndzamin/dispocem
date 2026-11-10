import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const STAFF_ROLES = [
  "admin",
  "wb_supervisor",
  "silo_viewer",
  "wb_operator",
];

export type Caller = {
  id: string;
  email: string | null;
  rola: string;
  naziv_firme: string | null;
};

// Utvrđuje ko poziva funkciju na osnovu korisničkog JWT-a i čita njegovu
// ulogu iz public.users. Sam anon/publishable ključ NIJE dovoljan - bez
// prijavljenog korisnika vraća 401, a uloga van `allowedRoles` vraća 403.
export async function requireCaller(
  req: Request,
  admin: SupabaseClient,
  allowedRoles: string[],
): Promise<Caller | Response> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return jsonResponse({ error: "Niste prijavljeni." }, 401);
  }

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) {
    return jsonResponse({ error: "Nevažeća sesija." }, 401);
  }

  const { data: profile } = await admin
    .from("users")
    .select("id, email, rola, naziv_firme")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !allowedRoles.includes(profile.rola)) {
    return jsonResponse({ error: "Nemate dozvolu za ovu radnju." }, 403);
  }

  return profile as Caller;
}

export function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
