import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import {
  computeManagerDynamics,
  type GroupBy,
} from "@/lib/dashboard/manager-dynamics";
import { jsonError, jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";

function parseGroupBy(v: string | null): GroupBy | null {
  if (v === "day" || v === "week" || v === "month") return v;
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const groupBy = parseGroupBy(searchParams.get("groupBy"));
    const managerIdsRaw = searchParams.get("managerIds");

    if (
      !dateFrom ||
      !dateTo ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)
    ) {
      return jsonError("Укажите dateFrom и dateTo (YYYY-MM-DD)", 400);
    }
    if (!groupBy) {
      return jsonError("groupBy: day | week | month", 400);
    }

    const managerIds = managerIdsRaw
      ? managerIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const conn = await getActiveBitrixConnection();
    const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
    if (!url) {
      return jsonOk({
        hasCrm: false,
        data: null,
        error: "Bitrix24 не подключён",
      });
    }

    const data = await computeManagerDynamics(
      url,
      dateFrom,
      dateTo,
      groupBy,
      managerIds,
    );

    return jsonOk({ hasCrm: true, data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return jsonError(msg, 500);
  }
}
