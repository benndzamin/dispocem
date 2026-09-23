import SiloStockDashboard from "./SiloStockDashboard";

export default function MillOperatorDashboard({ user }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-2xl font-semibold text-gray-900">
          Stanje silosa cementa
        </h2>
        <p className="text-sm text-gray-500">
          Unesite mjerenje prilikom svakog redovnog obilaska silosa.
        </p>
      </div>
      <SiloStockDashboard user={user} canEdit />
    </div>
  );
}
