import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "GitHub URL required" }, { status: 400 });

    // Parse GitHub URL: https://github.com/owner/repo or https://raw.githubusercontent.com/...
    let owner = "";
    let repo = "";
    let branch = "main";

    // Handle raw.githubusercontent.com URLs
    const rawMatch = url.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)/);
    if (rawMatch) {
      owner = rawMatch[1];
      repo = rawMatch[2];
      branch = rawMatch[3];
    } else {
      // Handle github.com URLs
      const ghMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!ghMatch) return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
      owner = ghMatch[1];
      repo = ghMatch[2].replace(/\.git$/, "");
      const branchMatch = url.match(/\/tree\/([^/]+)/);
      if (branchMatch) branch = branchMatch[1];
    }

    console.log(`[Agent Import] Fetching agents from ${owner}/${repo} (${branch})`);

    // Fetch repo tree to find SOUL.md or agent definition files
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const treeRes = await fetch(treeUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!treeRes.ok) {
      const errMsg = treeRes.status === 403
        ? "GitHub API rate limit reached. Wait a few minutes or try a smaller repo."
        : treeRes.status === 404
        ? "Repository or branch not found. Check the URL."
        : `GitHub API error ${treeRes.status}`;
      console.error(`[Agent Import] Tree fetch failed: ${treeRes.status}`);
      return NextResponse.json({ error: errMsg }, { status: treeRes.status });
    }

    const treeData = await treeRes.json();
    const files: { path: string; type: string }[] = treeData.tree || [];

    // Find agent definition files (SOUL.md, agent.json, or directories with SOUL.md)
    const agentDirs = new Set<string>();
    const soulFiles = files.filter(f =>
      f.type === "blob" && (
        f.path.endsWith("SOUL.md") ||
        f.path.endsWith("agent.md") ||
        f.path.endsWith("AGENT.md")
      )
    );

    console.log(`[Agent Import] Found ${soulFiles.length} agent definition files`);

    const imported: string[] = [];
    const errors: string[] = [];

    for (const file of soulFiles) {
      try {
        // Fetch the SOUL.md content
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`;
        const contentRes = await fetch(rawUrl);
        if (!contentRes.ok) {
          errors.push(`${file.path}: HTTP ${contentRes.status}`);
          continue;
        }

        const content = await contentRes.text();

        // Parse agent metadata from SOUL.md
        let agentName = file.path.split("/").slice(-2)[0] || file.path.split("/").pop()?.replace(/\.[^/.]+$/, "") || "unknown";
        let agentRole = "Custom Agent";
        let agentAvatar = "🤖";
        let systemPrompt = content;

        // Extract YAML frontmatter if present
        const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (yamlMatch) {
          const yaml = yamlMatch[1];
          const nameMatch = yaml.match(/name:\s*(.+)/);
          if (nameMatch) agentName = nameMatch[1].trim();

          const descMatch = yaml.match(/description:\s*(.+)/);
          if (descMatch) agentRole = descMatch[1].trim().slice(0, 100);

          const iconMatch = yaml.match(/(?:avatar|icon|emoji):\s*(.+)/);
          if (iconMatch) agentAvatar = iconMatch[1].trim();

          // Remove frontmatter for cleaner prompt
          systemPrompt = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "").trim();
        }

        // Upsert agent into database
        await db.agent.upsert({
          where: { name: agentName },
          update: {
            role: agentRole,
            systemPrompt,
            avatar: agentAvatar,
          },
          create: {
            name: agentName,
            role: agentRole,
            systemPrompt,
            avatar: agentAvatar,
          },
        });

        imported.push(agentName);
      } catch (e: any) {
        errors.push(`${file.path}: ${e.message}`);
      }
    }

    // If no SOUL.md files found, try fetching the README for agent lists
    if (soulFiles.length === 0) {
      const readmeFile = files.find(f => f.path.toLowerCase() === "readme.md");
      if (readmeFile) {
        try {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${readmeFile.path}`;
          const contentRes = await fetch(rawUrl);
          const readmeContent = await contentRes.text();

          // Extract agent names from markdown tables
          const tableRows = readmeContent.match(/\|\s*\[(.+?)\]\(.+?\)\s*\|/g);
          if (tableRows) {
            for (const row of tableRows.slice(0, 50)) {
              const nameMatch = row.match(/\[(.+?)\]/);
              if (nameMatch && nameMatch[1] !== "View" && !nameMatch[1].includes("Deploy")) {
                // Extract emoji if present
                const emojiMatch = nameMatch[1].match(/([\p{Emoji}\u{200d}]+)\s*(.+)/u);
                const agentName = emojiMatch ? emojiMatch[2].trim() : nameMatch[1].trim();
                const avatar = emojiMatch ? emojiMatch[1].trim() : "🤖";

                await db.agent.upsert({
                  where: { name: agentName },
                  update: {
                    role: `Agent from ${owner}/${repo}`,
                    systemPrompt: `Agent imported from GitHub repository ${owner}/${repo}.\n\nConfigure this agent's system prompt in Settings > Agents.`,
                    avatar,
                  },
                  create: {
                    name: agentName,
                    role: `Agent from ${owner}/${repo}`,
                    systemPrompt: `Agent imported from GitHub repository ${owner}/${repo}.\n\nConfigure this agent's system prompt in Settings > Agents.`,
                    avatar,
                  },
                });

                imported.push(agentName);
              }
            }
          }
        } catch (e: any) {
          errors.push(`README parsing: ${e.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported: imported.length,
      names: imported.slice(0, 50),
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      source: `${owner}/${repo}`,
    });
  } catch (error: unknown) {
    console.error("[Agent Import Error]:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
