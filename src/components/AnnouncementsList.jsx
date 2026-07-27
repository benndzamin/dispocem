import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function AnnouncementsList({ role, currentUser, refreshKey }) {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAnnouncements = async () => {
    setLoading(true);
    let query = supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });

    if (role === "buyer") {
      query = query.eq("created_by", currentUser?.id);
    }

    const { data, error } = await query;
    setLoading(false);
    if (!error) setAnnouncements(data || []);
  };

  useEffect(() => {
    fetchAnnouncements();
  }, [role, currentUser?.id, refreshKey]);

  const deleteAnnouncement = async (id) => {
    const { error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", id);
    if (!error) fetchAnnouncements();
  };

  const completeAnnouncement = async (id) => {
    const { error } = await supabase
      .from("announcements")
      .update({ status: "completed" })
      .eq("id", id);
    if (!error) fetchAnnouncements();
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">📋 Najave</h3>
          <p className="text-sm text-slate-400">
            Pregled i upravljanje najavama.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Učitavanje...</div>
      ) : announcements.length === 0 ? (
        <div className="text-sm text-slate-400">Nema podataka.</div>
      ) : (
        <div className="space-y-3">
          {announcements.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-slate-800 bg-slate-950 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-white">{item.firma}</div>
                  <div className="text-sm text-slate-400">
                    {item.vrsta_cementa}
                  </div>
                </div>
                <div className="text-sm text-slate-300">
                  Status:{" "}
                  <span className="font-semibold text-indigo-400">
                    {item.status}
                  </span>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-slate-400 md:grid-cols-3">
                <div>Planirano: {item.datum_planiranja_odpreme}</div>
                <div>
                  Vozač: {item.ime_vozaca || "-"} {item.prezime_vozaca || ""}
                </div>
                <div>Reg: {item.registarske_oznake || "-"}</div>
              </div>
              <div className="mt-4 flex gap-2">
                {role !== "buyer" && (
                  <button
                    onClick={() => completeAnnouncement(item.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white"
                  >
                    Označi kao completed
                  </button>
                )}
                {role === "buyer" && (
                  <button
                    onClick={() => deleteAnnouncement(item.id)}
                    className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                  >
                    Obriši
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
