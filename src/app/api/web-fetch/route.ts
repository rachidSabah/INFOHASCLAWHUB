import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = body.url?.trim();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Normalize URL - add https:// if no protocol
    let fetchUrl = url;
    if (!fetchUrl.startsWith("http://") && !fetchUrl.startsWith("https://")) {
      fetchUrl = "https://" + fetchUrl;
    }

    // Try both https and http
    const urlsToTry = [fetchUrl];
    if (fetchUrl.startsWith("https://")) {
      urlsToTry.push(fetchUrl.replace("https://", "http://"));
    }

    let html = "";
    let finalUrl = fetchUrl;
    let contentType = "";

    for (const tryUrl of urlsToTry) {
      try {
        const response = await fetch(tryUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,fr;q=0.8,ar;q=0.7",
            "Accept-Encoding": "identity",
            "Cache-Control": "no-cache",
          },
          signal: AbortSignal.timeout(15000),
          redirect: "follow",
        });

        if (!response.ok) continue;

        contentType = response.headers.get("content-type") || "";
        finalUrl = tryUrl;

        // Skip non-text responses
        if (!contentType.includes("text/") && !contentType.includes("html") && !contentType.includes("xml")) {
          return NextResponse.json({
            url: tryUrl,
            title: "Non-text content",
            description: `Content-Type: ${contentType}`,
            textContent: "",
            contentLength: 0,
            contentType,
            fetched: true,
            hint: "The URL returned non-text content.",
          });
        }

        html = await response.text();
        if (html && html.length > 50) break;
      } catch {
        continue;
      }
    }

    if (!html || html.length < 50) {
      return NextResponse.json({
        error: "Could not fetch content from this URL",
        url,
        hint: "The website may be blocking automated access, using JavaScript-only rendering, or may be down.",
      });
    }

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

    // Extract navigation menu items
    const navItems = [...html.matchAll(/<nav[^>]*>([\s\S]*?)<\/nav>/gi)].flatMap(navBlock => 
      [...navBlock[1].matchAll(/<a[^>]+href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({
        url: m[1],
        text: m[2].replace(/<[^>]+>/g, "").trim(),
      })).filter(l => l.text.length > 0)
    ).slice(0, 30);

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
    if (/elementor/i.test(html)) indicators.push("Elementor Builder");
    if (/wp-content/i.test(html)) indicators.push("WordPress");
    if (/wp-json/i.test(html)) indicators.push("WordPress REST API");
    if (/divi/i.test(html)) indicators.push("Divi Theme");
    if (/genesis/i.test(html)) indicators.push("Genesis Framework");
    if (/yoast/i.test(html)) indicators.push("Yoast SEO");
    if (/woocommerce/i.test(html)) indicators.push("WooCommerce");
    if (/rank[- ]?math/i.test(html)) indicators.push("Rank Math SEO");
    if (/wpbakery/i.test(html)) indicators.push("WPBakery Page Builder");
    if (/beaver[- ]?builder/i.test(html)) indicators.push("Beaver Builder");
    if (/bricks[- ]?builder/i.test(html)) indicators.push("Bricks Builder");
    if (/flatsome/i.test(html)) indicators.push("Flatsome Theme");
    if (/enfold/i.test(html)) indicators.push("Enfold Theme");
    if (/bootstrap/i.test(html)) indicators.push("Bootstrap CSS");
    if (/tailwind/i.test(html)) indicators.push("Tailwind CSS");

    // Extract images
    const images = [...html.matchAll(/<img[^>]+src=["']([^"']*)["'][^>]*>/gi)]
      .map(m => m[1])
      .filter(src => src.startsWith("http") || src.startsWith("/"))
      .slice(0, 10);

    // Strip HTML tags for readable text
    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
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
      url: finalUrl,
      title,
      description,
      headings,
      navItems,
      links,
      images,
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
