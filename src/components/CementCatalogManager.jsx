import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { CEMENT_CATALOG } from "../constants/cementCatalog";

export default function CementCatalogManager() {
  const [customItems, setCustomItems] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  // Brisanje - state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Set obrisanih osnovnih vrsta (čuva se u localStorage)
  const [deletedCatalogItems, setDeletedCatalogItems] = useState(() => {
    try {
      const saved = localStorage.getItem("deletedCementTypes");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Učitaj custom vrste iz tabele
  const fetchCustomItems = async () => {
    try {
      const { data, error } = await supabase
        .from("cement_types")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Greška pri učitavanju vrsta cementa:", error);
        return;
      }
      setCustomItems(data || []);
    } catch (err) {
      console.error("Neočekivana greška:", err);
    }
  };

  useEffect(() => {
    fetchCustomItems();
  }, []);

  // Kombinovana lista: CEMENT_CATALOG (minus obrisane) + custom iz tabele
  const allItems = (() => {
    // 1. Imena iz baze (sve što je admin dodao)
    const dbNames = new Set(customItems.map((c) => c.name));

    // 2. Mapiramo custom stavke iz baze
    const fromDb = customItems.map((c) => ({
      value: c.name,
      label: c.name,
      id: c.id,
      fromDb: true,
      is_active: c.is_active,
    }));

    // 3. Osnovni katalog (samo one koje nisu u bazi pod istim imenom i nisu obrisane)
    const catalog = CEMENT_CATALOG.filter(
      (c) => !dbNames.has(c.value) && !deletedCatalogItems.has(c.value),
    ).map((c) => ({
      ...c,
      id: `catalog-${c.value}`,
      fromDb: false,
      is_active: true,
    }));

    return [...catalog, ...fromDb];
  })();

  const showMessage = (msg, type = "success") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(""), 4000);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setMessage("");

    const { error } = await supabase
      .from("cement_types")
      .insert([{ name: name.trim() }]);

    if (error) {
      showMessage(`Greška pri dodavanju: ${error.message}`, "error");
      setLoading(false);
      return;
    }

    setName("");
    fetchCustomItems();
    showMessage("Vrsta cementa uspješno dodana.");
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (confirmName.trim() !== deleteTarget.value) return;

    if (deleteTarget.fromDb && deleteTarget.id) {
      setDeleteLoading(true);
      const { error } = await supabase
        .from("cement_types")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) {
        showMessage("Greška pri brisanju: " + error.message, "error");
        setDeleteLoading(false);
        closeDeleteConfirm();
        return;
      }
      setDeleteLoading(false);
      showMessage(`Vrsta cementa "${deleteTarget.value}" je obrisana.`);
      closeDeleteConfirm();
      fetchCustomItems();
    } else {
      // Brisanje osnovne vrste - čuvamo u localStorage
      const newDeleted = new Set(deletedCatalogItems);
      newDeleted.add(deleteTarget.value);
      setDeletedCatalogItems(newDeleted);
      localStorage.setItem(
        "deletedCementTypes",
        JSON.stringify([...newDeleted]),
      );
      showMessage(`Vrsta cementa "${deleteTarget.value}" je obrisana.`);
      closeDeleteConfirm();
    }
  };

  const openDeleteConfirm = (item) => {
    setDeleteTarget(item);
    setConfirmName("");
  };

  const closeDeleteConfirm = () => {
    setDeleteTarget(null);
    setConfirmName("");
  };

  const handleRestoreAll = () => {
    setDeletedCatalogItems(new Set());
    localStorage.removeItem("deletedCementTypes");
    showMessage("Sve obrisane osnovne vrste su vraćene.");
  };

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            messageType === "error"
              ? "border-red-500/20 bg-red-500/10 text-red-400"
              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {message}
        </div>
      )}

      {/* Forma za dodavanje - samo jedan input */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h3 className="text-lg font-semibold text-white mb-1">
          ➕ Dodaj novu vrstu cementa
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Unesite naziv nove vrste cementa (npr. "PREMILUK (CEM I 52,5 N) - 25
          kg").
        </p>

        <form onSubmit={handleAdd} className="flex gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Naziv vrste cementa"
            className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium transition-colors whitespace-nowrap"
          >
            {loading ? "Dodavanje..." : "Dodaj"}
          </button>
        </form>
      </div>

      {/* Tabela aktivnih vrsta cementa */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">
              📋 Aktivne vrste cementa
            </h3>
            <p className="text-sm text-slate-400">
              Pregled svih vrsta cementa u sistemu. Kliknite na 🗑️ za brisanje.
            </p>
          </div>
          {deletedCatalogItems.size > 0 && (
            <button
              type="button"
              onClick={handleRestoreAll}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 transition-colors"
            >
              🔄 Vrati obrisane ({deletedCatalogItems.size})
            </button>
          )}
        </div>

        {allItems.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 text-center text-sm text-slate-500">
            Nema registrovanih vrsta cementa. Dodajte prvu vrstu iznad.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700">
              <thead className="bg-slate-800">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400"
                  >
                    Naziv
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400"
                  >
                    Tip
                  </th>
                  <th scope="col" className="relative px-4 py-3">
                    <span className="sr-only">Obriši</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950">
                {allItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-900/50 transition-colors"
                  >
                    <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-white">
                      {item.label}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.fromDb
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}
                      >
                        {item.fromDb ? "Dodata" : "Osnovna"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <button
                        onClick={() => openDeleteConfirm(item)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        title="Obriši vrstu cementa"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal za potvrdu brisanja */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl shadow-black/40">
            <div className="mb-4">
              <h4 className="text-lg font-semibold text-white">
                🗑️ Potvrda brisanja
              </h4>
              <p className="mt-2 text-sm text-slate-400">
                Ova radnja je nepovratna. Da biste potvrdili brisanje, unesite
                tačan naziv vrste cementa:
              </p>
              <p className="mt-2 text-base font-bold text-red-400">
                "{deleteTarget.value}"
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Unesite tačan naziv za potvrdu
                </label>
                <input
                  type="text"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={deleteTarget.value}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-red-500"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={closeDeleteConfirm}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  Odustani
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={
                    confirmName.trim() !== deleteTarget.value || deleteLoading
                  }
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:bg-red-800 disabled:opacity-50 transition-colors"
                >
                  {deleteLoading ? "Brisanje..." : "Potvrdi brisanje"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
