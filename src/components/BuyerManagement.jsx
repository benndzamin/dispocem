import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function BuyerManagement({
  showNotification = () => {},
  hideTopBorder = false,
}) {
  const [buyers, setBuyers] = useState([]);
  const [cementTypes, setCementTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nazivFirme, setNazivFirme] = useState("");
  const [adresa, setAdresa] = useState("");
  const [dozvoljeniArtikli, setDozvoljeniArtikli] = useState([]);
  const [announcementRequired, setAnnouncementRequired] = useState(true);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const resetForm = () => {
    setSelectedBuyer(null);
    setEmail("");
    setPassword("");
    setNazivFirme("");
    setAdresa("");
    setDozvoljeniArtikli([]);
    setMessage("");
    setAnnouncementRequired(true);
    setApprovalRequired(false);
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
      setApprovalRequired(buyer.approval_required ?? false);
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
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (!error) {
      setCementTypes(
        (data || []).map((c) => ({
          value: c.name,
          label: c.name,
          id: c.id,
          na_stanju: c.na_stanju,
        })),
      );
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
          approval_required: approvalRequired,
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
            approval_required: approvalRequired,
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

  const filteredBuyers = buyers.filter((buyer) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      buyer.naziv_firme?.toLowerCase().includes(term) ||
      buyer.email?.toLowerCase().includes(term) ||
      buyer.adresa?.toLowerCase().includes(term)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredBuyers.length / pageSize));
  const paginatedBuyers = filteredBuyers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const rangeStart =
    filteredBuyers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, filteredBuyers.length);

  return (
    <div
      className={`bg-white border-gray-200 p-6 ${
        hideTopBorder ? "border-x border-b rounded-b-xl" : "border rounded-xl"
      }`}
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            👥 Upravljanje kupcima
          </h3>
          <p className="text-sm text-gray-500">
            Supervisor može dodavati i uređivati kupce, te mijenjati njihove
            dozvole i zahtjeve za najave.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Pretraži kupce (firma, email, adresa)..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
            />
          </div>
          <button
            type="button"
            onClick={() => openBuyerModal()}
            className="rounded-lg bg-brand-red hover:bg-brand-red-dark text-white px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap"
          >
            ➕ Dodaj novog kupca
          </button>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div className="w-full max-w-3xl rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-2xl shadow-black/10">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">
                  {modalMode === "edit" ? "Uredi kupca" : "Dodaj novog kupca"}
                </h4>
                <p className="text-sm text-gray-500">
                  {modalMode === "edit"
                    ? "Ažurirajte podatke postojećeg kupca."
                    : "Kreirajte novi nalog kupca i definišite dozvoljene artikle."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeBuyerModal}
                className="rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Zatvori
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs uppercase text-gray-500 font-semibold mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    disabled={modalMode === "edit"}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
                  />
                </div>

                {modalMode === "create" && (
                  <div>
                    <label className="block text-xs uppercase text-gray-500 font-semibold mb-1">
                      Lozinka
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs uppercase text-gray-500 font-semibold mb-1">
                    Naziv firme
                  </label>
                  <input
                    type="text"
                    required
                    value={nazivFirme}
                    onChange={(e) => setNazivFirme(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase text-gray-500 font-semibold mb-1">
                    Adresa
                  </label>
                  <input
                    type="text"
                    value={adresa}
                    onChange={(e) => setAdresa(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                <label className="text-xs uppercase text-gray-500 font-semibold">
                  Dozvoljeni artikli:
                </label>
                <div className="flex flex-wrap gap-2">
                  {cementTypes.map((cement) => (
                    <label
                      key={cement.value}
                      className="flex items-center gap-1 text-sm text-gray-900"
                    >
                      <input
                        type="checkbox"
                        checked={dozvoljeniArtikli.includes(cement.value)}
                        onChange={() => handleCheckboxChange(cement.value)}
                        className="form-checkbox rounded border-gray-300 bg-white text-brand-red focus:ring-brand-red"
                      />
                      {cement.label}
                      {cement.na_stanju === false && (
                        <span className="text-xs text-gray-400">
                          (nema na stanju)
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-900">
                <input
                  type="checkbox"
                  checked={announcementRequired}
                  onChange={(e) => setAnnouncementRequired(e.target.checked)}
                  className="form-checkbox rounded border-gray-300 bg-white text-brand-red focus:ring-brand-red"
                />
                <label className="text-xs uppercase text-gray-500 font-semibold">
                  Zahtijeva najavu
                </label>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-900">
                <input
                  type="checkbox"
                  checked={approvalRequired}
                  onChange={(e) => setApprovalRequired(e.target.checked)}
                  className="form-checkbox rounded border-gray-300 bg-white text-brand-red focus:ring-brand-red"
                />
                <label className="text-xs uppercase text-gray-500 font-semibold">
                  Zahtijeva odobrenje
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeBuyerModal}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark disabled:opacity-50"
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

      {loading ? (
        <p className="text-gray-500">Učitavanje kupaca...</p>
      ) : buyers.length === 0 ? (
        <p className="text-gray-500">Nema registrovanih kupaca.</p>
      ) : filteredBuyers.length === 0 ? (
        <p className="text-gray-500">Nema kupaca koji odgovaraju pretrazi.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto border-t border-gray-200 md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-100 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th
                    scope="col"
                    className="border-b border-gray-200 px-4 py-3 font-semibold"
                  >
                    Firma
                  </th>
                  <th
                    scope="col"
                    className="border-b border-gray-200 px-4 py-3 font-semibold"
                  >
                    Email
                  </th>
                  <th
                    scope="col"
                    className="border-b border-gray-200 px-4 py-3 font-semibold"
                  >
                    Dozvoljeni artikli
                  </th>
                  <th
                    scope="col"
                    className="border-b border-gray-200 px-4 py-3 font-semibold whitespace-nowrap"
                  >
                    Zahtijeva najavu
                  </th>
                  <th
                    scope="col"
                    className="border-b border-gray-200 px-4 py-3 font-semibold whitespace-nowrap"
                  >
                    Zahtijeva odobrenje
                  </th>
                  <th
                    scope="col"
                    className="relative border-b border-gray-200 px-4 py-3"
                  >
                    <span className="sr-only">Uredi</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white text-gray-700">
                {paginatedBuyers.map((buyer) => (
                  <tr
                    key={buyer.id}
                    className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {buyer.naziv_firme}
                    </td>
                    <td className="px-4 py-3">{buyer.email}</td>
                    <td className="px-4 py-3">
                      {buyer.dozvoljeni_artikli &&
                      buyer.dozvoljeni_artikli.length > 0
                        ? buyer.dozvoljeni_artikli.join(", ")
                        : "Nijedan"}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={buyer.announcement_required}
                        disabled
                        className="form-checkbox rounded border-gray-300 bg-white text-brand-red focus:ring-brand-red disabled:cursor-not-allowed disabled:opacity-70"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={buyer.approval_required}
                        disabled
                        className="form-checkbox rounded border-gray-300 bg-white text-brand-red focus:ring-brand-red disabled:cursor-not-allowed disabled:opacity-70"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleEditClick(buyer)}
                        className="whitespace-nowrap rounded-lg bg-brand-red hover:bg-brand-red-dark text-white px-3 py-2 text-xs font-medium transition-colors"
                      >
                        Uredi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {paginatedBuyers.map((buyer) => (
              <div
                key={buyer.id}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-gray-900">
                    {buyer.naziv_firme}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEditClick(buyer)}
                    className="shrink-0 whitespace-nowrap rounded-lg bg-brand-red hover:bg-brand-red-dark text-white px-3 py-2 text-xs font-medium transition-colors"
                  >
                    Uredi
                  </button>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  {buyer.email}
                </div>
                <div className="mt-3 text-sm">
                  <div className="text-xs uppercase text-gray-400">
                    Dozvoljeni artikli
                  </div>
                  <div className="text-gray-700">
                    {buyer.dozvoljeni_artikli &&
                    buyer.dozvoljeni_artikli.length > 0
                      ? buyer.dozvoljeni_artikli.join(", ")
                      : "Nijedan"}
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={buyer.announcement_required}
                    disabled
                    className="form-checkbox rounded border-gray-300 bg-white text-brand-red focus:ring-brand-red disabled:cursor-not-allowed disabled:opacity-70"
                  />
                  Zahtijeva najavu
                </label>
                <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={buyer.approval_required}
                    disabled
                    className="form-checkbox rounded border-gray-300 bg-white text-brand-red focus:ring-brand-red disabled:cursor-not-allowed disabled:opacity-70"
                  />
                  Zahtijeva odobrenje
                </label>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>
                Prikazano {rangeStart}-{rangeEnd} od {filteredBuyers.length}{" "}
                kupaca
              </span>
              <label className="ml-4 flex items-center gap-2">
                <span className="text-xs uppercase text-gray-500 font-semibold">
                  Po stranici
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-white"
              >
                Prethodna
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (page) =>
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1,
                )
                .reduce((acc, page, idx, arr) => {
                  if (idx > 0 && page - arr[idx - 1] > 1) acc.push("...");
                  acc.push(page);
                  return acc;
                }, [])
                .map((page, idx) =>
                  page === "..." ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-2 text-sm text-gray-400"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`rounded-lg border px-3 py-1.5 text-sm ${
                        page === currentPage
                          ? "border-brand-red bg-brand-red text-white"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {page}
                    </button>
                  ),
                )}
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-white"
              >
                Sljedeća
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
