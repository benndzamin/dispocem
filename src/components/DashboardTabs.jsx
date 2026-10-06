// Tab bar za AdminDashboard i VagaSupervisor ("connected folder tab" dizajn).
// Na mobilnom su tabovi u dva reda da bi se tekst vidio cijeli - red sa
// aktivnim tabom je uvijek donji, spojen sa sadržajem (kao klasični Windows
// tabovi u dva reda). Na desktopu ostaje jedan red.
export default function DashboardTabs({ tabs, activeTab, onChange, badges = {} }) {
  const half = Math.ceil(tabs.length / 2);
  const rows = [tabs.slice(0, half), tabs.slice(half)];
  const activeRowIndex = rows[0].some((tab) => tab.key === activeTab) ? 0 : 1;
  const backRow = rows[1 - activeRowIndex];
  const frontRow = rows[activeRowIndex];

  const renderBadge = (tab) => {
    const count = badges[tab.key];
    if (!count) return null;
    return (
      <span className="absolute -top-1.5 -right-1.5 z-20 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-red px-1 text-[11px] font-semibold text-white overflow-hidden">
        {count > 99 ? "99+" : count}
      </span>
    );
  };

  const tabStateClass = (tab) =>
    activeTab === tab.key
      ? "border-gray-200 border-b-white bg-white font-semibold text-brand-red"
      : "border-transparent border-b-gray-200 bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600";

  return (
    <div className="w-full pt-2 sm:w-auto">
      {/* Mobilni: dva reda */}
      <div className="flex flex-col gap-1 sm:hidden">
        <div className="flex gap-1">
          {backRow.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className="relative min-w-0 flex-1 rounded-t-lg border border-transparent bg-gray-100 px-1 py-2 text-center text-xs text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
            >
              {tab.mobileLabel}
              {renderBadge(tab)}
            </button>
          ))}
        </div>
        <div className="relative flex items-end gap-1">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-b border-gray-200" />
          {frontRow.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`relative min-w-0 flex-1 rounded-t-lg border px-1 py-2 text-center text-xs transition-colors ${tabStateClass(tab)}`}
            >
              {tab.mobileLabel}
              {renderBadge(tab)}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop: jedan red */}
      <div className="relative hidden w-max items-end gap-2 sm:flex">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 border-b border-gray-200" />
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`relative flex-none rounded-t-lg border px-4 py-2.5 text-center text-sm transition-colors ${tabStateClass(tab)}`}
          >
            {tab.label}
            {renderBadge(tab)}
          </button>
        ))}
      </div>
    </div>
  );
}
