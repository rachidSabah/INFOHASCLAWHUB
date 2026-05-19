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



async function callAI(prompt: string) {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a security expert. Scan the provided code for exposed secrets, API keys, passwords, tokens, and private keys. Return a JSON array of found secrets with: filePath, line, secretType, maskedValue (show first 2 and last 2 chars), severity.' },
        { role: 'user', content: prompt }
      ],
    });
    return completion.choices[0]?.message?.content || '[]';
  } catch (error) {
    console.error('ZAI SDK error:', error);
    return '[]';
  }
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
