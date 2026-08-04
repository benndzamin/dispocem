import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import BuyerManagement from "./BuyerManagement";
import AnnouncementsList from "./AnnouncementsList";
import AnnouncementForm from "./AnnouncementForm";
import CementCatalogManager from "./CementCatalogManager";
import NewAnnouncementAlerts from "./NewAnnouncementAlerts";
import useNewAnnouncementAlerts from "../hooks/useNewAnnouncementAlerts";

const tabs = [
  { key: "home", label: "Početna" },
  { key: "buyers", label: "Kupci" },
  { key: "cement", label: "Vrste cementa" },
  { key: "announcements", label: "Najave" },
];

export default function VagaSupervisor({ user }) {
  const [activeTab, setActiveTab] = useState("home");
  const [stats, setStats] = useState({
    buyers: 0,
    pendingAnnouncements: 0,
    inProgressAnnouncements: 0,
  });
  const [loadingStats, setLoadingStats] = useState(false);
  const [notification, setNotification] = useState(null); // For notifications
  const [refreshKey, setRefreshKey] = useState(0);
  const [buyers, setBuyers] = useState([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteSearch, setDeleteSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const { alerts: newAnnouncementAlerts, dismiss: dismissNewAnnouncementAlert } =
    useNewAnnouncementAlerts(user?.id);

  useEffect(() => {
    const fetchSupervisorStats = async () => {
      setLoadingStats(true);
      try {
        const [buyersResult, pendingResult, inProgressResult, buyersData] =
          await Promise.all([
            supabase
              .from("users")
              .select("id", { count: "exact", head: true })
              .eq("rola", "buyer"),
            supabase
              .from("announcements")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending"),
            supabase
              .from("announcements")
              .select("id", { count: "exact", head: true })
              .eq("status", "in_progress"),
            supabase
              .from("users")
              .select("*")
              .eq("rola", "buyer")
              .order("created_at", { ascending: false }),
          ]);

        setStats({
          buyers: buyersResult.count ?? 0,
          pendingAnnouncements: pendingResult.count ?? 0,
          inProgressAnnouncements: inProgressResult.count ?? 0,
        });
        setBuyers(buyersData.data || []);
      } catch (error) {
        console.error("Error fetching supervisor stats:", error);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchSupervisorStats();
  }, [refreshKey]);

  const handleRefresh = () => setRefreshKey((value) => value + 1);

  const showNotification = (message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000); // Hide after 3 seconds
  };

  const openAnnouncementModal = () => {
    setAnnouncementModalOpen(true);
  };

  const closeAnnouncementModal = () => {
    setAnnouncementModalOpen(false);
  };

  const openDeleteModal = () => {
    setDeleteSearch("");
    setDeleteTarget(null);
    setIsDeleteModalOpen(true);
  };
  const closeDeleteModal = () => {
    setDeleteSearch("");
    setDeleteTarget(null);
    setIsDeleteModalOpen(false);
  };

  const closeDeleteConfirm = () => {
    if (!deleteLoading) setDeleteTarget(null);
  };

  const handleDeleteBuyer = async () => {
    if (!deleteTarget) {
      showNotification("Odaberite kupca za brisanje.", "error");
      return;
    }

    setDeleteLoading(true);
    try {
      const { error: deleteAuthUserError } = await supabase.rpc(
        "delete_buyer_by_id",
        { p_buyer_id: deleteTarget.id },
      );
      if (deleteAuthUserError) {
        throw new Error(deleteAuthUserError.message);
      }

      showNotification(
        `Kupac ${deleteTarget.naziv_firme || deleteTarget.email} je uspješno obrisan.`,
      );
      closeDeleteModal();
      handleRefresh();
    } catch (error) {
      showNotification(`Greška pri brisanju kupca: ${error.message}`, "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  const normalizedDeleteSearch = deleteSearch.trim().toLowerCase();
  const filteredBuyers = buyers.filter((buyer) => {
    if (!normalizedDeleteSearch) return true;

    return [buyer.naziv_firme, buyer.email, buyer.adresa]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedDeleteSearch));
  });

  return (
    <div className="space-y-6">
      <NewAnnouncementAlerts
        alerts={newAnnouncementAlerts}
        onDismiss={dismissNewAnnouncementAlert}
      />

      {notification && (
        <div
          className={`fixed right-4 top-4 z-[60] rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            notification.type === "success"
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {notification.message}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-4 border-b border-gray-200 sm:flex-row sm:items-end sm:justify-between">
          <div className="pb-4">
            <h2 className="text-2xl font-semibold text-gray-900">
              Supervisor dashboard
            </h2>
            <p className="text-sm text-gray-500">
              Upravljajte najavama, kupcima i njihovim dozvolama.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`-mb-px rounded-t-lg border px-4 py-2.5 text-sm transition-colors ${
                  activeTab === tab.key
                    ? "relative z-10 border-gray-200 border-b-white bg-white font-semibold text-brand-red"
                    : "border-transparent border-b-gray-200 bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "home" && (
          <div className="mt-6 space-y-8">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
                <div className="text-sm uppercase text-gray-500">Kupci</div>
                <div className="mt-4 text-3xl font-bold text-gray-900">
                  {stats.buyers}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  Aktivni kupci u sistemu
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
                <div className="text-sm uppercase text-gray-500">
                  U toku utovara
                </div>
                <div className="mt-4 text-3xl font-bold text-gray-900">
                  {stats.inProgressAnnouncements}
                </div>
                <div className="mt-2 text-sm text-gray-500">U toku utovara</div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
                <div className="text-sm uppercase text-gray-500">Pending</div>
                <div className="mt-4 text-3xl font-bold text-gray-900">
                  {stats.pendingAnnouncements}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  Najave na čekanju
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-1">
              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Brze akcije
                    </h3>
                    <p className="text-sm text-gray-500">
                      Prebacite se brzo na najčešće zadatke.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    className="rounded-full bg-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-300"
                  >
                    Osvježi
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => openAnnouncementModal()}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-5 text-left text-gray-900 transition hover:border-brand-red hover:bg-red-50"
                  >
                    <div className="font-semibold">➕ Kreiraj novu najavu</div>
                    <div className="mt-2 text-sm text-gray-500">
                      Kreirajte novu najavu za kupca.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("buyers")}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-5 text-left text-gray-900 transition hover:border-brand-red hover:bg-red-50"
                  >
                    <div className="font-semibold">👥 Upravljaj kupcima</div>
                    <div className="mt-2 text-sm text-gray-500">
                      Pregledajte i uredite kupce i dozvole.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("announcements")}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-5 text-left text-gray-900 transition hover:border-brand-red hover:bg-red-50"
                  >
                    <div className="font-semibold">📢 Pregled najava</div>
                    <div className="mt-2 text-sm text-gray-500">
                      Pregledajte i ažuriraj postojeće najave.
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "cement" && <CementCatalogManager />}

        {activeTab === "announcements" && (
          <AnnouncementsList
            role="wb_supervisor"
            currentUser={user}
            refreshKey={refreshKey}
            hideTopBorder
            onCreateNew={() => openAnnouncementModal()}
            newAlerts={newAnnouncementAlerts}
          />
        )}

        {activeTab === "buyers" && (
          <div className="space-y-6">
            <BuyerManagement
              showNotification={showNotification}
              hideTopBorder
            />
            {/* Buyer Deletion Section */}
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                Obriši kupca
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Odaberite kupca iz liste i potvrdite brisanje.
              </p>
              <button
                type="button"
                onClick={openDeleteModal}
                className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
              >
                Otvori modal za brisanje
              </button>
            </div>
          </div>
        )}
      </div>

      {announcementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div className="w-full max-w-3xl rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl shadow-black/10">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Nova najava
                </h3>
                <p className="text-sm text-gray-500">
                  Odaberite kupca i popunite podatke za novu najavu.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAnnouncementModal}
                className="rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Zatvori
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <AnnouncementForm
                  currentUser={user}
                  role="wb_supervisor"
                  buyers={buyers}
                  onCreated={() => {
                    handleRefresh();
                  }}
                  onResult={(message, type) => {
                    closeAnnouncementModal();
                    showNotification(message, type);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div className="w-full max-w-5xl rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl shadow-black/10">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Obriši kupca
                </h3>
                <p className="text-sm text-gray-500">
                  Pronađite kupca, zatim kliknite ikonu kante u koloni Akcija.
                </p>
              </div>
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Zatvori
              </button>
            </div>

            <div className="space-y-4">
              <input
                type="search"
                value={deleteSearch}
                onChange={(e) => setDeleteSearch(e.target.value)}
                placeholder="Pretraži po firmi, emailu ili adresi..."
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-brand-red focus:ring-2 focus:ring-red-100 focus:outline-none"
              />

              <div className="max-h-[55vh] overflow-auto border-t border-gray-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-gray-100 text-xs uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="border-b border-gray-200 px-4 py-3 font-semibold">
                        Firma
                      </th>
                      <th className="border-b border-gray-200 px-4 py-3 font-semibold">
                        Email
                      </th>
                      <th className="border-b border-gray-200 px-4 py-3 font-semibold">
                        Adresa
                      </th>
                      <th className="border-b border-gray-200 px-4 py-3 text-right font-semibold">
                        Akcija
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white text-gray-700">
                    {filteredBuyers.map((buyer) => (
                      <tr
                        key={buyer.id}
                        className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {buyer.naziv_firme || "-"}
                        </td>
                        <td className="px-4 py-3">{buyer.email}</td>
                        <td className="px-4 py-3">{buyer.adresa || "-"}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(buyer)}
                            aria-label={`Obriši kupca ${buyer.naziv_firme || buyer.email}`}
                            title="Obriši kupca"
                            className="rounded-lg p-2 text-red-600 transition hover:bg-red-50 hover:text-red-700"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredBuyers.length === 0 && (
                      <tr>
                        <td
                          colSpan="4"
                          className="px-4 py-8 text-center text-sm text-gray-500"
                        >
                          Nema kupaca koji odgovaraju pretrazi.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-buyer-title"
            className="w-full max-w-lg rounded-3xl border border-red-300 bg-white p-6 shadow-2xl shadow-black/10"
          >
            <h3
              id="delete-buyer-title"
              className="text-lg font-semibold text-gray-900"
            >
              Potvrda brisanja
            </h3>
            <p className="mt-3 text-gray-700">
              Jeste li sigurni da želite obrisati kupca{" "}
              <span className="font-semibold text-gray-900">
                {deleteTarget.naziv_firme || deleteTarget.email}
              </span>
              ?
            </p>
            <p className="mt-1 text-sm text-gray-500">{deleteTarget.email}</p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deleteLoading}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                IZLAZ
              </button>
              <button
                type="button"
                onClick={handleDeleteBuyer}
                disabled={deleteLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteLoading ? "BRISANJE..." : "OBRIŠI"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
