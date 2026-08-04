import AnnouncementsList from "./AnnouncementsList";
import NewAnnouncementAlerts from "./NewAnnouncementAlerts";
import useNewAnnouncementAlerts from "../hooks/useNewAnnouncementAlerts";

export default function VagaOperator({ user }) {
  const { alerts, dismiss } = useNewAnnouncementAlerts(user?.id, "wb_operator");

  return (
    <div className="space-y-6">
      <NewAnnouncementAlerts alerts={alerts} onDismiss={dismiss} />
      <AnnouncementsList
        role="wb_operator"
        currentUser={user}
        refreshKey={0}
        newAlerts={alerts}
      />
    </div>
  );
}
