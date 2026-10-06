import SiloStockDashboard from "./SiloStockDashboard";

export default function MillOperatorDashboard({ user }) {
  return <SiloStockDashboard user={user} canEdit />;
}
