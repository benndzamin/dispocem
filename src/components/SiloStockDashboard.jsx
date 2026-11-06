import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
    // Konusno dno: zapremina konusa napunjenog do visine h (od vrha konusa
    // na dnu) raste sa h^3, pa je tona = punKonus * (h / H)^3. punKonus je
    // conical_height_m * conical_tons_per_meter (S5/S6: 5m * 10 = 50 t).
    // Iznad konusa je cilindar - linearno po metru (S5/S6: 450 t / 13 m).
    const coneHeight = Number(silo.conical_height_m);
    const coneFullTons = coneHeight * (Number(silo.conical_tons_per_meter) || 0);
    const cylRate = Number(silo.cylinder_tons_per_meter) || 0;
    tons =
      filledTotal <= coneHeight
        ? coneFullTons * Math.pow(Math.max(0, filledTotal) / coneHeight, 3)
        : coneFullTons + (filledTotal - coneHeight) * cylRate;
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

// Silos je prazan kad nema mjerenja ili kad je napunjeno <= 0,01 m (ista
// tolerancija kao u triggeru silo_reading_check_cement_grade u bazi).
const EMPTY_EPS = 0.01;
function isSiloEmpty(stats) {
  return !stats || stats.filledTotal <= EMPTY_EPS;
}

function gradeFullLabel(grade) {
  if (!grade) return null;
  return grade.brand ? `${grade.designation} ${grade.brand}` : grade.designation;
}

// Vrsta cementa po silosu: { grade, empty, canChange, needsGrade } po silo.id.
// Kroz context, da ga ilustrovane scene ne moraju provlačiti kroz props.
const SiloGradeContext = createContext({});

// Rinfuza je OK ako je BAREM JEDAN od njenih izvornih silosa ispunio uslov
// (prag ako postoji, inače "ima li imalo cementa").
function computeRinfuzaStatus(rinfuza, sourceSilos, statsBySiloId) {
  const contributing = sourceSilos.filter((silo) => {
    const stats = statsBySiloId[silo.id];
    if (!stats) return false;
    if (rinfuza.threshold_empty_m !== null && rinfuza.threshold_empty_m !== undefined) {
      return stats.avgEmpty < Number(rinfuza.threshold_empty_m);
    }
    return !isSiloEmpty(stats);
  });
  return { ok: contributing.length > 0, contributingIds: contributing.map((s) => s.id) };
}

// Dostupnost pojedinačnog silosa za datu rinfuzu (isti uslovi kao gore).
const AVAILABILITY = {
  ok: { label: "dostupan", color: "#22c55e", bg: "#dcfce7", text: "#047857" },
  bad: { label: "nedostupan", color: "#ef4444", bg: "#fee2e2", text: "#b91c1c" },
  none: { label: "bez mjerenja", color: "#9ca3af", bg: "#f3f4f6", text: "#6b7280" },
};

function siloAvailability(silo, stats, status) {
  if (!stats) return AVAILABILITY.none;
  return status.contributingIds.includes(silo.id) ? AVAILABILITY.ok : AVAILABILITY.bad;
}

const RINFUZA_SOURCE_CODES = {
  R1: ["S1", "S2"],
  R2: ["S3", "S4"],
  R3: ["S3", "S4"],
  R4: ["S5", "S6"],
};

// --- Vizuelni prikaz silosa (SVG, data-driven nivo popune) ------------------
const PPM = 9; // px po metru - crtano u razmjeri
const CYL_W = 92;
const CONE_BOTTOM_W = 24;

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
      <text
        x={CYL_W / 2}
        y={heightPx / 2 + 6}
        textAnchor="middle"
        fontSize="17"
        fontWeight="800"
        fill="#111827"
      >
        {stats ? `${Math.round(stats.pct * 100)}%` : "—"}
      </text>
      <MeasuredAt x={CYL_W / 2} y={heightPx / 2 + 22} recordedAt={stats?.recordedAt} fontSize={10} lineGap={13} />
    </svg>
  );
}

function fmt1(n) {
  return (Math.round(n * 10) / 10).toFixed(1);
}

// "Sada" koji se osvježava svakih 30s, da "prije X" teče u realnom vremenu.
function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function formatShortDateTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatAgo(iso, now) {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "upravo sada";
  if (mins < 60) return `prije ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `prije ${hours}h ${mins % 60}min`;
  const days = Math.floor(hours / 24);
  return `prije ${days}d ${hours % 24}h`;
}

// Dvije linije ispod procenta na silosu: kad je mjereno + koliko je prošlo.
function MeasuredAt({ x, y, recordedAt, fontSize = 11, lineGap = 14 }) {
  const now = useNow();
  if (!recordedAt) return null;
  return (
    <g fontSize={fontSize} fontWeight="600" fill="#374151" textAnchor="middle">
      <text x={x} y={y}>{formatShortDateTime(recordedAt)}</text>
      <text x={x} y={y + lineGap} fontWeight="700" fill="#1f2937">{formatAgo(recordedAt, now)}</text>
    </g>
  );
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

// Naziv vrste u dva reda: oznaka (CEM ...) sitno, skraćeni naziv podebljano.
function GradeLabel({ grade, muted = false }) {
  if (!grade) return null;
  return (
    <div className={`leading-tight ${muted ? "text-gray-400" : "text-gray-900"}`}>
      {grade.brand ? (
        <>
          <div className="text-[10px] font-medium">{grade.designation}</div>
          <div className="text-sm font-bold">{grade.brand}</div>
        </>
      ) : (
        <div className="text-xs font-bold">{grade.designation}</div>
      )}
    </div>
  );
}

// Prozor za izbor vrste: na telefonu se otvara odozdo, na računaru u sredini.
// Svaka vrsta je zaseban red: oznaka (CEM ...) sitno, skraćeni naziv krupno.
// Kroz portal na <body>, da ne naslijedi title-tooltip i širinu kartice.
function GradePickerModal({ silo, grades, currentGrade, saving, onConfirm, onClose }) {
  const [selectedId, setSelectedId] = useState(currentGrade?.id || null);
  const selected = grades.find((g) => g.id === selectedId) || null;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Vrsta cementa za ${silo.label}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div>
            <div className="text-base font-bold text-gray-900">Vrsta cementa · {silo.label}</div>
            <div className="mt-0.5 text-xs text-gray-500">
              {currentGrade ? `Posljednja: ${gradeFullLabel(currentGrade)}` : "Vrsta još nije postavljena"}
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

        <ul className="divide-y divide-gray-100 overflow-y-auto">
          {grades.map((g) => {
            const isSelected = g.id === selectedId;
            const isCurrent = g.id === currentGrade?.id;
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(g.id)}
                  className={`flex w-full items-center gap-3 border-l-4 px-4 py-3 text-left transition-colors ${
                    isSelected ? "border-brand-red bg-red-50" : "border-transparent hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      isSelected ? "border-brand-red" : "border-gray-300"
                    }`}
                  >
                    {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-brand-red" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    {g.brand ? (
                      <>
                        <span className="block text-xs text-gray-500">{g.designation}</span>
                        <span className="block text-base font-bold text-gray-900">{g.brand}</span>
                      </>
                    ) : (
                      <span className="block text-base font-bold text-gray-900">{g.designation}</span>
                    )}
                  </span>
                  {isCurrent && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      posljednja
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex gap-2 border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Odustani
          </button>
          <button
            type="button"
            disabled={!selected || saving}
            onClick={() => onConfirm(selected)}
            className="flex-1 rounded-lg bg-brand-red px-3 py-2 text-sm font-medium text-white hover:bg-brand-red-dark disabled:opacity-50"
          >
            {saving ? "Snimanje..." : "Potvrdi"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SiloGradeStatus({ info }) {
  const { grade, empty, needsGrade } = info;
  if (!empty) {
    return grade ? <GradeLabel grade={grade} /> : <div className="text-xs text-gray-400">Vrsta nije postavljena</div>;
  }
  return (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        Prazan{grade ? (needsGrade ? " · posljednja:" : " · odabrano:") : ""}
      </div>
      <GradeLabel grade={grade} muted={needsGrade} />
    </>
  );
}

function SiloCard({
  silo,
  stats,
  lastReading,
  canEdit,
  onSubmit,
  saving,
  gradeInfo,
  grades,
  onSetGrade,
  onShowHistory,
}) {
  const [point1, setPoint1] = useState("");
  const [point2, setPoint2] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const twoPoints = silo.measurement_points === 2;
  const totalHeight = Number(silo.total_height_m);
  const { grade, empty, canChange, needsGrade } = gradeInfo;
  // Dugme "Snimi" je ispod slike silosa, van <form>-a - veže se preko form id.
  const formId = `silo-form-${silo.code}`;

  const tooltip = lastReading
    ? `Zadnje mjerenje: ${lastReading.recorded_by_profile?.email || "nepoznato"} · ${formatDateTime(lastReading.recorded_at)}`
    : "Nema unesenih mjerenja";

  // Polja se brišu samo ako je snimanje uspjelo.
  const handleSubmit = async (e) => {
    e.preventDefault();
    const p1 = parseFloat(point1);
    const p2 = twoPoints ? parseFloat(point2) : null;
    if (Number.isNaN(p1) || (twoPoints && Number.isNaN(p2))) return;
    const ok = await onSubmit(silo, p1, p2);
    if (ok) {
      setPoint1("");
      setPoint2("");
    }
  };

  // "Prazan" = mjera pune visine na svakoj tački. Na već praznom silosu to
  // samo osvježava datum mjerenja (količina i posljednja vrsta ostaju iste).
  const handleEmpty = async () => {
    if (!empty && !window.confirm(`Označiti ${silo.label} kao prazan?`)) return;
    const ok = await onSubmit(silo, totalHeight, twoPoints ? totalHeight : null);
    if (ok) {
      setPoint1("");
      setPoint2("");
    }
  };

  // Potvrda je dugme "Potvrdi" u prozoru za izbor, pa nema dodatnog confirm-a.
  const handlePickGrade = async (g) => {
    const ok = await onSetGrade(silo, g);
    if (ok) setPickerOpen(false);
  };

  const inputClass =
    "w-full min-w-0 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-red-100 disabled:bg-gray-100 disabled:cursor-not-allowed";

  return (
    <div
      title={tooltip}
      className="flex w-[calc(50%-0.375rem)] shrink-0 flex-col items-center rounded-2xl border border-gray-200 bg-white p-3 sm:w-36"
    >
      <div className="text-sm font-bold text-gray-900">{silo.label}</div>

      <div className="mt-1 flex min-h-[2.5rem] w-full flex-col items-center justify-center text-center">
        <SiloGradeStatus info={gradeInfo} />
      </div>

      {canEdit && (
        <form id={formId} onSubmit={handleSubmit} className="mt-2 w-full">
          {twoPoints ? (
            <div className="flex gap-1">
              <input
                type="number"
                step="0.1"
                min="0"
                max={totalHeight}
                required
                disabled={needsGrade}
                placeholder="m"
                value={point1}
                onChange={(e) => setPoint1(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                step="0.1"
                min="0"
                max={totalHeight}
                required
                disabled={needsGrade}
                placeholder="m"
                value={point2}
                onChange={(e) => setPoint2(e.target.value)}
                className={inputClass}
              />
            </div>
          ) : (
            <input
              type="number"
              step="0.1"
              min="0"
              max={totalHeight}
              required
              disabled={needsGrade}
              placeholder="m"
              value={point1}
              onChange={(e) => setPoint1(e.target.value)}
              className={inputClass}
            />
          )}
        </form>
      )}

      <div className="mt-2">
        <SiloGraphic silo={silo} stats={stats} />
      </div>

      <div className="mt-2 text-center">
        <div className="font-mono text-lg font-semibold text-gray-900">
          {stats ? `${fmt1(stats.tons)} t` : "— t"}
        </div>
      </div>

      {canEdit && (
        <div className="mt-2 w-full space-y-1.5">
          {needsGrade && (
            <div className="text-center text-[11px] font-semibold text-amber-700">Prvo odaberite vrstu</div>
          )}
          <div className="flex gap-1.5">
            <button
              type="submit"
              form={formId}
              disabled={saving || needsGrade}
              className="flex-1 rounded-lg bg-brand-red px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-red-dark disabled:opacity-50"
            >
              {saving ? "..." : "Snimi"}
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              disabled={saving || !canChange}
              title={canChange ? "Odaberi vrstu cementa" : "Vrsta se mijenja samo kad je silos prazan"}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                needsGrade
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Vrsta
            </button>
          </div>

          {pickerOpen && canChange && (
            <GradePickerModal
              silo={silo}
              grades={grades}
              currentGrade={grade}
              saving={saving}
              onConfirm={handlePickGrade}
              onClose={() => setPickerOpen(false)}
            />
          )}

          <button
            type="button"
            onClick={handleEmpty}
            disabled={saving}
            className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Prazan
          </button>
          <button
            type="button"
            onClick={() => onShowHistory(silo.id)}
            className="w-full text-[11px] text-gray-500 underline hover:text-gray-700"
          >
            Historija
          </button>
        </div>
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

// R1/R2 (tap): pošto se Y-spoj sad dešava odmah kod tap-tačke, kamion se
// vozi bliže silosima nego kod R4 (kraći, kompaktniji canvas).
const TAP_TRUCK_Y = 340;
const TAP_STEM_END_Y = 336;
const TAP_SCENE_H = 412;

const LEFT_X = 20;
const RIGHT_X = SCENE_W - 20 - SILO_W;
const LEFT_CX = LEFT_X + SILO_W / 2;
const RIGHT_CX = RIGHT_X + SILO_W / 2;
const MERGE_X = SCENE_W / 2;

const OK_COLOR = "#22c55e";
const BAD_COLOR = "#ef4444";
const NEUTRAL_COLOR = "#9ca3af";

// S5/S6 (konusni) su nacrtani malo manji od S1-S4 - fizički su i niži (18m
// naspram 20m), a i korisnik je eksplicitno tražio da vizuelno budu manji.
const CONICAL_SCALE = 0.82;

function siloDims(silo) {
  const conical = !!silo.conical_height_m;
  const w = conical ? SILO_W * CONICAL_SCALE : SILO_W;
  const h = conical ? SILO_H * CONICAL_SCALE : SILO_H;
  return { conical, w, h, bottom: SILO_TOP + h };
}

function siloBodyPath(conical, w, h) {
  if (conical) {
    const cylH = h * (13 / 18);
    const coneBottomW = w * 0.19;
    const x1 = (w - coneBottomW) / 2;
    const x2 = x1 + coneBottomW;
    return `M0,0 L${w},0 L${w},${cylH} L${x2},${h} L${x1},${h} L0,${cylH} Z`;
  }
  return `M0,0 L${w},0 L${w},${h} L0,${h} Z`;
}

// Kamion-cisterna za rasuti cement, bočni pogled (kabina lijevo). Footprint
// je fiksan 150x66 i centriran na x - otvor za punjenje (dome) je tačno na
// sredini, ispod uspravne cijevi koja dolazi odozgo.
function TankerTruck({ x, y, id }) {
  const w = 150;
  const tankGrad = `tank-grad-${id}`;
  const cabGrad = `cab-grad-${id}`;
  const wheels = [22, 110, 130];

  return (
    <g transform={`translate(${x - w / 2}, ${y})`}>
      <defs>
        <linearGradient id={tankGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbe58a" />
          <stop offset="35%" stopColor="#ecc94b" />
          <stop offset="100%" stopColor="#a8861b" />
        </linearGradient>
        <linearGradient id={cabGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4b5d78" />
          <stop offset="100%" stopColor="#263244" />
        </linearGradient>
      </defs>

      {/* sjena */}
      <ellipse cx={w / 2} cy="65" rx="74" ry="2.5" fill="#000" opacity="0.15" />

      {/* šasija */}
      <rect x="6" y="45" width="140" height="5" rx="1.5" fill="#374151" />

      {/* ogradica/staza na vrhu cisterne */}
      <line x1="50" y1="3" x2="140" y2="3" stroke="#6b7280" strokeWidth="1.2" />
      {[50, 68, 104, 122, 140].map((px) => (
        <line key={px} x1={px} y1="3" x2={px} y2="8" stroke="#6b7280" strokeWidth="1.2" />
      ))}

      {/* izlazni konusi ispod cisterne + cijev za istovar */}
      <polygon points="62,34 86,34 79,45 69,45" fill="#b8961f" stroke="#7c6614" strokeWidth="1" />
      <polygon points="100,34 124,34 117,45 107,45" fill="#b8961f" stroke="#7c6614" strokeWidth="1" />
      <rect x="64" y="46.5" width="78" height="3" rx="1.5" fill="#9ca3af" stroke="#4b5563" strokeWidth="0.6" />

      {/* tijelo cisterne */}
      <rect x="42" y="7" width="102" height="31" rx="15.5" fill={`url(#${tankGrad})`} stroke="#7c6614" strokeWidth="1.5" />
      <rect x="50" y="11" width="86" height="3" rx="1.5" fill="#fff" opacity="0.5" />
      {[62, 93, 124].map((px) => (
        <line key={px} x1={px} y1="7.5" x2={px} y2="37.5" stroke="#8a6f17" strokeWidth="1.2" opacity="0.55" />
      ))}

      {/* otvori za punjenje (lijevi je ispod cijevi) */}
      <rect x="67" y="1" width="16" height="7" rx="2" fill="#d1d5db" stroke="#4b5563" strokeWidth="1" />
      <rect x="104" y="3" width="12" height="5" rx="1.5" fill="#d1d5db" stroke="#4b5563" strokeWidth="1" />

      {/* merdevine pozadi */}
      <line x1="145.5" y1="9" x2="145.5" y2="45" stroke="#4b5563" strokeWidth="1" />
      <line x1="149" y1="9" x2="149" y2="45" stroke="#4b5563" strokeWidth="1" />
      {[14, 21, 28, 35, 42].map((py) => (
        <line key={py} x1="145.5" y1={py} x2="149" y2={py} stroke="#4b5563" strokeWidth="1" />
      ))}

      {/* auspuh iza kabine */}
      <rect x="37" y="0" width="3" height="18" rx="1" fill="#6b7280" />

      {/* kabina */}
      <path d="M3,45 L3,25 Q3,19 8,17 L20,8 Q23,6 27,6 L39,6 L39,45 Z" fill={`url(#${cabGrad})`} stroke="#1f2937" strokeWidth="1" />
      <polygon points="8,21 20,11 26,11 26,21" fill="#bcdbe6" stroke="#1f2937" strokeWidth="0.6" />
      <rect x="28.5" y="11" width="8" height="10" rx="1" fill="#bcdbe6" stroke="#1f2937" strokeWidth="0.6" />
      <line x1="27.5" y1="22" x2="27.5" y2="42" stroke="#1f2937" strokeWidth="0.8" />
      <rect x="31" y="26" width="4" height="1.6" rx="0.8" fill="#d1d5db" />
      {[27, 30, 33].map((py) => (
        <line key={py} x1="4" y1={py} x2="9" y2={py} stroke="#9ca3af" strokeWidth="1" />
      ))}
      <rect x="3.5" y="35" width="4" height="3.5" rx="1" fill="#fde68a" stroke="#b45309" strokeWidth="0.5" />
      <rect x="1" y="40" width="11" height="5" rx="1.5" fill="#9ca3af" stroke="#4b5563" strokeWidth="0.6" />
      <line x1="8" y1="18" x2="5" y2="15" stroke="#1f2937" strokeWidth="1" />
      <rect x="2.5" y="11" width="3" height="6" rx="1" fill="#374151" />

      {/* blatobran iza zadnjeg točka */}
      <rect x="141" y="47" width="3" height="13" rx="1" fill="#1f2937" />

      {/* točkovi */}
      {wheels.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="56" r="9" fill="#1f2937" />
          <circle cx={cx} cy="56" r="5.5" fill="#9ca3af" stroke="#4b5563" strokeWidth="0.8" />
          <circle cx={cx} cy="56" r="1.8" fill="#4b5563" />
        </g>
      ))}
    </g>
  );
}

// Indikator dostupnosti iznad kamiona - lijevi silos lijevo od uspravne
// cijevi, desni desno od nje, da cijev ne prelazi preko teksta.
const CHIP_H = 26;
const CHIP_GAP = 10; // razmak od ose cijevi do chipa

function chipWidth(text) {
  return 34 + text.length * 7.6;
}

function SiloChip({ x, y, silo, availability, anchor }) {
  const text = `${silo.code} ${availability.label}`;
  const w = chipWidth(text);
  const left = anchor === "end" ? x - w : x;
  return (
    <g transform={`translate(${left}, ${y})`}>
      <rect width={w} height={CHIP_H} rx={CHIP_H / 2} fill={availability.bg} stroke={availability.color} strokeWidth="1.5" />
      <circle cx="14" cy={CHIP_H / 2} r="5" fill={availability.color} />
      <text x="25" y={CHIP_H / 2 + 4.5} fontSize="13" fontWeight="700" fill={availability.text}>
        {text}
      </text>
    </g>
  );
}

// Na telefonu se scena smanjuje (viewBox), pa bi SVG chipovi bili sitni -
// tu se sakrivaju i umjesto njih ispod scene ide HTML AvailabilityPills.
function SiloChips({ cx, y, leftSilo, rightSilo, statsBySiloId, status }) {
  return (
    <g className="hidden sm:inline">
      <SiloChip
        x={cx - CHIP_GAP}
        y={y}
        silo={leftSilo}
        availability={siloAvailability(leftSilo, statsBySiloId[leftSilo.id], status)}
        anchor="end"
      />
      <SiloChip
        x={cx + CHIP_GAP}
        y={y}
        silo={rightSilo}
        availability={siloAvailability(rightSilo, statsBySiloId[rightSilo.id], status)}
        anchor="start"
      />
    </g>
  );
}

// Svaka rinfuza je u svojoj kartici (okvir + blaga pozadina) da se jasno
// odvoji od susjednih.
const SCENE_CARD = "rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4";

// Naziv rinfuze kao naslov iznad scene (HTML, čitljiv i kad se SVG smanji).
function SceneTitle({ label }) {
  return <div className="mb-2 text-center text-lg font-bold text-gray-900">{label}</div>;
}

// Kvadrat s vrstom cementa na sredini silosa (između vremena mjerenja i
// tonaže). Prazan silos: zasivljen, sa "posljednje:" iznad naziva.
function SiloGradeBox({ w, h, info }) {
  const grade = info?.grade;
  const muted = !grade || info.empty;

  const lines = [];
  if (!grade) {
    lines.push({ text: "—", size: 14, weight: 800 });
  } else {
    if (info.empty) lines.push({ text: "posljednje:", size: 9, weight: 600 });
    if (grade.brand) {
      lines.push({ text: grade.designation, size: 10, weight: 600 });
      lines.push({ text: grade.brand, size: 13, weight: 800 });
    } else {
      lines.push({ text: grade.designation, size: 12, weight: 800 });
    }
  }

  const pad = 4;
  const boxW = w - 12;
  const maxTextW = boxW - 8;
  const boxH = lines.reduce((sum, l) => sum + l.size + 3, 0) + pad * 2;
  // Između donjeg reda "prije X" (~y 90) i polja tonaže (h*0.8 - 11).
  const centerY = (98 + (h * 0.8 - 11)) / 2;
  const top = centerY - boxH / 2;

  let y = top + pad;
  return (
    <g>
      <rect
        x={(w - boxW) / 2}
        y={top}
        width={boxW}
        height={boxH}
        rx="5"
        fill={muted ? "#e5e7eb" : "#ffffff"}
        stroke={muted ? "#9ca3af" : "#374151"}
        strokeWidth="1.2"
      />
      {lines.map((l, i) => {
        y += l.size + 3;
        // Duži red od kvadrata se sabija (procjena širine ~0,6 * font po znaku).
        const tooWide = l.text.length * l.size * 0.6 > maxTextW;
        return (
          <text
            key={i}
            x={w / 2}
            y={y - 3}
            textAnchor="middle"
            fontSize={l.size}
            fontWeight={l.weight}
            fill={muted ? "#6b7280" : "#111827"}
            {...(tooWide ? { textLength: maxTextW, lengthAdjust: "spacingAndGlyphs" } : {})}
          >
            {l.text}
          </text>
        );
      })}
    </g>
  );
}

function SiloVisual({ silo, cx, stats, ok, hasData }) {
  const gradeInfo = useContext(SiloGradeContext)[silo.id];
  const { conical, w, h } = siloDims(silo);
  const pct = stats?.pct ?? 0;
  const fillPx = pct * h;
  const path = siloBodyPath(conical, w, h);
  const clipId = `scene-clip-${silo.code}`;
  const gradId = `scene-grad-${silo.code}`;
  const statusColor = !hasData ? NEUTRAL_COLOR : ok ? OK_COLOR : BAD_COLOR;
  const x = cx - w / 2;

  return (
    <g transform={`translate(${x}, ${SILO_TOP})`}>
      <rect x={w / 2 - 34} y="-38" width="68" height="20" rx="4" fill="#eef0f1" stroke="#9ca3af" />
      <text x={w / 2} y="-24" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="11" fontWeight="700" fill="#374151">
        {stats ? `${fmt1(stats.avgEmpty)} m` : "0.0 m"}
      </text>
      <rect x={w / 2 - 10} y="-14" width="20" height="7" rx="2" fill="#4b5563" />

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
        <rect x="0" y={h - fillPx} width={w} height={fillPx} fill={statusColor} opacity="0.55" clipPath={`url(#${clipId})`} />
      )}
      <text x={w / 2} y="27" textAnchor="middle" fontSize="20" fontWeight="800" fill="#fff">
        {silo.label}
      </text>
      <text x={w / 2} y="54" textAnchor="middle" fontSize="18" fontWeight="900" fill="#111827">
        {hasData ? `${Math.round(pct * 100)}%` : "—"}
      </text>
      <MeasuredAt x={w / 2} y={72} recordedAt={stats?.recordedAt} />
      <SiloGradeBox w={w} h={h} info={gradeInfo} />

      {/* Tonaža - u donjoj vizuelnoj četvrtini silosa (80% visine), uvećano
          polje; pozicija je na 80% (ne dublje) da polje ostane unutar pune
          širine i kod konusnog dna S5/S6. */}
      <rect x={w / 2 - 36} y={h * 0.8 - 11} width="72" height="22" rx="4" fill="#eef0f1" stroke="#9ca3af" />
      <text x={w / 2} y={h * 0.8 + 4} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="12" fontWeight="700" fill="#374151">
        {stats ? `${fmt1(stats.tons)} t` : "— t"}
      </text>
    </g>
  );
}

// R3: cement izlazi s DNA oba silosa, ide zajedničkim donjim vodom, diže se
// (elevator/riser) do visine iznad cisterne, pa se preko gornjeg voda
// raspoređuje u dva mala hoppera, odakle slobodnim padom ide u cisternu.
// Silosi su namjerno jedan pored drugog (desno), hopperi+kamion su lijevo -
// korisnikova tačna referentna skica.
// Hopperi+kamion su pomaknuti udesno (a silosi+dizalica još više), da
// chipovi dostupnosti iznad kamiona stanu između ivice i dizalice.
const HOPPER_W = 680;
const HOPPER_H = 386;
const HOPPER_SILO_LEFT_CX = 440;
const HOPPER_SILO_RIGHT_CX = 580;
const HOPPER_Y_BOTTOM = SILO_BOTTOM + 32;
const HOPPER_RISER_X = 340;
const HOPPER_HEADER_Y = 122;
const HOPPER1_X = 130;
const HOPPER2_X = 210;
const HOPPER_TOP_Y = 164;
const HOPPER_BOTTOM_Y = 234;
const HOPPER_MERGE_X = 170;
const HOPPER_MERGE_Y = 254;
const HOPPER_STEM_END_Y = 310;
const HOPPER_TRUCK_Y = 314;
const VALVE_COLOR = "#c0392b";

function HopperScene({ rinfuza, leftSilo, rightSilo, leftStats, rightStats, leftHasData, rightHasData, leftOk, rightOk, leftColor, rightColor, stemColor, status }) {
  const leftDropD = `M ${HOPPER_SILO_LEFT_CX} ${SILO_BOTTOM} L ${HOPPER_SILO_LEFT_CX} ${HOPPER_Y_BOTTOM}`;
  const rightDropD = `M ${HOPPER_SILO_RIGHT_CX} ${SILO_BOTTOM} L ${HOPPER_SILO_RIGHT_CX} ${HOPPER_Y_BOTTOM} L ${HOPPER_SILO_LEFT_CX} ${HOPPER_Y_BOTTOM}`;
  // Zajednički dio: od spoja silosa, kroz dizalicu, cijelim gornjim vodom
  // (do iznad OBA hoppera) - oba izvora su se već spojila, boja je po
  // ukupnom statusu rinfuze. Header pokriva x od riser-a do hopper1 (koji
  // je krajnja tačka), pa "prolazi kroz" i tačku iznad hopper2 usput -
  // zato grane ispod ne smiju ponovo crtati taj vodoravni dio (to je
  // ranije stvaralo lažnu vodoravnu liniju u boji pogrešnog silosa).
  const sharedD = `M ${HOPPER_SILO_LEFT_CX} ${HOPPER_Y_BOTTOM} L ${HOPPER_RISER_X} ${HOPPER_Y_BOTTOM} L ${HOPPER_RISER_X} ${HOPPER_HEADER_Y} L ${HOPPER1_X} ${HOPPER_HEADER_Y}`;
  // Hopper 1 "pripada" lijevom silosu, hopper 2 desnom - samo kratak
  // uspravan spoj iznad svakog hoppera je obojen po statusu tog silosa
  // (plus dio od hoppera do spoja ka kamionu), bez ikakvog vodoravnog
  // segmenta.
  const leftBranchD = [
    `M ${HOPPER1_X} ${HOPPER_HEADER_Y} L ${HOPPER1_X} ${HOPPER_TOP_Y}`,
    `M ${HOPPER1_X} ${HOPPER_BOTTOM_Y} L ${HOPPER_MERGE_X} ${HOPPER_MERGE_Y}`,
  ].join(" ");
  const rightBranchD = [
    `M ${HOPPER2_X} ${HOPPER_HEADER_Y} L ${HOPPER2_X} ${HOPPER_TOP_Y}`,
    `M ${HOPPER2_X} ${HOPPER_BOTTOM_Y} L ${HOPPER_MERGE_X} ${HOPPER_MERGE_Y}`,
  ].join(" ");
  const stemD = `M ${HOPPER_MERGE_X} ${HOPPER_MERGE_Y} L ${HOPPER_MERGE_X} ${HOPPER_STEM_END_Y}`;

  return (
    <div className={SCENE_CARD}>
      <SceneTitle label={rinfuza.label} />
      <div>
        <svg
          width="100%"
          viewBox={`0 0 ${HOPPER_W} ${HOPPER_H}`}
          style={{ maxWidth: HOPPER_W, height: "auto" }}
          className="mx-auto block"
        >
          <SiloVisual silo={leftSilo} cx={HOPPER_SILO_LEFT_CX} stats={leftStats} ok={leftOk} hasData={leftHasData} />
          <SiloVisual silo={rightSilo} cx={HOPPER_SILO_RIGHT_CX} stats={rightStats} ok={rightOk} hasData={rightHasData} />

          <path d={sharedD} stroke={stemColor} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={leftBranchD} stroke={leftColor} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={rightBranchD} stroke={rightColor} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={stemD} stroke={stemColor} strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d={leftDropD} stroke={leftColor} strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d={rightDropD} stroke={rightColor} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={HOPPER_SILO_LEFT_CX} cy={SILO_BOTTOM} r="5" fill={VALVE_COLOR} stroke="#7f1d1d" strokeWidth="1" />
          <circle cx={HOPPER_SILO_RIGHT_CX} cy={SILO_BOTTOM} r="5" fill={VALVE_COLOR} stroke="#7f1d1d" strokeWidth="1" />

          <polygon
            points={`${HOPPER1_X - 26},${HOPPER_TOP_Y} ${HOPPER1_X + 26},${HOPPER_TOP_Y} ${HOPPER1_X + 13},${HOPPER_BOTTOM_Y} ${HOPPER1_X - 13},${HOPPER_BOTTOM_Y}`}
            fill="#c7cbcf"
            stroke="#6b7280"
            strokeWidth="1.2"
          />
          <polygon
            points={`${HOPPER2_X - 26},${HOPPER_TOP_Y} ${HOPPER2_X + 26},${HOPPER_TOP_Y} ${HOPPER2_X + 13},${HOPPER_BOTTOM_Y} ${HOPPER2_X - 13},${HOPPER_BOTTOM_Y}`}
            fill="#c7cbcf"
            stroke="#6b7280"
            strokeWidth="1.2"
          />

          <TankerTruck x={HOPPER_MERGE_X} y={HOPPER_TRUCK_Y} id={rinfuza.code} />
          <SiloChips
            cx={HOPPER_MERGE_X}
            y={HOPPER_TRUCK_Y - CHIP_H - 10}
            leftSilo={leftSilo}
            rightSilo={rightSilo}
            statsBySiloId={{ [leftSilo.id]: leftStats, [rightSilo.id]: rightStats }}
            status={status}
          />
        </svg>
      </div>
      <AvailabilityPills
        className="mt-2 flex-row flex-wrap justify-center sm:hidden"
        silos={[leftSilo, rightSilo]}
        statsBySiloId={{ [leftSilo.id]: leftStats, [rightSilo.id]: rightStats }}
        status={status}
      />
    </div>
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

  if (mechanism === "hopper") {
    return (
      <HopperScene
        rinfuza={rinfuza}
        leftSilo={leftSilo}
        rightSilo={rightSilo}
        leftStats={leftStats}
        rightStats={rightStats}
        leftHasData={leftHasData}
        rightHasData={rightHasData}
        leftOk={leftOk}
        rightOk={rightOk}
        leftColor={leftColor}
        rightColor={rightColor}
        stemColor={stemColor}
        status={status}
      />
    );
  }

  let leftPipeD;
  let rightPipeD;
  let extra;
  // R4 (kamion daleko, dug spoj kod dna) vs R1/R2 (Y-spoj je sad gore kod
  // tap-tačke, pa kamion smije biti bliže silosima - kraći canvas).
  let mergeYStart;
  let stemEndY;
  let truckY;
  let canvasH;
  let siloLeftCx = LEFT_CX;
  let siloRightCx = RIGHT_CX;

  if (mechanism === "tap") {
    // R1/R2: cijev se fizički spaja na visini praga (npr. 12m odozgo), ne
    // na dnu silosa - baš kako je korisnik naglasio.
    const ratio = Number(rinfuza.threshold_empty_m) / Number(leftSilo.total_height_m);
    const tapY = SILO_TOP + ratio * SILO_H;
    // Plići Y-spoj odmah kod ulaska u silos (tapY), pa tek onda kraća
    // uspravna cijev do (bližeg) kamiona.
    mergeYStart = tapY + 36;
    stemEndY = TAP_STEM_END_Y;
    truckY = TAP_TRUCK_Y;
    canvasH = TAP_SCENE_H;
    leftPipeD = `M ${LEFT_X + SILO_W} ${tapY} L ${LEFT_X + SILO_W + 22} ${tapY} L ${MERGE_X} ${mergeYStart}`;
    rightPipeD = `M ${RIGHT_X} ${tapY} L ${RIGHT_X - 22} ${tapY} L ${MERGE_X} ${mergeYStart}`;
    extra = (
      <g>
        <circle cx={LEFT_X + SILO_W} cy={tapY} r="4.5" fill={leftColor} stroke="#374151" strokeWidth="1" />
        <circle cx={RIGHT_X} cy={tapY} r="4.5" fill={rightColor} stroke="#374151" strokeWidth="1" />
        <text x={MERGE_X} y={tapY - 10} textAnchor="middle" fontSize="9" fill="#9ca3af">
          prag {fmt1(Number(rinfuza.threshold_empty_m))} m odozgo
        </text>
      </g>
    );
  } else {
    // R4: cijev direktno s dna konusa, bez praga. Konusni silosi su manji
    // (siloDims), pa se cijev spaja na njihovo stvarno (niže) dno. S5/S6 su
    // sastavljeni bliže jedan drugom, a dijagonala je kraća ali ISTOG nagiba
    // (ugla) kao prije - samo se skraćuje razmjerno manjoj vodoravnoj
    // udaljenosti do spoja.
    siloLeftCx = 150;
    siloRightCx = 310;
    const leftBottom = siloDims(leftSilo).bottom;
    const rightBottom = siloDims(rightSilo).bottom;
    // Kratak uspravni izlaz ispod konusa, pa dijagonala istog nagiba do
    // Y-spoja; kamion odmah ispod (ostavljeno tačno mjesta za chipove).
    const stubY = leftBottom + 14;
    const angleRatio = 87 / 145; // isti nagib kao originalna dijagonala
    const horizontal = MERGE_X - siloLeftCx;
    mergeYStart = stubY + horizontal * angleRatio;
    truckY = Math.round(mergeYStart + 46);
    stemEndY = truckY - 4;
    canvasH = truckY + 72;
    leftPipeD = `M ${siloLeftCx} ${leftBottom} L ${siloLeftCx} ${stubY} L ${MERGE_X} ${mergeYStart}`;
    rightPipeD = `M ${siloRightCx} ${rightBottom} L ${siloRightCx} ${stubY} L ${MERGE_X} ${mergeYStart}`;
  }

  return (
    <div className={SCENE_CARD}>
      <SceneTitle label={rinfuza.label} />
      <div>
        <svg
          width="100%"
          viewBox={`0 0 ${SCENE_W} ${canvasH}`}
          style={{ maxWidth: SCENE_W, height: "auto" }}
          className="mx-auto block"
        >
          <SiloVisual silo={leftSilo} cx={siloLeftCx} stats={leftStats} ok={leftOk} hasData={leftHasData} />
          <SiloVisual silo={rightSilo} cx={siloRightCx} stats={rightStats} ok={rightOk} hasData={rightHasData} />

          <path d={leftPipeD} stroke={leftColor} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={rightPipeD} stroke={rightColor} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M ${MERGE_X} ${mergeYStart} L ${MERGE_X} ${stemEndY}`} stroke={stemColor} strokeWidth="7" fill="none" strokeLinecap="round" />
          {extra}

          <TankerTruck x={MERGE_X} y={truckY} id={rinfuza.code} />
          <SiloChips
            cx={MERGE_X}
            y={truckY - CHIP_H - 10}
            leftSilo={leftSilo}
            rightSilo={rightSilo}
            statsBySiloId={statsBySiloId}
            status={status}
          />
        </svg>
      </div>
      <AvailabilityPills
        className="mt-2 flex-row flex-wrap justify-center sm:hidden"
        silos={[leftSilo, rightSilo]}
        statsBySiloId={statsBySiloId}
        status={status}
      />
    </div>
  );
}

function AllSilosRow({
  silos,
  statsBySiloId,
  readingsBySiloId,
  gradeInfoBySiloId,
  grades,
  canEdit,
  onSubmit,
  onSetGrade,
  onShowHistory,
  savingCode,
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-6">
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
            gradeInfo={gradeInfoBySiloId[silo.id]}
            grades={grades}
            onSetGrade={onSetGrade}
            onShowHistory={onShowHistory}
          />
        ))}
      </div>
    </div>
  );
}

const HISTORY_PAGE = 50;

function fetchHistoryPage(siloId, offset) {
  let query = supabase
    .from("silo_cement_changes")
    .select("id, silo_id, old_grade_id, new_grade_id, changed_by_email, changed_at")
    .order("changed_at", { ascending: false })
    .range(offset, offset + HISTORY_PAGE - 1);
  if (siloId) query = query.eq("silo_id", siloId);
  return query;
}

function GradeCell({ grade }) {
  if (!grade) return <span className="italic text-gray-400">nije postavljeno</span>;
  return <span>{gradeFullLabel(grade)}</span>;
}

// Historija promjena vrste cementa (ko, kada, šta je bilo, šta je postavljeno).
function SiloCementHistory({ silos, gradesById, filterSiloId, onFilterChange, version, sectionRef }) {
  const [rows, setRows] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  // Odgovor na stariji zahtjev (npr. prije promjene filtera) se ignoriše.
  const applyPage = (requestId, offset, { data, error: err }) => {
    if (requestId !== requestRef.current) return;
    if (err) {
      setError(err.message);
    } else {
      setError(null);
      setRows((prev) => (offset ? [...prev, ...data] : data));
      setHasMore(data.length === HISTORY_PAGE);
    }
    setLoading(false);
  };

  const loadMore = () => {
    const requestId = ++requestRef.current;
    const offset = rows.length;
    setLoading(true);
    fetchHistoryPage(filterSiloId, offset).then((res) => applyPage(requestId, offset, res));
  };

  // Pri promjeni filtera stari redovi ostaju vidljivi dok ne stignu novi.
  useEffect(() => {
    const requestId = ++requestRef.current;
    fetchHistoryPage(filterSiloId, 0).then((res) => applyPage(requestId, 0, res));
  }, [filterSiloId, version]);

  const siloLabel = (id) => silos.find((s) => s.id === id)?.label || "?";

  return (
    <div ref={sectionRef} className="scroll-mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Historija vrsta cementa</div>
        <select
          value={filterSiloId || ""}
          onChange={(e) => onFilterChange(e.target.value || null)}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand-red focus:outline-none"
        >
          <option value="">Svi silosi</option>
          {silos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="text-sm text-red-700">Greška pri učitavanju historije: {error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className="text-sm text-gray-500">Nema promjena vrste cementa.</div>
      )}

      {rows.length > 0 && (
        <>
          <table className="hidden w-full text-left text-sm sm:table">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="py-1 pr-3 font-semibold">Silos</th>
                <th className="py-1 pr-3 font-semibold">Bilo je</th>
                <th className="py-1 pr-3 font-semibold">Postavljeno</th>
                <th className="py-1 pr-3 font-semibold">Ko je promijenio</th>
                <th className="py-1 font-semibold">Kada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 pr-3 font-semibold text-gray-900">{siloLabel(r.silo_id)}</td>
                  <td className="py-1.5 pr-3 text-gray-600">
                    <GradeCell grade={gradesById[r.old_grade_id]} />
                  </td>
                  <td className="py-1.5 pr-3 font-medium text-gray-900">
                    <GradeCell grade={gradesById[r.new_grade_id]} />
                  </td>
                  <td className="py-1.5 pr-3 text-gray-700">{r.changed_by_email || "nepoznato"}</td>
                  <td className="py-1.5 whitespace-nowrap text-gray-700">{formatDateTime(r.changed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-2 sm:hidden">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-gray-900">{siloLabel(r.silo_id)}</span>
                  <span className="text-xs text-gray-500">{formatDateTime(r.changed_at)}</span>
                </div>
                <div className="mt-1 text-gray-600">
                  <GradeCell grade={gradesById[r.old_grade_id]} />
                </div>
                <div className="font-medium text-gray-900">
                  → <GradeCell grade={gradesById[r.new_grade_id]} />
                </div>
                <div className="mt-1 break-all text-xs text-gray-500">{r.changed_by_email || "nepoznato"}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {loading && <div className="mt-2 text-sm text-gray-500">Učitavanje...</div>}
      {hasMore && !loading && (
        <button
          type="button"
          onClick={loadMore}
          className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Učitaj još
        </button>
      )}
    </div>
  );
}

// HTML verzija indikatora dostupnosti (kartica radnika na mlinu + ispod
// scene na telefonu, gdje su SVG chipovi presitni).
function AvailabilityPills({ silos, statsBySiloId, status, className = "" }) {
  return (
    <div className={`flex gap-1.5 ${className}`}>
      {silos.map((s) => {
        const a = siloAvailability(s, statsBySiloId[s.id], status);
        return (
          <span
            key={s.id}
            className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-sm font-semibold"
            style={{ borderColor: a.color, backgroundColor: a.bg, color: a.text }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
            {s.code} {a.label}
          </span>
        );
      })}
    </div>
  );
}

// Kompaktna, ne-ilustrovana kartica - koristi je samo mill_operator ekran
// (RinfuzaRow), gdje je bitna brzina pregleda, ne vizuelni mehanizam.
function RinfuzaCard({ rinfuza, sourceSilos, status, statsBySiloId }) {
  return (
    <div className="w-full shrink-0 rounded-2xl border border-gray-200 bg-white p-3 sm:w-56">
      <div className="font-bold text-gray-900">{rinfuza.label}</div>
      <AvailabilityPills
        className="mt-2 flex-row flex-wrap sm:flex-col"
        silos={sourceSilos}
        statsBySiloId={statsBySiloId}
        status={status}
      />
    </div>
  );
}

function RinfuzaRow({ rinfuzeList, silosByCode, statsBySiloId }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-6">
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
              statsBySiloId={statsBySiloId}
            />
          );
        })}
      </div>
    </div>
  );
}

// Komponenta se montira iznova pri svakom otvaranju taba, pa zadnje učitane
// podatke držimo ovdje - ponovno otvaranje je trenutno, a osvježava se u pozadini.
let cache = null;
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") cache = null;
});

export default function SiloStockDashboard({ user, canEdit = false, hideTopBorder = false }) {
  const [silos, setSilos] = useState(cache?.silos || []);
  const [rinfuze, setRinfuze] = useState(cache?.rinfuze || []);
  const [readings, setReadings] = useState(cache?.readings || []);
  const [grades, setGrades] = useState(cache?.grades || []);
  const [gradeChanges, setGradeChanges] = useState(cache?.gradeChanges || []);
  const [loading, setLoading] = useState(!cache);
  const [message, setMessage] = useState(null);
  const [savingCode, setSavingCode] = useState(null);
  const [historySiloId, setHistorySiloId] = useState(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const historyRef = useRef(null);

  const fetchAll = async () => {
    if (!cache) setLoading(true);
    try {
      // Uz svaki silos dolazi samo njegovo zadnje mjerenje i zadnja promjena
      // vrste (limit 1 po silosu), umjesto cijele historije.
      const [silosRes, rinfuzeRes, gradesRes] = await Promise.all([
        supabase
          .from("silos")
          .select(
            "*, silo_readings(*, recorded_by_profile:users(email)), silo_cement_changes(id, silo_id, new_grade_id, changed_at)"
          )
          .order("code")
          .order("recorded_at", { referencedTable: "silo_readings", ascending: false })
          .limit(1, { referencedTable: "silo_readings" })
          .order("changed_at", { referencedTable: "silo_cement_changes", ascending: false })
          .limit(1, { referencedTable: "silo_cement_changes" }),
        supabase.from("rinfuze").select("*").order("code"),
        supabase.from("silo_cement_grades").select("*").order("sort_order"),
      ]);

      if (silosRes.error) throw silosRes.error;
      if (rinfuzeRes.error) throw rinfuzeRes.error;
      if (gradesRes.error) throw gradesRes.error;

      const silosData = silosRes.data || [];
      cache = {
        silos: silosData,
        rinfuze: rinfuzeRes.data || [],
        readings: silosData.flatMap((s) => s.silo_readings || []),
        grades: gradesRes.data || [],
        gradeChanges: silosData.flatMap((s) => s.silo_cement_changes || []),
      };
      setSilos(cache.silos);
      setRinfuze(cache.rinfuze);
      setReadings(cache.readings);
      setGrades(cache.grades);
      setGradeChanges(cache.gradeChanges);
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
    const stats = last ? computeSiloStats(silo, Number(last.avg_empty_m)) : null;
    statsBySiloId[silo.id] = stats ? { ...stats, recordedAt: last.recorded_at } : null;
  }

  // Ista pravila kao triggeri u bazi (20261106090000_silo_cement_grades.sql).
  const gradesById = Object.fromEntries(grades.map((g) => [g.id, g]));
  const changeBySiloId = Object.fromEntries(gradeChanges.map((c) => [c.silo_id, c]));
  const gradeInfoBySiloId = {};
  for (const silo of silos) {
    const change = changeBySiloId[silo.id];
    const last = readingsBySiloId[silo.id];
    const empty = isSiloEmpty(statsBySiloId[silo.id]);
    gradeInfoBySiloId[silo.id] = {
      grade: change ? gradesById[change.new_grade_id] || null : null,
      empty,
      // Vrsta se mijenja samo na praznom silosu (ili kad nikad nije postavljena).
      canChange: !change || empty,
      // Nakon pražnjenja mjera s materijalom traži vrstu odabranu POSLIJE pražnjenja.
      needsGrade:
        !change || (empty && !!last && new Date(change.changed_at) <= new Date(last.recorded_at)),
    };
  }

  const handleShowHistory = (siloId) => {
    setHistorySiloId(siloId);
    historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSetGrade = async (silo, grade) => {
    setSavingCode(silo.code);
    setMessage(null);
    try {
      const { error } = await supabase
        .from("silo_cement_changes")
        .insert([{ silo_id: silo.id, new_grade_id: grade.id, changed_by: user?.id }]);
      if (error) throw error;
      setMessage({ type: "success", text: `${silo.label}: postavljena vrsta ${gradeFullLabel(grade)}.` });
      setHistoryVersion((v) => v + 1);
      await fetchAll();
      return true;
    } catch (err) {
      setMessage({ type: "error", text: `Greška pri promjeni vrste: ${err.message}` });
      fetchAll();
      return false;
    } finally {
      setSavingCode(null);
    }
  };

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
      await fetchAll();
      return true;
    } catch (err) {
      setMessage({ type: "error", text: `Greška pri snimanju: ${err.message}` });
      // Stanje je možda zastarjelo (npr. drugi korisnik ispraznio silos).
      fetchAll();
      return false;
    } finally {
      setSavingCode(null);
    }
  };

  if (loading) {
    return (
      <div
        className={`bg-white p-3 sm:p-6 text-sm text-gray-500 ${
          hideTopBorder ? "rounded-b-2xl border-x border-b border-gray-200" : "rounded-2xl border border-gray-200"
        }`}
      >
        Učitavanje stanja silosa...
      </div>
    );
  }

  return (
    <SiloGradeContext.Provider value={gradeInfoBySiloId}>
    <div
      className={`space-y-4 bg-white p-3 sm:p-6 ${
        hideTopBorder ? "rounded-b-2xl border-x border-b border-gray-200" : "rounded-2xl border border-gray-200"
      }`}
    >
      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {canEdit ? (
        // Radniku na mlinu je bitno da unese sve silose brzo, bez skrolanja
        // kroz grupe po dva - svi silosi su u jednom redu, a status rinfuza
        // je posebna, kompaktna sekcija ispod.
        <div className="space-y-4">
          <AllSilosRow
            silos={silos}
            statsBySiloId={statsBySiloId}
            readingsBySiloId={readingsBySiloId}
            gradeInfoBySiloId={gradeInfoBySiloId}
            grades={grades}
            canEdit={canEdit}
            onSubmit={handleSubmitReading}
            onSetGrade={handleSetGrade}
            onShowHistory={handleShowHistory}
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

      <SiloCementHistory
        silos={silos}
        gradesById={gradesById}
        filterSiloId={historySiloId}
        onFilterChange={setHistorySiloId}
        version={historyVersion}
        sectionRef={historyRef}
      />
    </div>
    </SiloGradeContext.Provider>
  );
}
