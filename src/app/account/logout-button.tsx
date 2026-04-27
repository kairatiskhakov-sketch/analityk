"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        void signOut({ callbackUrl: "/login" });
      }}
      className="btn-primary w-full py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {loading ? "…" : "Выйти"}
    </button>
  );
}
