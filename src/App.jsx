import { useEffect, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { supabase } from "./supabaseClient";
import Login from "./components/Login";
import AdminDashboard from "./components/AdminDashboard";
import KupacDashboard from "./components/KupacDashboard";
import VagaSupervisor from "./components/VagaSupervisor";
import VagaOperator from "./components/VagaOperator";
import MillOperatorDashboard from "./components/MillOperatorDashboard";
import UserBadge from "./components/UserBadge";
import PushSubscribeButton from "./components/PushSubscribeButton";
import ChangePasswordButton from "./components/ChangePasswordButton";
import useStaffPresence from "./hooks/useStaffPresence";

export default function App() {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roleError, setRoleError] = useState("");
  // Korisnik za kojeg je profil učitan / se učitava - štiti od zastarjelih
  // odgovora i od ponovnog dohvatanja na svaki TOKEN_REFRESHED.
  const profileUserIdRef = useRef(null);
  useStaffPresence(session, userProfile);

  // Funkcija za povlačenje role iz naše tabele users
  const fetchUserRole = async (userId) => {
    profileUserIdRef.current = userId;
    setLoading(true);
    setRoleError("");
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    // U međuvremenu se prijavio drugi korisnik ili je došlo do odjave.
    if (profileUserIdRef.current !== userId) return;

    if (error || !data) {
      console.error("Greška pri dohvatanju role:", error?.message);
      // Ne pretpostavljamo ulogu ("buyer") - prikazujemo grešku s ponovnim
      // pokušajem, da osoblje ne dobije pogrešan ekran.
      setUserProfile(null);
      setUserRole(null);
      setRoleError(error?.message || "Profil nije pronađen.");
    } else {
      setUserProfile(data);
      setUserRole(data.rola || "buyer");
    }
    setLoading(false);
  };

  useEffect(() => {
    const handleSession = (nextSession) => {
      setSession(nextSession);
      const nextUserId = nextSession?.user?.id ?? null;

      if (!nextUserId) {
        profileUserIdRef.current = null;
        setUserProfile(null);
        setUserRole(null);
        setRoleError("");
        setLoading(false);
        return;
      }

      if (nextUserId !== profileUserIdRef.current) {
        // Odloženo izvan auth callbacka (preporuka Supabase-a - izbjegava
        // zastoj kad se iz callbacka zove drugi Supabase upit).
        setTimeout(() => fetchUserRole(nextUserId), 0);
      }
    };

    // 1. Provjeri trenutnu sesiju pri pokretanju
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    // 2. Slušaj promjene (Login / Logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Funkcija za Logout
  const handleLogout = async () => {
    // Push pretplata ovog uređaja je vezana za korisnika koji se odjavljuje -
    // brišemo je iz baze (dok je JWT još važeći), inače bi uređaj i dalje
    // primao njegove notifikacije. Browser pretplata ostaje, pa je sljedeći
    // korisnik (ili isti nakon ponovne prijave) automatski preuzima.
    try {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
        ]);
        const pushSubscription =
          await registration?.pushManager?.getSubscription();
        if (pushSubscription) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", pushSubscription.endpoint);
        }
      }
    } catch (err) {
      console.error("Uklanjanje push pretplate pri odjavi nije uspjelo:", err);
    }

    // "local": odjava samo s ovog uređaja. Podrazumijevani "global" je brisao
    // sesije na svim uređajima istog naloga (npr. zajednički nalog mlina).
    await supabase.auth.signOut({ scope: "local" });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[url('/background-image.jpg')] bg-cover bg-center text-gray-900 font-sans">
        <div className="text-sm uppercase tracking-widest text-gray-500 animate-pulse">
          Učitavanje sistema...
        </div>
        <Analytics />
      </div>
    );
  }

  if (session && roleError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[url('/background-image.jpg')] bg-cover bg-center text-gray-900 font-sans px-4">
        <div className="bg-white/95 border border-gray-200 rounded-xl p-6 max-w-sm w-full text-center space-y-4">
          <p className="text-sm text-gray-700">
            Nije moguće učitati vaš profil. Provjerite internet vezu i pokušajte
            ponovo.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => fetchUserRole(session.user.id)}
              className="bg-brand-red text-white text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-lg cursor-pointer"
            >
              Pokušaj ponovo
            </button>
            <button
              onClick={handleLogout}
              className="bg-white border border-gray-300 text-gray-600 text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-lg cursor-pointer"
            >
              Odjavi se
            </button>
          </div>
        </div>
        <Analytics />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <Login />
        <Analytics />
      </>
    );
  }

  // Zajednički Layout sa Navigacijom / Logout dugmetom za ulogovane korisnike
  return (
    <div className="min-h-screen bg-[url('/background-image.jpg')] bg-cover bg-center bg-fixed text-gray-800 font-sans">
      <Analytics />
      {/* Glavni Top Bar sistema */}
      <header className="relative z-40 h-16 border-b border-gray-200 sm:h-20">
        {/* Cement pozadina */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[url('/cement1.png')] bg-cover bg-center"
        />
        {/* Blagi bijeli preloj radi čitljivosti teksta preko slike */}
        <div aria-hidden="true" className="absolute inset-0 bg-white/45" />

        <div className="relative flex h-full items-center gap-4 pl-3 sm:gap-5 sm:pl-0">
          <img src="/logo.png" alt="Lukavac Cement" className="h-full w-auto" />
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-gray-900">
              DISPOCEM LOGISTICS
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:gap-3">
              <UserBadge user={session.user} userProfile={userProfile} />

              {(userProfile?.rola === "wb_supervisor" ||
                userProfile?.rola === "silo_viewer" ||
                userProfile?.rola === "wb_operator" ||
                userProfile?.rola === "buyer") && (
                <PushSubscribeButton userId={session.user.id} />
              )}

              {userProfile?.rola === "admin" && (
                <ChangePasswordButton email={session.user.email} />
              )}

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
      <main className="px-2 py-4 sm:p-6">
        {userRole === "admin" && <AdminDashboard user={session?.user} />}

        {userRole === "wb_supervisor" && (
          <VagaSupervisor user={session?.user} />
        )}

        {userRole === "wb_operator" && <VagaOperator user={session?.user} />}

        {userRole === "mill_operator" && (
          <MillOperatorDashboard user={session?.user} />
        )}

        {userRole === "silo_viewer" && (
          <VagaSupervisor user={session?.user} userRole="silo_viewer" />
        )}

        {userRole === "buyer" && (
          <KupacDashboard user={session?.user} userProfile={userProfile} />
        )}
      </main>
    </div>
  );
}
