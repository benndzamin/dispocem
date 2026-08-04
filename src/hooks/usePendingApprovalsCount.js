import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function usePendingApprovalsCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;

    const fetchCount = async () => {
      const { count: total, error } = await supabase
        .from("announcements")
        .select("id", { count: "exact", head: true })
        .eq("status", "awaiting_approval");
      if (!error && active) setCount(total ?? 0);
    };

    fetchCount();

    const channel = supabase
      .channel(`pending-approvals-count-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements" },
        (payload) => {
          if (payload.new?.status === "awaiting_approval") {
            setCount((c) => c + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "announcements" },
        (payload) => {
          const wasAwaiting = payload.old?.status === "awaiting_approval";
          const isAwaiting = payload.new?.status === "awaiting_approval";
          if (wasAwaiting && !isAwaiting) setCount((c) => Math.max(0, c - 1));
          else if (!wasAwaiting && isAwaiting) setCount((c) => c + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "announcements" },
        (payload) => {
          if (payload.old?.status === "awaiting_approval") {
            setCount((c) => Math.max(0, c - 1));
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
