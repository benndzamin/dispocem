import { useState } from "react";
import AnnouncementForm from "./AnnouncementForm";
import AnnouncementsList from "./AnnouncementsList";
import NewAnnouncementAlerts from "./NewAnnouncementAlerts";
import NoticeScheduleBanner from "./NoticeScheduleBanner";
import useMyAnnouncementAlerts from "../hooks/useMyAnnouncementAlerts";
import useNoticeBroadcast from "../hooks/useNoticeBroadcast";

export default function KupacDashboard({ user, userProfile }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const { alerts: myAlerts, dismiss: dismissMyAlert } =
    useMyAnnouncementAlerts(user?.id);
  const { pendingBroadcast, acknowledge } = useNoticeBroadcast(user?.id);

  const showNotification = (message, type) => {
    setNotification({ message, type });
    window.setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <NoticeScheduleBanner />
      </div>
      <NewAnnouncementAlerts alerts={myAlerts} onDismiss={dismissMyAlert} />
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
      <AnnouncementsList
        role="buyer"
        currentUser={user}
        refreshKey={refreshKey}
        onCreateNew={() => setAnnouncementModalOpen(true)}
        newAlerts={myAlerts}
      />

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

      {pendingBroadcast && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="notice-broadcast-title"
            className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-2xl shadow-black/10"
          >
            <h3
              id="notice-broadcast-title"
              className="text-lg font-semibold text-gray-900"
            >
              Obavijest
            </h3>
            <p className="mt-3 whitespace-pre-wrap text-gray-700">
              {pendingBroadcast.message}
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={acknowledge}
                className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark"
              >
                Razumijem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
