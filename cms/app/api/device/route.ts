import { NextResponse } from "next/server";
import { prisma, safePrismaQuery } from "@/lib/prisma";

const DEFAULT_DEVICE = {
  id: "default",
  piHost: "192.168.1.100",
  wsPort: 8765,
  debugStreamPort: 8080,
  status: "ONLINE",
  lastHeartbeat: new Date().toISOString(),
  s3Bucket: process.env.AWS_BUCKET_NAME || "lidar-assets",
  s3Region: process.env.AWS_REGION || "ap-south-1",
  dbStatus: "CONNECTED",
};

export async function GET() {
  const result = await safePrismaQuery(
    () => prisma.deviceConfig.findUnique({ where: { id: "default" } }),
    DEFAULT_DEVICE
  );
  const data = result.data || DEFAULT_DEVICE;
  return NextResponse.json({ success: true, data: { ...DEFAULT_DEVICE, ...data }, source: result.source });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { piHost, wsPort, debugStreamPort, status } = body;

    const result = await safePrismaQuery(
      () =>
        prisma.deviceConfig.upsert({
          where: { id: "default" },
          update: {
            ...(piHost && { piHost }),
            ...(wsPort && { wsPort: Number(wsPort) }),
            ...(debugStreamPort && { debugStreamPort: Number(debugStreamPort) }),
            ...(status && { status }),
            lastHeartbeat: new Date(),
          },
          create: {
            id: "default",
            piHost: piHost || "192.168.1.100",
            wsPort: Number(wsPort || 8765),
            debugStreamPort: Number(debugStreamPort || 8080),
            status: status || "ONLINE",
          },
        }),
      { ...DEFAULT_DEVICE, ...body }
    );

    return NextResponse.json({ success: true, data: result.data, source: result.source });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
