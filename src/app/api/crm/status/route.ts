import { getCrmStatusSnapshot } from "@/lib/crm/status";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getCrmStatusSnapshot();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
