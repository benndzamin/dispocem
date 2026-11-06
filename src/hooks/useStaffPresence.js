import { useEffect } from "react";
import { supabase } from "../supabaseClient";
import {
  parseUserAgent,
  sessionIdFromAccessToken,
} from "../utils/device";

export const STAFF_PRESENCE_CHANNEL = "staff-online";

const STAFF_ROLES = [
  "admin",
  "wb_supervisor",
  "silo_viewer",
  "wb_operator",
  "mill_operator",
];

// Osoblje javlja da je online na privatnom kanalu 'staff-online' (RLS na
// realtime.messages pušta samo osoblje). Admin u tabu "Aktivnost" sluša isti
// kanal, ali se ne javlja (track) - da ne broji sam sebe.
const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000;

export default function useStaffPresence(session, userProfile) {
  const userId = session?.user?.id;
  const rola = userProfile?.rola;
  const accessToken = session?.access_token;
  const sessionId = accessToken ? sessionIdFromAccessToken(accessToken) : null;
  const isStaff = !!userId && STAFF_ROLES.includes(rola);

  // Trajni log prijava (jedna sesija = jedna prijava). Uređaj i IP server
  // čita iz auth.sessions; ponovljeni poziv za istu sesiju ne pravi duplikat.
  useEffect(() => {
    if (!isStaff || !sessionId) return;
    supabase.rpc("log_staff_login").then(({ error }) => {
      if (error) console.error("Snimanje prijave nije uspjelo:", error.message);
    });
  }, [isStaff, sessionId]);

  // "Zadnja aktivnost" koja ostaje i nakon odjave: odmah, svakih 5 min dok je
  // tab vidljiv, i pri povratku na tab.
  useEffect(() => {
    if (!isStaff) return;
    const touch = () => {
      if (document.visibilityState !== "visible") return;
      supabase.rpc("touch_last_seen").then(({ error }) => {
        if (error) console.error("Bilježenje aktivnosti nije uspjelo:", error.message);
      });
    };
    touch();
    const intervalId = window.setInterval(touch, LAST_SEEN_INTERVAL_MS);
    document.addEventListener("visibilitychange", touch);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", touch);
    };
  }, [isStaff, userId]);

  useEffect(() => {
    if (!userId || !STAFF_ROLES.includes(rola) || rola === "admin") return;

    const channel = supabase.channel(STAFF_PRESENCE_CHANNEL, {
      // enabled: true - presence se inače uključuje tek ako kanal ima
      // presence listener, a ovdje samo javljamo (track), ne slušamo.
      config: { private: true, presence: { key: userId, enabled: true } },
    });

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await channel.track({
        user_id: userId,
        email: session.user.email,
        rola,
        session_id: sessionIdFromAccessToken(accessToken),
        device: parseUserAgent(navigator.userAgent),
        online_at: new Date().toISOString(),
      });
    });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
    // accessToken se osvježava svaki sat - ne treba ponovo javljati prisustvo
    // (session_id ostaje isti).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, rola]);
}
