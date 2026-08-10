import { NextResponse } from "next/server";
import { prisma, safePrismaQuery } from "@/lib/prisma";

let currentTriggerState = {
  activeZoneKey: 0,
  activeZoneName: "Idle Default (No Zone Active)",
  activeMedia: {
    id: "m0",
    title: "Idle Ambience Loop",
    fileName: "idle_ambient_loop.mp4",
    s3Key: "videos/idle_ambient_loop.mp4",
    publicUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  },
  updatedAt: new Date().toISOString(),
};

const DEFAULT_VIDEOS: Record<number, { title: string; fileName: string; publicUrl: string }> = {
  0: {
    title: "Idle Ambience Loop",
    fileName: "idle_ambient_loop.mp4",
    publicUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  },
  1: {
    title: "Exhibit 1 - Interactive LiDAR Showcase",
    fileName: "exhibit_1_showcase.mp4",
    publicUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  },
  2: {
    title: "Exhibit 2 - Deep Sea LiDAR Mapping",
    fileName: "exhibit_2_deepsea.mp4",
    publicUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
};

export async function GET() {
  return NextResponse.json({ success: true, state: currentTriggerState });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const videoKey = Number(body.video !== undefined ? body.video : body.zoneKey || 0);

    let activeMedia: any = null;
    let zoneName = videoKey === 0 ? "Idle Default State" : `Zone ${videoKey}`;

    if (videoKey === 0) {
      const idleAllocResult = await safePrismaQuery(
        () =>
          prisma.zoneAllocation.findFirst({
            where: { isIdleDefault: true },
            include: { media: true },
          }),
        null
      );
      if (idleAllocResult.data?.media) {
        activeMedia = idleAllocResult.data.media;
      }
    } else {
      const zoneResult = await safePrismaQuery(
        () =>
          prisma.zone.findUnique({
            where: { zoneKey: videoKey },
            include: {
              allocations: {
                include: { media: true },
              },
            },
          }),
        null
      );
      if (zoneResult.data) {
        zoneName = zoneResult.data.name;
        if (zoneResult.data.allocations.length > 0) {
          activeMedia = zoneResult.data.allocations[0].media;
        }
      }
    }

    if (!activeMedia) {
      activeMedia = DEFAULT_VIDEOS[videoKey] || DEFAULT_VIDEOS[0];
    }

    currentTriggerState = {
      activeZoneKey: videoKey,
      activeZoneName: zoneName,
      activeMedia,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      message: `Trigger event video:${videoKey} processed`,
      state: currentTriggerState,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
