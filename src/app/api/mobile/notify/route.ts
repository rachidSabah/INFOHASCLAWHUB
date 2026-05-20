import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, title, message, type, data } = body;

    if (!title || !message) {
      return NextResponse.json({ error: 'title and message are required' }, { status: 400 });
    }

    // Find all registered devices for the user
    const devices = await db.settings.findMany({
      where: {
        key: { startsWith: 'mobile_device_' },
      },
    });

    const targetDevices = devices.filter(d => {
      try {
        const parsed = JSON.parse(d.value);
        return !userId || parsed.userId === userId;
      } catch {
        return false;
      }
    });

    // Simulate push notification delivery
    const results = targetDevices.map(device => {
      try {
        const parsed = JSON.parse(device.value);
        return {
          deviceToken: parsed.deviceToken?.substring(0, 10) + '...',
          platform: parsed.platform,
          delivered: true,
          timestamp: new Date().toISOString(),
        };
      } catch {
        return { delivered: false, error: 'Invalid device data' };
      }
    });

    return NextResponse.json({
      success: true,
      notification: { title, message, type, data },
      recipients: results.length,
      results,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
