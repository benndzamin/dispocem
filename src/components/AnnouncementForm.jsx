import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function AnnouncementForm({ currentUser, onCreated, buyerProfile }) {
  const [vrstaCementa, setVrstaCementa] = useState("");
  const [datumPlaniranja, setDatumPlaniranja] = useState("");
  const [imeVozaca, setImeVozaca] = useState("");
  const [prezimeVozaca, setPrezimeVozaca] = useState("");
  const [registarskeOznake, setRegistarskeOznake] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const allowedCementTypes = buyerProfile?.dozvoljeni_artikli || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const payload = {
      created_by: currentUser?.id,
      firma: buyerProfile?.naziv_firme || "",
      vrsta_cementa: vrstaCementa,
      datum_planiranja_odpreme: datumPlaniranja,
      ime_vozaca: imeVozaca.trim() || null,
      prezime_vozaca: prezimeVozaca.trim() || null,
      registarske_oznake: registarskeOznake.trim() || null,
      status: "pending",
    };

    const { error } = await supabase.from("announcements").insert([payload]);
    setLoading(false);

    if (error) {
      setMessage("Greška pri kreiranju najave.");
      return;
    }

    setVrstaCementa("");
    setDatumPlaniranja("");
    setImeVozaca("");
    setPrezimeVozaca("");
    setRegistarskeOznake("");
    setMessage("Najava uspješno kreirana.");
    onCreated?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Nova najava otpreme</h3>
        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium select-none ${
          buyerProfile?.announcement_required 
            ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        }`}>
          Najava obavezna: {buyerProfile?.announcement_required ? "DA" : "NE"}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Firma</label>
          <input value={buyerProfile?.naziv_firme || ""} readOnly className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-300" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Vrsta cementa</label>
          <select value={vrstaCementa} onChange={(e) => setVrstaCementa(e.target.value)} required className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white">
            <option value="">Odaberi</option>
            {allowedCementTypes.length > 0 ? (
              allowedCementTypes.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))
            ) : (
              <option value="" disabled>Nemate dozvoljene vrste cementa</option>
            )}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Datum planiranja otpreme</label>
          <input type="date" value={datumPlaniranja} onChange={(e) => setDatumPlaniranja(e.target.value)} required className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Status</label>
          <input value="pending" readOnly className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-400" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Ime vozača</label>
          <input value={imeVozaca} onChange={(e) => setImeVozaca(e.target.value)} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Prezime vozača</label>
          <input value={prezimeVozaca} onChange={(e) => setPrezimeVozaca(e.target.value)} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Registarske oznake</label>
          <input value={registarskeOznake} onChange={(e) => setRegistarskeOznake(e.target.value)} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white" />
        </div>
      </div>

      {message && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">{message}</div>}

      <button type="submit" disabled={loading} className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white">
        {loading ? "Spremanje..." : "Kreiraj najavu"}
      </button>
    </form>
  );
}
