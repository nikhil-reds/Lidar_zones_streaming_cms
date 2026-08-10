import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const wsPort = parseInt(process.env.WS_PORT || "8765", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Store connected kiosk display clients
const connectedClients = new Set<WebSocket>();

// Default Video Stream URLs
const MEDIA_FALLBACKS: Record<number, { zone: string; title: string; url: string }> = {
  0: {
    zone: "IDLE",
    title: "Idle Ambience Loop",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  },
  1: {
    zone: "ZONE 1",
    title: "Exhibit 1 - Interactive LiDAR Showcase",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  },
  2: {
    zone: "ZONE 2",
    title: "Exhibit 2 - Deep Sea LiDAR Mapping",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
};

app.prepare().then(() => {
  // 1. Next.js HTTP Server
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || "", true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("HTTP Request Error:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  server.listen(port, () => {
    console.log(`> Next.js CMS Server listening on http://${hostname}:${port}`);
  });

  // 2. Standalone WebSocket Hub on Port 8765
  const wss = new WebSocketServer({ port: wsPort });
  console.log(`> LiDAR WebSocket Bridge Server listening on ws://${hostname}:${wsPort}`);

  wss.on("connection", (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[WS] Client Connected from ${clientIp}`);
    connectedClients.add(ws);

    // Send welcome status message
    ws.send(
      JSON.stringify({
        type: "status",
        message: "Connected to LiDAR Zones CMS WebSocket Server",
        activeClients: connectedClients.size,
      })
    );

    ws.on("message", (data) => {
      try {
        const payloadStr = data.toString();
        console.log(`[WS INGEST] ${payloadStr}`);
        const parsed = JSON.parse(payloadStr);

        const videoKey = parsed.video !== undefined ? Number(parsed.video) : Number(parsed.zoneKey || 0);
        const mediaInfo = MEDIA_FALLBACKS[videoKey] || MEDIA_FALLBACKS[0];

        const broadcastPayload = JSON.stringify({
          type: "zone_trigger",
          video: videoKey,
          zone: mediaInfo.zone,
          title: mediaInfo.title,
          mediaUrl: mediaInfo.url,
          timestamp: new Date().toISOString(),
        });

        // Relay event to all connected Web Kiosks & Dashboards
        connectedClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(broadcastPayload);
          }
        });
      } catch (err) {
        console.error("[WS ERROR] Failed parsing message:", err);
      }
    });

    ws.on("close", () => {
      console.log(`[WS] Client Disconnected (${clientIp})`);
      connectedClients.delete(ws);
    });

    ws.on("error", (err) => {
      console.error(`[WS CLIENT ERROR]`, err);
    });
  });
});
