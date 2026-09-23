import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// --- Formule iz specifikacije (vidi plan: Domenska specifikacija) ----------
// Ulaz je uvijek "prazan prostor mjeren odozgo, u metrima" (avgEmpty).
function computeSiloStats(silo, avgEmpty) {
  if (avgEmpty === null || avgEmpty === undefined || Number.isNaN(avgEmpty)) {
    return null;
  }
  const totalHeight = Number(silo.total_height_m);
  const filledTotal = totalHeight - avgEmpty;
  let tons;

  if (silo.conical_height_m) {
    const coneHeight = Number(silo.conical_height_m);
    const coneRate = Number(silo.conical_tons_per_meter) || 0;
    const cylRate = Number(silo.cylinder_tons_per_meter) || 0;
    tons =
      filledTotal <= coneHeight
        ? filledTotal * coneRate
        : coneHeight * coneRate + (filledTotal - coneHeight) * cylRate;
  } else {
    tons = filledTotal * (Number(silo.cylinder_tons_per_meter) || 0);
  }

  return {
    avgEmpty,
    filledTotal,
    tons: Math.max(0, tons),
    pct: Math.max(0, Math.min(1, filledTotal / totalHeight)),
  };
}

// Rinfuza je OK ako je BAREM JEDAN od njenih izvornih silosa ispunio uslov
// (prag ako postoji, inače "ima li imalo cementa").
function computeRinfuzaStatus(rinfuza, sourceSilos, statsBySiloId) {
  const contributing = sourceSilos.filter((silo) => {
    const stats = statsBySiloId[silo.id];
    if (!stats) return false;
    if (rinfuza.threshold_empty_m !== null && rinfuza.threshold_empty_m !== undefined) {
      return stats.avgEmpty < Number(rinfuza.threshold_empty_m);
    }
    return stats.filledTotal > 0.01;
  });
  return { ok: contributing.length > 0, contributingIds: contributing.map((s) => s.id) };
}

const RINFUZA_MECHANISM = {
  R1: "Direktna gravitacija · prag 12 m praznine",
  R2: "Direktna gravitacija · prag 12 m praznine",
  R3: "Dizanje u male silose + slobodni pad · bez praga",
  R4: "Dno konusnih silosa · bez praga",
};

// --- Vizuelni prikaz silosa (SVG, data-driven nivo popune) ------------------
const PPM = 7; // px po metru - crtano u razmjeri
const CYL_W = 74;
const CONE_BOTTOM_W = 20;

function siloOutlinePath(silo, heightPx) {
  if (silo.conical_height_m) {
    const cylH = (Number(silo.total_height_m) - Number(silo.conical_height_m)) * PPM;
    const x1 = (CYL_W - CONE_BOTTOM_W) / 2;
    const x2 = x1 + CONE_BOTTOM_W;
    return `M0,0 L${CYL_W},0 L${CYL_W},${cylH} L${x2},${heightPx} L${x1},${heightPx} L0,${cylH} Z`;
  }
  return `M0,0 L${CYL_W},0 L${CYL_W},${heightPx} L0,${heightPx} Z`;
}

function SiloGraphic({ silo, stats }) {
  const heightPx = Number(silo.total_height_m) * PPM;
  const path = siloOutlinePath(silo, heightPx);
  const pct = stats?.pct ?? 0;
  const fillPx = pct * heightPx;
  const clipId = `silo-clip-${silo.code}`;

  return (
    <svg width={CYL_W} height={heightPx} viewBox={`0 0 ${CYL_W} ${heightPx}`} className="shrink-0">
      <defs>
        <clipPath id={clipId}>
          <path d={path} />
        </clipPath>
      </defs>
      <path d={path} fill="#e5e7eb" stroke="#9ca3af" strokeWidth="1.5" />
      {stats && (
        <rect
          x="0"
          y={heightPx - fillPx}
          width={CYL_W}
          height={fillPx}
          fill="#b3a37f"
          clipPath={`url(#${clipId})`}
        />
      )}
    </svg>
  );
}

function fmt1(n) {
  return (Math.round(n * 10) / 10).toFixed(1);
}

function formatDateTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("bs-BA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SiloCard({ silo, stats, lastReading, canEdit, onSubmit, saving }) {
  const [point1, setPoint1] = useState("");
  const [point2, setPoint2] = useState("");
  const twoPoints = silo.measurement_points === 2;

  const tooltip = lastReading
    ? `Zadnje mjerenje: ${lastReading.recorded_by_profile?.email || "nepoznato"} · ${formatDateTime(lastReading.recorded_at)}`
    : "Nema unesenih mjerenja";

  const handleSubmit = (e) => {
    e.preventDefault();
    const p1 = parseFloat(point1);
    const p2 = twoPoints ? parseFloat(point2) : null;
    if (Number.isNaN(p1) || (twoPoints && Number.isNaN(p2))) return;
    onSubmit(silo, p1, p2);
    setPoint1("");
    setPoint2("");
  };

  return (
    <div
      title={tooltip}
      className="flex w-36 shrink-0 flex-col items-center rounded-2xl border border-gray-200 bg-white p-3"
    >
      <div className="text-sm font-bold text-gray-900">{silo.label}</div>

      <div className="mt-2">
        <SiloGraphic silo={silo} stats={stats} />
      </div>

      <div className="mt-2 text-center">
        <div className="font-mono text-lg font-semibold text-gray-900">
          {stats ? `${fmt1(stats.tons)} t` : "— t"}
        </div>
        <div className="text-xs text-gray-500">
          {stats ? `${Math.round(stats.pct * 100)}% popunjenosti` : "Nema mjerenja"}
        </div>
      </div>

      {canEdit && (
        <form onSubmit={handleSubmit} className="mt-3 w-full space-y-1.5">
          {twoPoints ? (
            <div className="flex gap-1">
              <input
                type="number"
                step="0.1"
                min="0"
                required
                placeholder="T1"
                value={point1}
                onChange={(e) => setPoint1(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-red-100"
              />
              <input
                type="number"
                step="0.1"
                min="0"
                required
                placeholder="T2"
                value={point2}
                onChange={(e) => setPoint2(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-red-100"
              />
            </div>
          ) : (
            <input
              type="number"
              step="0.1"
              min="0"
              required
              placeholder="Mjerenje (m)"
              value={point1}
              onChange={(e) => setPoint1(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-red-100"
            />
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-brand-red px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-brand-red-dark disabled:opacity-50"
          >
            {saving ? "Snimanje..." : "Snimi"}
          </button>
        </form>
      )}
    </div>
  );
}

function RinfuzaCard({ rinfuza, sourceSilos, status }) {
  return (
    <div
      className={`w-48 shrink-0 rounded-2xl border p-3 ${
        status.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-gray-900">{rinfuza.label}</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
            status.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          }`}
        >
          {status.ok ? "✓ AKTIVNA" : "✗ NEDOVOLJNO"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {sourceSilos.map((s) => (
          <span
            key={s.id}
            className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] ${
              status.contributingIds.includes(s.id)
                ? "border-emerald-300 text-emerald-700"
                : "border-gray-300 text-gray-500"
            }`}
          >
            {s.code}
          </span>
        ))}
      </div>
      <div className="mt-2 text-[11px] leading-snug text-gray-500">
        {RINFUZA_MECHANISM[rinfuza.code]}
      </div>
    </div>
  );
}

function Group({ title, siloCodes, rinfuzaCodes, silosByCode, rinfuzeByCode, statsBySiloId, readingsBySiloId, canEdit, onSubmit, savingCode }) {
  const silos = siloCodes.map((c) => silosByCode[c]).filter(Boolean);
  const rinfuze = rinfuzaCodes.map((c) => rinfuzeByCode[c]).filter(Boolean);

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-6">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        {silos.map((silo) => (
          <SiloCard
            key={silo.id}
            silo={silo}
            stats={statsBySiloId[silo.id]}
            lastReading={readingsBySiloId[silo.id]}
            canEdit={canEdit}
            onSubmit={onSubmit}
            saving={savingCode === silo.code}
          />
        ))}
      </div>
      <div className="my-3 text-center text-xs text-gray-400">↓ napaja ↓</div>
      <div className="flex flex-wrap justify-center gap-3">
        {rinfuze.map((rinfuza) => (
          <RinfuzaCard
            key={rinfuza.id}
            rinfuza={rinfuza}
            sourceSilos={silos}
            status={computeRinfuzaStatus(rinfuza, silos, statsBySiloId)}
          />
        ))}
      </div>
    </div>
  );
}

export default function SiloStockDashboard({ user, canEdit = false, hideTopBorder = false }) {
  const [silos, setSilos] = useState([]);
  const [rinfuze, setRinfuze] = useState([]);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [savingCode, setSavingCode] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [silosRes, rinfuzeRes, readingsRes] = await Promise.all([
        supabase.from("silos").select("*").order("code"),
        supabase.from("rinfuze").select("*").order("code"),
        supabase
          .from("silo_readings")
          .select("*, recorded_by_profile:users(email)")
          .order("recorded_at", { ascending: false }),
      ]);

      if (silosRes.error) throw silosRes.error;
      if (rinfuzeRes.error) throw rinfuzeRes.error;
      if (readingsRes.error) throw readingsRes.error;

      setSilos(silosRes.data || []);
      setRinfuze(rinfuzeRes.data || []);
      setReadings(readingsRes.data || []);
    } catch (err) {
      setMessage({ type: "error", text: `Greška pri učitavanju: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const silosByCode = Object.fromEntries(silos.map((s) => [s.code, s]));
  const rinfuzeByCode = Object.fromEntries(rinfuze.map((r) => [r.code, r]));

  // readings je već sortiran po recorded_at desc, pa je prvo pojavljivanje
  // po silo_id ujedno i zadnje mjerenje za taj silos.
  const readingsBySiloId = {};
  for (const r of readings) {
    if (!readingsBySiloId[r.silo_id]) readingsBySiloId[r.silo_id] = r;
  }

  const statsBySiloId = {};
  for (const silo of silos) {
    const last = readingsBySiloId[silo.id];
    statsBySiloId[silo.id] = last ? computeSiloStats(silo, Number(last.avg_empty_m)) : null;
  }

  const handleSubmitReading = async (silo, p1, p2) => {
    setSavingCode(silo.code);
    setMessage(null);
    try {
      const avg = silo.measurement_points === 2 ? (p1 + p2) / 2 : p1;
      const stats = computeSiloStats(silo, avg);
      const { error } = await supabase.from("silo_readings").insert([
        {
          silo_id: silo.id,
          point1_empty_m: p1,
          point2_empty_m: silo.measurement_points === 2 ? p2 : null,
          avg_empty_m: avg,
          computed_tons: stats.tons,
          recorded_by: user?.id,
        },
      ]);
      if (error) throw error;
      setMessage({ type: "success", text: `Mjerenje za ${silo.label} je snimljeno.` });
      fetchAll();
    } catch (err) {
      setMessage({ type: "error", text: `Greška pri snimanju: ${err.message}` });
    } finally {
      setSavingCode(null);
    }
  };

  if (loading) {
    return (
      <div
        className={`bg-white p-6 text-sm text-gray-500 ${
          hideTopBorder ? "rounded-b-2xl border-x border-b border-gray-200" : "rounded-2xl border border-gray-200"
        }`}
      >
        Učitavanje stanja silosa...
      </div>
    );
  }

  return (
    <div
      className={`bg-white p-4 sm:p-6 ${
        hideTopBorder ? "rounded-b-2xl border-x border-b border-gray-200" : "rounded-2xl border border-gray-200"
      }`}
    >
      {message && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${
            message.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>✓ zeleno — rinfuza radi</span>
        <span>✗ crveno — nedovoljno cementa</span>
        <span>Zadržite kursor preko silosa za zadnje mjerenje</span>
      </div>

      <div className="space-y-4">
        <Group
          title="Silosi S1–S2"
          siloCodes={["S1", "S2"]}
          rinfuzaCodes={["R1"]}
          silosByCode={silosByCode}
          rinfuzeByCode={rinfuzeByCode}
          statsBySiloId={statsBySiloId}
          readingsBySiloId={readingsBySiloId}
          canEdit={canEdit}
          onSubmit={handleSubmitReading}
          savingCode={savingCode}
        />
        <Group
          title="Silosi S3–S4"
          siloCodes={["S3", "S4"]}
          rinfuzaCodes={["R2", "R3"]}
          silosByCode={silosByCode}
          rinfuzeByCode={rinfuzeByCode}
          statsBySiloId={statsBySiloId}
          readingsBySiloId={readingsBySiloId}
          canEdit={canEdit}
          onSubmit={handleSubmitReading}
          savingCode={savingCode}
        />
        <Group
          title="Silosi S5–S6 · konusno dno"
          siloCodes={["S5", "S6"]}
          rinfuzaCodes={["R4"]}
          silosByCode={silosByCode}
          rinfuzeByCode={rinfuzeByCode}
          statsBySiloId={statsBySiloId}
          readingsBySiloId={readingsBySiloId}
          canEdit={canEdit}
          onSubmit={handleSubmitReading}
          savingCode={savingCode}
        />
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Mjerenje = prazan prostor od vrha silosa do površine cementa, u
        metrima. S1–S4: prosjek dvije tačke. S5–S6: jedna tačka, donjih 5 m je
        konusno dno s posebnom konstantom tona/metar.
        {!canEdit && " Unos je dozvoljen samo radniku na mlinu cementa."}
      </p>
    </div>
  );
}
