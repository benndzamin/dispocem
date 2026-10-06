import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { formatScheduleText } from "../lib/noticeSchedule";

const DAY_LABELS = [
  { day_of_week: 1, label: "Ponedjeljak" },
  { day_of_week: 2, label: "Utorak" },
  { day_of_week: 3, label: "Srijeda" },
  { day_of_week: 4, label: "Četvrtak" },
  { day_of_week: 5, label: "Petak" },
  { day_of_week: 6, label: "Subota" },
  { day_of_week: 7, label: "Nedjelja" },
];

export default function NoticeScheduleSettings({
  user,
  showNotification = () => {},
  hideTopBorder = false,
}) {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  useEffect(() => {
    const fetchDays = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("notice_working_hours")
        .select("day_of_week, is_open, opens_at, closes_at")
        .order("day_of_week", { ascending: true });
      setLoading(false);
      if (error) {
        showNotification(
          "Greška pri učitavanju rasporeda: " + error.message,
          "error",
        );
        return;
      }
      setDays(data || []);
    };
    fetchDays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateDay = (dayOfWeek, patch) => {
    setDays((prev) =>
      prev.map((d) => (d.day_of_week === dayOfWeek ? { ...d, ...patch } : d)),
    );
  };

  const handleSaveSchedule = async () => {
    setSaving(true);
    // 7 nezavisnih update-a (jedan po redu) - namjerno NEMA insert/upsert:
    // notice_working_hours nema insert grant za authenticated (raspored se
    // nikad ne insertuje/brise iz aplikacije, samo edituje in-place).
    const results = await Promise.all(
      days.map((day) =>
        supabase
          .from("notice_working_hours")
          .update({
            is_open: day.is_open,
            opens_at: day.opens_at,
            closes_at: day.closes_at,
          })
          .eq("day_of_week", day.day_of_week),
      ),
    );
    setSaving(false);

    const firstError = results.find((r) => r.error)?.error;
    if (firstError) {
      showNotification(
        "Greška pri spremanju rasporeda: " + firstError.message,
        "error",
      );
      return;
    }
    showNotification("Raspored najava je sačuvan.");
  };

  const handleSendBroadcast = async () => {
    const trimmed = broadcastMessage.trim();
    if (!trimmed) {
      showNotification("Unesite tekst obavijesti.", "error");
      return;
    }

    setSendingBroadcast(true);
    const { error } = await supabase
      .from("notice_broadcasts")
      .insert([{ message: trimmed, created_by: user?.id }]);
    setSendingBroadcast(false);

    if (error) {
      showNotification(
        "Greška pri slanju obavijesti: " + error.message,
        "error",
      );
      return;
    }

    setBroadcastMessage("");
    showNotification("Obavijest je poslana kupcima.");

    supabase.functions
      .invoke("send-broadcast-notification", {
        body: { message: trimmed, actorUserId: user?.id },
      })
      .catch((err) =>
        console.error("Slanje push obavijesti nije uspjelo:", err),
      );
  };

  return (
    <div
      className={`bg-white border-gray-200 p-3 sm:p-6 ${
        hideTopBorder ? "border-x border-b rounded-b-xl" : "border rounded-xl"
      }`}
    >
      <div className="space-y-8">
        <section>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
            Raspored primanja najava
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Uključite/isključite dane i podesite vrijeme prijema najava. Za
            jednokratni praznik: isključite taj dan sada, uključite ga ponovo
            nakon praznika.
          </p>

          {!loading && (
            <div className="mt-4 space-y-2">
              {DAY_LABELS.map(({ day_of_week, label }) => {
                const day = days.find((d) => d.day_of_week === day_of_week);
                if (!day) return null;
                return (
                  <div
                    key={day_of_week}
                    className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <label className="flex w-40 items-center gap-2 text-sm font-medium text-gray-900">
                      <input
                        type="checkbox"
                        checked={day.is_open}
                        onChange={(e) =>
                          updateDay(day_of_week, { is_open: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-brand-red focus:ring-red-100"
                      />
                      {label}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={(day.opens_at || "").slice(0, 5)}
                        disabled={!day.is_open}
                        onChange={(e) =>
                          updateDay(day_of_week, { opens_at: e.target.value })
                        }
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 disabled:bg-gray-100 disabled:text-gray-400"
                      />
                      <span className="text-gray-400">–</span>
                      <input
                        type="time"
                        value={(day.closes_at || "").slice(0, 5)}
                        disabled={!day.is_open}
                        onChange={(e) =>
                          updateDay(day_of_week, { closes_at: e.target.value })
                        }
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 disabled:bg-gray-100 disabled:text-gray-400"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-4 text-xs text-gray-500">
            <span className="font-semibold text-gray-600">
              Pregled za kupce:{" "}
            </span>
            {formatScheduleText(days)}
          </p>

          <button
            type="button"
            onClick={handleSaveSchedule}
            disabled={saving || loading}
            className="mt-4 rounded-lg bg-brand-red hover:bg-brand-red-dark px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
          >
            {saving ? "Spremanje..." : "Sačuvaj raspored"}
          </button>
        </section>

        <section className="border-t border-gray-200 pt-6">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
            Obavijesti kupce
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Poruka će se odmah prikazati prijavljenim kupcima, a ostalima
            prilikom sljedeće prijave. Ne gasi se sama - kupac je mora
            potvrditi klikom na "Razumijem".
          </p>
          <textarea
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            rows={4}
            placeholder="Unesite tekst obavijesti za kupce..."
            className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
          />
          <button
            type="button"
            onClick={handleSendBroadcast}
            disabled={sendingBroadcast || !broadcastMessage.trim()}
            className="mt-3 rounded-lg bg-brand-red hover:bg-brand-red-dark px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
          >
            {sendingBroadcast ? "Slanje..." : "Pošalji obavijest"}
          </button>
        </section>
      </div>
    </div>
  );
}
