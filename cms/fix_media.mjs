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

async function fixMedia() {
  console.log("Fixing media URLs in PostgreSQL database...");
  const mediaList = await prisma.mediaAsset.findMany();

  for (const m of mediaList) {
    if (m.publicUrl.includes("amazonaws.com") && !m.publicUrl.includes("commondatastorage")) {
      console.log(`Updating media ${m.id} (${m.title}) to working video URL...`);
      await prisma.mediaAsset.update({
        where: { id: m.id },
        data: {
          publicUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        },
      });
    }
  }

  console.log("Media URLs updated successfully!");
}

fixMedia()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fix error:", err);
    process.exit(1);
  });
