import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function RegistracijaKupca() {
  const [cementTypes, setCementTypes] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nazivFirme, setNazivFirme] = useState("");
  const [adresa, setAdresa] = useState("");
  const [odabranaRoba, setOdabranaRoba] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchCementTypes = async () => {
    const { data, error } = await supabase
      .from("cement_types")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (!error) setCementTypes(data || []);
  };

  useEffect(() => {
    fetchCementTypes();
  }, []);

  const handleCheckboxChange = (vrsta) => {
    if (odabranaRoba.includes(vrsta)) {
      setOdabranaRoba(odabranaRoba.filter((item) => item !== vrsta));
    } else {
      setOdabranaRoba([...odabranaRoba, vrsta]);
    }
  };

  const handleRegistracija = async (e) => {
    e.preventDefault();
    if (odabranaRoba.length === 0) {
      alert(
        "Morate izabrati barem jednu vrstu cementa koju kupac smije kupovati!",
      );
      return;
    }

    setLoading(true);

    try {
      // 1. Kreiranje korisnika u Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: null,
        },
      });

      if (authError) throw authError;

      const noviKorisnikId = authData?.user?.id;
      if (!noviKorisnikId) {
        throw new Error("Greška pri generisanju korisničkog računa.");
      }

      // 2. Upis u novu javnu tabelu "users"
      const { error: profileError } = await supabase.from("users").upsert(
        [
          {
            id: noviKorisnikId,
            email: email,
            rola: "buyer",
            naziv_firme: nazivFirme,
            adresa: adresa,
            dozvoljeni_artikli: odabranaRoba,
            announcement_required: true,
          },
        ],
        { onConflict: "id" },
      );

      if (profileError) throw profileError;

      alert("Kupac uspješno registrovan!");

      // Reset forme
      setEmail("");
      setPassword("");
      setNazivFirme("");
      setAdresa("");
      setOdabranaRoba([]);
    } catch (err) {
      console.error("Greška:", err.message);
      alert("Greška pri registraciji: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-2xl mx-auto mt-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">
        👥 Registracija Novog Kupca
      </h3>

      <form onSubmit={handleRegistracija} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase text-gray-500 font-semibold mb-1">
              Email kupca
            </label>
            <input
              type="email"
              required
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-500 font-semibold mb-1">
              Lozinka
            </label>
            <input
              type="password"
              required
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase text-gray-500 font-semibold mb-1">
              Naziv kompanije / kupca
            </label>
            <input
              type="text"
              required
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
              value={nazivFirme}
              onChange={(e) => setNazivFirme(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-500 font-semibold mb-1">
              Adresa sjedišta
            </label>
            <input
              type="text"
              required
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
              value={adresa}
              onChange={(e) => setAdresa(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase text-gray-500 font-semibold mb-2">
            Dozvoljene vrste cementa za otpremu
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
            {cementTypes.map((cement) => (
              <label
                key={cement.id}
                className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-brand-red focus:ring-brand-red bg-white"
                  checked={odabranaRoba.includes(cement.name)}
                  onChange={() => handleCheckboxChange(cement.name)}
                />
                <span>{cement.name}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-red hover:bg-brand-red-dark disabled:bg-brand-red-dark text-white font-semibold py-2 rounded-lg transition-colors duration-200"
        >
          {loading ? "Registracija u toku..." : "Registruj Kupca"}
        </button>
      </form>
    </div>
  );
}
