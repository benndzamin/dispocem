import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const DISPLAY_MS = 60000;

export default function useNewAnnouncementAlerts(currentUserId) {
  const [alerts, setAlerts] = useState([]);
  const timeoutsRef = useRef(new Map());

  const dismiss = (id) => {
    const timeoutId = timeoutsRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutsRef.current.delete(id);
    }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  useEffect(() => {
    const channel = supabase
      .channel(`new-announcement-alerts-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements" },
        (payload) => {
          const row = payload.new;
          if (!row || row.created_by === currentUserId) return;

          const alert = {
            id: row.id,
            row,
            message: `${row.firma || "Kupac"} je kreirao/la novu najavu za utovar (${row.vrsta_cementa}).`,
          };

          setAlerts((prev) => [...prev, alert]);

          const timeoutId = setTimeout(() => {
            setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
            timeoutsRef.current.delete(alert.id);
          }, DISPLAY_MS);
          timeoutsRef.current.set(alert.id, timeoutId);
        },
      )
      .subscribe();

    const timeouts = timeoutsRef.current;
    return () => {
      supabase.removeChannel(channel);
      timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      timeouts.clear();
    };
  }, [currentUserId]);

  return { alerts, dismiss };
}
