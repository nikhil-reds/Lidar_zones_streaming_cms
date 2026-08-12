"""
ws_client.py - runs on the Raspberry Pi.

Keeps a persistent WebSocket connection to the PC (which runs the
server) and lets the synchronous LiDAR main loop fire-and-forget tiny
JSON messages like {"video": 1} whenever a zone is triggered.

Also posts HTTP trigger events to the Next.js CMS API (http://<PC_HOST>:3000/api/trigger)
so telemetry logs update live on your laptop dashboard!

Usage from your main script:

    from ws_client import ZoneSignaler
    signaler = ZoneSignaler(PC_HOST, PC_PORT)   # starts connecting in the background
    ...
    signaler.send(1)      # zone1 triggered -> play video 1 on the PC
    signaler.send(2)      # zone2 triggered -> play video 2
    signaler.send(None)   # no zone active -> PC goes idle
"""

import asyncio
import json
import threading
import urllib.request
import urllib.error


class ZoneSignaler:
    def __init__(self, host, port=8765, cms_port=3000, reconnect_delay=2.0):
        self.host = host
        self.port = port
        self.cms_port = cms_port
        self.uri = f"ws://{host}:{port}"
        self.cms_url = f"http://{host}:{cms_port}/api/trigger"
        self.reconnect_delay = reconnect_delay
        self._loop = asyncio.new_event_loop()
        self._ws = None
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def _run_loop(self):
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._maintain_connection())

    async def _maintain_connection(self):
        import websockets
        while True:
            try:
                async with websockets.connect(self.uri) as ws:
                    self._ws = ws
                    print(f"[ws_client] Connected to PC WebSocket at {self.uri}")
                    await ws.wait_closed()
            except Exception as e:
                print(f"[ws_client] Could not reach PC WebSocket ({e}); retrying in {self.reconnect_delay}s...")
            self._ws = None
            await asyncio.sleep(self.reconnect_delay)

    def send(self, video_id):
        """video_id: 1, 2, ... for a specific video, or None for idle.
        Sends payload to both WebSocket server and CMS HTTP API."""
        vid = video_id if video_id else 0
        payload = json.dumps({"video": vid})

        # 1. Send over WebSocket if connected
        if self._ws is not None:
            asyncio.run_coroutine_threadsafe(self._safe_send(payload), self._loop)
        else:
            print(f"[ws_client] WS not connected - sending HTTP CMS trigger for video:{vid}")

        # 2. Dispatch HTTP POST to Next.js CMS API in background thread
        threading.Thread(target=self._post_cms_trigger, args=(vid,), daemon=True).start()

    async def _safe_send(self, payload):
        try:
            if self._ws is not None:
                await self._ws.send(payload)
        except Exception as e:
            print(f"[ws_client] WS Send failed: {e}")

    def _post_cms_trigger(self, video_id):
        """Posts trigger event directly to Next.js CMS API for live telemetry logs."""
        try:
            req = urllib.request.Request(
                self.cms_url,
                data=json.dumps({"video": video_id}).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                pass
        except Exception as e:
            # Silent fallback if CMS API HTTP is unreachable
            pass
