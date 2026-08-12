import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const STORAGE_PREFIX = "dispocem:notice-broadcast-seen:";

function getSeenId(userId) {
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

function setSeenId(userId, broadcastId) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, broadcastId);
  } catch {
    // localStorage nedostupan (npr. privatni mod) - dijalog ce se ponovo
    // prikazati sljedeci put, prihvatljivo za ovu funkcionalnost.
  }
}

// Prikazuje kupcu obavijesti koje supervizor posalje kroz "Obavijesti kupce".
// Dvije putanje isporuke: (1) na mount ucita zadnju poruku i prikaze je ako
// je kupac jos nije potvrdio, (2) realtime kanal (isti obrazac kao
// useMyAnnouncementAlerts.js) odmah prikaze novu poruku dok je kupac
// prijavljen, bez potrebe za refresh-om.
export default function useNoticeBroadcast(userId) {
  const [pendingBroadcast, setPendingBroadcast] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    const fetchLatest = async () => {
      const { data, error } = await supabase
        .from("notice_broadcasts")
        .select("id, message, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && active && data && data.id !== getSeenId(userId)) {
        setPendingBroadcast(data);
      }
    };

    fetchLatest();

    const channel = supabase
      .channel(`notice-broadcast-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notice_broadcasts" },
        (payload) => {
          if (payload.new) setPendingBroadcast(payload.new);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const acknowledge = () => {
    if (pendingBroadcast) setSeenId(userId, pendingBroadcast.id);
    setPendingBroadcast(null);
  };

  return { pendingBroadcast, acknowledge };
}
