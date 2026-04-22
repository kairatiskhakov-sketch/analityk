import { jsonOk } from "@/lib/http/json";
import { createLogger, shortId } from "@/lib/log/logger";

export const dynamic = "force-dynamic";

/** Заглушка под GA4 Data API push (если появится подписка). */
export async function POST() {
  const log = createLogger("webhook.google", { reqId: shortId() });
  log.info("ping", { status: "not_implemented" });
  return jsonOk({ received: true, note: "not_implemented" });
}
