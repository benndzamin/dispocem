import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const STATUS_ORDER = { pending: 0, in_progress: 1, completed: 2 };

const COLUMNS = [
  { key: "firma", label: "Firma", accessor: (item) => item.firma || "" },
  {
    key: "created_at",
    label: "Kreirano",
    accessor: (item) => item.created_at || "",
  },
  {
    key: "vrsta_cementa",
    label: "Vrsta cementa",
    accessor: (item) => item.vrsta_cementa || "",
  },
  {
    key: "datum_planiranja_odpreme",
    label: "Planirani datum",
    accessor: (item) => item.datum_planiranja_odpreme || "",
  },
  {
    key: "vozac",
    label: "Vozač",
    accessor: (item) =>
      `${item.prezime_vozaca || ""} ${item.ime_vozaca || ""}`.trim(),
  },
  {
    key: "registarske_oznake",
    label: "Registracija",
    accessor: (item) => item.registarske_oznake || "",
  },
  {
    key: "status",
    label: "Status",
    accessor: (item) => STATUS_ORDER[item.status] ?? 0,
  },
];

export default function AnnouncementsList({
  role,
  currentUser,
  refreshKey,
  hideTopBorder = false,
  onCreateNew,
  newAlerts,
}) {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortField, setSortField] = useState("created_at");
  const [sortDirection, setSortDirection] = useState("desc");

  const showNotification = (message, type = "success") => {
    setNotification({ message, type });
    window.setTimeout(() => setNotification(null), 3000);
  };

  const fetchAnnouncements = async () => {
    setLoading(true);
    let query = supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });

    if (role === "buyer") {
      query = query.eq("created_by", currentUser?.id);
    }

    const { data, error } = await query;
    setLoading(false);
    if (!error) {
      setAnnouncements(data || []);
    } else {
      showNotification(
        "Greška pri učitavanju najava: " + error.message,
        "error",
      );
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, [role, currentUser?.id, refreshKey]);

  useEffect(() => {
    if (!newAlerts?.length) return;
    setAnnouncements((prev) => {
      const existingIds = new Set(prev.map((a) => a.id));
      const toAdd = newAlerts
        .filter((a) => a.type === "insert")
        .map((a) => a.row)
        .filter((row) => row && !existingIds.has(row.id));
      const toRemoveIds = new Set(
        newAlerts
          .filter((a) => a.type === "delete")
          .map((a) => a.row?.id)
          .filter(Boolean),
      );
      const updates = new Map(
        newAlerts
          .filter((a) => a.type === "update" && a.row?.id)
          .map((a) => [a.row.id, a.row]),
      );

      let next = prev;
      if (toRemoveIds.size > 0) {
        next = next.filter((item) => !toRemoveIds.has(item.id));
      }
      if (updates.size > 0) {
        next = next.map((item) =>
          updates.has(item.id) ? { ...item, ...updates.get(item.id) } : item,
        );
      }
      if (toAdd.length > 0) {
        next = [...toAdd, ...next];
      }
      return next === prev ? prev : next;
    });
  }, [newAlerts]);

  const highlightedIds = new Set((newAlerts || []).map((a) => a.id));

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const openDeleteModal = (announcement) => {
    setDeleteTarget(announcement);
  };

  const canDelete = (item) => {
    if (role === "buyer") {
      const ONE_HOUR_MS = 60 * 60 * 1000;
      return (
        item.status === "pending" &&
        Date.now() - new Date(item.created_at).getTime() < ONE_HOUR_MS
      );
    }
    return true;
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setDeleteTarget(null);
  };

  const confirmDeleteAnnouncement = async () => {
    if (!deleteTarget) return;

    setDeleteLoading(true);
    const { data, error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", deleteTarget.id)
      .select();
    setDeleteLoading(false);

    if (error) {
      showNotification(
        "Greška pri brisanju najave: " + error.message,
        "error",
      );
      return;
    }

    if (!data || data.length === 0) {
      setDeleteTarget(null);
      await fetchAnnouncements();
      showNotification(
        "Najava se više ne može obrisati (status ili vrijeme su se u međuvremenu promijenili).",
        "error",
      );
      return;
    }

    const deletedByLabel =
      role === "buyer"
        ? deleteTarget.firma
        : currentUser?.email || "Nepoznat korisnik";

    supabase
      .rpc("log_announcement_deletion", {
        p_announcement_id: deleteTarget.id,
        p_firma: deleteTarget.firma,
        p_vrsta_cementa: deleteTarget.vrsta_cementa,
        p_created_by: deleteTarget.created_by,
        p_deleted_by_label: deletedByLabel,
        p_deleted_by_role: role,
      })
      .then(({ error: logError }) => {
        if (logError) {
          console.error("Logovanje brisanja nije uspjelo:", logError);
        }
      });

    supabase.functions
      .invoke("send-push-notification", {
        body: {
          action: "deleted",
          firma: deleteTarget.firma,
          vrstaCementa: deleteTarget.vrsta_cementa,
          deletedByLabel,
          deletedByRole: role,
        },
      })
      .catch((err) =>
        console.error("Slanje push notifikacije nije uspjelo:", err),
      );

    const notifyBuyer =
      deleteTarget.created_by && deleteTarget.created_by !== currentUser?.id;
    const notifySupervisors = role === "wb_operator";

    if (notifyBuyer) {
      supabase.functions
        .invoke("send-status-push-notification", {
          body: {
            action: "deleted",
            userId: deleteTarget.created_by,
            vrstaCementa: deleteTarget.vrsta_cementa,
          },
        })
        .catch((err) =>
          console.error("Slanje push notifikacije kupcu nije uspjelo:", err),
        );
    }

    if (notifyBuyer || notifySupervisors) {
      supabase.functions
        .invoke("send-announcement-email", {
          body: {
            action: "deleted",
            firma: deleteTarget.firma,
            vrstaCementa: deleteTarget.vrsta_cementa,
            deletedByLabel,
            ...(notifyBuyer ? { buyerId: deleteTarget.created_by } : {}),
            ...(notifySupervisors ? { notifySupervisors: true } : {}),
          },
        })
        .catch((err) =>
          console.error("Slanje emaila nije uspjelo:", err),
        );
    }

    setDeleteTarget(null);
    await fetchAnnouncements();
    showNotification(`Najava za ${deleteTarget.firma} je obrisana.`);
  };

  const openStatusModal = (announcement) => {
    setStatusTarget(announcement);
    setSelectedStatus(announcement.status);
  };

  const closeStatusModal = () => {
    if (statusLoading) return;
    setStatusTarget(null);
    setSelectedStatus("");
  };

  const updateAnnouncementStatus = async () => {
    if (!statusTarget || !selectedStatus) return;

    setStatusLoading(true);
    const previousStatus = statusTarget.status;
    const { error } = await supabase
      .from("announcements")
      .update({ status: selectedStatus })
      .eq("id", statusTarget.id);

    if (error) {
      showNotification(
        "Greška pri promjeni statusa najave: " + error.message,
        "error",
      );
      setStatusLoading(false);
      return;
    }

    await supabase.from("announcement_status_history").insert({
      announcement_id: statusTarget.id,
      changed_by: currentUser?.id,
      old_status: previousStatus,
      new_status: selectedStatus,
    });

    if (previousStatus !== selectedStatus) {
      supabase.functions
        .invoke("send-status-push-notification", {
          body: {
            userId: statusTarget.created_by,
            vrstaCementa: statusTarget.vrsta_cementa,
            oldStatus: previousStatus,
            newStatus: selectedStatus,
          },
        })
        .catch((err) =>
          console.error("Slanje push notifikacije nije uspjelo:", err),
        );
    }

    setStatusLoading(false);
    setStatusTarget(null);
    setSelectedStatus("");
    await fetchAnnouncements();
    showNotification(
      previousStatus === selectedStatus
        ? `Status najave za ${statusTarget.firma} je ostao ${selectedStatus}.`
        : `Status najave za ${statusTarget.firma} je promijenjen: ${previousStatus} → ${selectedStatus}.`,
    );
  };

  const openHistoryModal = async (item) => {
    setHistoryTarget(item);
    setHistoryLoading(true);

    const [creatorResult, historyResult] = await Promise.all([
      item.created_by
        ? supabase
            .from("users")
            .select("email")
            .eq("id", item.created_by)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("announcement_status_history")
        .select("*, changed_by_user:users(email)")
        .eq("announcement_id", item.id)
        .order("changed_at", { ascending: true }),
    ]);

    setHistoryLoading(false);

    if (historyResult.error) {
      showNotification(
        "Greška pri učitavanju istorije izmjena: " +
          historyResult.error.message,
        "error",
      );
      return;
    }

    const events = [
      {
        id: "created",
        label: "Najava kreirana",
        by: creatorResult.data?.email || "-",
        at: item.created_at,
      },
      ...(historyResult.data || []).map((entry) => ({
        id: entry.id,
        label: `Status promijenjen: ${entry.old_status || "-"} → ${entry.new_status}`,
        by: entry.changed_by_user?.email || "-",
        at: entry.changed_at,
      })),
    ];

    setHistoryEntries(events);
  };

  const closeHistoryModal = () => {
    setHistoryTarget(null);
    setHistoryEntries([]);
  };

  const filteredAnnouncements = announcements.filter((item) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      item.firma?.toLowerCase().includes(term) ||
      item.vrsta_cementa?.toLowerCase().includes(term) ||
      item.ime_vozaca?.toLowerCase().includes(term) ||
      item.prezime_vozaca?.toLowerCase().includes(term) ||
      item.registarske_oznake?.toLowerCase().includes(term) ||
      item.status?.toLowerCase().includes(term)
    );
  });

  const sortedAnnouncements = [...filteredAnnouncements].sort((a, b) => {
    const column = COLUMNS.find((c) => c.key === sortField);
    const va = column?.accessor(a) ?? "";
    const vb = column?.accessor(b) ?? "";
    if (va < vb) return sortDirection === "asc" ? -1 : 1;
    if (va > vb) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAnnouncements.length / pageSize),
  );
  const paginatedAnnouncements = sortedAnnouncements.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const rangeStart =
    filteredAnnouncements.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(
    currentPage * pageSize,
    filteredAnnouncements.length,
  );

  return (
    <div
      className={`bg-white border-gray-200 p-6 ${
        hideTopBorder ? "border-x border-b rounded-b-xl" : "border rounded-xl"
      }`}
    >
      {notification && (
        <div
          role="alert"
          className={`fixed right-4 top-4 z-[70] rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
            notification.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {notification.message}
        </div>
      )}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">📋 Najave</h3>
          <p className="text-sm text-gray-500">
            Pregled i upravljanje najavama.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Pretraži najave (firma, cement, vozač...)..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
            >
              {COLUMNS.map((col) => (
                <option key={col.key} value={col.key}>
                  Sortiraj: {col.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
              }
              aria-label="Obrni smjer sortiranja"
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {sortDirection === "asc" ? "▲" : "▼"}
            </button>
          </div>
          {onCreateNew && (
            <button
              type="button"
              onClick={onCreateNew}
              className="rounded-lg bg-brand-red hover:bg-brand-red-dark text-white px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap"
            >
              ➕ Dodaj novu najavu
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Učitavanje...</div>
      ) : announcements.length === 0 ? (
        <div className="text-sm text-gray-500">Nema podataka.</div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="text-sm text-gray-500">
          Nema najava koje odgovaraju pretrazi.
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto border-t border-gray-200 md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-100 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="whitespace-nowrap border-b border-gray-200 px-3 py-3 font-semibold cursor-pointer select-none hover:bg-gray-200"
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortField === col.key && (
                          <span className="text-[10px]">
                            {sortDirection === "asc" ? "▲" : "▼"}
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="whitespace-nowrap border-b border-gray-200 px-3 py-3 font-semibold">
                    Akcije
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white text-gray-700">
                {paginatedAnnouncements.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b last:border-b-0 transition-colors duration-700 ${
                      highlightedIds.has(item.id)
                        ? "border-blue-200 bg-blue-50 hover:bg-blue-100"
                        : item.status === "completed"
                          ? "border-gray-200 bg-gray-50 opacity-60"
                          : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <td
                      className="max-w-[16rem] truncate px-3 py-3 font-semibold text-gray-900"
                      title={item.firma}
                    >
                      {item.firma}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {new Date(item.created_at).toLocaleDateString("hr-HR")}{" "}
                      {new Date(item.created_at).toLocaleTimeString("hr-HR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td
                      className="max-w-[14rem] truncate px-3 py-3"
                      title={item.vrsta_cementa}
                    >
                      {item.vrsta_cementa}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {item.datum_planiranja_odpreme
                        ? item.datum_planiranja_odpreme
                            .split("-")
                            .reverse()
                            .join(".")
                        : "-"}
                    </td>
                    <td
                      className="max-w-[12rem] truncate px-3 py-3"
                      title={`${item.ime_vozaca || "-"} ${item.prezime_vozaca || ""}`}
                    >
                      {item.ime_vozaca || "-"} {item.prezime_vozaca || ""}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {item.registarske_oznake || "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-brand-red">
                      {item.status}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="flex flex-nowrap gap-2">
                        {role !== "buyer" && (
                          <button
                            type="button"
                            onClick={() => openStatusModal(item)}
                            className="whitespace-nowrap rounded-lg bg-brand-red hover:bg-brand-red-dark text-white px-3 py-2 text-xs font-medium transition-colors"
                          >
                            Promijeni status
                          </button>
                        )}
                        {canDelete(item) && (
                          <button
                            type="button"
                            onClick={() => openDeleteModal(item)}
                            className="whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                          >
                            Obriši
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openHistoryModal(item)}
                          className="whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          Historija
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {paginatedAnnouncements.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-4 transition-colors duration-700 ${
                  highlightedIds.has(item.id)
                    ? "border-blue-200 bg-blue-50"
                    : item.status === "completed"
                      ? "border-gray-200 bg-gray-50 opacity-60"
                      : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-gray-900">
                    {item.firma}
                  </div>
                  <div className="whitespace-nowrap text-xs font-semibold uppercase text-brand-red">
                    {item.status}
                  </div>
                </div>

                <div className="mt-2 text-sm text-gray-700">
                  {item.vrsta_cementa}
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                  <div>
                    <span className="text-gray-400">Kreirano: </span>
                    {new Date(item.created_at).toLocaleDateString("hr-HR")}{" "}
                    {new Date(item.created_at).toLocaleTimeString("hr-HR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div>
                    <span className="text-gray-400">Planirano: </span>
                    {item.datum_planiranja_odpreme
                      ? item.datum_planiranja_odpreme
                          .split("-")
                          .reverse()
                          .join(".")
                      : "-"}
                  </div>
                  <div>
                    <span className="text-gray-400">Vozač: </span>
                    {item.ime_vozaca || "-"} {item.prezime_vozaca || ""}
                  </div>
                  <div>
                    <span className="text-gray-400">Reg: </span>
                    {item.registarske_oznake || "-"}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {role !== "buyer" && (
                    <button
                      type="button"
                      onClick={() => openStatusModal(item)}
                      className="rounded-lg bg-brand-red hover:bg-brand-red-dark text-white px-3 py-2 text-xs font-medium transition-colors"
                    >
                      Promijeni status
                    </button>
                  )}
                  {canDelete(item) && (
                    <button
                      type="button"
                      onClick={() => openDeleteModal(item)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 hover:bg-red-100"
                    >
                      Obriši
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openHistoryModal(item)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    Historija
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>
                Prikazano {rangeStart}-{rangeEnd} od{" "}
                {filteredAnnouncements.length} najava
              </span>
              <label className="ml-4 flex items-center gap-2">
                <span className="text-xs uppercase text-gray-500 font-semibold">
                  Po stranici
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-white"
              >
                Prethodna
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (page) =>
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1,
                )
                .reduce((acc, page, idx, arr) => {
                  if (idx > 0 && page - arr[idx - 1] > 1) acc.push("...");
                  acc.push(page);
                  return acc;
                }, [])
                .map((page, idx) =>
                  page === "..." ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-2 text-sm text-gray-400"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`rounded-lg border px-3 py-1.5 text-sm ${
                        page === currentPage
                          ? "border-brand-red bg-brand-red text-white"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {page}
                    </button>
                  ),
                )}
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-white"
              >
                Sljedeća
              </button>
            </div>
          </div>
        </>
      )}

      {statusTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-status-title"
            className="w-full max-w-2xl rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-2xl shadow-black/10"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3
                  id="change-status-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  Mijenjate status najave
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Pregledajte podatke i odaberite novi status najave.
                </p>
              </div>
              <button
                type="button"
                onClick={closeStatusModal}
                disabled={statusLoading}
                className="rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Zatvori
              </button>
            </div>

            <dl className="grid gap-x-6 gap-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Firma
                </dt>
                <dd className="mt-1 font-medium text-gray-900">
                  {statusTarget.firma}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Vrsta cementa
                </dt>
                <dd className="mt-1 text-gray-800">
                  {statusTarget.vrsta_cementa}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Planirani datum
                </dt>
                <dd className="mt-1 text-gray-800">
                  {statusTarget.datum_planiranja_odpreme}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Vozač
                </dt>
                <dd className="mt-1 text-gray-800">
                  {statusTarget.ime_vozaca || "-"}{" "}
                  {statusTarget.prezime_vozaca || ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Registracija
                </dt>
                <dd className="mt-1 text-gray-800">
                  {statusTarget.registarske_oznake || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Trenutni status
                </dt>
                <dd className="mt-1 font-medium text-brand-red">
                  {statusTarget.status}
                </dd>
              </div>
            </dl>

            <div className="mt-5">
              <label
                htmlFor="announcement-status"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                Novi status
              </label>
              <select
                id="announcement-status"
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
                disabled={statusLoading}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-brand-red focus:ring-2 focus:ring-red-100 focus:outline-none disabled:opacity-50"
              >
                <option value="pending">pending</option>
                <option value="in_progress">in progress</option>
                <option value="completed">completed</option>
              </select>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeStatusModal}
                disabled={statusLoading}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Odustani
              </button>
              <button
                type="button"
                onClick={updateAnnouncementStatus}
                disabled={statusLoading}
                className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {statusLoading ? "Spremanje..." : "Potvrdi promjenu"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-announcement-title"
            className="w-full max-w-lg rounded-3xl border border-red-300 bg-white p-4 sm:p-6 shadow-2xl shadow-black/10"
          >
            <h3
              id="delete-announcement-title"
              className="text-lg font-semibold text-gray-900"
            >
              Potvrda brisanja
            </h3>
            <p className="mt-3 text-gray-700">
              Jeste li sigurni da želite obrisati najavu za{" "}
              <span className="font-semibold text-gray-900">
                {deleteTarget.firma}
              </span>{" "}
              ({deleteTarget.vrsta_cementa}, planirano{" "}
              {deleteTarget.datum_planiranja_odpreme
                ? deleteTarget.datum_planiranja_odpreme
                    .split("-")
                    .reverse()
                    .join(".")
                : "-"}
              )?
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteLoading}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Izađi
              </button>
              <button
                type="button"
                onClick={confirmDeleteAnnouncement}
                disabled={deleteLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteLoading ? "Brisanje..." : "Obriši"}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
            className="w-full max-w-2xl rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-2xl shadow-black/10"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3
                  id="history-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  Historija izmjena — {historyTarget.firma}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Hronološki pregled: kreiranje najave i sve naredne izmjene
                  statusa.
                </p>
              </div>
              <button
                type="button"
                onClick={closeHistoryModal}
                className="rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Zatvori
              </button>
            </div>

            {historyLoading ? (
              <div className="text-sm text-gray-500">Učitavanje...</div>
            ) : historyEntries.length === 0 ? (
              <div className="text-sm text-gray-500">
                Još nema zabilježenih izmjena statusa za ovu najavu.
              </div>
            ) : (
              <ul className="max-h-96 space-y-3 overflow-y-auto">
                {historyEntries.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm"
                  >
                    <div className="font-medium text-gray-900">
                      {event.label}
                    </div>
                    <div className="mt-1 text-gray-500">
                      {event.by} ·{" "}
                      {new Date(event.at).toLocaleDateString("hr-HR")}{" "}
                      {new Date(event.at).toLocaleTimeString("hr-HR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
