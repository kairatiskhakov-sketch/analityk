import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center"
          style={{ background: "#0a0a0a", color: "var(--muted)" }}
        >
          Загрузка…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
