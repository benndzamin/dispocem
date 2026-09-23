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

const RINFUZA_SOURCE_CODES = {
  R1: ["S1", "S2"],
  R2: ["S3", "S4"],
  R3: ["S3", "S4"],
  R4: ["S5", "S6"],
};

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

const RINFUZA_VISUAL_MECHANISM = {
  R1: "tap",
  R2: "tap",
  R3: "hopper",
  R4: "cone",
};

// --- Ilustrovana scena (cijevi + kamion-cisterna) za admin/supervizor tab --
// Jedan SVG canvas po rinfuzi, geometrija fiksna (nije skalirana po metru -
// cilj je vizuelna čitljivost mehanizma, ne razmjera).
const SCENE_W = 460;
const SILO_W = 130;
const SILO_TOP = 44;
const SILO_H = 250;
const SILO_BOTTOM = SILO_TOP + SILO_H;
const MERGE_Y = 372;
const STEM_END_Y = 410;
const TRUCK_Y = 414;
const SCENE_H = 506;

const LEFT_X = 20;
const RIGHT_X = SCENE_W - 20 - SILO_W;
const LEFT_CX = LEFT_X + SILO_W / 2;
const RIGHT_CX = RIGHT_X + SILO_W / 2;
const MERGE_X = SCENE_W / 2;

const OK_COLOR = "#22c55e";
const BAD_COLOR = "#ef4444";
const NEUTRAL_COLOR = "#9ca3af";

function siloBodyPath(conical) {
  if (conical) {
    const cylH = SILO_H * (13 / 18);
    const x1 = (SILO_W - 24) / 2;
    const x2 = x1 + 24;
    return `M0,0 L${SILO_W},0 L${SILO_W},${cylH} L${x2},${SILO_H} L${x1},${SILO_H} L0,${cylH} Z`;
  }
  return `M0,0 L${SILO_W},0 L${SILO_W},${SILO_H} L0,${SILO_H} Z`;
}

function TankerTruck({ x, y }) {
  const w = 150;
  const h = 66;
  return (
    <g transform={`translate(${x - w / 2}, ${y})`}>
      <rect x="0" y={h - 8} width={w} height="6" rx="2" fill="#8b8f93" />
      <rect x="38" y="8" width="100" height="34" rx="17" fill="#e8c94a" stroke="#96811f" strokeWidth="1.5" />
      <rect x="46" y="12" width="84" height="4" rx="2" fill="#fff" opacity="0.5" />
      <rect x="4" y="6" width="34" height="30" rx="4" fill="#3d4a5c" />
      <rect x="8" y="10" width="24" height="12" rx="2" fill="#bcdbe6" />
      <circle cx="20" cy={h - 6} r="9" fill="#222" />
      <circle cx="60" cy={h - 6} r="9" fill="#222" />
      <circle cx="118" cy={h - 6} r="9" fill="#222" />
    </g>
  );
}

function SiloVisual({ silo, cx, stats, ok, hasData }) {
  const conical = !!silo.conical_height_m;
  const pct = stats?.pct ?? 0;
  const fillPx = pct * SILO_H;
  const path = siloBodyPath(conical);
  const clipId = `scene-clip-${silo.code}`;
  const gradId = `scene-grad-${silo.code}`;
  const statusColor = !hasData ? NEUTRAL_COLOR : ok ? OK_COLOR : BAD_COLOR;
  const x = cx - SILO_W / 2;

  return (
    <g transform={`translate(${x}, ${SILO_TOP})`}>
      <rect x={SILO_W / 2 - 34} y="-38" width="68" height="20" rx="4" fill="#eef0f1" stroke="#9ca3af" />
      <text x={SILO_W / 2} y="-24" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="11" fontWeight="700" fill="#374151">
        {stats ? `${fmt1(stats.avgEmpty)} m` : "0.0 m"}
      </text>
      <rect x={SILO_W / 2 - 10} y="-14" width="20" height="7" rx="2" fill="#4b5563" />

      <defs>
        <linearGradient id={gradId} x1="0" x2="1">
          <stop offset="0%" stopColor="#8c9195" />
          <stop offset="35%" stopColor="#c7cbcf" />
          <stop offset="50%" stopColor="#e9ebec" />
          <stop offset="65%" stopColor="#c7cbcf" />
          <stop offset="100%" stopColor="#8c9195" />
        </linearGradient>
        <clipPath id={clipId}>
          <path d={path} />
        </clipPath>
      </defs>
      <path d={path} fill={`url(#${gradId})`} stroke="#6b7280" strokeWidth="1.5" />
      {hasData && (
        <rect x="0" y={SILO_H - fillPx} width={SILO_W} height={fillPx} fill={statusColor} opacity="0.55" clipPath={`url(#${clipId})`} />
      )}
      <text x={SILO_W / 2} y="24" textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff">
        {silo.label}
      </text>
      <text x={SILO_W / 2} y="54" textAnchor="middle" fontSize="22" fontWeight="900" fill={statusColor}>
        {hasData ? `${Math.round(pct * 100)}%` : "—"}
      </text>

      <rect x={SILO_W / 2 - 34} y={SILO_H + 6} width="68" height="20" rx="4" fill="#eef0f1" stroke="#9ca3af" />
      <text x={SILO_W / 2} y={SILO_H + 20} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="11" fontWeight="700" fill="#374151">
        {stats ? `${fmt1(stats.tons)} t` : "— t"}
      </text>
    </g>
  );
}

function RinfuzaScene({ rinfuza, leftSilo, rightSilo, statsBySiloId }) {
  if (!leftSilo || !rightSilo) return null;
  const mechanism = RINFUZA_VISUAL_MECHANISM[rinfuza.code];
  const status = computeRinfuzaStatus(rinfuza, [leftSilo, rightSilo], statsBySiloId);
  const leftStats = statsBySiloId[leftSilo.id];
  const rightStats = statsBySiloId[rightSilo.id];
  const leftHasData = !!leftStats;
  const rightHasData = !!rightStats;
  const leftOk = status.contributingIds.includes(leftSilo.id);
  const rightOk = status.contributingIds.includes(rightSilo.id);
  const leftColor = !leftHasData ? NEUTRAL_COLOR : leftOk ? OK_COLOR : BAD_COLOR;
  const rightColor = !rightHasData ? NEUTRAL_COLOR : rightOk ? OK_COLOR : BAD_COLOR;
  const stemColor = !leftHasData && !rightHasData ? NEUTRAL_COLOR : status.ok ? OK_COLOR : BAD_COLOR;

  let leftPipeD;
  let rightPipeD;
  let extra = null;

  if (mechanism === "tap") {
    // R1/R2: cijev se fizički spaja na visini praga (npr. 12m odozgo), ne
    // na dnu silosa - baš kako je korisnik naglasio.
    const ratio = Number(rinfuza.threshold_empty_m) / Number(leftSilo.total_height_m);
    const tapY = SILO_TOP + ratio * SILO_H;
    leftPipeD = `M ${LEFT_X + SILO_W} ${tapY} L ${LEFT_X + SILO_W + 22} ${tapY} L ${MERGE_X} ${MERGE_Y}`;
    rightPipeD = `M ${RIGHT_X} ${tapY} L ${RIGHT_X - 22} ${tapY} L ${MERGE_X} ${MERGE_Y}`;
    extra = (
      <g>
        <circle cx={LEFT_X + SILO_W} cy={tapY} r="4.5" fill={leftColor} stroke="#374151" strokeWidth="1" />
        <circle cx={RIGHT_X} cy={tapY} r="4.5" fill={rightColor} stroke="#374151" strokeWidth="1" />
        <text x={MERGE_X} y={tapY - 10} textAnchor="middle" fontSize="9" fill="#9ca3af">
          prag {fmt1(Number(rinfuza.threshold_empty_m))} m odozgo
        </text>
      </g>
    );
  } else if (mechanism === "cone") {
    // R4: cijev direktno s dna konusa, bez praga.
    leftPipeD = `M ${LEFT_CX} ${SILO_BOTTOM} L ${LEFT_CX} ${SILO_BOTTOM + 36} L ${MERGE_X} ${MERGE_Y}`;
    rightPipeD = `M ${RIGHT_CX} ${SILO_BOTTOM} L ${RIGHT_CX} ${SILO_BOTTOM + 36} L ${MERGE_X} ${MERGE_Y}`;
  } else {
    // R3: diže se u male silose (hoppere) iznad cisterne, pa slobodni pad.
    const hopperTopY = SILO_TOP + 10;
    const hopperBottomY = SILO_TOP + 50;
    const hopper1X = MERGE_X - 35;
    const hopper2X = MERGE_X + 35;
    leftPipeD = `M ${LEFT_X + SILO_W} ${SILO_TOP + 20} L ${hopper1X} ${SILO_TOP + 20} L ${hopper1X} ${hopperTopY}`;
    rightPipeD = `M ${RIGHT_X} ${SILO_TOP + 20} L ${hopper2X} ${SILO_TOP + 20} L ${hopper2X} ${hopperTopY}`;
    extra = (
      <g>
        <polygon
          points={`${hopper1X - 16},${hopperTopY} ${hopper1X + 16},${hopperTopY} ${hopper1X + 8},${hopperBottomY} ${hopper1X - 8},${hopperBottomY}`}
          fill="#c7cbcf"
          stroke="#6b7280"
          strokeWidth="1.2"
        />
        <polygon
          points={`${hopper2X - 16},${hopperTopY} ${hopper2X + 16},${hopperTopY} ${hopper2X + 8},${hopperBottomY} ${hopper2X - 8},${hopperBottomY}`}
          fill="#c7cbcf"
          stroke="#6b7280"
          strokeWidth="1.2"
        />
        <path d={`M ${hopper1X} ${hopperBottomY} L ${MERGE_X} ${MERGE_Y}`} stroke={leftColor} strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d={`M ${hopper2X} ${hopperBottomY} L ${MERGE_X} ${MERGE_Y}`} stroke={rightColor} strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <svg width={SCENE_W} height={SCENE_H} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="mx-auto">
          <SiloVisual silo={leftSilo} cx={LEFT_CX} stats={leftStats} ok={leftOk} hasData={leftHasData} />
          <SiloVisual silo={rightSilo} cx={RIGHT_CX} stats={rightStats} ok={rightOk} hasData={rightHasData} />

          <path d={leftPipeD} stroke={leftColor} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={rightPipeD} stroke={rightColor} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M ${MERGE_X} ${MERGE_Y} L ${MERGE_X} ${STEM_END_Y}`} stroke={stemColor} strokeWidth="7" fill="none" strokeLinecap="round" />
          {extra}

          <TankerTruck x={MERGE_X} y={TRUCK_Y} />
          <text x={MERGE_X} y={TRUCK_Y - 8} textAnchor="middle" fontSize="14" fontWeight="800" fill="#111827">
            {rinfuza.label}
          </text>
          <text x={MERGE_X} y={SCENE_H - 8} textAnchor="middle" fontSize="12" fontWeight="700" fill={status.ok ? "#059669" : "#dc2626"}>
            {status.ok ? "✓ AKTIVNA" : "✗ NEDOVOLJNO"}
          </text>
        </svg>
      </div>
      <p className="mt-1 text-center text-[11px] text-gray-400">{RINFUZA_MECHANISM[rinfuza.code]}</p>
    </div>
  );
}

function AllSilosRow({ silos, statsBySiloId, readingsBySiloId, canEdit, onSubmit, savingCode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-6">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Svi silosi
      </div>
      <div className="flex flex-wrap justify-center gap-3">
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
    </div>
  );
}

// Kompaktna, ne-ilustrovana kartica - koristi je samo mill_operator ekran
// (RinfuzaRow), gdje je bitna brzina pregleda, ne vizuelni mehanizam.
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

function RinfuzaRow({ rinfuzeList, silosByCode, statsBySiloId }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-6">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Status rinfuza
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {rinfuzeList.map((rinfuza) => {
          const sourceSilos = (RINFUZA_SOURCE_CODES[rinfuza.code] || [])
            .map((c) => silosByCode[c])
            .filter(Boolean);
          return (
            <RinfuzaCard
              key={rinfuza.id}
              rinfuza={rinfuza}
              sourceSilos={sourceSilos}
              status={computeRinfuzaStatus(rinfuza, sourceSilos, statsBySiloId)}
            />
          );
        })}
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

      {canEdit ? (
        // Radniku na mlinu je bitno da unese sve silose brzo, bez skrolanja
        // kroz grupe po dva - svi silosi su u jednom redu, a status rinfuza
        // je posebna, kompaktna sekcija ispod.
        <div className="space-y-4">
          <AllSilosRow
            silos={silos}
            statsBySiloId={statsBySiloId}
            readingsBySiloId={readingsBySiloId}
            canEdit={canEdit}
            onSubmit={handleSubmitReading}
            savingCode={savingCode}
          />
          <RinfuzaRow rinfuzeList={rinfuze} silosByCode={silosByCode} statsBySiloId={statsBySiloId} />
        </div>
      ) : (
        // Admin/supervizor: ilustrovani cijevni prikaz po rinfuzi (cijevi +
        // kamion-cisterna), po uzoru na korisnikove referentne skice. S3/S4
        // se crtaju dva puta (za R2 i za R3) jer hrane obje rinfuze sa
        // različitim mehanizmom.
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {rinfuze.map((rinfuza) => {
            const [leftCode, rightCode] = RINFUZA_SOURCE_CODES[rinfuza.code] || [];
            return (
              <RinfuzaScene
                key={rinfuza.id}
                rinfuza={rinfuza}
                leftSilo={silosByCode[leftCode]}
                rightSilo={silosByCode[rightCode]}
                statsBySiloId={statsBySiloId}
              />
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        Mjerenje = prazan prostor od vrha silosa do površine cementa, u
        metrima. S1–S4: prosjek dvije tačke. S5–S6: jedna tačka, donjih 5 m je
        konusno dno s posebnom konstantom tona/metar.
        {!canEdit && " Unos je dozvoljen samo radniku na mlinu cementa."}
      </p>
    </div>
  );
}
