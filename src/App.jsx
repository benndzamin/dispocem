import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Login from "./components/Login";
import KupacDashboard from "./components/KupacDashboard";
import AdminDashboard from "./components/AdminDashboard";
import VagaOperator from "./components/VagaOperator";
import VagaSupervisor from "./components/VagaSupervisor";

export default function App() {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Provjeri trenutnu aktivnu sesiju pri paljenju aplikacije
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
      else setLoading(false);
    });

    // 2. Slušaj uživo kad se korisnik loguje ili odjavi
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

  // Funkcija koja vuče tačnu rolu iz naše tabele na Supabase-u
  const fetchUserRole = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("korisnici_profile")
        .select("rola")
        .eq("id", userId)
        .single();

      if (!error && data) {
        setUserRole(data.rola);
      }
    } catch (err) {
      console.error("Greška pri povlačenju role:", err);
    } finally {
      setLoading(false);
    }
  };

  // Dok sistem provjerava tokene i bazu, prikaži čist loader
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-white font-sans">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-slate-400 tracking-wide">
            Inicijalizacija sistema...
          </p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Ako korisnik nije logovan, sve rute vode na Login. Ako jeste, ide na dashboard */}
        <Route
          path="/login"
          element={!session ? <Login /> : <Navigate to="/dashboard" />}
        />

        {/* Glavna dinamička kontrolna tačka */}
        <Route
          path="/dashboard"
          element={
            session ? (
              userRole === "admin" ? (
                <AdminDashboard />
              ) : userRole === "weightbridge_supervisor" ? (
                <VagaSupervisor />
              ) : userRole === "weightbridge_operator" ? (
                <VagaOperator />
              ) : (
                <KupacDashboard />
              )
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        {/* Sve ostale nepostojeće rute vraćaj nazad na početak */}
        <Route
          path="*"
          element={<Navigate to={session ? "/dashboard" : "/login"} />}
        />
      </Routes>
    </Router>
  );
}
