import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function useNoticeWorkingHours() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    const fetchRows = async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from("notice_working_hours")
        .select("day_of_week, is_open, opens_at, closes_at")
        .order("day_of_week", { ascending: true });

      if (!active) return;
      setError(fetchError ? fetchError.message : null);
      setRows(fetchError ? [] : data || []);
      setLoading(false);
    };

    fetchRows();
    return () => {
      active = false;
    };
  }, []);

  return { rows, loading, error };
}
