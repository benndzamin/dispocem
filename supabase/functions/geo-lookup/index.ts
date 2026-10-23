import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_IPS = 50;

type Geo = { city: string | null; country: string | null; country_code: string | null };

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Privatne/lokalne adrese se ne šalju vanjskom servisu.
function isPrivateIp(ip: string) {
  if (ip === "::1" || ip.startsWith("fe80:") || /^f[cd]/i.test(ip)) return true;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

async function fetchGeo(ip: string): Promise<(Geo & { region: string | null }) | null> {
  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { "User-Agent": "dispocem-geo-lookup" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.error) return null;
    return {
      city: data.city ?? null,
      region: data.region ?? null,
      country: data.country_name ?? null,
      country_code: data.country_code ?? null,
    };
  } catch {
    return null;
  }
}

// Približna lokacija (grad/država) za IP adrese sesija osoblja - samo admin.
// Rezultati se keširaju u ip_geo_cache 7 dana.
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
    return jsonResponse({ error: "Samo admin može vidjeti lokacije." }, 403);
  }

  let payload: { ips?: unknown };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Neispravan zahtjev." }, 400);
  }

  const ips = [
    ...new Set(
      (Array.isArray(payload.ips) ? payload.ips : [])
        .filter((ip): ip is string => typeof ip === "string" && ip.length > 0)
        .slice(0, MAX_IPS),
    ),
  ];

  const result: Record<string, Geo | { local: true } | null> = {};
  const publicIps: string[] = [];

  for (const ip of ips) {
    if (isPrivateIp(ip)) result[ip] = { local: true };
    else publicIps.push(ip);
  }

  if (publicIps.length > 0) {
    const { data: cached } = await supabase
      .from("ip_geo_cache")
      .select("ip, city, country, country_code, fetched_at")
      .in("ip", publicIps);

    const freshCutoff = Date.now() - CACHE_MAX_AGE_MS;
    const missing: string[] = [];

    for (const ip of publicIps) {
      const hit = (cached || []).find((row) => row.ip === ip);
      if (hit && new Date(hit.fetched_at).getTime() > freshCutoff) {
        result[ip] = {
          city: hit.city,
          country: hit.country,
          country_code: hit.country_code,
        };
      } else {
        missing.push(ip);
      }
    }

    // Redom, da se ne udari rate limit servisa.
    for (const ip of missing) {
      const geo = await fetchGeo(ip);
      result[ip] = geo
        ? { city: geo.city, country: geo.country, country_code: geo.country_code }
        : null;
      if (geo) {
        await supabase.from("ip_geo_cache").upsert({
          ip,
          ...geo,
          fetched_at: new Date().toISOString(),
        });
      }
    }
  }

  return jsonResponse({ geo: result }, 200);
});
