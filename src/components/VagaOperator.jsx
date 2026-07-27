import AnnouncementsList from "./AnnouncementsList";

export default function VagaOperator({ user }) {
  return (
    <div className="space-y-6">
      <AnnouncementsList role="wb_operator" currentUser={user} refreshKey={0} />
    </div>
  );
}
