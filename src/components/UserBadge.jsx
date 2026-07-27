import React from "react";

const ROLE_DETAILS = {
  admin: {
    title: "Administracija — kontrolna tabla",
    desc: "Admin vidi sve najave, upravlja vrstama cementa i kontrolira kupce.",
  },
  wb_supervisor: {
    title: "Supervizor vage",
    desc: "Supervizor vidi sve najave, dodjeljuje dozvole kupcima i može dodavati kupce.",
  },
  wb_operator: {
    title: "Operater vage",
    desc: "Operator vidi sve najave i može ih označiti kao completed.",
  },
  buyer: {
    title: "Portal kupca",
    desc: "Kupac vidi svoje najave, dodaje nove i može ih brisati.",
  },
};

export default function UserBadge({ user, userProfile }) {
  const email = user?.email || "Nepoznat";
  const namePart = email.split("@")[0] || "u";
  const initials = namePart
    .split(/[._-]/)
    .map((s) => s?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const role = userProfile?.rola || "buyer";
  const details = ROLE_DETAILS[role] || { title: "Portal kupca", desc: "" };

  return (
    <div className="flex items-center gap-3">
      {/* Circle Badge */}
      <div className="h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-semibold uppercase shadow-md select-none">
        {initials || "U"}
      </div>

      {/* Role Title with Hover tooltip */}
      <div className="relative group cursor-help">
        <span className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors border-b border-dashed border-indigo-500/30 pb-0.5 select-none">
          {details.title}
        </span>
        
        {/* Tooltip Hover Card */}
        <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-72">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-2xl backdrop-blur-md">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Korisnik: {email}
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              {details.desc}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
