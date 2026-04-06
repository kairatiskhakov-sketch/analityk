import { jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";

/** Заглушка под GA4 Data API push (если появится подписка). */
export async function POST() {
  return jsonOk({ received: true, note: "not_implemented" });
}
