import {
  createAdminClient,
  corsHeaders,
  jsonResponse,
  requireCaller,
} from "../_shared/caller.ts";

// Kreiranje kupca na serveru (service role). Ranije je BuyerManagement zvao
// auth.signUp u browseru, što je privremeno prebacivalo sesiju admina /
// supervizora na novog kupca - a ako bi nešto puklo usred toga, osoblje bi
// ostalo prijavljeno kao kupac. Ovdje sesija pozivaoca ostaje netaknuta.
//
// Odgovorno lice: insert trigger (enforce_odgovorno_lice) kupcu uvijek dodijeli
// voditelja prodaje; drugačiji izbor upisuje klijent naknadnim update-om pod
// svojom sesijom (trigger tada provjerava da je pozivalac admin/voditelj).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = createAdminClient();

  const caller = await requireCaller(req, admin, [
    "admin",
    "wb_supervisor",
    "silo_viewer",
  ]);
  if (caller instanceof Response) return caller;

  let payload: {
    email?: string;
    password?: string;
    naziv_firme?: string;
    adresa?: string;
    dozvoljeni_artikli?: unknown;
    announcement_required?: boolean;
    approval_required?: boolean;
  };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Neispravan zahtjev." }, 400);
  }

  const email = payload.email?.trim();
  const password = payload.password ?? "";
  const nazivFirme = payload.naziv_firme?.trim();

  if (!email || !password) {
    return jsonResponse(
      { error: "Email i lozinka su obavezni za kreiranje novog kupca." },
      400,
    );
  }
  if (!nazivFirme) {
    return jsonResponse({ error: "Naziv firme je obavezan." }, 400);
  }

  const dozvoljeniArtikli = Array.isArray(payload.dozvoljeni_artikli)
    ? payload.dozvoljeni_artikli.filter((a) => typeof a === "string")
    : [];

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !created?.user) {
    return jsonResponse(
      { error: createError?.message || "Nije moguće kreirati kupca." },
      400,
    );
  }

  const { error: profileError } = await admin.from("users").insert([
    {
      id: created.user.id,
      email,
      rola: "buyer",
      naziv_firme: nazivFirme,
      adresa: payload.adresa ?? "",
      dozvoljeni_artikli: dozvoljeniArtikli,
      announcement_required: payload.announcement_required ?? true,
      approval_required: payload.approval_required ?? false,
    },
  ]);

  if (profileError) {
    // Profil nije upisan - očisti auth korisnika da ne ostane osiroteli nalog.
    await admin.auth.admin.deleteUser(created.user.id);
    console.error("Upis profila kupca nije uspio:", profileError);
    return jsonResponse({ error: "Nije moguće sačuvati profil kupca." }, 400);
  }

  return jsonResponse({ id: created.user.id, email }, 200);
});
