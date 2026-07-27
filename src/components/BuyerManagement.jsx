import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { CEMENT_CATALOG } from "../constants/cementCatalog";

export default function BuyerManagement({ showNotification = () => {} }) {
  const [buyers, setBuyers] = useState([]);
  const [cementTypes, setCementTypes] = useState(CEMENT_CATALOG);
  const [loading, setLoading] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nazivFirme, setNazivFirme] = useState("");
  const [adresa, setAdresa] = useState("");
  const [dozvoljeniArtikli, setDozvoljeniArtikli] = useState([]);
  const [announcementRequired, setAnnouncementRequired] = useState(true);
  const [message, setMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");

  const resetForm = () => {
    setSelectedBuyer(null);
    setEmail("");
    setPassword("");
    setNazivFirme("");
    setAdresa("");
    setDozvoljeniArtikli([]);
    setMessage("");
    setAnnouncementRequired(true);
    setModalMode("create");
  };

  const openBuyerModal = (buyer = null) => {
    if (buyer) {
      setSelectedBuyer(buyer);
      setEmail(buyer.email || "");
      setPassword("");
      setNazivFirme(buyer.naziv_firme || "");
      setAdresa(buyer.adresa || "");
      setDozvoljeniArtikli(buyer.dozvoljeni_artikli || []);
      setAnnouncementRequired(buyer.announcement_required ?? true);
      setModalMode("edit");
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const closeBuyerModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const fetchBuyers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("rola", "buyer")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (!error) {
      setBuyers(data || []);
    } else {
      showNotification(
        "Greška pri dohvatanju kupaca: " + error.message,
        "error",
      );
    }
  };

  const fetchCementTypes = async () => {
    const { data, error } = await supabase
      .from("cement_types")
      .select("*")
      .order("name", { ascending: true });

    if (!error) {
      const dbTypes = data || [];
      const dbNames = new Set(dbTypes.map((c) => c.name));

      // Spoji katalog i bazu, izbjegni duplikate po imenu
      const catalogTypes = CEMENT_CATALOG.filter((c) => !dbNames.has(c.value));

      const combined = [
        ...catalogTypes,
        ...dbTypes.map((c) => ({ value: c.name, label: c.name, id: c.id })),
      ];

      setCementTypes(combined);
    } else {
      setCementTypes(CEMENT_CATALOG);
    }
  };

  useEffect(() => {
    fetchBuyers();
    fetchCementTypes();
  }, []);

  const updateBuyerProfile = async (buyerId, updates) => {
    setLoading(true);
    const { error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", buyerId);
    setLoading(false);
    if (!error) {
      fetchBuyers();
      showNotification("Kupac je uspješno ažuriran.", "success");
    } else {
      showNotification(
        "Greška pri ažuriranju kupca: " + error.message,
        "error",
      );
    }
    return error;
  };

  const toggleAnnouncementRequired = async (buyerId, currentValue) => {
    setLoading(true);
    const { error } = await supabase
      .from("users")
      .update({ announcement_required: !currentValue })
      .eq("id", buyerId);
    setLoading(false);
    if (!error) {
      fetchBuyers();
      showNotification("Status najave je uspješno ažuriran.", "success");
    } else {
      showNotification(
        "Greška pri ažuriranju statusa najave: " + error.message,
        "error",
      );
    }
  };

  const handleEditClick = (buyer) => openBuyerModal(buyer);

  const handleCheckboxChange = (vrsta) => {
    setDozvoljeniArtikli((prev) =>
      prev.includes(vrsta)
        ? prev.filter((item) => item !== vrsta)
        : [...prev, vrsta],
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (!nazivFirme) throw new Error("Naziv firme je obavezan.");

      if (selectedBuyer) {
        const error = await updateBuyerProfile(selectedBuyer.id, {
          naziv_firme: nazivFirme,
          adresa,
          dozvoljeni_artikli: dozvoljeniArtikli,
          announcement_required: announcementRequired,
        });
        if (error) throw error;
        resetForm();
        return;
      }

      if (!email || !password)
        throw new Error(
          "Email i lozinka su obavezni za kreiranje novog kupca.",
        );

      const prevSession = (await supabase.auth.getSession()).data?.session;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: null },
      });
      if (error) throw error;

      const newUserId = data?.user?.id;
      if (!newUserId) throw new Error("Nije moguće kreirati kupca.");

      const { error: profileError } = await supabase.from("users").upsert(
        [
          {
            id: newUserId,
            email,
            rola: "buyer",
            naziv_firme: nazivFirme,
            adresa,
            dozvoljeni_artikli: dozvoljeniArtikli,
            announcement_required: announcementRequired,
          },
        ],
        { onConflict: "id" },
      );
      if (profileError) throw profileError;

      if (prevSession) await supabase.auth.setSession(prevSession);

      showNotification("Kupac je uspješno kreiran.", "success");
      resetForm();
      fetchBuyers();
    } catch (err) {
      console.error(err);
      showNotification(err.message || "Greška pri spremanju kupca.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white mb-2">
            👥 Upravljanje kupcima
          </h3>
          <p className="text-sm text-slate-400">
            Supervisor može dodavati i uređivati kupce, te mijenjati njihove
            dozvole i zahtjeve za najave.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openBuyerModal()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Dodaj novog kupca
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl shadow-black/40">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-white">
                  {modalMode === "edit" ? "Uredi kupca" : "Dodaj novog kupca"}
                </h4>
                <p className="text-sm text-slate-400">
                  {modalMode === "edit"
                    ? "Ažurirajte podatke postojećeg kupca."
                    : "Kreirajte novi nalog kupca i definišite dozvoljene artikle."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeBuyerModal}
                className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Zatvori
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs uppercase text-slate-400 font-semibold mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    disabled={modalMode === "edit"}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {modalMode === "create" && (
                  <div>
                    <label className="block text-xs uppercase text-slate-400 font-semibold mb-1">
                      Lozinka
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs uppercase text-slate-400 font-semibold mb-1">
                    Naziv firme
                  </label>
                  <input
                    type="text"
                    required
                    value={nazivFirme}
                    onChange={(e) => setNazivFirme(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-slate-400 font-semibold mb-1">
                    Adresa
                  </label>
                  <input
                    type="text"
                    value={adresa}
                    onChange={(e) => setAdresa(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                <label className="text-xs uppercase text-slate-400 font-semibold">
                  Dozvoljeni artikli:
                </label>
                <div className="flex flex-wrap gap-2">
                  {cementTypes.map((cement) => (
                    <label
                      key={cement.value}
                      className="flex items-center gap-1 text-sm text-white"
                    >
                      <input
                        type="checkbox"
                        checked={dozvoljeniArtikli.includes(cement.value)}
                        onChange={() => handleCheckboxChange(cement.value)}
                        className="form-checkbox rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                      />
                      {cement.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={announcementRequired}
                  onChange={(e) => setAnnouncementRequired(e.target.checked)}
                  className="form-checkbox rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                />
                <label className="text-xs uppercase text-slate-400 font-semibold">
                  Zahtijeva najavu
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeBuyerModal}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {loading
                    ? "Spremanje..."
                    : modalMode === "edit"
                      ? "Ažuriraj kupca"
                      : "Dodaj kupca"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Buyer List */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
        <h4 className="text-sm font-semibold text-white mb-4">
          Postojeći kupci
        </h4>
        {loading ? (
          <p className="text-slate-400">Učitavanje kupaca...</p>
        ) : buyers.length === 0 ? (
          <p className="text-slate-400">Nema registrovanih kupaca.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700">
              <thead className="bg-slate-800">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400"
                  >
                    Firma
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400"
                  >
                    Email
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400"
                  >
                    Dozvoljeni artikli
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400"
                  >
                    Zahtijeva najavu
                  </th>
                  <th scope="col" className="relative px-4 py-3">
                    <span className="sr-only">Uredi</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900">
                {buyers.map((buyer) => (
                  <tr key={buyer.id}>
                    <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-white">
                      {buyer.naziv_firme}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-300">
                      {buyer.email}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-300">
                      {buyer.dozvoljeni_artikli &&
                      buyer.dozvoljeni_artikli.length > 0
                        ? buyer.dozvoljeni_artikli.join(", ")
                        : "Nijedan"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={buyer.announcement_required}
                        onChange={() =>
                          toggleAnnouncementRequired(
                            buyer.id,
                            buyer.announcement_required,
                          )
                        }
                        className="form-checkbox rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-medium">
                      <button
                        onClick={() => handleEditClick(buyer)}
                        className="text-indigo-400 hover:text-indigo-600"
                      >
                        Uredi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
