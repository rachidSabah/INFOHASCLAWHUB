import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

let ZAI: any = null;
async function getZAI() {
  if (!ZAI) {
    const mod = await import('z-ai-web-dev-sdk');
    ZAI = mod.default;
  }
  return ZAI.create();
}



async function callAI(prompt: string): Promise<string> {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a security expert. Scan the provided code for exposed secrets, API keys, passwords, tokens, and private keys. Return a JSON array of found secrets with: filePath, line, secretType, maskedValue (show first 2 and last 2 chars), severity.' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim() && result.trim() !== '[]') return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[SecuritySecrets] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generateSecretsFallback(prompt);
}

function generateSecretsFallback(prompt: string): string {
  // Extract file path and content from the prompt
  const filePathMatch = prompt.match(/File:\s*(.+)/);
  const contentMatch = prompt.match(/Content:\n([\s\S]*?)$/);
  const filePath = filePathMatch ? filePathMatch[1].trim() : 'unknown';
  const content = contentMatch ? contentMatch[1] : '';

  const secrets: Array<{ filePath: string; line: number; secretType: string; maskedValue: string; severity: string }> = [];

  if (content) {
    const lines = content.split('\n');

    // Regex patterns for common secret types
    const patterns: Array<{ regex: RegExp; secretType: string; severity: string }> = [
      { regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]([\w-]{8,})['"]/gi, secretType: 'api_key', severity: 'high' },
      { regex: /(?:secret[_-]?key|secretkey)\s*[:=]\s*['"]([\w-]{8,})['"]/gi, secretType: 'secret_key', severity: 'critical' },
      { regex: /(?:password|passwd|pwd)\s*[:=]\s*['"]([^'"]{4,})['"]/gi, secretType: 'password', severity: 'critical' },
      { regex: /(?:auth[_-]?token|access[_-]?token|bearer)\s*[:=]\s*['"]([\w.-]{8,})['"]/gi, secretType: 'token', severity: 'high' },
      { regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/gi, secretType: 'private_key', severity: 'critical' },
      { regex: /(?:mongodb|postgres|mysql|redis):\/\/[\w:.-]+@[\w.-]+/gi, secretType: 'connection_string', severity: 'critical' },
      { regex: /sk-[a-zA-Z0-9]{20,}/g, secretType: 'openai_api_key', severity: 'critical' },
      { regex: /AKIA[0-9A-Z]{16}/g, secretType: 'aws_access_key', severity: 'critical' },
      { regex: /ghp_[a-zA-Z0-9]{36}/g, secretType: 'github_token', severity: 'high' },
      { regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, secretType: 'jwt_token', severity: 'medium' },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { regex, secretType, severity } of patterns) {
        const match = regex.exec(line);
        if (match) {
          const fullMatch = match[0];
          const maskedValue = fullMatch.length > 6
            ? fullMatch.substring(0, 3) + '***' + fullMatch.substring(fullMatch.length - 3)
            : '***';
          secrets.push({
            filePath,
            line: i + 1,
            secretType,
            maskedValue,
            severity,
          });
        }
        regex.lastIndex = 0; // Reset regex for next line
      }
    }
  }

  return JSON.stringify(secrets);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const secretType = searchParams.get('secretType');
    const isRevoked = searchParams.get('isRevoked');

    const where: any = {};
    if (secretType) where.secretType = secretType;
    if (isRevoked !== null) where.isRevoked = isRevoked === 'true';

    const secrets = await db.exposedSecret.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(secrets);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files } = body;

    if (!files || !Array.isArray(files)) {
      return NextResponse.json({ error: 'files array is required' }, { status: 400 });
    }

    const foundSecrets = [];

    for (const file of files) {
      const aiResult = await callAI(
        `Scan this file for exposed secrets:\n\nFile: ${file.path}\nContent:\n${file.content}\n\nReturn a JSON array of found secrets.`
      );

      let secrets;
      try {
        secrets = JSON.parse(aiResult);
      } catch {
        secrets = [];
      }

      for (const secret of secrets) {
        const created = await db.exposedSecret.create({
          data: {
            filePath: secret.filePath || file.path,
            line: secret.line || 0,
            secretType: secret.secretType || 'api_key',
            maskedValue: secret.maskedValue || '****',
          },
        });
        foundSecrets.push(created);
      }
    }

    return NextResponse.json({ scanned: files.length, found: foundSecrets.length, secrets: foundSecrets });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
