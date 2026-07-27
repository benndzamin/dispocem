import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import BuyerManagement from "./BuyerManagement";
import AnnouncementsList from "./AnnouncementsList";
import AnnouncementForm from "./AnnouncementForm";

const tabs = [
  { key: "home", label: "Početna" },
  { key: "newAnnouncement", label: "Nova najava" },
  { key: "buyers", label: "Kupci" },
];

export default function VagaSupervisor({ user }) {
  const [activeTab, setActiveTab] = useState("home");
  const [stats, setStats] = useState({
    buyers: 0,
    announcements: 0,
    pendingAnnouncements: 0,
  });
  const [loadingStats, setLoadingStats] = useState(false);
  const [notification, setNotification] = useState(null); // For notifications
  const [refreshKey, setRefreshKey] = useState(0);
  const [buyers, setBuyers] = useState([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [announcementBuyer, setAnnouncementBuyer] = useState(null);

  useEffect(() => {
    const fetchSupervisorStats = async () => {
      setLoadingStats(true);
      try {
        const [
          buyersResult,
          announcementsResult,
          pendingResult,
          buyersData,
        ] = await Promise.all([
          supabase
            .from("users")
            .select("id", { count: "exact", head: true })
            .eq("rola", "buyer"),
          supabase
            .from("announcements")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("announcements")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
          supabase
            .from("users")
            .select("*")
            .eq("rola", "buyer")
            .order("created_at", { ascending: false }),
        ]);

        setStats({
          buyers: buyersResult.count ?? 0,
          announcements: announcementsResult.count ?? 0,
          pendingAnnouncements: pendingResult.count ?? 0,
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

  const openAnnouncementModal = (buyer = null) => {
    const initialBuyer = buyer || buyers[0] || null;
    setAnnouncementBuyer(initialBuyer);
    setAnnouncementModalOpen(true);
  };

  const closeAnnouncementModal = () => {
    setAnnouncementBuyer(null);
    setAnnouncementModalOpen(false);
  };

  const handleAnnouncementBuyerChange = (email) => {
    const buyer = buyers.find((item) => item.email === email);
    setAnnouncementBuyer(buyer || null);
  };

  const openDeleteModal = () => setIsDeleteModalOpen(true);
  const closeDeleteModal = () => {
    setDeleteEmail("");
    setIsDeleteModalOpen(false);
  };

  const handleDeleteBuyer = async (e) => {
    e.preventDefault();
    if (!deleteEmail) {
      showNotification("Email je obavezan!", "error");
      return;
    }

    try {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("email", deleteEmail)
        .single();

      if (userError || !userData) {
        throw new Error("Kupac sa tim emailom nije pronađen.");
      }

      const userId = userData.id;

      const { error: deleteAnnouncementsError } = await supabase
        .from("announcements")
        .delete()
        .eq("buyer_id", userId);

      if (deleteAnnouncementsError) {
        throw new Error("Greška pri brisanju najava kupca: " + deleteAnnouncementsError.message);
      }

      const { error: deleteProfileError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);

      if (deleteProfileError) {
        throw new Error("Greška pri brisanju profila kupca: " + deleteProfileError.message);
      }

      const { error: deleteAuthUserError } = await supabase.rpc("delete_user_by_email", { p_email: deleteEmail });
      if (deleteAuthUserError) {
        throw new Error(
          "Greška pri brisanju korisnika iz autentifikacije: " + deleteAuthUserError.message,
        );
      }

      showNotification(`Kupac ${deleteEmail} je uspješno obrisan.`);
      closeDeleteModal();
      handleRefresh();
    } catch (error) {
      showNotification(`Greška pri brisanju kupca: ${error.message}`, "error");
    }
  };

  return (
    <div className="space-y-6">
      {notification && (
        <div
          className={`rounded-md p-3 text-sm ${
            notification.type === "success"
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {notification.message}
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Supervisor dashboard</h2>
            <p className="text-sm text-slate-400">
              Upravljajte najavama, kupcima i njihovim dozvolama.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  activeTab === tab.key
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "home" && (
          <div className="space-y-8">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                <div className="text-sm uppercase text-slate-400">Kupci</div>
                <div className="mt-4 text-3xl font-bold text-white">{stats.buyers}</div>
                <div className="mt-2 text-sm text-slate-500">Aktivni kupci u sistemu</div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                <div className="text-sm uppercase text-slate-400">Ukupno najava</div>
                <div className="mt-4 text-3xl font-bold text-white">{stats.announcements}</div>
                <div className="mt-2 text-sm text-slate-500">Ukupno najava kreiranih</div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                <div className="text-sm uppercase text-slate-400">Pending</div>
                <div className="mt-4 text-3xl font-bold text-white">{stats.pendingAnnouncements}</div>
                <div className="mt-2 text-sm text-slate-500">Najave na čekanju</div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-1">
              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Brze akcije</h3>
                    <p className="text-sm text-slate-400">Prebacite se brzo na najčešće zadatke.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    className="rounded-full bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                  >
                    Osvježi
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("newAnnouncement")}
                    className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-5 text-left text-white transition hover:border-indigo-500"
                  >
                    <div className="font-semibold">➕ Kreiraj novu najavu</div>
                    <div className="mt-2 text-sm text-slate-400">Kreirajte novu najavu za kupca.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("buyers")}
                    className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-5 text-left text-white transition hover:border-indigo-500"
                  >
                    <div className="font-semibold">👥 Upravljaj kupcima</div>
                    <div className="mt-2 text-sm text-slate-400">Pregledajte i uredite kupce i dozvole.</div>
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Sve najave</h3>
              <AnnouncementsList role="wb_supervisor" currentUser={user} refreshKey={refreshKey} />
            </div>
          </div>
        )}

        {activeTab === "newAnnouncement" && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white">Kreiraj novu najavu</h3>
            <button
              type="button"
              onClick={() => openAnnouncementModal()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500"
            >
              Otvori formu najave
            </button>
          </div>
        )}

        {activeTab === "buyers" && (
          <div className="space-y-6">
            <BuyerManagement showNotification={showNotification} />
            {/* Buyer Deletion Section */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Obriši kupca</h3>
              <p className="text-sm text-slate-400 mb-4">Otvorite modal i potvrdite email adresu kupca za brisanje.</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl shadow-black/40">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Nova najava</h3>
                <p className="text-sm text-slate-400">Odaberite kupca i popunite podatke za novu najavu.</p>
              </div>
              <button
                type="button"
                onClick={closeAnnouncementModal}
                className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Zatvori
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-slate-400 font-semibold mb-1">Kupac</label>
                <select
                  value={announcementBuyer?.email || ""}
                  onChange={(e) => handleAnnouncementBuyerChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white"
                >
                  <option value="">Odaberi kupca</option>
                  {buyers.map((buyer) => (
                    <option key={buyer.id} value={buyer.email}>
                      {buyer.naziv_firme} ({buyer.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <AnnouncementForm
                  currentUser={user}
                  buyerProfile={announcementBuyer}
                  onCreated={() => {
                    handleRefresh();
                    showNotification("Najava je uspješno dodana.", "success");
                    closeAnnouncementModal();
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl shadow-black/40">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Potvrda brisanja kupca</h3>
                <p className="text-sm text-slate-400">Unesite email adresu da potvrdite brisanje.</p>
              </div>
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Zatvori
              </button>
            </div>

            <form onSubmit={handleDeleteBuyer} className="space-y-4">
              <input
                type="email"
                value={deleteEmail}
                onChange={(e) => setDeleteEmail(e.target.value)}
                placeholder="Email adresa kupca"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white"
                required
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Potvrdi brisanje
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
