import { useState } from "react";
import AnnouncementForm from "./AnnouncementForm";
import AnnouncementsList from "./AnnouncementsList";

export default function KupacDashboard({ user, userProfile }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type) => {
    setNotification({ message, type });
    window.setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="space-y-6">
      {notification && (
        <div
          className={`fixed right-4 top-4 z-[60] rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
            notification.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
          role="alert"
        >
          {notification.message}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAnnouncementModalOpen(true)}
          className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark"
        >
          Nova najava
        </button>
      </div>
      <AnnouncementsList role="buyer" currentUser={user} refreshKey={refreshKey} />

      {announcementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl shadow-black/10">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Nova najava otpreme</h3>
                <p className="text-sm text-gray-500">Popunite podatke za novu najavu.</p>
              </div>
              <button
                type="button"
                onClick={() => setAnnouncementModalOpen(false)}
                className="rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Zatvori
              </button>
            </div>

            <AnnouncementForm
              currentUser={user}
              buyerProfile={userProfile}
              role="buyer"
              onCreated={() => {
                setRefreshKey((value) => value + 1);
              }}
              onResult={(message, type) => {
                setAnnouncementModalOpen(false);
                showNotification(message, type);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
