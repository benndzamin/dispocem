import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { supabase } from "../supabaseClient";

// Prosječna nosivost po utovaru - koristi se samo dok se ne uvede stvarno
// evidentiranje količine po najavi. Vidi napomenu ispod grafa u UI-ju.
const TONS_PER_RINFUZA = 27.6;
const TONS_PER_VRECE = 25.4;

const PERIODS = [
  { key: "7d", label: "7 dana", days: 7 },
  { key: "30d", label: "30 dana", days: 30 },
  { key: "3m", label: "3 mjeseca", days: 90 },
  { key: "6m", label: "6 mjeseci", days: 180 },
  { key: "1y", label: "Godina dana", days: 365 },
];

// Kategorijalna paleta (dataviz skill referentna paleta, slotovi 1-8).
const COLOR_RINFUZA = "#2a78d6";
const COLOR_VRECE = "#eb6834";
const COLOR_UKUPNO = "#1baf7a";
const EXTRA_PALETTE = ["#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

const SPECIAL_SERIES = [
  { id: "RINFUZA", label: "RINFUZA", color: COLOR_RINFUZA },
  { id: "VRECE", label: "VREĆE", color: COLOR_VRECE },
  { id: "UKUPNO", label: "UKUPNO", color: COLOR_UKUPNO },
];

function isBulkCement(name) {
  return /rinfuza/i.test(name || "");
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayLabel(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${m}`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function colorForType(id, allTypes) {
  const idx = allTypes.findIndex((t) => t.id === id);
  if (idx === -1) return "#898781";
  return EXTRA_PALETTE[idx % EXTRA_PALETTE.length];
}

export default function DispatchChart({ refreshKey }) {
  const [periodKey, setPeriodKey] = useState("7d");
  const [cementTypes, setCementTypes] = useState([]);
  const [selectedSeries, setSelectedSeries] = useState(
    () => new Set(["RINFUZA", "VRECE"]),
  );
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTypes = async () => {
      const { data, error } = await supabase
        .from("cement_types")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (!error) setCementTypes(data || []);
    };
    fetchTypes();
  }, []);

  useEffect(() => {
    let active = true;

    const fetchHistory = async () => {
      setLoading(true);
      const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[0];
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (period.days - 1));

      const { data, error } = await supabase
        .from("announcement_status_history")
        .select("announcement_id, changed_at, announcements(vrsta_cementa)")
        .eq("new_status", "completed")
        .gte("changed_at", start.toISOString());

      if (!active) return;
      setLoading(false);

      if (error) {
        console.error("Greška pri učitavanju istorije otpreme:", error);
        setRawRows([]);
        return;
      }
      setRawRows(data || []);
    };

    fetchHistory();
    return () => {
      active = false;
    };
  }, [periodKey, refreshKey]);

  const nameToId = useMemo(() => {
    const map = new Map();
    for (const t of cementTypes) map.set(t.name, t.id);
    return map;
  }, [cementTypes]);

  const chartData = useMemo(() => {
    const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[0];

    // Ako je najava iz bilo kog razloga više puta prešla u "completed",
    // računati samo poslednji prelaz - sprečava duplo brojanje.
    const latestByAnnouncement = new Map();
    for (const row of rawRows) {
      const existing = latestByAnnouncement.get(row.announcement_id);
      if (
        !existing ||
        new Date(row.changed_at) > new Date(existing.changed_at)
      ) {
        latestByAnnouncement.set(row.announcement_id, row);
      }
    }

    const buckets = new Map();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = period.days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = dateKey(d);
      buckets.set(key, {
        date: key,
        label: formatDayLabel(d),
        RINFUZA: 0,
        VRECE: 0,
        byType: {},
      });
    }

    for (const row of latestByAnnouncement.values()) {
      const vrsta = row.announcements?.vrsta_cementa;
      if (!vrsta) continue;
      const key = dateKey(new Date(row.changed_at));
      const bucket = buckets.get(key);
      if (!bucket) continue;

      const bulk = isBulkCement(vrsta);
      const perUnit = bulk ? TONS_PER_RINFUZA : TONS_PER_VRECE;
      if (bulk) bucket.RINFUZA += perUnit;
      else bucket.VRECE += perUnit;

      const typeId = nameToId.get(vrsta);
      if (typeId)
        bucket.byType[typeId] = (bucket.byType[typeId] || 0) + perUnit;
    }

    return Array.from(buckets.values()).map((b) => {
      const point = {
        date: b.date,
        label: b.label,
        RINFUZA: round1(b.RINFUZA),
        VRECE: round1(b.VRECE),
        UKUPNO: round1(b.RINFUZA + b.VRECE),
      };
      for (const typeId of selectedSeries) {
        if (point[typeId] === undefined) {
          point[typeId] = round1(b.byType[typeId] || 0);
        }
      }
      return point;
    });
  }, [rawRows, periodKey, selectedSeries, nameToId]);

  const toggleSeries = (id) => {
    setSelectedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-gray-50 p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Odprema cementa
          </h3>
          <p className="text-sm text-gray-500">
            Završeni utovari po danu, procjena u tonama.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriodKey(p.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                periodKey === p.key
                  ? "bg-brand-red text-white"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
        {SPECIAL_SERIES.map((s) => (
          <label
            key={s.id}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-800"
          >
            <input
              type="checkbox"
              checked={selectedSeries.has(s.id)}
              onChange={() => toggleSeries(s.id)}
              className="form-checkbox rounded border-gray-300 bg-white"
              style={{ accentColor: s.color }}
            />
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </label>
        ))}
      </div>

      {cementTypes.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-gray-200 pt-3">
          {cementTypes.map((type) => (
            <label
              key={type.id}
              className="flex items-center gap-1.5 text-xs text-gray-700"
            >
              <input
                type="checkbox"
                checked={selectedSeries.has(type.id)}
                onChange={() => toggleSeries(type.id)}
                className="form-checkbox rounded border-gray-300 bg-white"
                style={{ accentColor: colorForType(type.id, cementTypes) }}
              />
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: colorForType(type.id, cementTypes) }}
              />
              {type.name}
            </label>
          ))}
        </div>
      )}

      <div className="h-72 w-full">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Učitavanje...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#e1e0d9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#898781" }}
                axisLine={{ stroke: "#c3c2b7" }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#898781" }}
                axisLine={false}
                tickLine={false}
                width={40}
                label={{
                  value: "tone",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#898781",
                  fontSize: 11,
                }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e1e0d9",
                  fontSize: 12,
                }}
                formatter={(value, name) => [`${value} t`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {SPECIAL_SERIES.filter((s) => selectedSeries.has(s.id)).map(
                (s) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ),
              )}
              {cementTypes
                .filter((type) => selectedSeries.has(type.id))
                .map((type) => (
                  <Line
                    key={type.id}
                    type="monotone"
                    dataKey={type.id}
                    name={type.name}
                    stroke={colorForType(type.id, cementTypes)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
