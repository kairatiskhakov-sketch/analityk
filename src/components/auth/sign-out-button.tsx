"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-[7px] border px-3 py-2 text-[13px] outline-none transition-opacity hover:opacity-90"
      style={{
        borderColor: "var(--border2)",
        background: "transparent",
        color: "var(--text)",
      }}
    >
      Выйти
    </button>
  );
}
