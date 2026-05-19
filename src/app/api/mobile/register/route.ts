import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceToken, platform, userId, deviceName } = body;

    if (!deviceToken || !platform) {
      return NextResponse.json({ error: 'deviceToken and platform are required' }, { status: 400 });
    }

    // Store as a settings entry for mobile device registration
    const registration = await db.settings.create({
      data: {
        key: `mobile_device_${deviceToken.substring(0, 20)}`,
        value: JSON.stringify({
          deviceToken,
          platform, // "ios" | "android"
          userId,
          deviceName,
          registeredAt: new Date().toISOString(),
          isActive: true,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      registered: true,
      platform,
      deviceId: registration.id,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
