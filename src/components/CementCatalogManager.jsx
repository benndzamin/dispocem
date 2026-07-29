import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { CEMENT_CATALOG } from "../constants/cementCatalog";

export default function CementCatalogManager() {
  const [customItems, setCustomItems] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [showAddModal, setShowAddModal] = useState(false);

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
  const [showRestoreModal, setShowRestoreModal] = useState(false);

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

    // 2. Mapiramo custom stavke iz baze (samo aktivne - obrisane su is_active = false)
    const fromDb = customItems
      .filter((c) => c.is_active !== false)
      .map((c) => ({
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

  // Kombinovana lista obrisanih stavki (osnovne iz localStorage + dodate iz baze sa is_active = false)
  const restorableItems = [
    ...[...deletedCatalogItems].map((name) => ({ kind: "catalog", name })),
    ...customItems
      .filter((c) => c.is_active === false)
      .map((c) => ({ kind: "db", id: c.id, name: c.name })),
  ];

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
    setShowAddModal(false);
  };

  const openAddModal = () => setShowAddModal(true);

  const closeAddModal = () => {
    setShowAddModal(false);
    setName("");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (confirmName.trim() !== deleteTarget.value) return;

    if (deleteTarget.fromDb && deleteTarget.id) {
      setDeleteLoading(true);
      const { error } = await supabase
        .from("cement_types")
        .update({ is_active: false })
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

  const handleRestoreCatalogItem = (itemName) => {
    const newDeleted = new Set(deletedCatalogItems);
    newDeleted.delete(itemName);
    setDeletedCatalogItems(newDeleted);
    if (newDeleted.size === 0) {
      localStorage.removeItem("deletedCementTypes");
    } else {
      localStorage.setItem(
        "deletedCementTypes",
        JSON.stringify([...newDeleted]),
      );
    }
    showMessage(`Vrsta cementa "${itemName}" je vraćena.`);
  };

  const handleRestoreDbItem = async (item) => {
    const { error } = await supabase
      .from("cement_types")
      .update({ is_active: true })
      .eq("id", item.id);

    if (error) {
      showMessage("Greška pri vraćanju: " + error.message, "error");
      return;
    }
    showMessage(`Vrsta cementa "${item.name}" je vraćena.`);
    fetchCustomItems();
  };

  const openRestoreModal = () => setShowRestoreModal(true);
  const closeRestoreModal = () => setShowRestoreModal(false);

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            messageType === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {message}
        </div>
      )}

      {/* Tabela aktivnih vrsta cementa */}
      <div className="rounded-b-2xl border-x border-b border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              📋 Aktivne vrste cementa
            </h3>
            <p className="text-sm text-gray-500">
              Pregled svih vrsta cementa u sistemu. Kliknite na 🗑️ za brisanje.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openAddModal}
              className="rounded-lg bg-brand-red hover:bg-brand-red-dark text-white px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap"
            >
              ➕ Dodaj vrstu cementa
            </button>
            {restorableItems.length > 0 && (
              <button
                type="button"
                onClick={openRestoreModal}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-100 transition-colors"
              >
                🔄 Vrati obrisane ({restorableItems.length})
              </button>
            )}
          </div>
        </div>

        {allItems.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
            Nema registrovanih vrsta cementa. Kliknite na "➕ Dodaj vrstu
            cementa" iznad.
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-gray-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-100 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th scope="col" className="border-b border-gray-200 px-4 py-3 font-semibold">
                    Naziv
                  </th>
                  <th scope="col" className="border-b border-gray-200 px-4 py-3 font-semibold">
                    Tip
                  </th>
                  <th scope="col" className="relative border-b border-gray-200 px-4 py-3">
                    <span className="sr-only">Obriši</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white text-gray-700">
                {allItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {item.label}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.fromDb
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-gray-100 text-gray-600 border border-gray-300"
                        }`}
                      >
                        {item.fromDb ? "Dodata" : "Osnovna"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openDeleteConfirm(item)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl shadow-black/10">
            <div className="mb-4">
              <h4 className="text-lg font-semibold text-gray-900">
                🗑️ Potvrda brisanja
              </h4>
              <p className="mt-2 text-sm text-gray-500">
                Ova radnja je nepovratna. Da biste potvrdili brisanje, unesite
                tačan naziv vrste cementa:
              </p>
              <p className="mt-2 text-base font-bold text-red-600">
                "{deleteTarget.value}"
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                  Unesite tačan naziv za potvrdu
                </label>
                <input
                  type="text"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={deleteTarget.value}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={closeDeleteConfirm}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
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

      {/* Modal za dodavanje nove vrste cementa */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl shadow-black/10">
            <div className="mb-4">
              <h4 className="text-lg font-semibold text-gray-900">
                ➕ Dodaj novu vrstu cementa
              </h4>
              <p className="mt-2 text-sm text-gray-500">
                Unesite naziv nove vrste cementa (npr. "PREMILUK (CEM I 52,5
                N) - 25 kg").
              </p>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Naziv vrste cementa"
                autoFocus
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
              />
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="bg-brand-red hover:bg-brand-red-dark disabled:bg-brand-red-dark disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium transition-colors whitespace-nowrap"
                >
                  {loading ? "Dodavanje..." : "Dodaj"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal za vraćanje obrisanih vrsta cementa */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl shadow-black/10">
            <div className="mb-4">
              <h4 className="text-lg font-semibold text-gray-900">
                🔄 Vrati obrisane vrste cementa
              </h4>
              <p className="mt-2 text-sm text-gray-500">
                Odaberite koju obrisanu vrstu cementa želite vratiti u
                aktivnu listu.
              </p>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {restorableItems.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">
                  Nema više obrisanih vrsta.
                </p>
              ) : (
                restorableItems.map((item) => (
                  <div
                    key={item.kind === "catalog" ? `catalog-${item.name}` : `db-${item.id}`}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <span className="text-sm text-gray-900">{item.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        item.kind === "catalog"
                          ? handleRestoreCatalogItem(item.name)
                          : handleRestoreDbItem(item)
                      }
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      🔄 Vrati
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={closeRestoreModal}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Zatvori
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
