// crypto.randomUUID postoji samo na https/localhost - na http preko LAN IP
// (testiranje s telefona) je undefined, pa koristimo fallback.
export default function uniqueId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
