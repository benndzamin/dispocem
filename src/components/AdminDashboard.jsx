import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import CementCatalogManager from "./CementCatalogManager";
import BuyerManagement from "./BuyerManagement";
import AnnouncementsList from "./AnnouncementsList";

const tabs = [
  { key: "home", label: "Početna" },
  { key: "announcements", label: "Najave" },
  { key: "buyers", label: "Kupci" },
  { key: "cement", label: "Vrste cementa" },
];

export default function AdminDashboard({ user }) {
  const [activeTab, setActiveTab] = useState("home");
  const [stats, setStats] = useState({
    buyers: 0,
    announcements: 0,
    cementTypes: 0,
    pendingAnnouncements: 0,
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
          announcementsResult,
          cementResult,
          pendingResult,
          recentResult,
        ] = await Promise.all([
          supabase
            .from("users")
            .select("id", { count: "exact", head: true })
            .eq("rola", "buyer"),
          supabase
            .from("announcements")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("cement_types")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("announcements")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
          supabase
            .from("announcements")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(3),
        ]);

        setStats({
          buyers: buyersResult.count ?? 0,
          announcements: announcementsResult.count ?? 0,
          cementTypes: cementResult.count ?? 0,
          pendingAnnouncements: pendingResult.count ?? 0,
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
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              Admin dashboard
            </h2>
            <p className="text-sm text-slate-400">
              Upravljajte statistikama, najavama, kupcima i vrstama cementa.
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                <div className="text-sm uppercase text-slate-400">Kupci</div>
                <div className="mt-4 text-3xl font-bold text-white">
                  {stats.buyers}
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  Aktivni kupci u sistemu
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                <div className="text-sm uppercase text-slate-400">Najave</div>
                <div className="mt-4 text-3xl font-bold text-white">
                  {stats.announcements}
                </div>
                <div className="mt-2 text-sm text-slate-500">Ukupno najava</div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                <div className="text-sm uppercase text-slate-400">Cement</div>
                <div className="mt-4 text-3xl font-bold text-white">
                  {stats.cementTypes}
                </div>
                <div className="mt-2 text-sm text-slate-500">Vrste cementa</div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                <div className="text-sm uppercase text-slate-400">Pending</div>
                <div className="mt-4 text-3xl font-bold text-white">
                  {stats.pendingAnnouncements}
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  Najave na čekanju
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      Brze akcije
                    </h3>
                    <p className="text-sm text-slate-400">
                      Prebacite se brzo na najčešće zadatke.
                    </p>
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
                    onClick={() => setActiveTab("announcements")}
                    className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-5 text-left text-white transition hover:border-indigo-500"
                  >
                    <div className="font-semibold">📢 Upravljaj najavama</div>
                    <div className="mt-2 text-sm text-slate-400">
                      Pregledaj i ažuriraj postojeće najave.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("buyers")}
                    className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-5 text-left text-white transition hover:border-indigo-500"
                  >
                    <div className="font-semibold">👥 Upravljaj kupcima</div>
                    <div className="mt-2 text-sm text-slate-400">
                      Dodaj ili izmijeni kupce.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("cement")}
                    className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-5 text-left text-white transition hover:border-indigo-500"
                  >
                    <div className="font-semibold">🧱 Dodaj cement</div>
                    <div className="mt-2 text-sm text-slate-400">
                      Dodaj novu vrstu cementa.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("home")}
                    className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-5 text-left text-white transition hover:border-indigo-500"
                  >
                    <div className="font-semibold">📈 Pregled statistike</div>
                    <div className="mt-2 text-sm text-slate-400">
                      Pogledajte ključne metrike u jednom mjestu.
                    </div>
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-white">
                    Najnovije najave
                  </h3>
                  <p className="text-sm text-slate-400">
                    Tri najnovije najave iz sistema.
                  </p>
                </div>

                {loadingStats ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                    Učitavanje...
                  </div>
                ) : recentAnnouncements.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                    Nema najnovijih najava.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentAnnouncements.map((announcement) => (
                      <div
                        key={announcement.id}
                        className="rounded-2xl border border-slate-800 bg-slate-950 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-white">
                              {announcement.firma}
                            </div>
                            <div className="text-sm text-slate-400">
                              {announcement.vrsta_cementa}
                            </div>
                          </div>
                          <div className="text-xs uppercase text-slate-500">
                            {announcement.status}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-slate-400">
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
          <div className="space-y-6">
            <AnnouncementsList
              role="admin"
              currentUser={user}
              refreshKey={refreshKey}
            />
          </div>
        )}

        {activeTab === "buyers" && (
          <BuyerManagement
            showNotification={(msg, type) => console.log(msg, type)}
          />
        )}

        {activeTab === "cement" && <CementCatalogManager />}
      </div>
    </div>
  );
}
