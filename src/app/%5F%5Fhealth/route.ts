import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, releaseId: process.env.RELEASE_ID ?? "dev" });
}
