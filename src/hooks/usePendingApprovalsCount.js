import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import uniqueId from "../utils/uniqueId";

// Broji samo najave koje čekaju odobrenje i za čijeg kupca je trenutni
// korisnik "odgovorno lice" - lista odobrenja i dalje prikazuje sve.
// Vraća null dok prvi fetch ne završi, da DashboardTabs može razlikovati
// početno učitavanje od stvarno pristigle nove najave (blink badge-a).
export default function usePendingApprovalsCount(currentUserId) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;

    const isMine = (row) =>
      row?.status === "awaiting_approval" &&
      row?.odgovorno_lice_id === currentUserId;

    const fetchCount = async () => {
      const { count: total, error } = await supabase
        .from("announcements")
        .select("id", { count: "exact", head: true })
        .eq("status", "awaiting_approval")
        .eq("odgovorno_lice_id", currentUserId);
      if (!error && active) setCount(total ?? 0);
    };

    fetchCount();

    const channel = supabase
      .channel(`pending-approvals-count-${uniqueId()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements" },
        (payload) => {
          if (isMine(payload.new)) setCount((c) => (c ?? 0) + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "announcements" },
        (payload) => {
          // Pokriva i odobrenje i premještanje na drugo odgovorno lice.
          const wasMine = isMine(payload.old);
          const nowMine = isMine(payload.new);
          if (wasMine && !nowMine)
            setCount((c) => Math.max(0, (c ?? 0) - 1));
          else if (!wasMine && nowMine) setCount((c) => (c ?? 0) + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "announcements" },
        (payload) => {
          if (isMine(payload.old)) {
            setCount((c) => Math.max(0, (c ?? 0) - 1));
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return count;
}
