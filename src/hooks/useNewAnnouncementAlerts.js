import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const DISPLAY_MS = 60000;

export default function useNewAnnouncementAlerts(currentUserId, viewerRole) {
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
    const addAlert = (alert) => {
      setAlerts((prev) => [...prev, alert]);

      const timeoutId = setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
        timeoutsRef.current.delete(alert.id);
      }, DISPLAY_MS);
      timeoutsRef.current.set(alert.id, timeoutId);
    };

    const channel = supabase
      .channel(`new-announcement-alerts-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements" },
        (payload) => {
          const row = payload.new;
          if (!row || row.created_by === currentUserId) return;

          addAlert({
            id: row.id,
            type: "insert",
            row,
            message: `${row.firma || "Kupac"} je kreirao/la novu najavu za utovar (${row.vrsta_cementa}).`,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "announcements" },
        (payload) => {
          const row = payload.new;
          const oldRow = payload.old;
          const wasAwaitingApproval = oldRow?.status === "awaiting_approval";
          const isNowApproved = row?.status && row.status !== "awaiting_approval";
          if (!row || !wasAwaitingApproval || !isNowApproved) return;

          // Ova najava je do sad bila skrivena (čekala odobrenje) - sad
          // postaje vidljiva. Tretiramo je kao "insert" da uđe u tabelu.
          // Operateru se prikazuje toast, supervizoru samo tiho uđe u
          // tabelu (već ima svoju potvrdu iz ekrana za odobravanje).
          addAlert({
            id: row.id,
            type: "insert",
            row,
            message: `${row.firma || "Kupac"} — najava (${row.vrsta_cementa}) je odobrena, spremna za utovar.`,
            silent: viewerRole === "wb_supervisor",
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "announcement_deletions",
        },
        (payload) => {
          const row = payload.new;
          if (!row) return;

          // Ko god je obrisao najavu ne treba vidjeti toast o svojoj
          // vlastitoj akciji, a operateri ne treba da vide toast kad DRUGI
          // operater obrise najavu (peer buka) - ali red se i dalje mora
          // ukloniti iz njihove tabele, zato se alert i dalje dodaje, samo
          // bez poruke.
          const silent =
            row.deleted_by === currentUserId ||
            (viewerRole === "wb_operator" && row.deleted_by_role === "wb_operator");

          const who =
            row.deleted_by_role === "buyer" ? row.firma : row.deleted_by_label;

          addAlert({
            id: `deleted-${row.id}`,
            type: "delete",
            row: { id: row.announcement_id },
            message: `${who} je obrisao/la najavu za utovar (${row.vrsta_cementa}).`,
            silent,
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
  }, [currentUserId, viewerRole]);

  return { alerts, dismiss };
}
