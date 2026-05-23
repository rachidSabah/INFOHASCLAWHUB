import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = body.url?.trim();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return NextResponse.json({ error: "URL must start with http:// or https://" }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json({
        error: `HTTP ${response.status} ${response.statusText}`,
        url,
      });
    }

    const contentType = response.headers.get("content-type") || "";
    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "No title";

    // Extract meta description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
                     html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    const description = descMatch ? descMatch[1] : "";

    // Extract headings
    const headings = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => ({
      level: parseInt(m[1]),
      text: m[2].replace(/<[^>]+>/g, "").trim(),
    })).filter(h => h.text.length > 0).slice(0, 20);

    // Extract links
    const links = [...html.matchAll(/<a[^>]+href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => ({
        url: m[1],
        text: m[2].replace(/<[^>]+>/g, "").trim(),
      }))
      .filter(l => l.text.length > 0 && l.url.startsWith("http"))
      .slice(0, 20);

    // Check for CMS/framework indicators
    const indicators: string[] = [];
    if (/avada/i.test(html)) indicators.push("Avada Theme");
    if (/elementor/i.test(html)) indicators.push("Elementor");
    if (/wp-content/i.test(html)) indicators.push("WordPress");
    if (/divi/i.test(html)) indicators.push("Divi Theme");
    if (/genesis/i.test(html)) indicators.push("Genesis Framework");
    if (/yoast/i.test(html)) indicators.push("Yoast SEO");
    if (/woocommerce/i.test(html)) indicators.push("WooCommerce");

    // Strip HTML tags for readable text
    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 15000);

    return NextResponse.json({
      url,
      title,
      description,
      headings,
      links,
      indicators,
      contentLength: html.length,
      textContent,
      contentType,
      fetched: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to fetch: ${message}` }, { status: 500 });
  }
}
