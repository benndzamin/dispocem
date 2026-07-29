import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg("Pogrešan email ili lozinka. Pokušajte ponovo.");
      setLoading(false);
      return;
    }

    if (data?.user?.id) {
      // Dohvati rolu iz baze umjesto da je određujemo po emailu
      const { data: userData } = await supabase
        .from("users")
        .select("rola")
        .eq("id", data.user.id)
        .single();

      const role = userData?.rola || "buyer";

      // Kreiraj profil ako ne postoji (default: buyer)
      await supabase.rpc("ensure_user_profile", {
        p_user_id: data.user.id,
        p_email: data.user.email,
        p_role: role,
        p_naziv_firme: "",
        p_adresa: "",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[url('/background-image.jpg')] bg-cover bg-center font-sans px-4">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl p-8 shadow-2xl">
        <div className="mb-8 flex items-center justify-center gap-4">
          <img src="/logo.png" alt="Lukavac Cement" className="h-24 w-auto" />
          <div>
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              DISPOCEM LOGISTICS
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Sistem za pametno upravljanje otpremom
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              E-mail adresa
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 transition-colors"
              placeholder="ime.prezime@firma.ba"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Lozinka
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-red hover:bg-brand-red-dark active:bg-brand-red-dark text-white font-medium py-3 rounded-lg transition-colors shadow-lg shadow-red-600/10 mt-2 disabled:opacity-50"
          >
            {loading ? "Povezivanje..." : "Prijavi se na sistem"}
          </button>
        </form>
      </div>
    </div>
  );
}
