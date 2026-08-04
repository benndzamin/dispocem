import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import CementCatalogManager from "./CementCatalogManager";
import BuyerManagement from "./BuyerManagement";
import AnnouncementsList from "./AnnouncementsList";

const tabs = [
  { key: "home", label: "Početna" },
  { key: "cement", label: "Vrste cementa" },
  { key: "buyers", label: "Kupci" },
  { key: "announcements", label: "Najave" },
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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-b border-gray-200" />
          <div className="pb-4">
            <h2 className="text-2xl font-semibold text-gray-900">
              Admin dashboard
            </h2>
            <p className="text-sm text-gray-500">
              Upravljajte statistikama, najavama, kupcima i vrstama cementa.
            </p>
          </div>

          <div className="scrollbar-hide overflow-x-auto">
            <div className="relative flex w-max items-end gap-2 flex-nowrap">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 border-b border-gray-200" />
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative shrink-0 rounded-t-lg border px-4 py-2.5 text-sm transition-colors ${
                    activeTab === tab.key
                      ? "border-gray-200 border-b-white bg-white font-semibold text-brand-red"
                      : "border-transparent border-b-gray-200 bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === "home" && (
          <div className="mt-6 space-y-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                  Vrste cementa
                </div>
                <div className="mt-4 text-3xl font-bold text-gray-900">
                  {stats.cementTypes}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  Aktivne vrste cementa
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
                <div className="text-sm uppercase text-gray-500">Najave</div>
                <div className="mt-4 text-3xl font-bold text-gray-900">
                  {stats.pendingAnnouncements}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  Status: pending
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
                <div className="text-sm uppercase text-gray-500">
                  In progress
                </div>
                <div className="mt-4 text-3xl font-bold text-gray-900">
                  {stats.inProgressAnnouncements}
                </div>
                <div className="mt-2 text-sm text-gray-500">Najave u toku</div>
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("announcements")}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-5 text-left text-gray-900 transition hover:border-brand-red hover:bg-red-50"
                  >
                    <div className="font-semibold">📢 Upravljaj najavama</div>
                    <div className="mt-2 text-sm text-gray-500">
                      Pregledaj i ažuriraj postojeće najave.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("buyers")}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-5 text-left text-gray-900 transition hover:border-brand-red hover:bg-red-50"
                  >
                    <div className="font-semibold">👥 Upravljaj kupcima</div>
                    <div className="mt-2 text-sm text-gray-500">
                      Dodaj ili izmijeni kupce.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("cement")}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-5 text-left text-gray-900 transition hover:border-brand-red hover:bg-red-50"
                  >
                    <div className="font-semibold">🧱 Dodaj cement</div>
                    <div className="mt-2 text-sm text-gray-500">
                      Dodaj novu vrstu cementa.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("home")}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-5 text-left text-gray-900 transition hover:border-brand-red hover:bg-red-50"
                  >
                    <div className="font-semibold">📈 Pregled statistike</div>
                    <div className="mt-2 text-sm text-gray-500">
                      Pogledajte ključne metrike u jednom mjestu.
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
          <BuyerManagement
            showNotification={(msg, type) => console.log(msg, type)}
            hideTopBorder
          />
        )}

        {activeTab === "cement" && <CementCatalogManager />}
      </div>
    </div>
  );
}
