import { NextResponse } from "next/server";
import { prisma, safePrismaQuery } from "@/lib/prisma";
import { deleteS3Object } from "@/lib/s3";

const MOCK_MEDIA = [
  {
    id: "m0",
    title: "Idle Ambience Loop",
    fileName: "idle_ambient_loop.mp4",
    s3Key: "videos/idle_ambient_loop.mp4",
    publicUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    mimeType: "video/mp4",
    sizeBytes: 44316922,
    durationSec: 15.0,
    resolution: "1920x1080",
    createdAt: new Date().toISOString(),
  },
  {
    id: "m1",
    title: "Exhibit 1 - Interactive LiDAR Showcase",
    fileName: "exhibit_1_showcase.mp4",
    s3Key: "videos/exhibit_1_showcase.mp4",
    publicUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    mimeType: "video/mp4",
    sizeBytes: 10275259,
    durationSec: 30.0,
    resolution: "1920x1080",
    createdAt: new Date().toISOString(),
  },
  {
    id: "m2",
    title: "Exhibit 2 - Deep Sea LiDAR Mapping",
    fileName: "exhibit_2_deepsea.mp4",
    s3Key: "videos/exhibit_2_deepsea.mp4",
    publicUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    mimeType: "video/mp4",
    sizeBytes: 29317648,
    durationSec: 60.0,
    resolution: "1920x1080",
    createdAt: new Date().toISOString(),
  },
];

export async function GET() {
  const result = await safePrismaQuery(
    () => prisma.mediaAsset.findMany({ orderBy: { createdAt: "desc" } }),
    MOCK_MEDIA
  );
  const data = result.data !== null && result.data !== undefined ? result.data : MOCK_MEDIA;
  return NextResponse.json({ success: true, data, source: result.source });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, fileName, s3Key, publicUrl, mimeType, sizeBytes, durationSec, resolution } = body;

    if (!title || !s3Key || !publicUrl) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (title, s3Key, publicUrl)" },
        { status: 400 }
      );
    }

    const mockAsset = {
      id: `m_${Date.now()}`,
      title,
      fileName: fileName || title,
      s3Key,
      publicUrl,
      mimeType: mimeType || "video/mp4",
      sizeBytes: Number(sizeBytes || 0),
      durationSec: Number(durationSec || 0),
      resolution: resolution || "1920x1080",
      createdAt: new Date().toISOString(),
    };

    const result = await safePrismaQuery(
      () =>
        prisma.mediaAsset.create({
          data: {
            title,
            fileName: fileName || title,
            s3Key,
            publicUrl,
            mimeType: mimeType || "video/mp4",
            sizeBytes: Number(sizeBytes || 0),
            durationSec: Number(durationSec || 0),
            resolution: resolution || "1920x1080",
          },
        }),
      mockAsset
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
    const s3Key = searchParams.get("s3Key");

    if (!id && !s3Key) {
      return NextResponse.json({ success: false, error: "id or s3Key is required" }, { status: 400 });
    }

    if (s3Key) {
      await deleteS3Object(s3Key);
    }

    if (id) {
      await safePrismaQuery(() => prisma.mediaAsset.delete({ where: { id } }), { id });
    }

    return NextResponse.json({ success: true, deletedId: id, s3Key });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
