import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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

function latestOf(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

// Dijalog "Vidi sve": zadnjih 20 prijava naloga (trajni log, ostaje i nakon
// odjave). Zamagljena pozadina; zatvara se na Esc, × ili klik van prozora.
function LoginHistoryDialog({ member, geoByIp, fetchGeo, version, onRevoke, onClose }) {
  const [logins, setLogins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_staff_logins", { p_user_id: member.id }).then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) {
        setError(err.message);
      } else {
        setLogins(data || []);
        fetchGeo((data || []).map((l) => l.ip));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // fetchGeo se ne mijenja smisleno između rendera - učitava se po nalogu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.id, version]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Prijave za ${member.email}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <div className="break-all text-base font-bold text-gray-900">Prijave · {member.email}</div>
            <div className="mt-0.5 text-xs text-gray-500">
              Zadnjih 20 prijava, od najnovije. Lokacija je približna (po IP adresi).
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zatvori"
            className="-mr-1 rounded-lg px-2 py-1 text-xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto">
          {loading && <div className="px-4 py-3 text-sm text-gray-500">Učitavanje...</div>}
          {error && <div className="px-4 py-3 text-sm text-red-700">Greška pri učitavanju prijava: {error}</div>}
          {!loading && !error && logins.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">Nema zabilježenih prijava.</div>
          )}
          <ul className="divide-y divide-gray-100">
            {logins.map((l) => (
              <li key={l.session_id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-gray-900">{formatDateTime(l.logged_in_at)}</span>
                  {l.is_active && (
                    <span className="flex items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        aktivna
                      </span>
                      {onRevoke && (
                        <button
                          type="button"
                          onClick={() => onRevoke(l)}
                          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-red-300 hover:text-red-600"
                        >
                          Odjavi
                        </button>
                      )}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-gray-700">{parseUserAgent(l.user_agent)}</div>
                <div className="mt-0.5 break-all text-xs text-gray-500">
                  📍 {formatGeo(geoByIp[l.ip])} · {l.ip || "-"}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Zatvori
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
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
  const [loginsMember, setLoginsMember] = useState(null); // dijalog "Vidi sve"
  const [loginsVersion, setLoginsVersion] = useState(0); // osvježi dijalog nakon odjave
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
      (data || []).flatMap((member) => [
        ...(member.sessions || []).map((s) => s.ip),
        member.last_login?.ip,
      ]),
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
    setLoginsVersion((v) => v + 1);
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
  const closeLogins = useCallback(() => setLoginsMember(null), []);

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
            // Najnovije od: aktivnost žive sesije i trajno zapamćena aktivnost.
            const lastActive = latestOf(
              member.sessions?.[0]?.last_active,
              member.last_seen_at,
            );
            const lastLogin = member.last_login;
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
                      {isOnline
                        ? "Online"
                        : isRecentlyActive
                          ? "Aktivan/na"
                          : `Zadnja aktivnost: ${timeAgo(lastActive, now)}`}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                      <span>
                        <span className="font-medium text-gray-700">Zadnja prijava:</span>{" "}
                        {lastLogin ? (
                          <>
                            {formatDateTime(lastLogin.logged_in_at)} ·{" "}
                            {parseUserAgent(lastLogin.user_agent)} · 📍{" "}
                            {formatGeo(geoByIp[lastLogin.ip])} ·{" "}
                            <span className="break-all">{lastLogin.ip || "-"}</span>
                          </>
                        ) : (
                          formatDateTime(member.last_sign_in_at)
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLoginsMember(member)}
                        className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Vidi sve
                      </button>
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

                {/* Pojedinačni uređaji (i "Odjavi" po uređaju) su u dijalogu "Vidi sve". */}
                <div className="mt-1 text-xs text-gray-400">
                  {member.sessions?.length > 0
                    ? `Trenutno prijavljen/a na ${member.sessions.length} ${
                        member.sessions.length === 1 ? "uređaju" : "uređaja"
                      }`
                    : "Trenutno nije prijavljen/a ni na jednom uređaju"}
                </div>

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

      {loginsMember && (
        <LoginHistoryDialog
          member={loginsMember}
          geoByIp={geoByIp}
          fetchGeo={fetchGeo}
          version={loginsVersion}
          onRevoke={
            loginsMember.rola !== "admin"
              ? (login) =>
                  setConfirm({
                    type: "session",
                    member: loginsMember,
                    session: { id: login.session_id, user_agent: login.user_agent },
                  })
              : null
          }
          onClose={closeLogins}
        />
      )}

      {confirm && (
        // z-[60]: potvrda odjave se otvara i iznad dijaloga "Vidi sve".
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 p-4">
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
