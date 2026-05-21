import { NextResponse } from "next/server";

// Auto-grab: scan tokens + return the best match for a provider
export async function POST(req: Request) {
  try {
    const { provider } = await req.json();
    const baseUrl = req.url.replace("/api/browser/tokens/autograb", "/api/browser/tokens");
    const res = await fetch(baseUrl);
    const data = await res.json();
    
    // Filter by provider and return best token
    const providerTokens = (data.tokens || []).filter((t: any) => 
      t.provider === provider && t.decrypted && t.value && t.value.length > 20
    );
    
    if (providerTokens.length > 0) {
      return NextResponse.json({ 
        success: true, 
        token: providerTokens[0].value,
        provider,
        count: providerTokens.length 
      });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: `No tokens found for ${provider}. Log in and try again.` 
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
