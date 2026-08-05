import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const ROLE_LABELS = {
  wb_supervisor: "Supervizor vage",
  wb_operator: "Operater vage",
};

const ROLE_OPTIONS = [
  { value: "wb_supervisor", label: ROLE_LABELS.wb_supervisor },
  { value: "wb_operator", label: ROLE_LABELS.wb_operator },
];

export default function StaffManagement({
  showNotification = () => {},
  hideTopBorder = false,
}) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rola, setRola] = useState("wb_supervisor");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setRola("wb_supervisor");
  };

  const openModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const fetchStaff = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .in("rola", ["wb_supervisor", "wb_operator"])
      .order("created_at", { ascending: false });
    setLoading(false);
    if (!error) {
      setStaff(data || []);
    } else {
      showNotification(
        "Greška pri dohvatanju osoblja: " + error.message,
        "error",
      );
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      showNotification("Email i lozinka su obavezni.", "error");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "admin-create-staff",
        { body: { email, password, rola } },
      );
      if (error) {
        // Kod non-2xx odgovora supabase-js ne parsira JSON tijelo u `data` -
        // `error.message` je generički ("Edge Function returned a non-2xx
        // status code"). Stvarna poruka je u error.context (Response objekt).
        let message = error.message;
        if (typeof error.context?.json === "function") {
          try {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          } catch {
            // tijelo nije JSON - zadrži generičku poruku
          }
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);

      showNotification("Nalog je uspješno kreiran.", "success");
      closeModal();
      fetchStaff();
    } catch (err) {
      showNotification(
        err.message || "Greška pri kreiranju naloga.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleteLoading(true);
    try {
      const { error } = await supabase.rpc("delete_staff_by_id", {
        p_staff_id: deleteTarget.id,
      });
      if (error) throw error;

      showNotification(
        `Nalog ${deleteTarget.email} je uspješno obrisan.`,
        "success",
      );
      setDeleteTarget(null);
      fetchStaff();
    } catch (err) {
      showNotification(
        `Greška pri brisanju naloga: ${err.message}`,
        "error",
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredStaff = staff.filter((member) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      member.email?.toLowerCase().includes(term) ||
      ROLE_LABELS[member.rola]?.toLowerCase().includes(term)
    );
  });

  return (
    <div
      className={`bg-white border-gray-200 p-6 ${
        hideTopBorder ? "border-x border-b rounded-b-xl" : "border rounded-xl"
      }`}
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            🛡️ Upravljanje osobljem
          </h3>
          <p className="text-sm text-gray-500">
            Admin može kreirati i brisati naloge supervizora i operatera
            vage.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Pretraži osoblje (email, uloga)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
            />
          </div>
          <button
            type="button"
            onClick={openModal}
            className="rounded-lg bg-brand-red hover:bg-brand-red-dark text-white px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap"
          >
            ➕ Dodaj osoblje
          </button>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-2xl shadow-black/10">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">
                  Dodaj osoblje
                </h4>
                <p className="text-sm text-gray-500">
                  Kreirajte novi nalog supervizora ili operatera vage.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Zatvori
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-gray-500 font-semibold mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
                />
              </div>

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

              <div>
                <label className="block text-xs uppercase text-gray-500 font-semibold mb-1">
                  Uloga
                </label>
                <select
                  value={rola}
                  onChange={(e) => setRola(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark disabled:opacity-50"
                >
                  {saving ? "Kreiranje..." : "Dodaj nalog"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl shadow-black/10">
            <h4 className="text-lg font-semibold text-gray-900">
              Obrisati nalog?
            </h4>
            <p className="mt-2 text-sm text-gray-500">
              Nalog <span className="font-semibold">{deleteTarget.email}</span>{" "}
              ({ROLE_LABELS[deleteTarget.rola]}) će biti trajno obrisan i
              korisnik se više neće moći prijaviti. Ova akcija se ne može
              poništiti.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Odustani
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? "Brisanje..." : "Obriši nalog"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Učitavanje osoblja...</p>
      ) : staff.length === 0 ? (
        <p className="text-gray-500">Nema kreiranog osoblja.</p>
      ) : filteredStaff.length === 0 ? (
        <p className="text-gray-500">Nema osoblja koje odgovara pretrazi.</p>
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
                    Email
                  </th>
                  <th
                    scope="col"
                    className="border-b border-gray-200 px-4 py-3 font-semibold"
                  >
                    Uloga
                  </th>
                  <th
                    scope="col"
                    className="border-b border-gray-200 px-4 py-3 font-semibold"
                  >
                    Kreiran
                  </th>
                  <th
                    scope="col"
                    className="relative border-b border-gray-200 px-4 py-3"
                  >
                    <span className="sr-only">Akcije</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white text-gray-700">
                {filteredStaff.map((member) => (
                  <tr
                    key={member.id}
                    className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {member.email}
                    </td>
                    <td className="px-4 py-3">
                      {ROLE_LABELS[member.rola] || member.rola}
                    </td>
                    <td className="px-4 py-3">
                      {member.created_at
                        ? new Date(member.created_at).toLocaleDateString(
                            "bs-BA",
                          )
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(member)}
                        className="whitespace-nowrap rounded-lg bg-red-50 text-red-600 hover:bg-red-100 px-3 py-2 text-xs font-medium transition-colors"
                      >
                        Obriši
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {filteredStaff.map((member) => (
              <div
                key={member.id}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-900">
                      {member.email}
                    </div>
                    <div className="text-sm text-gray-500">
                      {ROLE_LABELS[member.rola] || member.rola}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(member)}
                    className="shrink-0 whitespace-nowrap rounded-lg bg-red-50 text-red-600 hover:bg-red-100 px-3 py-2 text-xs font-medium transition-colors"
                  >
                    Obriši
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  Kreiran:{" "}
                  {member.created_at
                    ? new Date(member.created_at).toLocaleDateString("bs-BA")
                    : "-"}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
