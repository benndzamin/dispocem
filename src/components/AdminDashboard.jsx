import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import CementCatalogManager from "./CementCatalogManager";
import BuyerManagement from "./BuyerManagement";
import AnnouncementsList from "./AnnouncementsList";
import StaffManagement from "./StaffManagement";

const tabs = [
  { key: "home", label: "Početna", mobileLabel: "Početna" },
  { key: "cement", label: "Vrste cementa", mobileLabel: "Cement" },
  { key: "buyers", label: "Kupci", mobileLabel: "Kupci" },
  { key: "announcements", label: "Najave", mobileLabel: "Najave" },
  { key: "staff", label: "Osoblje", mobileLabel: "Osoblje" },
];

export default function AdminDashboard({ user }) {
  const [activeTab, setActiveTab] = useState("home");
  const [stats, setStats] = useState({
    buyers: 0,
    cementTypes: 0,
    pendingAnnouncements: 0,
    inProgressAnnouncements: 0,
  });
  const [recentAnnouncements, setRecentAnnouncements] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const fetchAdminStats = async () => {
      setLoadingStats(true);
      try {
        const [
          buyersResult,
          cementResult,
          pendingResult,
          inProgressResult,
          recentResult,
        ] = await Promise.all([
          supabase
            .from("users")
            .select("id", { count: "exact", head: true })
            .eq("rola", "buyer"),
          supabase
            .from("cement_types")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true),
          supabase
            .from("announcements")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
          supabase
            .from("announcements")
            .select("id", { count: "exact", head: true })
            .eq("status", "in_progress"),
          supabase
            .from("announcements")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(3),
        ]);

        setStats({
          buyers: buyersResult.count ?? 0,
          cementTypes: cementResult.count ?? 0,
          pendingAnnouncements: pendingResult.count ?? 0,
          inProgressAnnouncements: inProgressResult.count ?? 0,
        });

        setRecentAnnouncements(recentResult.data || []);
      } catch (error) {
        console.error("Error fetching admin stats:", error);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchAdminStats();
  }, [refreshKey]);

  const handleRefresh = () => setRefreshKey((value) => value + 1);

  const showNotification = (message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="space-y-6">
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
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-b border-gray-200" />
          <div className="pb-4">
            <h2 className="text-2xl font-semibold text-gray-900">
              Admin dashboard
            </h2>
            <p className="text-sm text-gray-500">
              Upravljajte statistikama, najavama, kupcima, vrstama cementa i
              osobljem.
            </p>
          </div>

          <div className="w-full sm:w-auto">
            <div className="relative flex items-end gap-1 sm:w-max sm:gap-2">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 border-b border-gray-200" />
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative min-w-0 flex-1 truncate rounded-t-lg border px-1.5 py-2 text-center text-[11px] transition-colors sm:flex-none sm:px-4 sm:py-2.5 sm:text-sm ${
                    activeTab === tab.key
                      ? "border-gray-200 border-b-white bg-white font-semibold text-brand-red"
                      : "border-transparent border-b-gray-200 bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  }`}
                >
                  <span className="sm:hidden">{tab.mobileLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === "home" && (
          <div className="mt-6 space-y-8">
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 md:gap-4">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">
                  Kupci
                </div>
                <div className="mt-2 text-xl font-bold text-gray-900 sm:mt-3 sm:text-2xl md:text-3xl">
                  {stats.buyers}
                </div>
                <div className="mt-1 text-xs text-gray-500 sm:mt-2 sm:text-sm">
                  Aktivni kupci u sistemu
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">
                  Vrste cementa
                </div>
                <div className="mt-2 text-xl font-bold text-gray-900 sm:mt-3 sm:text-2xl md:text-3xl">
                  {stats.cementTypes}
                </div>
                <div className="mt-1 text-xs text-gray-500 sm:mt-2 sm:text-sm">
                  Aktivne vrste cementa
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">
                  Najave
                </div>
                <div className="mt-2 text-xl font-bold text-gray-900 sm:mt-3 sm:text-2xl md:text-3xl">
                  {stats.pendingAnnouncements}
                </div>
                <div className="mt-1 text-xs text-gray-500 sm:mt-2 sm:text-sm">
                  Status: pending
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">
                  In progress
                </div>
                <div className="mt-2 text-xl font-bold text-gray-900 sm:mt-3 sm:text-2xl md:text-3xl">
                  {stats.inProgressAnnouncements}
                </div>
                <div className="mt-1 text-xs text-gray-500 sm:mt-2 sm:text-sm">
                  Najave u toku
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
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

                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab("announcements")}
                    className="rounded-2xl border border-gray-200 bg-white px-3 py-3 text-left text-gray-900 transition hover:border-brand-red hover:bg-red-50 sm:px-4 sm:py-5"
                  >
                    <div className="text-sm font-semibold sm:text-base">
                      📢 Upravljaj najavama
                    </div>
                    <div className="mt-1 text-xs text-gray-500 sm:mt-2 sm:text-sm">
                      Pregledaj i ažuriraj postojeće najave.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("buyers")}
                    className="rounded-2xl border border-gray-200 bg-white px-3 py-3 text-left text-gray-900 transition hover:border-brand-red hover:bg-red-50 sm:px-4 sm:py-5"
                  >
                    <div className="text-sm font-semibold sm:text-base">
                      👥 Upravljaj kupcima
                    </div>
                    <div className="mt-1 text-xs text-gray-500 sm:mt-2 sm:text-sm">
                      Dodaj ili izmijeni kupce.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("cement")}
                    className="rounded-2xl border border-gray-200 bg-white px-3 py-3 text-left text-gray-900 transition hover:border-brand-red hover:bg-red-50 sm:px-4 sm:py-5"
                  >
                    <div className="text-sm font-semibold sm:text-base">
                      🧱 Dodaj cement
                    </div>
                    <div className="mt-1 text-xs text-gray-500 sm:mt-2 sm:text-sm">
                      Dodaj novu vrstu cementa.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("home")}
                    className="rounded-2xl border border-gray-200 bg-white px-3 py-3 text-left text-gray-900 transition hover:border-brand-red hover:bg-red-50 sm:px-4 sm:py-5"
                  >
                    <div className="text-sm font-semibold sm:text-base">
                      📈 Pregled statistike
                    </div>
                    <div className="mt-1 text-xs text-gray-500 sm:mt-2 sm:text-sm">
                      Pogledajte ključne metrike u jednom mjestu.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("staff")}
                    className="rounded-2xl border border-gray-200 bg-white px-3 py-3 text-left text-gray-900 transition hover:border-brand-red hover:bg-red-50 sm:px-4 sm:py-5"
                  >
                    <div className="text-sm font-semibold sm:text-base">
                      🛡️ Upravljaj osobljem
                    </div>
                    <div className="mt-1 text-xs text-gray-500 sm:mt-2 sm:text-sm">
                      Dodaj ili ukloni supervizore i operatere.
                    </div>
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Najnovije najave
                  </h3>
                  <p className="text-sm text-gray-500">
                    Tri najnovije najave iz sistema.
                  </p>
                </div>

                {loadingStats ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
                    Učitavanje...
                  </div>
                ) : recentAnnouncements.length === 0 ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
                    Nema najnovijih najava.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentAnnouncements.map((announcement) => (
                      <div
                        key={announcement.id}
                        className="rounded-2xl border border-gray-200 bg-white p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-gray-900">
                              {announcement.firma}
                            </div>
                            <div className="text-sm text-gray-500">
                              {announcement.vrsta_cementa}
                            </div>
                          </div>
                          <div className="text-xs uppercase text-gray-500">
                            {announcement.status}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-gray-500">
                          <div>
                            Planirano: {announcement.datum_planiranja_odpreme}
                          </div>
                          <div>
                            Vozač: {announcement.ime_vozaca || "-"}{" "}
                            {announcement.prezime_vozaca || ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "announcements" && (
          <AnnouncementsList
            role="admin"
            currentUser={user}
            refreshKey={refreshKey}
            hideTopBorder
          />
        )}

        {activeTab === "buyers" && (
          <BuyerManagement showNotification={showNotification} hideTopBorder />
        )}

        {activeTab === "staff" && (
          <StaffManagement showNotification={showNotification} hideTopBorder />
        )}

        {activeTab === "cement" && <CementCatalogManager />}
      </div>
    </div>
  );
}
