import { NextRequest, NextResponse } from "next/server";
import { getAllProviderHealth, resetProvider } from "@/lib/resilience";

export async function GET() {
  try {
    const health = getAllProviderHealth();
    return NextResponse.json({
      providers: health,
      summary: {
        total: health.length,
        healthy: health.filter(p => p.circuitState === "closed").length,
        open: health.filter(p => p.circuitState === "open").length,
        halfOpen: health.filter(p => p.circuitState === "half-open").length,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { providerId, action } = await req.json();
    
    if (action === "reset" && providerId) {
      resetProvider(providerId);
      return NextResponse.json({ success: true, message: `Provider "${providerId}" reset` });
    }
    
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
