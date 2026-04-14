import { countStageConfigs } from "@/lib/bitrix/stage-config";
import {
  getActiveBitrixConnection,
  getBitrixWebhookBaseUrl,
} from "@/lib/bitrix/connection";
import { jsonOk } from "@/lib/http/json";

export const dynamic = "force-dynamic";

/** Баннер на дашборде: Bitrix подключён, но этапы ещё не сохранены в StageConfig */
export async function GET() {
  const conn = await getActiveBitrixConnection();
  const url = conn ? getBitrixWebhookBaseUrl(conn) : null;
  const n = await countStageConfigs();
  const showBanner = Boolean(url) && n === 0;
  return jsonOk({ showBanner, configuredCount: n, hasBitrix: Boolean(url) });
}
