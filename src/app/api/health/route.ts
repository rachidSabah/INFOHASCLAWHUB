import { NextResponse } from "next/server";
import { getHealthStatus, startSelfHealer, triggerHealthCheck } from "@/lib/self-healer";

let started = false;

export async function GET() {
  if (!started) {
    const port = process.env.PORT ? parseInt(process.env.PORT) : undefined;
    startSelfHealer(port);
    started = true;
  }

  const status = getHealthStatus();
  return NextResponse.json(status);
}

export async function POST() {
  try {
    await triggerHealthCheck();
    const status = getHealthStatus();
    return NextResponse.json(status);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
