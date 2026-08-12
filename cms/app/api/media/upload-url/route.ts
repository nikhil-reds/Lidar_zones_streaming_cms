import { NextResponse } from "next/server";
import { getUploadPresignedUrl, getDownloadPresignedUrl } from "@/lib/s3";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fileName, mimeType } = body;

    if (!fileName) {
      return NextResponse.json({ success: false, error: "fileName parameter is required" }, { status: 400 });
    }

    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const s3Key = `videos/${Date.now()}_${cleanFileName}`;

    const presignedUpload = await getUploadPresignedUrl(s3Key, mimeType || "video/mp4");
    const presignedDownload = await getDownloadPresignedUrl(s3Key);

    return NextResponse.json({
      success: true,
      uploadUrl: presignedUpload.uploadUrl,
      s3Key,
      publicUrl: presignedDownload.url || `https://${presignedUpload.bucket}.s3.${process.env.AWS_REGION || "ap-south-1"}.amazonaws.com/${s3Key}`,
      bucket: presignedUpload.bucket,
      isMock: presignedUpload.isMock || false,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
