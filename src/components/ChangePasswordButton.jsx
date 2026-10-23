import { useState } from "react";
import { supabase } from "../supabaseClient";

const MIN_LENGTH = 8;

// Promjena vlastite lozinke za prijavljenog korisnika. Trenutna lozinka se
// provjerava ponovnom prijavom, da niko ne može promijeniti lozinku samo
// zato što je zatekao otvorenu sesiju.
export default function ChangePasswordButton({ email }) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const close = () => {
    if (saving) return;
    setOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < MIN_LENGTH) {
      setError(`Nova lozinka mora imati najmanje ${MIN_LENGTH} znakova.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Nova lozinka i potvrda se ne podudaraju.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Nova lozinka mora biti različita od trenutne.");
      return;
    }

    setSaving(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signInError) throw new Error("Trenutna lozinka nije ispravna.");

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Promjena lozinke nije uspjela.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Promijeni lozinku"
        aria-label="Promijeni lozinku"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white text-sm text-gray-500 transition-colors hover:border-brand-red hover:bg-red-50"
      >
        🔑
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-gray-200 bg-white p-4 shadow-2xl shadow-black/10 sm:p-6"
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3
                  id="change-password-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  Promjena lozinke
                </h3>
                <p className="text-sm text-gray-500">{email}</p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Zatvori
              </button>
            </div>

            {success ? (
              <div className="space-y-4">
                <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                  Lozinka je uspješno promijenjena. Sljedeći put se prijavite
                  novom lozinkom.
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark"
                  >
                    U redu
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                    Trenutna lozinka
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                    Nova lozinka
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                    Potvrda nove lozinke
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                    {error}
                  </p>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={close}
                    disabled={saving}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    Odustani
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark disabled:opacity-50"
                  >
                    {saving ? "Spremanje..." : "Promijeni lozinku"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
