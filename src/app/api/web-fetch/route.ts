import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

// Rotate user agents to avoid bot detection
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

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

    // Try multiple strategies
    const urlsToTry = [fetchUrl];
    if (fetchUrl.startsWith("https://")) {
      urlsToTry.push(fetchUrl.replace("https://", "http://"));
    }

    let html = "";
    let finalUrl = fetchUrl;
    let contentType = "";
    let fetchSuccess = false;

    for (const tryUrl of urlsToTry) {
      if (fetchSuccess) break;

      // Try with different user agents
      for (const userAgent of USER_AGENTS.slice(0, 3)) {
        if (fetchSuccess) break;

        try {
          const response = await fetch(tryUrl, {
            headers: {
              "User-Agent": userAgent,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9,fr;q=0.8,ar;q=0.7,es;q=0.6",
              "Accept-Encoding": "identity",
              "Cache-Control": "no-cache",
              "Sec-Fetch-Dest": "document",
              "Sec-Fetch-Mode": "navigate",
              "Sec-Fetch-Site": "none",
              "Upgrade-Insecure-Requests": "1",
            },
            signal: AbortSignal.timeout(15000),
            redirect: "follow",
          });

          if (!response.ok) continue;

          contentType = response.headers.get("content-type") || "";
          finalUrl = tryUrl;

          // Skip non-text responses (but allow JSON for APIs)
          if (!contentType.includes("text/") && !contentType.includes("html") && !contentType.includes("xml") && !contentType.includes("json")) {
            return NextResponse.json({
              url: tryUrl,
              title: "Non-text content",
              description: `Content-Type: ${contentType}`,
              textContent: "",
              contentLength: 0,
              contentType,
              fetched: true,
              hint: "The URL returned non-text content (e.g., PDF, image, video). Try web_search for information about this site.",
            });
          }

          html = await response.text();
          if (html && html.length > 20) {
            fetchSuccess = true;
          }
        } catch {
          continue;
        }
      }
    }

    // If all attempts failed, try the local search API as a fallback
    if (!fetchSuccess || html.length < 20) {
      // Try searching for the site info via the search API
      try {
        const domain = fetchUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const ports = [3000, 3001, 3002, 3003];
        for (const port of ports) {
          try {
            const searchRes = await fetch(`http://127.0.0.1:${port}/api/search`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: `site:${domain}` }),
              signal: AbortSignal.timeout(5000),
            });
            if (searchRes.ok) {
              const searchData = await searchRes.json();
              if (searchData.results && searchData.results.length > 0) {
                // Build a text summary from search results
                const topResult = searchData.results[0];
                const snippets = searchData.results.slice(0, 3).map((r: any) =>
                  `${r.name}: ${r.snippet}`
                ).join("\n\n");

                return NextResponse.json({
                  url: fetchUrl,
                  title: topResult.name || domain,
                  description: topResult.snippet || "",
                  textContent: snippets,
                  contentLength: snippets.length,
                  contentType: "search-fallback",
                  fetched: false,
                  searchResults: searchData.results.slice(0, 5),
                  hint: "Could not directly fetch the website. Showing search results instead.",
                });
              }
            }
          } catch { continue; }
        }
      } catch {}

      return NextResponse.json({
        error: "Could not fetch content from this URL",
        url,
        hint: "The website may be blocking automated access, using JavaScript-only rendering, or may be down. Try using web_search to find information about this site instead.",
      });
    }

    // --- Success: Parse the HTML ---

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "No title";

    // Extract meta description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
                     html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    const description = descMatch ? descMatch[1] : "";

    // Extract Open Graph description as fallback
    const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i);

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
    if (/react/i.test(html) && /__next/i.test(html)) indicators.push("Next.js");
    if (/nuxt/i.test(html)) indicators.push("Nuxt.js");
    if (/vue/i.test(html)) indicators.push("Vue.js");
    if (/angular/i.test(html)) indicators.push("Angular");
    if (/laravel/i.test(html)) indicators.push("Laravel");
    if (/django/i.test(html)) indicators.push("Django");
    if (/shopify/i.test(html)) indicators.push("Shopify");
    if (/squarespace/i.test(html)) indicators.push("Squarespace");
    if (/wix\.com/i.test(html)) indicators.push("Wix");
    if (/webflow/i.test(html)) indicators.push("Webflow");
    if (/joomla/i.test(html)) indicators.push("Joomla");
    if (/drupal/i.test(html)) indicators.push("Drupal");

    // Extract images
    const images = [...html.matchAll(/<img[^>]+src=["']([^"']*)["'][^>]*>/gi)]
      .map(m => m[1])
      .filter(src => src.startsWith("http") || src.startsWith("/"))
      .slice(0, 10);

    // Extract meta keywords
    const keywordsMatch = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']*)["']/i);
    const keywords = keywordsMatch ? keywordsMatch[1].split(",").map(k => k.trim()).filter(k => k.length > 0) : [];

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
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 15000);

    return NextResponse.json({
      url: finalUrl,
      title,
      description: description || ogDescMatch?.[1] || "",
      keywords,
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
