import { NextResponse } from "next/server";
import { prisma, safePrismaQuery } from "@/lib/prisma";

const MOCK_ALLOCATIONS = [
  {
    id: "a0",
    zoneId: null,
    zoneName: "Idle Default (No Zone Active)",
    mediaId: "m0",
    isIdleDefault: true,
    priority: 0,
  },
  {
    id: "a1",
    zoneId: "z1",
    zoneName: "Exhibit Zone 1 (Left Area)",
    mediaId: "m1",
    isIdleDefault: false,
    priority: 1,
  },
  {
    id: "a2",
    zoneId: "z2",
    zoneName: "Exhibit Zone 2 (Right Area)",
    mediaId: "m2",
    isIdleDefault: false,
    priority: 1,
  },
];

export async function GET() {
  const result = await safePrismaQuery(
    () =>
      prisma.zoneAllocation.findMany({
        include: {
          zone: true,
          media: true,
        },
      }),
    MOCK_ALLOCATIONS
  );
  const data = result.data !== null && result.data !== undefined ? result.data : MOCK_ALLOCATIONS;
  return NextResponse.json({ success: true, data, source: result.source });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { zoneId, mediaId, isIdleDefault, priority } = body;

    if (!mediaId) {
      return NextResponse.json({ success: false, error: "mediaId is required" }, { status: 400 });
    }

    const mockAlloc = {
      id: `a_${Date.now()}`,
      zoneId: zoneId || null,
      mediaId,
      isIdleDefault: Boolean(isIdleDefault),
      priority: Number(priority || 1),
    };

    const result = await safePrismaQuery(
      () =>
        prisma.zoneAllocation.create({
          data: {
            zoneId: zoneId || null,
            mediaId,
            isIdleDefault: Boolean(isIdleDefault),
            priority: Number(priority || 1),
          },
          include: {
            zone: true,
            media: true,
          },
        }),
      mockAlloc
    );

    return NextResponse.json({ success: true, data: result.data, source: result.source });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, zoneId, mediaId, isIdleDefault, priority } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Allocation id is required" }, { status: 400 });
    }

    const result = await safePrismaQuery(
      () =>
        prisma.zoneAllocation.update({
          where: { id },
          data: {
            ...(zoneId !== undefined && { zoneId }),
            ...(mediaId && { mediaId }),
            ...(isIdleDefault !== undefined && { isIdleDefault: Boolean(isIdleDefault) }),
            ...(priority !== undefined && { priority: Number(priority) }),
          },
          include: {
            zone: true,
            media: true,
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
      return NextResponse.json({ success: false, error: "Allocation id required" }, { status: 400 });
    }

    await safePrismaQuery(() => prisma.zoneAllocation.delete({ where: { id } }), { id });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
