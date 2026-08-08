"""
pc_server.py
Runs on the Windows laptop.

Waits for the Raspberry Pi to send:
    {"video": 1}
    {"video": 2}
    {"video": 0}

Then plays the corresponding local video fullscreen WITH AUDIO using VLC.

WHAT CHANGED vs your version:
  - The old code called vlc's set_fullscreen(True) but never embedded VLC
    into a window of ours. That means VLC creates its OWN native output
    window the first time it plays something. That new window pops up
    behind/beside whatever you're doing, doesn't have focus, and that's
    why you had to alt-tab to it.
  - Fix: we create a single black, topmost, fullscreen Tkinter window
    the moment the script starts (so you get an automatic black screen
    right away, no window switching needed), and we embed VLC's video
    output INSIDE that window using player.set_hwnd(). VLC then draws
    into our window instead of opening its own. Same window handles
    video 1, video 2, and the black/idle state - it never closes or
    reopens, so there is nothing to alt-tab to.

Install:
    1) Install VLC media player itself (the actual app, not just the pip package):
       https://www.videolan.org/vlc/
    2) pip install websockets python-vlc

Run:
    python pc_server.py

Press Escape at any time to quit (useful while testing).
"""

import asyncio
import json
import threading
import tkinter as tk
import vlc
import websockets

# ============================================================
# CONFIG
# ============================================================

HOST = "0.0.0.0"
PORT = 8765

VIDEO_MAP = {
    1: r"C:\Users\vikra\OneDrive\Desktop\videolidar\video1.mp4",
    2: r"C:\Users\vikra\OneDrive\Desktop\videolidar\video2.mp4",
}

# Plays whenever no one is in zone 1 or zone 2 (i.e. the Pi sends {"video": 0}
# or hasn't sent anything yet). This is now treated as "video 0" instead of
# a black screen.
IDLE_VIDEO = r"C:\Users\vikra\OneDrive\Desktop\videolidar\demo.mp4"

POLL_MS = 50  # how often (ms) we check for a new requested video

# ============================================================
# Shared state (set by the websocket thread, read by the UI thread)
# ============================================================

lock = threading.Lock()
requested_video = 0


def set_requested_video(video):
    global requested_video
    with lock:
        requested_video = video


def get_requested_video():
    with lock:
        return requested_video


# ============================================================
# WebSocket Server (runs in a background thread)
# ============================================================

async def handler(websocket):
    print("Raspberry Pi Connected!")
    try:
        async for message in websocket:
            print("Received:", message)
            try:
                data = json.loads(message)
                video = int(data.get("video", 0))
                set_requested_video(video)
            except Exception as e:
                print(e)
    except Exception:
        print("Pi Disconnected")


async def websocket_server():
    async with websockets.serve(handler, HOST, PORT):
        print(f"Waiting for Raspberry Pi on ws://{HOST}:{PORT}")
        await asyncio.Future()


def start_server():
    threading.Thread(
        target=lambda: asyncio.run(websocket_server()),
        daemon=True
    ).start()


# ============================================================
# Fullscreen window + embedded VLC player (runs on the main thread)
# ============================================================

class Player:
    def __init__(self):
        # --- Black fullscreen window, created immediately on startup ---
        self.root = tk.Tk()
        self.root.title("Video Player")
        self.root.configure(bg="black")
        self.root.attributes("-fullscreen", True)
        self.root.attributes("-topmost", True)   # stays on top, no alt-tab needed
        self.root.config(cursor="none")          # hide the mouse cursor

        # A plain frame is what we hand to VLC to draw video into
        self.video_frame = tk.Frame(self.root, bg="black")
        self.video_frame.pack(fill=tk.BOTH, expand=True)

        # Quit with Escape (handy for testing / kiosk exit)
        self.root.bind("<Escape>", lambda e: self.root.destroy())

        # Force the window to exist + grab focus before VLC binds to it
        self.root.update_idletasks()
        self.root.focus_force()

        # --- VLC instance/player, embedded into the frame above ---
        self.instance = vlc.Instance("--no-video-title-show", "--mouse-hide-timeout=0")
        self.player = self.instance.media_player_new()
        self.player.set_hwnd(self.video_frame.winfo_id())  # Windows-only embedding

        # Pre-load every Media object once, so switching is instant.
        # Key 0 = idle/demo video, keys 1/2 = your zone videos.
        all_videos = {0: IDLE_VIDEO, **VIDEO_MAP}
        self.media_cache = {}
        for video_id, path in all_videos.items():
            media = self.instance.media_new(path)
            media.add_option("input-repeat=-1")  # loop while this video is active
            self.media_cache[video_id] = media

        self.current_video = -1

        # Start polling for zone changes and kick off the black screen
        self.root.after(POLL_MS, self.poll)

    def poll(self):
        video = get_requested_video()

        if video != self.current_video:
            self.current_video = video

            if video in self.media_cache:
                print("Switching to video:", video)
                self.player.set_media(self.media_cache[video])
                self.player.play()
            else:
                print("Black Screen")
                self.player.stop()

        self.root.after(POLL_MS, self.poll)

    def run(self):
        self.root.mainloop()


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    start_server()
    Player().run()