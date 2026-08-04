export default function NewAnnouncementAlerts({ alerts, onDismiss }) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="fixed right-4 top-24 z-[70] flex flex-col gap-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-start gap-3 rounded-lg border border-blue-300 bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          <span className="mt-0.5">🔔</span>
          <span className="flex-1">{alert.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(alert.id)}
            aria-label="Zatvori obavještenje"
            className="text-white/80 transition-colors hover:text-white"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
