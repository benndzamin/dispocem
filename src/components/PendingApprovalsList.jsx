import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

function formatDate(value) {
  if (!value) return "-";
  return value.split("-").reverse().join(".");
}

export default function PendingApprovalsList({ currentUser }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [approving, setApproving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notification, setNotification] = useState(null);
  const confirmTargetRef = useRef(null);

  const showNotification = (message, type = "success") => {
    setNotification({ message, type });
    window.setTimeout(() => setNotification(null), 3000);
  };

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("status", "awaiting_approval")
      .order("created_at", { ascending: false });
    setLoading(false);

    if (error) {
      showNotification("Greška pri učitavanju najava: " + error.message, "error");
      return;
    }
    setItems(data || []);
  };

  useEffect(() => {
    confirmTargetRef.current = confirmTarget;
  }, [confirmTarget]);

  useEffect(() => {
    fetchItems();

    const channel = supabase
      .channel(`pending-approvals-list-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements" },
        (payload) => {
          const row = payload.new;
          if (row?.status !== "awaiting_approval") return;
          setItems((prev) =>
            prev.some((item) => item.id === row.id) ? prev : [row, ...prev],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "announcements" },
        (payload) => {
          const row = payload.new;
          if (!row) return;
          const wasAwaiting = payload.old?.status === "awaiting_approval";
          const isAwaiting = row.status === "awaiting_approval";

          if (wasAwaiting && !isAwaiting) {
            setItems((prev) => prev.filter((item) => item.id !== row.id));
            if (confirmTargetRef.current?.id === row.id) {
              setConfirmTarget(null);
              showNotification("Najava je već obrađena.", "error");
            }
          } else if (!wasAwaiting && isAwaiting) {
            setItems((prev) =>
              prev.some((item) => item.id === row.id) ? prev : [row, ...prev],
            );
          } else if (wasAwaiting && isAwaiting) {
            setItems((prev) =>
              prev.map((item) =>
                item.id === row.id ? { ...item, ...row } : item,
              ),
            );
            if (confirmTargetRef.current?.id === row.id) {
              setConfirmTarget((prev) => (prev ? { ...prev, ...row } : prev));
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "announcements" },
        (payload) => {
          const oldRow = payload.old;
          if (oldRow?.status !== "awaiting_approval") return;
          setItems((prev) => prev.filter((item) => item.id !== oldRow.id));
          if (confirmTargetRef.current?.id === oldRow.id) {
            setConfirmTarget(null);
            showNotification("Najava je već obrisana.", "error");
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const openConfirm = (item) => setConfirmTarget(item);
  const closeConfirm = () => {
    if (!approving && !deleting) setConfirmTarget(null);
  };

  const handleApprove = async () => {
    if (!confirmTarget) return;
    setApproving(true);

    const { error } = await supabase
      .from("announcements")
      .update({ status: "pending" })
      .eq("id", confirmTarget.id);

    setApproving(false);

    if (error) {
      showNotification("Greška pri odobravanju: " + error.message, "error");
      return;
    }

    supabase.functions
      .invoke("send-push-notification", {
        body: {
          action: "approved",
          firma: confirmTarget.firma,
          vrstaCementa: confirmTarget.vrsta_cementa,
        },
      })
      .catch((err) =>
        console.error("Slanje push notifikacije operateru nije uspjelo:", err),
      );

    setItems((prev) => prev.filter((item) => item.id !== confirmTarget.id));
    showNotification(`Najava za ${confirmTarget.firma} je odobrena.`);
    setConfirmTarget(null);
  };

  const handleDelete = async () => {
    if (!confirmTarget) return;
    setDeleting(true);

    const { data, error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", confirmTarget.id)
      .select();

    setDeleting(false);

    if (error) {
      showNotification("Greška pri brisanju najave: " + error.message, "error");
      return;
    }

    if (!data || data.length === 0) {
      setConfirmTarget(null);
      await fetchItems();
      showNotification(
        "Najava se više ne može obrisati (u međuvremenu je promijenjena).",
        "error",
      );
      return;
    }

    const deletedByLabel = currentUser?.email || "Nepoznat korisnik";

    supabase
      .rpc("log_announcement_deletion", {
        p_announcement_id: confirmTarget.id,
        p_firma: confirmTarget.firma,
        p_vrsta_cementa: confirmTarget.vrsta_cementa,
        p_created_by: confirmTarget.created_by,
        p_deleted_by_label: deletedByLabel,
        p_deleted_by_role: "wb_supervisor",
        p_was_awaiting_approval: true,
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
          firma: confirmTarget.firma,
          vrstaCementa: confirmTarget.vrsta_cementa,
          deletedByLabel,
          deletedByRole: "wb_supervisor",
          actorUserId: currentUser?.id,
          // Ova najava je bila "čeka odobrenje" pa je operater nikad nije ni
          // vidio (RLS je skriva od operatera) - ne treba mu notifikacija o
          // brisanju nečega o čemu ne zna.
          wasAwaitingApproval: true,
        },
      })
      .catch((err) =>
        console.error("Slanje push notifikacije nije uspjelo:", err),
      );

    if (confirmTarget.created_by) {
      supabase.functions
        .invoke("send-status-push-notification", {
          body: {
            action: "deleted",
            userId: confirmTarget.created_by,
            vrstaCementa: confirmTarget.vrsta_cementa,
          },
        })
        .catch((err) =>
          console.error("Slanje push notifikacije kupcu nije uspjelo:", err),
        );

      supabase.functions
        .invoke("send-announcement-email", {
          body: {
            action: "deleted",
            firma: confirmTarget.firma,
            vrstaCementa: confirmTarget.vrsta_cementa,
            deletedByLabel,
            buyerId: confirmTarget.created_by,
          },
        })
        .catch((err) => console.error("Slanje emaila nije uspjelo:", err));
    }

    setItems((prev) => prev.filter((item) => item.id !== confirmTarget.id));
    showNotification(`Najava za ${confirmTarget.firma} je obrisana.`);
    setConfirmTarget(null);
  };

  return (
    <div className="rounded-b-2xl border-x border-b border-gray-200 bg-white p-4 sm:p-6">
      {notification && (
        <div
          role="alert"
          className={`fixed right-4 top-24 z-[70] rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
            notification.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {notification.message}
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">
          Najave koje čekaju odobrenje
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Kupci kod kojih je uključeno "Zahtijeva odobrenje" — klikni na najavu
          da odobriš utovar prije nego postane vidljiva operateru.
        </p>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-500">Učitavanje...</div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-500">
          Nema najava koje čekaju odobrenje.
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto border-t border-gray-200 md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-100 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="whitespace-nowrap border-b border-gray-200 px-3 py-3 font-semibold">
                    Firma
                  </th>
                  <th className="whitespace-nowrap border-b border-gray-200 px-3 py-3 font-semibold">
                    Vrsta cementa
                  </th>
                  <th className="whitespace-nowrap border-b border-gray-200 px-3 py-3 font-semibold">
                    Planirani datum
                  </th>
                  <th className="whitespace-nowrap border-b border-gray-200 px-3 py-3 font-semibold">
                    Vozač
                  </th>
                  <th className="whitespace-nowrap border-b border-gray-200 px-3 py-3 font-semibold">
                    Registracija
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white text-gray-700">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => openConfirm(item)}
                    className="cursor-pointer border-b border-gray-200 last:border-b-0 hover:bg-amber-50"
                  >
                    <td
                      className="max-w-[16rem] truncate px-3 py-3 font-semibold text-gray-900"
                      title={item.firma}
                    >
                      {item.firma}
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-3" title={item.vrsta_cementa}>
                      {item.vrsta_cementa}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatDate(item.datum_planiranja_odpreme)}
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-3">
                      {[item.ime_vozaca, item.prezime_vozaca].filter(Boolean).join(" ") || "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {item.registarske_oznake || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => openConfirm(item)}
                className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left hover:bg-amber-50"
              >
                <div className="font-semibold text-gray-900">{item.firma}</div>
                <div className="mt-1 text-sm text-gray-700">{item.vrsta_cementa}</div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                  <div>
                    <span className="text-gray-400">Planirano: </span>
                    {formatDate(item.datum_planiranja_odpreme)}
                  </div>
                  <div>
                    <span className="text-gray-400">Vozač: </span>
                    {[item.ime_vozaca, item.prezime_vozaca].filter(Boolean).join(" ") || "-"}
                  </div>
                  <div>
                    <span className="text-gray-400">Reg: </span>
                    {item.registarske_oznake || "-"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {confirmTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="approve-dialog-title"
            className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-4 shadow-2xl shadow-black/10 sm:p-6"
          >
            <h3 id="approve-dialog-title" className="text-lg font-semibold text-gray-900">
              Potvrda odobrenja
            </h3>
            <p className="mt-3 text-gray-700">
              Jeste li sigurni da želite dozvoliti utovar za najavu —{" "}
              <span className="font-semibold text-gray-900">{confirmTarget.firma}</span> (
              {confirmTarget.vrsta_cementa})?
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={approving || deleting}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Odustani
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={approving || deleting}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  className="h-4 w-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
                {deleting ? "Brisanje..." : "Obriši"}
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={approving || deleting}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  className="h-4 w-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {approving ? "Odobravanje..." : "Odobri"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
