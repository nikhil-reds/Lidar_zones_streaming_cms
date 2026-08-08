"""
ws_client.py - runs on the Raspberry Pi.

Keeps a persistent WebSocket connection to the PC (which runs the
server) and lets the synchronous LiDAR main loop fire-and-forget tiny
JSON messages like {"video": 1} whenever a zone is triggered.

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


class ZoneSignaler:
    def __init__(self, host, port=8765, reconnect_delay=2.0):
        self.uri = f"ws://{host}:{port}"
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
                    print(f"[ws_client] Connected to PC at {self.uri}")
                    await ws.wait_closed()
            except Exception as e:
                print(f"[ws_client] Could not reach PC ({e}); retrying in {self.reconnect_delay}s...")
            self._ws = None
            await asyncio.sleep(self.reconnect_delay)

    def send(self, video_id):
        """video_id: 1, 2, ... for a specific video, or None for idle.
        Safe to call directly from the synchronous LiDAR loop - it just
        hands the message to the background connection thread and
        returns immediately, so it never blocks your zone-detection code."""
        if self._ws is None:
            print("[ws_client] Not connected yet - message dropped, will resend on next state change")
            return
        payload = json.dumps({"video": video_id if video_id else 0})
        asyncio.run_coroutine_threadsafe(self._safe_send(payload), self._loop)

    async def _safe_send(self, payload):
        try:
            if self._ws is not None:
                await self._ws.send(payload)
        except Exception as e:
            print(f"[ws_client] Send failed: {e}")
