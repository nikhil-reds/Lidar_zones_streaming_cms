import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION || "ap-south-1";
const bucketName = process.env.AWS_BUCKET_NAME || "lidar-assets";

export const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

/**
 * Generate AWS S3 Presigned Upload URL for direct browser uploads.
 */
export async function getUploadPresignedUrl(s3Key: string, contentType: string = "video/mp4") {
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return { success: true, uploadUrl: url, s3Key, bucket: bucketName };
  } catch (error: any) {
    console.error("S3 Presigned Upload URL Error:", error);
    const publicUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
    return { success: true, uploadUrl: publicUrl, s3Key, bucket: bucketName, isMock: true };
  }
}

/**
 * Generate AWS S3 Presigned Download/Stream GET URL for browser playback.
 */
export async function getDownloadPresignedUrl(s3Key: string) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 86400 }); // 24 Hours
    return { success: true, url, s3Key, bucket: bucketName };
  } catch (error: any) {
    console.error("S3 Presigned Download URL Error:", error);
    const publicUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
    return { success: false, url: publicUrl, s3Key, bucket: bucketName };
  }
}

/**
 * Delete an object from AWS S3 Bucket.
 */
export async function deleteS3Object(s3Key: string) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });
    await s3Client.send(command);
    return { success: true };
  } catch (error: any) {
    console.warn("S3 Delete Warning:", error?.message || error);
    return { success: true, isMock: true };
  }
}

/**
 * Get public or signed URL for streaming.
 */
export function getS3PublicUrl(s3Key: string) {
  return `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
}
