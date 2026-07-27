import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./components/Login";
import AdminDashboard from "./components/AdminDashboard";
import KupacDashboard from "./components/KupacDashboard";
import VagaSupervisor from "./components/VagaSupervisor";
import VagaOperator from "./components/VagaOperator";
import UserBadge from "./components/UserBadge";

export default function App() {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Provjeri trenutnu sesiju pri pokretanju
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
      else setLoading(false);
    });

    // 2. Slušaj promjene (Login / Logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
      else {
        setUserRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Funkcija za povlačenje role iz naše tabele korisnici_profile
  const fetchUserRole = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;
      setUserProfile(data);
      setUserRole(data?.rola || "buyer");
    } catch (err) {
      console.error("Greška pri dohvatanju role:", err.message);
      setUserProfile(null);
      setUserRole("buyer");
    } finally {
      setLoading(false);
    }
  };

  // Funkcija za Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white font-sans">
        <div className="text-sm uppercase tracking-widest text-slate-500 animate-pulse">
          Učitavanje sistema...
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  // Zajednički Layout sa Navigacijom / Logout dugmetom za ulogovane korisnike
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Glavni Top Bar sistema */}
      <header className="border-b border-slate-900 bg-slate-900/50 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white">
            DISPOCEM LOGISTICS
          </h1>
          <div className="mt-1.5 flex items-center gap-3">
            <UserBadge user={session.user} userProfile={userProfile} />
          </div>
        </div>

        {/* Profi Logout Button */}
        <button
          onClick={handleLogout}
          className="bg-slate-950 hover:bg-red-950 border border-slate-800 hover:border-red-900 text-slate-400 hover:text-red-400 text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-lg transition-all duration-200 cursor-pointer"
        >
          Odjavi se
        </button>
      </header>

      {/* Ruter ekrana u zavisnosti od role */}
      <main className="p-6">
        {userRole === "admin" && <AdminDashboard user={session?.user} />}

        {userRole === "wb_supervisor" && (
          <VagaSupervisor user={session?.user} />
        )}

        {userRole === "wb_operator" && <VagaOperator user={session?.user} />}

        {userRole === "buyer" && (
          <KupacDashboard user={session?.user} userProfile={userProfile} />
        )}
      </main>
    </div>
  );
}
