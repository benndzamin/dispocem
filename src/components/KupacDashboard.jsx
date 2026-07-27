import { useState } from "react";
import AnnouncementForm from "./AnnouncementForm";
import AnnouncementsList from "./AnnouncementsList";

export default function KupacDashboard({ user, userProfile }) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <AnnouncementForm currentUser={user} buyerProfile={userProfile} onCreated={() => setRefreshKey((v) => v + 1)} />
      <AnnouncementsList role="buyer" currentUser={user} refreshKey={refreshKey} />
    </div>
  );
}
