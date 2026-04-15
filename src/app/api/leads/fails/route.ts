import { auth } from "@/auth";
import { BITRIX_LOSS_REASON_FIELD, BitrixAPI } from "@/lib/bitrix/api";
import { fetchDealUserfieldDictCached } from "@/lib/bitrix/cache";
import { getActiveBitrixConnection, getBitrixWebhookBaseUrl } from "@/lib/bitrix/connection";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(req: Request) {
  await auth();
  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const pipelineId = searchParams.get("pipelineId") || "";
    const managerIds = searchParams.get("managers")?.split(",").filter(Boolean) || [];

    const connection = await getActiveBitrixConnection();
    const webhookUrl = connection ? getBitrixWebhookBaseUrl(connection) : null;
    if (!webhookUrl) {
      return NextResponse.json({ fails: [] });
    }

    const api = new BitrixAPI(webhookUrl);
    const toDate = dateTo || formatYmd(new Date());
    const fromDate = dateFrom || formatYmd(new Date(Date.now() - 6 * 86400000));

    const [deals, ufDict] = await Promise.all([
      api.getDeals({
        dateFrom: fromDate,
        dateTo: toDate,
        managerIds: managerIds.length ? managerIds : undefined,
        categoryId: pipelineId || undefined,
        select: ["ID", "STAGE_ID", "STAGE_SEMANTIC_ID", BITRIX_LOSS_REASON_FIELD, "LOSS_REASON_ID"],
      }),
      fetchDealUserfieldDictCached(webhookUrl, BITRIX_LOSS_REASON_FIELD),
    ]);

    const lostDeals = deals.filter((d) => d.STAGE_SEMANTIC_ID === "F");

    const grouped: Record<string, number> = {};
    for (const d of lostDeals) {
      const uf = String(
        (d as unknown as Record<string, unknown>)[BITRIX_LOSS_REASON_FIELD] ?? "",
      ).trim();
      let reason: string;
      if (uf && uf !== "0") {
        reason = ufDict.get(uf) ?? `Причина ${uf}`;
      } else {
        const lr = String(d.LOSS_REASON_ID ?? "").trim();
        reason = lr ? `Причина ${lr}` : "Не указана";
      }
      grouped[reason] = (grouped[reason] ?? 0) + 1;
    }

    const fails = Object.entries(grouped)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      fails,
      source: "deals-uf",
      totalLostDeals: lostDeals.length,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
