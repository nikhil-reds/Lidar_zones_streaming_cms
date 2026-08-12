import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_DytR8K5owdns@ep-calm-lab-aztifuij-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log("Seeding Neon PostgreSQL Database with Live Initial Data...");

  // 1. Device Config
  const device = await prisma.deviceConfig.upsert({
    where: { id: "default" },
    update: {
      piHost: "172.30.1.201",
      wsPort: 8765,
      debugStreamPort: 8080,
      status: "ONLINE",
      lastHeartbeat: new Date(),
    },
    create: {
      id: "default",
      piHost: "172.30.1.201",
      wsPort: 8765,
      debugStreamPort: 8080,
      status: "ONLINE",
    },
  });
  console.log("Created/Updated DeviceConfig:", device);

  // 2. Media Assets
  const m0 = await prisma.mediaAsset.upsert({
    where: { s3Key: "videos/idle_ambient_loop.mp4" },
    update: {},
    create: {
      title: "Idle Ambience Loop",
      fileName: "idle_ambient_loop.mp4",
      s3Key: "videos/idle_ambient_loop.mp4",
      publicUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      mimeType: "video/mp4",
      sizeBytes: 44316922,
      durationSec: 15.0,
      resolution: "1920x1080",
    },
  });

  const m1 = await prisma.mediaAsset.upsert({
    where: { s3Key: "videos/exhibit_1_showcase.mp4" },
    update: {},
    create: {
      title: "Exhibit 1 - Interactive LiDAR Showcase",
      fileName: "exhibit_1_showcase.mp4",
      s3Key: "videos/exhibit_1_showcase.mp4",
      publicUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      mimeType: "video/mp4",
      sizeBytes: 10275259,
      durationSec: 30.0,
      resolution: "1920x1080",
    },
  });

  const m2 = await prisma.mediaAsset.upsert({
    where: { s3Key: "videos/exhibit_2_deepsea.mp4" },
    update: {},
    create: {
      title: "Exhibit 2 - Deep Sea LiDAR Mapping",
      fileName: "exhibit_2_deepsea.mp4",
      s3Key: "videos/exhibit_2_deepsea.mp4",
      publicUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      mimeType: "video/mp4",
      sizeBytes: 29317648,
      durationSec: 60.0,
      resolution: "1920x1080",
    },
  });
  console.log("Seeded MediaAssets:", [m0.id, m1.id, m2.id]);

  // 3. Zones
  const z1 = await prisma.zone.upsert({
    where: { zoneKey: 1 },
    update: {},
    create: {
      name: "Exhibit Zone 1 (Left Area)",
      zoneKey: 1,
      minX: -2.5,
      maxX: -0.5,
      minY: 1.0,
      maxY: 3.5,
      color: "#3b82f6",
      isActive: true,
    },
  });

  const z2 = await prisma.zone.upsert({
    where: { zoneKey: 2 },
    update: {},
    create: {
      name: "Exhibit Zone 2 (Right Area)",
      zoneKey: 2,
      minX: 0.5,
      maxX: 2.5,
      minY: 1.0,
      maxY: 3.5,
      color: "#10b981",
      isActive: true,
    },
  });
  console.log("Seeded Zones:", [z1.id, z2.id]);

  // 4. Zone Allocations
  // Clear old allocations first to prevent duplicates
  await prisma.zoneAllocation.deleteMany({});

  const a0 = await prisma.zoneAllocation.create({
    data: {
      mediaId: m0.id,
      isIdleDefault: true,
      priority: 0,
    },
  });

  const a1 = await prisma.zoneAllocation.create({
    data: {
      zoneId: z1.id,
      mediaId: m1.id,
      isIdleDefault: false,
      priority: 1,
    },
  });

  const a2 = await prisma.zoneAllocation.create({
    data: {
      zoneId: z2.id,
      mediaId: m2.id,
      isIdleDefault: false,
      priority: 1,
    },
  });
  console.log("Seeded ZoneAllocations:", [a0.id, a1.id, a2.id]);

  console.log("DATABASE SEED COMPLETED SUCCESSFULLY!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
