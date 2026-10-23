import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { STAFF_PRESENCE_CHANNEL } from "../hooks/useStaffPresence";
import { describePushHost, parseUserAgent } from "../utils/device";

const ROLE_LABELS = {
  admin: "Admin",
  wb_supervisor: "Supervizor vage",
  silo_viewer: "Voditelj prodaje",
  wb_operator: "Operater vage",
  mill_operator: "Rukovodilac mlina cementa",
};

const ACTIVE_WINDOW_MS = 15 * 60 * 1000;

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("bs-BA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("bs-BA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(value, now) {
  if (!value) return "nikad";
  const diffMin = Math.round((now - new Date(value).getTime()) / 60000);
  if (diffMin < 1) return "upravo";
  if (diffMin < 60) return `prije ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `prije ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `prije ${diffD} d`;
}

function formatGeo(geo) {
  if (geo === undefined) return "…";
  if (!geo) return "Nepoznata lokacija";
  if (geo.local) return "Lokalna mreža";
  return [geo.city, geo.country].filter(Boolean).join(", ") || "Nepoznata lokacija";
}

export default function StaffActivity({
  showNotification = () => {},
  hideTopBorder = false,
}) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [geoByIp, setGeoByIp] = useState({});
  const [online, setOnline] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [confirm, setConfirm] = useState(null); // { type, member, session }
  const [revoking, setRevoking] = useState(false);
  // "Sada" za relativna vremena - osvježava se svake minute.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  const fetchGeo = async (ips) => {
    const unique = [...new Set(ips.filter(Boolean))];
    if (unique.length === 0) return;
    const { data, error } = await supabase.functions.invoke("geo-lookup", {
      body: { ips: unique },
    });
    if (error) {
      console.error("Geolokacija nije uspjela:", error);
      setGeoByIp((prev) => ({
        ...prev,
        ...Object.fromEntries(unique.map((ip) => [ip, prev[ip] ?? null])),
      }));
      return;
    }
    setGeoByIp((prev) => ({ ...prev, ...(data?.geo || {}) }));
  };

  const fetchActivity = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_staff_activity");
    setLoading(false);
    if (error) {
      showNotification(
        "Greška pri dohvatanju aktivnosti: " + error.message,
        "error",
      );
      return;
    }
    setStaff(data || []);
    fetchGeo(
      (data || []).flatMap((member) =>
        (member.sessions || []).map((s) => s.ip),
      ),
    );
  };

  useEffect(() => {
    fetchActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Uživo: ko je trenutno online (admin samo sluša, ne javlja se).
  useEffect(() => {
    const channel = supabase.channel(STAFF_PRESENCE_CHANNEL, {
      config: { private: true },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const entries = Object.values(state).map((metas) => {
          const sorted = [...metas].sort((a, b) =>
            (a.online_at || "").localeCompare(b.online_at || ""),
          );
          return { ...sorted[0], devices: metas };
        });
        entries.sort((a, b) => (a.email || "").localeCompare(b.email || ""));
        setOnline(entries);
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("Pretplata na online status nije uspjela.");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // session_id iz presence -> IP te sesije -> lokacija.
  const ipBySessionId = useMemo(() => {
    const map = {};
    staff.forEach((member) =>
      (member.sessions || []).forEach((s) => {
        map[s.id] = s.ip;
      }),
    );
    return map;
  }, [staff]);

  // Ako se pojavi online sesija koja još nije u listi (nova prijava),
  // osvježi pregled da dobijemo njen IP.
  useEffect(() => {
    const unknown = online
      .flatMap((entry) => entry.devices)
      .some((d) => d.session_id && !(d.session_id in ipBySessionId));
    if (unknown && !loading) fetchActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const handleRevoke = async () => {
    if (!confirm) return;
    setRevoking(true);
    const { error } =
      confirm.type === "session"
        ? await supabase.rpc("admin_revoke_session", {
            p_session_id: confirm.session.id,
          })
        : await supabase.rpc("admin_revoke_all_sessions", {
            p_user_id: confirm.member.id,
          });
    setRevoking(false);

    if (error) {
      showNotification("Greška pri odjavi: " + error.message, "error");
      return;
    }

    showNotification(
      confirm.type === "session"
        ? `Uređaj korisnika ${confirm.member.email} je odjavljen.`
        : `${confirm.member.email} je odjavljen/a sa svih uređaja.`,
      "success",
    );
    setConfirm(null);
    fetchActivity();
  };

  const filteredStaff = staff.filter((member) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      member.email?.toLowerCase().includes(term) ||
      ROLE_LABELS[member.rola]?.toLowerCase().includes(term)
    );
  });

  const onlineUserIds = new Set(online.map((entry) => entry.user_id));

  return (
    <div
      className={`bg-white border-gray-200 p-3 sm:p-6 ${
        hideTopBorder ? "border-x border-b rounded-b-xl" : "border rounded-xl"
      }`}
    >
      {/* Online uživo */}
      <section className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            {online.length > 0 && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-3 w-3 rounded-full ${
                online.length > 0 ? "bg-emerald-500" : "bg-gray-300"
              }`}
            />
          </span>
          <h3 className="text-lg font-bold text-gray-900">
            Trenutno online: {online.length}
          </h3>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Osoblje koje trenutno ima otvorenu aplikaciju. Ažurira se uživo.
        </p>

        {online.length > 0 && (
          <div className="mt-3 space-y-2">
            {online.map((entry) => (
              <div
                key={entry.user_id}
                className="rounded-xl border border-emerald-100 bg-white p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="break-all font-semibold text-gray-900">
                    {entry.email}
                  </span>
                  <span className="text-xs text-gray-500">
                    {ROLE_LABELS[entry.rola] || entry.rola}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 text-xs text-gray-600">
                  {entry.devices.map((device, idx) => {
                    const ip = ipBySessionId[device.session_id];
                    return (
                      <div key={`${device.session_id}-${idx}`}>
                        {device.device} · 📍{" "}
                        {ip ? formatGeo(geoByIp[ip]) : "…"} · online od{" "}
                        {formatTime(device.online_at)}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pregled svih */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            📱 Prijave i uređaji
          </h3>
          <p className="text-sm text-gray-500">
            Aktivne prijave osoblja po uređaju. Lokacija je približna (po IP
            adresi).
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Pretraži (email, uloga)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 sm:w-64"
          />
          <button
            type="button"
            onClick={fetchActivity}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {loading ? "Učitavanje..." : "Osvježi"}
          </button>
        </div>
      </div>

      {loading && staff.length === 0 ? (
        <p className="text-gray-500">Učitavanje...</p>
      ) : filteredStaff.length === 0 ? (
        <p className="text-gray-500">Nema osoblja koje odgovara pretrazi.</p>
      ) : (
        <div className="space-y-3">
          {filteredStaff.map((member) => {
            const lastActive = member.sessions?.[0]?.last_active;
            const isRecentlyActive =
              lastActive &&
              now - new Date(lastActive).getTime() < ACTIVE_WINDOW_MS;
            const isOnline = onlineUserIds.has(member.id);
            const canRevoke = member.rola !== "admin";

            return (
              <div
                key={member.id}
                className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                          isOnline ? "bg-emerald-500" : "bg-gray-300"
                        }`}
                        title={isOnline ? "Online" : "Offline"}
                      />
                      <span className="break-all font-semibold text-gray-900">
                        {member.email}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {ROLE_LABELS[member.rola] || member.rola}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Zadnja prijava: {formatDateTime(member.last_sign_in_at)}
                      {" · "}
                      {isOnline
                        ? "Online"
                        : isRecentlyActive
                          ? "Aktivan/na"
                          : `Zadnja aktivnost: ${timeAgo(lastActive, now)}`}
                    </div>
                  </div>
                  {canRevoke && member.sessions?.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setConfirm({ type: "all", member })}
                      className="shrink-0 whitespace-nowrap rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100"
                    >
                      Odjavi sa svih uređaja
                    </button>
                  )}
                </div>

                {member.sessions?.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {member.sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-col gap-2 rounded-lg bg-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 text-sm">
                          <div className="font-medium text-gray-900">
                            {parseUserAgent(s.user_agent)}
                          </div>
                          <div className="break-all text-xs text-gray-500">
                            📍 {formatGeo(geoByIp[s.ip])} · {s.ip || "-"} ·
                            aktivnost {timeAgo(s.last_active, now)}
                          </div>
                        </div>
                        {canRevoke && (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirm({ type: "session", member, session: s })
                            }
                            className="shrink-0 self-start whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-red-300 hover:text-red-600 sm:self-auto"
                          >
                            Odjavi
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-400">
                    Nije prijavljen/a ni na jednom uređaju.
                  </p>
                )}

                {member.push_devices?.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    🔔 Push:{" "}
                    {member.push_devices
                      .map((p) => describePushHost(p.endpoint_host))
                      .join(", ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-4 shadow-2xl shadow-black/10 sm:p-6">
            <h4 className="text-lg font-semibold text-gray-900">
              {confirm.type === "session"
                ? "Odjaviti uređaj?"
                : "Odjaviti sa svih uređaja?"}
            </h4>
            <p className="mt-2 text-sm text-gray-500">
              {confirm.type === "session" ? (
                <>
                  <span className="font-semibold">{confirm.member.email}</span>{" "}
                  će biti odjavljen/a s uređaja{" "}
                  {parseUserAgent(confirm.session.user_agent)}.
                </>
              ) : (
                <>
                  <span className="font-semibold">{confirm.member.email}</span>{" "}
                  će biti odjavljen/a sa svih uređaja, a push notifikacije će
                  mu/joj biti isključene.
                </>
              )}{" "}
              Uređaj može raditi još najviše oko sat vremena, nakon toga traži
              ponovnu prijavu.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={revoking}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Odustani
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={revoking}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {revoking ? "Odjavljivanje..." : "Odjavi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
