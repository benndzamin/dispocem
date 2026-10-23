import { useState } from "react";
import { supabase } from "../supabaseClient";

const TEMPLATES = [
  {
    label: "🔧 Rad na sistemu",
    title: "Rad na sistemu",
    message:
      "U toku su radovi na sistemu. Moguć je kraći prekid rada aplikacije.",
  },
  {
    label: "✅ Sistem ažuriran",
    title: "Sistem je ažuriran!",
    message:
      "Radovi su završeni, sistem je ažuriran. Osvježite aplikaciju da vidite izmjene.",
  },
];

export default function StaffNotification({
  showNotification = () => {},
  hideTopBorder = false,
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const applyTemplate = (template) => {
    setTitle(template.title);
    setMessage(template.message);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      showNotification("Unesite tekst obavijesti.", "error");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "send-staff-notification",
        { body: { title, message } },
      );
      if (error) {
        // Kod non-2xx odgovora stvarna poruka je u error.context (isto kao
        // StaffManagement).
        let errorMessage = error.message;
        if (typeof error.context?.json === "function") {
          try {
            const body = await error.context.json();
            if (body?.error) errorMessage = body.error;
          } catch {
            // tijelo nije JSON - zadrži generičku poruku
          }
        }
        throw new Error(errorMessage);
      }

      showNotification(
        data?.recipientsWithPush
          ? `Obavijest poslana (${data.recipientsWithPush} od ${data.recipients} osoba ima uključene notifikacije).`
          : "Niko od osoblja nema uključene push notifikacije.",
        data?.recipientsWithPush ? "success" : "error",
      );
      setTitle("");
      setMessage("");
    } catch (err) {
      showNotification(
        err.message || "Greška pri slanju obavijesti.",
        "error",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={`bg-white border-gray-200 p-3 sm:p-6 ${
        hideTopBorder ? "border-x border-b rounded-b-xl" : "border rounded-xl"
      }`}
    >
      <h3 className="text-lg font-bold text-gray-900 mb-2">
        🔔 Obavijest osoblju
      </h3>
      <p className="mb-4 text-sm text-gray-500">
        Push notifikacija za supervizore vage, voditelja prodaje i operatere
        vage (samo za one koji su uključili notifikacije). Kupci je ne
        dobijaju.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {TEMPLATES.map((template) => (
          <button
            key={template.label}
            type="button"
            onClick={() => applyTemplate(template)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:border-brand-red hover:bg-red-50"
          >
            {template.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs uppercase text-gray-500 font-semibold mb-1">
            Naslov
          </label>
          <input
            type="text"
            value={title}
            maxLength={60}
            placeholder="Obavijest sistema"
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
          />
        </div>

        <div>
          <label className="block text-xs uppercase text-gray-500 font-semibold mb-1">
            Poruka
          </label>
          <textarea
            required
            rows={3}
            maxLength={300}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark disabled:opacity-50 sm:w-auto"
          >
            {sending ? "Slanje..." : "Pošalji osoblju"}
          </button>
        </div>
      </form>
    </div>
  );
}
