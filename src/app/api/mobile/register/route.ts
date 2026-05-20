import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceToken, platform, userId, deviceName } = body;

    if (!deviceToken || !platform) {
      return NextResponse.json({ error: 'deviceToken and platform are required' }, { status: 400 });
    }

    const settingsKey = `mobile_device_${deviceToken.substring(0, 20)}`;
    const deviceData = JSON.stringify({
      deviceToken,
      platform, // "ios" | "android"
      userId,
      deviceName,
      registeredAt: new Date().toISOString(),
      isActive: true,
    });

    // Use upsert to avoid unique constraint violations on repeated registrations
    const registration = await db.settings.upsert({
      where: { key: settingsKey },
      update: { value: deviceData },
      create: { key: settingsKey, value: deviceData },
    });

    return NextResponse.json({
      success: true,
      registered: true,
      platform,
      deviceId: registration.id,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Registration failed';
    console.error('[Mobile Register] Error:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
