// Cista logika (bez React/Supabase importa) za sedmicni raspored prijema
// najava. Koriste je i AnnouncementForm.jsx (klijentska provjera prije
// slanja) i NoticeScheduleBanner.jsx / NoticeScheduleSettings.jsx (prikaz).

const WEEKDAY_ABBR = ["Pon", "Uto", "Sri", "Čet", "Pet", "Sub", "Ned"]; // index 0 = day_of_week 1 (ponedjeljak)
const ISO_WEEKDAY_BY_SHORT = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function stripSeconds(value) {
  return value ? value.slice(0, 5) : value;
}

// Grupise uzastopne dane sa identicnim (is_open, opens_at, closes_at) u jednu
// frazu - npr. "Pon–Čet: 07:00–15:00, Pet: neradni dan, Sub: 07:00–12:00,
// Ned: neradni dan". Nema posebne logike za "radni dani vs vikend" - ako
// supervizor ugasi Petak zbog praznika, to se automatski odvoji u svoju
// grupu.
export function formatScheduleText(rows) {
  if (!rows || rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) => a.day_of_week - b.day_of_week);

  const groups = [];
  for (const row of sorted) {
    const key = `${row.is_open}|${row.opens_at}|${row.closes_at}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.days.push(row.day_of_week);
    } else {
      groups.push({ key, days: [row.day_of_week], ...row });
    }
  }

  return groups
    .map((g) => {
      const first = WEEKDAY_ABBR[g.days[0] - 1];
      const last = WEEKDAY_ABBR[g.days[g.days.length - 1] - 1];
      const label = g.days.length === 1 ? first : `${first}–${last}`;
      if (!g.is_open) {
        return `${label}: ${g.days.length === 1 ? "neradni dan" : "neradni dani"}`;
      }
      return `${label}: ${stripSeconds(g.opens_at)}–${stripSeconds(g.closes_at)}`;
    })
    .join(", ");
}

// Racuna "danas"/"sada" u Europe/Sarajevo vremenskoj zoni, bez obzira na
// lokalnu vremensku zonu klijenta. Locale je eksplicitno "en-US" da string
// za dan u sedmici (Mon/Tue/...) ne ovisi o jeziku browsera. isoDow je
// 1=ponedjeljak...7=nedjelja, isto kao Postgres extract(isodow from ...).
export function getSarajevoNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Sarajevo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    isoDow: ISO_WEEKDAY_BY_SHORT[byType.weekday],
    hhmm: `${byType.hour.padStart(2, "0")}:${byType.minute.padStart(2, "0")}`,
  };
}

// Vraca poruku za blokiranje kupca ili null ako je unutar dozvoljenog
// prozora (ili raspored jos nije ucitan - fail-open, server trigger je
// stvarna odbrana).
export function getBuyerBlockMessage(rows, date = new Date()) {
  if (!rows || rows.length === 0) return null;

  const { isoDow, hhmm } = getSarajevoNowParts(date);
  const todayRule = rows.find((r) => r.day_of_week === isoDow);
  if (!todayRule) return null;

  if (!todayRule.is_open) {
    return "Poštovani, danas ne primamo najave.";
  }

  const opens = stripSeconds(todayRule.opens_at);
  const closes = stripSeconds(todayRule.closes_at);
  if (hhmm < opens || hhmm > closes) {
    return `Poštovani, vrijeme za najave je od ${opens} do ${closes}.`;
  }

  return null;
}

export { WEEKDAY_ABBR, stripSeconds };
