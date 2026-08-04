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
      <div className="min-h-screen flex items-center justify-center bg-[url('/background-image.jpg')] bg-cover bg-center text-gray-900 font-sans">
        <div className="text-sm uppercase tracking-widest text-gray-500 animate-pulse">
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
    <div className="min-h-screen bg-[url('/background-image.jpg')] bg-cover bg-center bg-fixed text-gray-800 font-sans">
      {/* Glavni Top Bar sistema */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur h-20 flex items-center">
        <div className="flex h-full items-center gap-3">
          <img src="/logo.png" alt="Lukavac Cement" className="h-full w-auto" />
          <div>
            <h1 className="text-lg font-bold tracking-tight text-gray-900">
              DISPOCEM LOGISTICS
            </h1>
            <div className="mt-1.5 flex items-center gap-3">
              <UserBadge user={session.user} userProfile={userProfile} />

              {/* Profi Logout Button */}
              <button
                onClick={handleLogout}
                className="bg-white hover:bg-red-50 border border-gray-300 hover:border-brand-red text-gray-500 hover:text-brand-red text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer"
              >
                Odjavi se
              </button>
            </div>
          </div>
        </div>
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
