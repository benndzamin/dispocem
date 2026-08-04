import usePushSubscription from "../hooks/usePushSubscription";

export default function PushSubscribeButton({ userId }) {
  const { supported, subscribed, loading, error, subscribe } =
    usePushSubscription(userId);

  if (!supported) return null;

  if (subscribed) {
    return (
      <span className="text-xs font-medium text-emerald-700">
        ✓ Push notifikacije uključene
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={subscribe}
        disabled={loading}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
      >
        {loading ? "Uključivanje..." : "🔔 Uključi push notifikacije"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
