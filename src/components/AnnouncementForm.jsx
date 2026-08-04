import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const todayStr = toDateInputValue(new Date());
const maxDate = new Date();
maxDate.setDate(maxDate.getDate() + 30);
const maxDateStr = toDateInputValue(maxDate);

export default function AnnouncementForm({
  currentUser,
  onCreated,
  onResult,
  buyerProfile,
  role,
  buyers,
}) {
  const isBuyer = role === "buyer";

  const [vrstaCementa, setVrstaCementa] = useState("");
  const [datumPlaniranja, setDatumPlaniranja] = useState(todayStr);
  const [imeVozaca, setImeVozaca] = useState("");
  const [prezimeVozaca, setPrezimeVozaca] = useState("");
  const [registarskeOznake, setRegistarskeOznake] = useState("");
  const [loading, setLoading] = useState(false);

  const [buyerQuery, setBuyerQuery] = useState("");
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inStockNames, setInStockNames] = useState(new Set());

  useEffect(() => {
    const fetchInStock = async () => {
      const { data, error } = await supabase
        .from("cement_types")
        .select("name")
        .eq("is_active", true)
        .eq("na_stanju", true);
      if (!error) {
        setInStockNames(new Set((data || []).map((c) => c.name)));
      }
    };
    fetchInStock();
  }, []);

  const effectiveBuyerProfile = isBuyer ? buyerProfile : selectedBuyer;
  const allowedCementTypes = effectiveBuyerProfile?.dozvoljeni_artikli || [];

  const normalizedBuyerQuery = buyerQuery.trim().toLowerCase();
  const buyerSuggestions =
    !isBuyer && normalizedBuyerQuery
      ? (buyers || [])
          .filter((buyer) =>
            buyer.naziv_firme?.toLowerCase().includes(normalizedBuyerQuery),
          )
          .slice(0, 6)
      : [];

  const handleBuyerQueryChange = (value) => {
    setBuyerQuery(value);
    setShowSuggestions(true);
    if (selectedBuyer && value !== selectedBuyer.naziv_firme) {
      setSelectedBuyer(null);
    }
  };

  const handleSelectBuyer = (buyer) => {
    setSelectedBuyer(buyer);
    setBuyerQuery(buyer.naziv_firme || "");
    setShowSuggestions(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!inStockNames.has(vrstaCementa)) {
      onResult?.("Vrsta cementa trenutno nije na stanju.", "error");
      return;
    }

    setLoading(true);

    const payload = {
      created_by: currentUser?.id,
      firma: effectiveBuyerProfile?.naziv_firme || "",
      vrsta_cementa: vrstaCementa,
      datum_planiranja_odpreme: datumPlaniranja,
      ime_vozaca: imeVozaca.trim() || null,
      prezime_vozaca: prezimeVozaca.trim() || null,
      registarske_oznake: registarskeOznake.trim() || null,
      status: "pending",
    };

    const { error } = await supabase.from("announcements").insert([payload]);
    setLoading(false);

    if (error) {
      onResult?.("Greška pri kreiranju najave: " + error.message, "error");
      return;
    }

    setVrstaCementa("");
    setDatumPlaniranja(todayStr);
    setImeVozaca("");
    setPrezimeVozaca("");
    setRegistarskeOznake("");
    setBuyerQuery("");
    setSelectedBuyer(null);
    onCreated?.();
    onResult?.("Najava je uspješno kreirana.", "success");

    supabase.functions
      .invoke("send-announcement-email", {
        body: {
          firma: payload.firma,
          vrstaCementa: payload.vrsta_cementa,
          datumPlaniranja: payload.datum_planiranja_odpreme,
          imeVozaca: payload.ime_vozaca,
          prezimeVozaca: payload.prezime_vozaca,
          registarskeOznake: payload.registarske_oznake,
          buyerEmail: effectiveBuyerProfile?.email,
        },
      })
      .catch((err) => console.error("Slanje emaila nije uspjelo:", err));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-6"
    >
      <div className="flex flex-col gap-2 border-b border-gray-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
          Nova najava otpreme
        </h3>
        {!isBuyer && (
          <span
            className={`text-xs px-2.5 py-1 rounded-full border font-medium select-none ${
              effectiveBuyerProfile?.announcement_required
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            Najava obavezna:{" "}
            {effectiveBuyerProfile?.announcement_required ? "DA" : "NE"}
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {!isBuyer && (
          <div className="relative">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Kupac
            </label>
            <input
              value={buyerQuery}
              onChange={(e) => handleBuyerQueryChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setShowSuggestions(false)}
              placeholder="Počnite kucati naziv firme..."
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
            />
            {showSuggestions && buyerSuggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                {buyerSuggestions.map((buyer) => (
                  <li
                    key={buyer.id}
                    onMouseDown={() => handleSelectBuyer(buyer)}
                    className="cursor-pointer px-3 py-2 text-sm text-gray-900 hover:bg-red-50"
                  >
                    {buyer.naziv_firme}
                  </li>
                ))}
              </ul>
            )}
            {normalizedBuyerQuery && !selectedBuyer && (
              <p className="mt-1 text-xs text-red-600">Nepostojeći kupac</p>
            )}
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Vrsta cementa
          </label>
          <select
            value={vrstaCementa}
            onChange={(e) => setVrstaCementa(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
          >
            <option value="">Odaberi</option>
            {allowedCementTypes.length > 0 ? (
              allowedCementTypes.map((name) => (
                <option
                  key={name}
                  value={name}
                  disabled={!inStockNames.has(name)}
                >
                  {name}
                  {!inStockNames.has(name) ? " (nema na stanju)" : ""}
                </option>
              ))
            ) : (
              <option value="" disabled>
                Nemate dozvoljene vrste cementa
              </option>
            )}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Datum planiranja otpreme
          </label>
          <input
            type="date"
            value={datumPlaniranja}
            min={todayStr}
            max={maxDateStr}
            onChange={(e) => setDatumPlaniranja(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
          />
        </div>
        {!isBuyer && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Status
            </label>
            <input
              value="pending"
              readOnly
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Ime vozača
          </label>
          <input
            value={imeVozaca}
            onChange={(e) => setImeVozaca(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Prezime vozača
          </label>
          <input
            value={prezimeVozaca}
            onChange={(e) => setPrezimeVozaca(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
          />
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Registarske oznake
          </label>
          <input
            value={registarskeOznake}
            onChange={(e) => setRegistarskeOznake(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || (!isBuyer && !selectedBuyer)}
        className="w-full rounded-lg bg-brand-red hover:bg-brand-red-dark px-4 py-2 font-semibold text-white transition-colors disabled:opacity-50"
      >
        {loading ? "Spremanje..." : "Kreiraj najavu"}
      </button>
    </form>
  );
}
