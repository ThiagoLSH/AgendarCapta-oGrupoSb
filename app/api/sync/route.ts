import { NextRequest, NextResponse } from "next/server";
import { syncCaptacoesToGoogleCalendar } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Endpoint chamado pelo cron (Vercel Cron ou serviço externo) a cada 15-30min.
 * Protegido por CRON_SECRET para não ficar aberto publicamente.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await syncCaptacoesToGoogleCalendar();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
