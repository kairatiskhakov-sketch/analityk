import { auth } from "@/auth";
import { autoLoadStageConfigs } from "@/lib/bitrix/auto-stage-config";
import { getActiveBitrixConnection, getBitrixWebhookBaseUrl } from "@/lib/bitrix/connection";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await auth();
    console.log("Sync stages session:", JSON.stringify(session));

    const connection = await getActiveBitrixConnection();
    if (!connection) {
      return NextResponse.json({ error: "CRM не подключена" }, { status: 400 });
    }
    const webhookUrl = getBitrixWebhookBaseUrl(connection);
    if (!webhookUrl) {
      return NextResponse.json({ error: "CRM не подключена" }, { status: 400 });
    }

    const count = await autoLoadStageConfigs(webhookUrl);
    return NextResponse.json({ success: true, count });
  } catch (e) {
    console.error("Sync stages error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
