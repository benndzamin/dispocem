import AnnouncementsList from "./AnnouncementsList";
import NewAnnouncementAlerts from "./NewAnnouncementAlerts";
import PushSubscribeButton from "./PushSubscribeButton";
import useNewAnnouncementAlerts from "../hooks/useNewAnnouncementAlerts";

export default function VagaOperator({ user }) {
  const { alerts, dismiss } = useNewAnnouncementAlerts(user?.id);

  return (
    <div className="space-y-6">
      <NewAnnouncementAlerts alerts={alerts} onDismiss={dismiss} />
      <div>
        <PushSubscribeButton userId={user?.id} />
      </div>
      <AnnouncementsList
        role="wb_operator"
        currentUser={user}
        refreshKey={0}
        newAlerts={alerts}
      />
    </div>
  );
}
