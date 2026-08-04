import usePushSubscription from "../hooks/usePushSubscription";

export default function PushSubscribeButton({ userId }) {
  const { supported, subscribed, loading, error, subscribe, unsubscribe } =
    usePushSubscription(userId);

  if (!supported) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={loading}
        title={
          subscribed
            ? "Push notifikacije su uključene — klikni da isključiš"
            : "Uključi push notifikacije"
        }
        aria-label={
          subscribed ? "Isključi push notifikacije" : "Uključi push notifikacije"
        }
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-colors disabled:opacity-50 ${
          subscribed
            ? "border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-200 hover:bg-emerald-600"
            : "border-gray-300 bg-gray-100 text-gray-400 hover:bg-gray-200"
        }`}
      >
        {loading ? "…" : subscribed ? "🔔" : "🔕"}
      </button>
      {error && (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-red-200 bg-white p-3 text-xs text-red-600 shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
