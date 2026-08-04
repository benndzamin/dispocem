import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const DISPLAY_MS = 60000;

const STATUS_LABELS = {
  pending: "Na čekanju",
  in_progress: "U toku",
  completed: "Završeno",
};

export default function useMyAnnouncementAlerts(currentUserId) {
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
    if (!currentUserId) return;

    const addAlert = (alert) => {
      setAlerts((prev) => [...prev, alert]);

      const timeoutId = setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
        timeoutsRef.current.delete(alert.id);
      }, DISPLAY_MS);
      timeoutsRef.current.set(alert.id, timeoutId);
    };

    const channel = supabase
      .channel(`my-announcement-alerts-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "announcement_deletions",
        },
        (payload) => {
          const row = payload.new;
          if (!row || row.deleted_by === currentUserId) return;

          addAlert({
            id: row.id,
            type: "delete",
            row: { id: row.announcement_id },
            message: `Vaša najava (${row.vrsta_cementa}) je obrisana.`,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "announcements" },
        (payload) => {
          const row = payload.new;
          const oldRow = payload.old;
          if (!row || !oldRow || oldRow.status === row.status) return;

          const label = STATUS_LABELS[row.status] || row.status;

          addAlert({
            id: `status-${row.id}-${row.status}`,
            type: "update",
            row,
            message: `Vaša najava (${row.vrsta_cementa}) je sada: ${label}.`,
          });
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
