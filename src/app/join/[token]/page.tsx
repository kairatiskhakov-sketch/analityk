import { Suspense } from "react";
import { JoinClient } from "./join-client";

export const dynamic = "force-dynamic";

export default function JoinPage({ params }: { params: { token: string } }) {
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
      <JoinClient token={params.token} />
    </Suspense>
  );
}
