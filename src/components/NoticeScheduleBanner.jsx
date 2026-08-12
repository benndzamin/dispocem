import useNoticeWorkingHours from "../hooks/useNoticeWorkingHours";
import { formatScheduleText } from "../lib/noticeSchedule";

export default function NoticeScheduleBanner({ className = "" }) {
  const { rows, loading, error } = useNoticeWorkingHours();

  if (loading || error || rows.length === 0) return null;

  return (
    <p className={`text-xs text-gray-600 ${className}`}>
      <span className="font-semibold text-gray-700">Vrijeme za najave: </span>
      {formatScheduleText(rows)}
    </p>
  );
}
