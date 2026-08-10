import { NextResponse } from "next/server";
import { getUploadPresignedUrl } from "@/lib/s3";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fileName, mimeType } = body;

    if (!fileName) {
      return NextResponse.json({ success: false, error: "fileName parameter is required" }, { status: 400 });
    }

    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const s3Key = `videos/${Date.now()}_${cleanFileName}`;

    const presignedData = await getUploadPresignedUrl(s3Key, mimeType || "video/mp4");

    return NextResponse.json({
      success: true,
      uploadUrl: presignedData.uploadUrl,
      s3Key,
      publicUrl: `https://${presignedData.bucket}.s3.${process.env.AWS_REGION || "ap-south-1"}.amazonaws.com/${s3Key}`,
      bucket: presignedData.bucket,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
