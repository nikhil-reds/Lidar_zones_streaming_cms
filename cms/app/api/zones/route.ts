import { NextResponse } from "next/server";
import { prisma, safePrismaQuery } from "@/lib/prisma";

// Fallback Mock Zones
const MOCK_ZONES = [
  {
    id: "z1",
    name: "Exhibit Zone 1 (Left Area)",
    zoneKey: 1,
    minX: -2.5,
    maxX: -0.5,
    minY: 1.0,
    maxY: 3.5,
    color: "#3b82f6",
    isActive: true,
  },
  {
    id: "z2",
    name: "Exhibit Zone 2 (Right Area)",
    zoneKey: 2,
    minX: 0.5,
    maxX: 2.5,
    minY: 1.0,
    maxY: 3.5,
    color: "#10b981",
    isActive: true,
  },
];

export async function GET() {
  const result = await safePrismaQuery(
    () => prisma.zone.findMany({ orderBy: { zoneKey: "asc" } }),
    MOCK_ZONES
  );
  const data = result.data && result.data.length > 0 ? result.data : MOCK_ZONES;
  return NextResponse.json({ success: true, data, source: result.source });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, zoneKey, minX, maxX, minY, maxY, color } = body;

    if (!name || zoneKey === undefined) {
      return NextResponse.json({ success: false, error: "Missing required fields name or zoneKey" }, { status: 400 });
    }

    const mockCreated = {
      id: `z_${Date.now()}`,
      name,
      zoneKey: Number(zoneKey),
      minX: Number(minX || 0),
      maxX: Number(maxX || 0),
      minY: Number(minY || 0),
      maxY: Number(maxY || 0),
      color: color || "#3b82f6",
      isActive: true,
    };

    const result = await safePrismaQuery(
      () =>
        prisma.zone.create({
          data: {
            name,
            zoneKey: Number(zoneKey),
            minX: Number(minX || 0),
            maxX: Number(maxX || 0),
            minY: Number(minY || 0),
            maxY: Number(maxY || 0),
            color: color || "#3b82f6",
          },
        }),
      mockCreated
    );

    return NextResponse.json({ success: true, data: result.data, source: result.source });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, minX, maxX, minY, maxY, isActive, color } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Zone id required" }, { status: 400 });
    }

    const result = await safePrismaQuery(
      () =>
        prisma.zone.update({
          where: { id },
          data: {
            ...(name && { name }),
            ...(minX !== undefined && { minX: Number(minX) }),
            ...(maxX !== undefined && { maxX: Number(maxX) }),
            ...(minY !== undefined && { minY: Number(minY) }),
            ...(maxY !== undefined && { maxY: Number(maxY) }),
            ...(color && { color }),
            ...(isActive !== undefined && { isActive: Boolean(isActive) }),
          },
        }),
      body
    );

    return NextResponse.json({ success: true, data: result.data, source: result.source });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Zone id required" }, { status: 400 });
    }

    await safePrismaQuery(() => prisma.zone.delete({ where: { id } }), { id });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
