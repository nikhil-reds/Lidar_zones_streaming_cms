import serial
import math
import time
import threading
import os

# OpenCV bundles its own Qt libraries, which often lack a working Wayland
# plugin on newer Raspberry Pi OS (Wayland by default) - this causes
# cv2.imshow() windows to open but render solid black. Forcing xcb (X11
# compatibility, which Wayland sessions also support) fixes it. Must be
# set BEFORE cv2 is imported. Only the signage window still uses this;
# the camera no longer opens any local window.
os.environ.setdefault("QT_QPA_PLATFORM", "xcb")

from read_ld19 import parse_packet, PORT, BAUD
from ws_client import ZoneSignaler  # NEW - sends zone triggers to the PC

try:
    import cv2
except ImportError:
    print("CRITICAL: OpenCV not found. Run: pip install opencv-python")
    exit()

try:
    from flask import Flask, Response
except ImportError:
    print("CRITICAL: Flask not found. Run: pip install flask")
    exit()

# ============================================================
# CONFIG
# ============================================================
MAX_DISTANCE = 8000
ROTATION_OFFSET = 90
MIN_DISTANCE = 40
MIN_INTENSITY = 15
FRONT_SIN_MARGIN = -0.02

# --- Calibration ---
CALIBRATION_SECONDS = 60
ANGLE_BIN_DEG = 2
NUM_BINS = int(360 / ANGLE_BIN_DEG)
RDP_EPSILON_MM = 150

# --- Tracking (LiDAR only - camera does NOT feed into this) ---
FOREGROUND_THRESHOLD_MM = 400
CLUSTER_GAP_MM = 200
MIN_CLUSTER_POINTS = 8
MAX_MATCH_DIST_MM = 700
MOTION_THRESHOLD_MM = 250
MOTION_STREAK_REQUIRED = 3
MOTION_STREAK_DECAY = 6
MAX_MISSED_FRAMES = 5

# --- Interactive zones (mm, in LiDAR room coordinates) ---
ZONE_1 = [-1500, -500, 1000, 2500]
ZONE_2 = [500, 1500, 1000, 2500]

ZONE_TRIGGER_ANY_OBJECT = True

# --- NEW: PC WebSocket server connection ---
# Set this to your Windows PC's local IP address (run `ipconfig` on the
# PC and use the IPv4 address of the Wi-Fi/Ethernet adapter it's on -
# same network as the Pi). Port must match PORT in pc_server.py.
PC_HOST = "10.181.186.69"   # laptop's current IP on the shared 10.228.42.x network
PC_PORT = 8765

# Maps this script's internal zone names to the numeric video IDs the
# PC's VIDEO_MAP expects. Add more zones/IDs here if you add more zones.
ZONE_TO_VIDEO_ID = {
    "zone1": 1,
    "zone2": 2,
}

# --- Signage (second monitor, local) - now OPTIONAL/legacy.
# Video playback has moved to the PC, so you no longer need image1.jpeg /
# image2.jpeg on the Pi, and SIGNAGE_LOCAL_WINDOW_ENABLED should normally
# stay False. This is kept only so the existing /signage.mjpg debug
# route still returns *something* if you want it; harmless to leave on.
SIGNAGE_MONITOR_OFFSET_X = 1920
AD_IMAGE_ZONE1 = 'image1.jpeg'
AD_IMAGE_ZONE2 = 'image2.jpeg'
SIGNAGE_LOCAL_WINDOW_ENABLED = False

# --- Camera (pure stream, no processing) ---
CAMERA_PREVIEW_ENABLED = True
CAMERA_SRC = 0
CAMERA_WIDTH = 1920
CAMERA_HEIGHT = 1080
CAMERA_FPS = 20

# --- Network streaming ---
STREAM_HOST = '0.0.0.0'
STREAM_PORT = 8080
JPEG_QUALITY = 70
STREAM_FPS_LIMIT = 15

# --- Room/zone view ---
ROOM_VIEW_ENABLED = True
ROOM_CANVAS_W = 900
ROOM_CANVAS_H = 900
ROOM_MARGIN_PX = 50
VIEW_PADDING_MM = 1000

BG_COLOR = '#03050a'
WALL_COLOR = '#4fc3ff'
FLOOR_FILL = '#0a3d5c'
FLOOR_FILL_ALPHA = 0.6
GRID_COLOR = '#0a2a44'
PERSON_COLOR = '#ff3355'
PERSON_FILL_ALPHA = 0.35
OBJECT_COLOR = '#ff9500'
OBJECT_FILL_ALPHA = 0.35
ZONE_COLOR = '#39ff14'
ZONE_ACTIVE_COLOR = '#ffffff'
SENSOR_COLOR = '#ffffff'

def hex_to_bgr(hex_str):
    """'#rrggbb' (alpha ignored if present) -> (b, g, r) tuple for cv2."""
    h = hex_str.lstrip('#')
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (b, g, r)


# ============================================================
# THREADED CAMERA - unchanged
# ============================================================
class CameraStream:
    def __init__(self, src=0):
        self.cap = cv2.VideoCapture(src, cv2.CAP_V4L2)
        if self.cap.isOpened():
            self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
            self.cap.set(cv2.CAP_PROP_FPS, CAMERA_FPS)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        self.lock = threading.Lock()
        self.ret, self.frame = (False, None)
        self.running = self.cap.isOpened()

        if not self.running:
            print(f"Warning: camera source {src} did not open at all "
                  f"(cap.isOpened() is False). Check the device exists, "
                  f"e.g. `ls /dev/video*` and that CAMERA_SRC matches it.")
            return

        for _ in range(10):
            self.ret, self.frame = self.cap.read()
            if self.ret and self.frame is not None:
                break
            time.sleep(0.1)

        if not self.ret or self.frame is None:
            print(f"Warning: camera source {src} opened but produced no "
                  f"frames after 10 attempts. This is almost always a "
                  f"driver/format mismatch, not a network/Flask issue. "
                  f"Run the standalone quick_camera_test.py to confirm, "
                  f"and try a different CAMERA_SRC index or fourcc.")
        else:
            h, w = self.frame.shape[:2]
            print(f"Camera source {src} is delivering frames ({w}x{h}).")

        self.thread = threading.Thread(target=self._update, daemon=True)
        self.thread.start()

    def _update(self):
        fail_count = 0
        while self.running:
            ret, frame = self.cap.read()
            with self.lock:
                self.ret, self.frame = ret, frame
            if not ret:
                fail_count += 1
                if fail_count in (30, 300):
                    print("Warning: camera reads keep failing "
                          "(ret=False) - check the camera connection/driver.")
            else:
                fail_count = 0

    def read(self):
        with self.lock:
            if self.frame is None:
                return False, None
            return self.ret, self.frame.copy()

    def release(self):
        self.running = False
        if hasattr(self, 'thread'):
            self.thread.join(timeout=1)
        self.cap.release()


# ============================================================
# SIGNAGE - kept only for the local /signage.mjpg debug route.
# It no longer drives what appears on the big screen - that's the
# PC's job now. Safe to leave as-is.
# ============================================================
def _blank_frame():
    import numpy as np
    return np.zeros((400, 600, 3), dtype='uint8')

def _text_frame(text):
    import numpy as np
    frame = np.zeros((400, 600, 3), dtype='uint8')
    cv2.putText(frame, text, (20, 200), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    return frame

class MediaSource:
    VIDEO_EXTS = ('.mp4', '.avi', '.mov', '.mkv', '.m4v', '.webm')

    def __init__(self, path, label):
        self.label = label
        self.path = path
        self.is_video = os.path.splitext(path)[1].lower() in self.VIDEO_EXTS
        self.lock = threading.Lock()
        self.frame = None
        self.running = False
        self.cap = None
        abs_path = os.path.abspath(path)

        if self.is_video:
            self.cap = cv2.VideoCapture(path)
            if not self.cap.isOpened():
                print(f"Warning: could not open video '{path}' (looked for it at "
                      f"{abs_path}) for {label}. Signage will show placeholder text.")
                return
            print(f"Loaded signage video for {label}: {abs_path}")
            self.running = True
            self.thread = threading.Thread(target=self._update_video, daemon=True)
            self.thread.start()
        else:
            img = cv2.imread(path)
            if img is None:
                print(f"Warning: could not load image '{path}' (looked for it at "
                      f"{abs_path}) for {label}. Signage will show placeholder text.")
                return
            print(f"Loaded signage image for {label}: {abs_path}")
            self.frame = img

    def _update_video(self):
        fps = self.cap.get(cv2.CAP_PROP_FPS) or 25
        delay = 1.0 / fps if fps > 0 else 0.04
        while self.running:
            ret, frame = self.cap.read()
            if not ret:
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            with self.lock:
                self.frame = frame
            time.sleep(delay)

    def read(self):
        with self.lock:
            return None if self.frame is None else self.frame.copy()

    def release(self):
        self.running = False
        if self.cap is not None:
            self.cap.release()


class Signage:
    def __init__(self, show_local_window=True):
        self.show_local_window = show_local_window
        self.window = 'Signage'
        if self.show_local_window:
            cv2.namedWindow(self.window, cv2.WINDOW_NORMAL)
            cv2.moveWindow(self.window, SIGNAGE_MONITOR_OFFSET_X, 0)
            cv2.setWindowProperty(self.window, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)

        self.sources = {
            'zone1': MediaSource(AD_IMAGE_ZONE1, 'zone1'),
            'zone2': MediaSource(AD_IMAGE_ZONE2, 'zone2'),
        }
        self.current_state = None

    def show(self, state):
        self.current_state = state

    def read(self):
        state = self.current_state
        if state is None:
            return _blank_frame()
        src = self.sources.get(state)
        frame = src.read() if src else None
        return frame if frame is not None else _text_frame(f"DISPLAYING {state.upper()}")

    def render_local(self):
        if self.show_local_window:
            cv2.imshow(self.window, self.read())

    def close(self):
        for src in self.sources.values():
            src.release()
        if self.show_local_window:
            cv2.destroyWindow(self.window)


# ============================================================
# ROOM VIEW - unchanged
# ============================================================
def _view_bounds(extents):
    if extents is None:
        return -4000, 4000, 4000
    min_x, max_x, max_y = extents
    return min_x - VIEW_PADDING_MM, max_x + VIEW_PADDING_MM, max_y + VIEW_PADDING_MM

class RoomView:
    def __init__(self):
        self.lock = threading.Lock()
        self.frame = self._placeholder("Calibrating...")

    def _placeholder(self, text):
        import numpy as np
        img = np.zeros((ROOM_CANVAS_H, ROOM_CANVAS_W, 3), dtype='uint8')
        img[:] = hex_to_bgr(BG_COLOR)
        cv2.putText(img, text, (40, ROOM_CANVAS_H // 2), cv2.FONT_HERSHEY_SIMPLEX,
                    1, hex_to_bgr(WALL_COLOR), 2)
        return img

    def update(self, baseline_xy, extents, tracked_objects, zone1_active, zone2_active):
        import numpy as np
        if not baseline_xy or extents is None:
            with self.lock:
                self.frame = self._placeholder("Calibrating...")
            return

        min_x, max_x, max_y = _view_bounds(extents)
        span_x = max(max_x - min_x, 1)
        span_y = max(max_y, 1)
        avail_w = ROOM_CANVAS_W - 2 * ROOM_MARGIN_PX
        avail_h = ROOM_CANVAS_H - 2 * ROOM_MARGIN_PX
        scale = min(avail_w / span_x, avail_h / span_y)

        def to_px(x, y):
            px = ROOM_MARGIN_PX + (x - min_x) * scale
            py = ROOM_CANVAS_H - ROOM_MARGIN_PX - y * scale
            return int(round(px)), int(round(py))

        img = np.zeros((ROOM_CANVAS_H, ROOM_CANVAS_W, 3), dtype='uint8')
        img[:] = hex_to_bgr(BG_COLOR)

        grid_col = hex_to_bgr(GRID_COLOR)
        x = (int(min_x) // 1000) * 1000
        while x <= max_x:
            p1 = to_px(x, 0)
            p2 = to_px(x, max_y)
            cv2.line(img, p1, p2, grid_col, 1, cv2.LINE_AA)
            x += 1000
        y = 0
        while y <= max_y:
            p1 = to_px(min_x, y)
            p2 = to_px(max_x, y)
            cv2.line(img, p1, p2, grid_col, 1, cv2.LINE_AA)
            y += 1000

        wall_pts = np.array([to_px(px_, py_) for px_, py_ in baseline_xy], dtype='int32')
        if len(wall_pts) >= 3:
            overlay = img.copy()
            cv2.fillPoly(overlay, [wall_pts], hex_to_bgr(FLOOR_FILL))
            cv2.addWeighted(overlay, FLOOR_FILL_ALPHA, img, 1 - FLOOR_FILL_ALPHA, 0, img)
        cv2.polylines(img, [wall_pts], isClosed=True, color=hex_to_bgr(WALL_COLOR),
                       thickness=2, lineType=cv2.LINE_AA)

        SENSOR_ARROW_LEN_MM = 400
        tail = to_px(0, 0)
        tip = to_px(0, SENSOR_ARROW_LEN_MM)
        cv2.arrowedLine(img, tail, tip, hex_to_bgr(SENSOR_COLOR), 3,
                         cv2.LINE_AA, tipLength=0.4)
        cv2.circle(img, tail, 5, hex_to_bgr(SENSOR_COLOR), -1, cv2.LINE_AA)

        for zone, label, active in ((ZONE_1, "ZONE 1", zone1_active), (ZONE_2, "ZONE 2", zone2_active)):
            p1 = to_px(zone[0], zone[3])
            p2 = to_px(zone[1], zone[2])
            color = hex_to_bgr(ZONE_ACTIVE_COLOR) if active else hex_to_bgr(ZONE_COLOR)
            if active:
                overlay = img.copy()
                cv2.rectangle(overlay, p1, p2, hex_to_bgr(ZONE_COLOR), -1)
                cv2.addWeighted(overlay, 0.25, img, 0.75, 0, img)
            cv2.rectangle(img, p1, p2, color, 2, cv2.LINE_AA)
            label_pos = ((p1[0] + p2[0]) // 2 - 30, (p1[1] + p2[1]) // 2)
            cv2.putText(img, label, label_pos, cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

        for oid, data in tracked_objects.items():
            if data['missed'] > 0:
                continue
            cx, cy = data['pos']
            w, h = data['w'], data['h']
            is_person = data['is_person']
            color = hex_to_bgr(PERSON_COLOR) if is_person else hex_to_bgr(OBJECT_COLOR)
            p1 = to_px(cx - w / 2, cy + h / 2)
            p2 = to_px(cx + w / 2, cy - h / 2)
            overlay = img.copy()
            cv2.rectangle(overlay, p1, p2, color, -1)
            alpha = PERSON_FILL_ALPHA if is_person else OBJECT_FILL_ALPHA
            cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)
            cv2.rectangle(img, p1, p2, color, 2, cv2.LINE_AA)
            if is_person:
                tx, ty = to_px(cx, cy + h / 2 + 150)
                cv2.putText(img, "Person", (tx - 25, ty), cv2.FONT_HERSHEY_SIMPLEX,
                            0.5, color, 1, cv2.LINE_AA)

        with self.lock:
            self.frame = img

    def read(self):
        with self.lock:
            return self.frame.copy()


# ============================================================
# NETWORK MJPEG SERVER - unchanged
# ============================================================
app = Flask(__name__)
_camera_ref = {'obj': None}
_signage_ref = {'obj': None}
_room_ref = {'obj': None}
_recalib_ref = {'flag': False}

def _mjpeg_generator(get_frame_fn):
    min_interval = 1.0 / STREAM_FPS_LIMIT
    while True:
        start = time.time()
        frame = get_frame_fn()
        if frame is not None:
            ok, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
            if ok:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buf.tobytes() + b'\r\n')
        elapsed = time.time() - start
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)

def _get_camera_frame():
    cam = _camera_ref['obj']
    if cam is None:
        return None
    ret, frame = cam.read()
    return frame if ret else None

def _get_signage_frame():
    sig = _signage_ref['obj']
    if sig is None:
        return None
    return sig.read()

def _get_room_frame():
    room = _room_ref['obj']
    if room is None:
        return None
    return room.read()

@app.route('/camera.mjpg')
def camera_feed():
    return Response(_mjpeg_generator(_get_camera_frame),
                     mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/signage.mjpg')
def signage_feed():
    return Response(_mjpeg_generator(_get_signage_frame),
                     mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/room.mjpg')
def room_feed():
    return Response(_mjpeg_generator(_get_room_frame),
                     mimetype='multipart/x-mixed-replace; boundary=frame')

def _fullscreen_page(title, stream_path):
    return f"""
    <!DOCTYPE html>
    <html>
      <head>
        <title>{title}</title>
        <style>
          html, body {{
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: black;
            overflow: hidden;
          }}
          img {{
            width: 100vw;
            height: 100vh;
            object-fit: cover;
          }}
        </style>
      </head>
      <body>
        <img src="{stream_path}">
      </body>
    </html>
    """

@app.route('/camera-full')
def camera_full_page():
    return _fullscreen_page('Camera', '/camera.mjpg')

@app.route('/signage-full')
def signage_full_page():
    return _fullscreen_page('Signage', '/signage.mjpg')

@app.route('/room-full')
def room_full_page():
    return _fullscreen_page('Room View', '/room.mjpg')

@app.route('/recalibrate')
def recalibrate():
    _recalib_ref['flag'] = True
    return (f"Recalibration requested - keep the room clear for "
            f"{CALIBRATION_SECONDS}s. Watch the terminal for progress.")

@app.route('/')
def index():
    return (
        "<h2>LD19 Streams</h2>"
        "<p><a href='/camera.mjpg'>Camera stream (raw)</a> | "
        "<a href='/camera-full'>fullscreen</a></p>"
        "<p><a href='/signage.mjpg'>Signage stream (raw, legacy debug)</a> | "
        "<a href='/signage-full'>fullscreen</a></p>"
        "<p><a href='/room.mjpg'>Room / zone view (raw)</a> | "
        "<a href='/room-full'>fullscreen</a></p>"
        "<p><a href='/recalibrate'>Recalibrate room (moved the LiDAR? click this)</a></p>"
    )

def start_stream_server():
    t = threading.Thread(
        target=lambda: app.run(host=STREAM_HOST, port=STREAM_PORT,
                                threaded=True, debug=False, use_reloader=False),
        daemon=True
    )
    t.start()
    print(f"Streams available at http://<this-device-ip>:{STREAM_PORT}/  "
          f"(camera: /camera.mjpg, signage: /signage.mjpg)")


# ============================================================
# ROOM MAPPING - unchanged
# ============================================================
def angle_to_bin(ang):
    return int(ang / ANGLE_BIN_DEG) % NUM_BINS

def is_front_bin(bin_index):
    bin_ang = bin_index * ANGLE_BIN_DEG
    rad = math.radians(bin_ang + ROTATION_OFFSET)
    return math.sin(rad) >= FRONT_SIN_MARGIN

def point_line_distance(point, start, end):
    if start == end:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    num = abs((end[0] - start[0]) * (start[1] - point[1]) -
               (start[0] - point[0]) * (end[1] - start[1]))
    den = math.hypot(end[0] - start[0], end[1] - start[1])
    return num / den

def simplify_rdp(points, epsilon):
    if len(points) < 3:
        return points
    start, end = points[0], points[-1]
    dmax, idx = 0, 0
    for i in range(1, len(points) - 1):
        d = point_line_distance(points[i], start, end)
        if d > dmax:
            idx, dmax = i, d
    if dmax > epsilon:
        left = simplify_rdp(points[:idx + 1], epsilon)
        right = simplify_rdp(points[idx:], epsilon)
        return left[:-1] + right
    return [start, end]

def cluster_points(points_xy):
    if not points_xy:
        return []
    clusters, current = [], [points_xy[0]]
    for i in range(1, len(points_xy)):
        x0, y0 = points_xy[i - 1]
        x1, y1 = points_xy[i]
        if math.hypot(x1 - x0, y1 - y0) <= CLUSTER_GAP_MM:
            current.append(points_xy[i])
        else:
            clusters.append(current)
            current = [points_xy[i]]
    clusters.append(current)
    return [c for c in clusters if len(c) >= MIN_CLUSTER_POINTS]

def build_baseline(bin_samples):
    baseline = [None] * NUM_BINS
    for i in range(NUM_BINS):
        if is_front_bin(i) and bin_samples[i]:
            baseline[i] = max(bin_samples[i])
    known = [i for i in range(NUM_BINS) if baseline[i] is not None]
    if not known:
        return None
    for i in range(NUM_BINS):
        if is_front_bin(i) and baseline[i] is None:
            nearest = min(known, key=lambda k: abs(k - i))
            baseline[i] = baseline[nearest]
    return baseline

def fit_room_rectangle(baseline):
    pts = []
    for i, dist in enumerate(baseline):
        if dist is None:
            continue
        rad = math.radians(i * ANGLE_BIN_DEG + ROTATION_OFFSET)
        pts.append((dist * math.cos(rad), dist * math.sin(rad)))
    if not pts:
        return baseline, None
    min_x_raw = min(p[0] for p in pts)
    max_x_raw = max(p[0] for p in pts)
    max_y_raw = max(p[1] for p in pts)
    left_pts = [p[0] for p in pts if p[0] < min_x_raw + 300]
    right_pts = [p[0] for p in pts if p[0] > max_x_raw - 300]
    front_pts = [p[1] for p in pts if p[1] > max_y_raw - 300]
    min_x = sum(left_pts) / len(left_pts) if left_pts else min_x_raw
    max_x = sum(right_pts) / len(right_pts) if right_pts else max_x_raw
    max_y = sum(front_pts) / len(front_pts) if front_pts else max_y_raw
    rect_baseline = [None] * NUM_BINS
    for i in range(NUM_BINS):
        if baseline[i] is None:
            continue
        rad = math.radians(i * ANGLE_BIN_DEG + ROTATION_OFFSET)
        dx, dy = math.cos(rad), math.sin(rad)
        candidates = []
        if dx < 0:
            candidates.append(min_x / dx)
        if dx > 0:
            candidates.append(max_x / dx)
        if dy > 0:
            candidates.append(max_y / dy)
        if candidates:
            rect_baseline[i] = min(t for t in candidates if t > 0)
    return rect_baseline, (min_x, max_x, max_y)

def baseline_to_xy(baseline):
    pts = []
    for i, dist in enumerate(baseline):
        if dist is None:
            continue
        rad = math.radians(i * ANGLE_BIN_DEG + ROTATION_OFFSET)
        pts.append((dist * math.cos(rad), dist * math.sin(rad)))
    if not pts:
        return []
    pts.sort(key=lambda p: math.atan2(p[1], p[0]))
    return simplify_rdp(pts, RDP_EPSILON_MM)

def room_dimensions(extents):
    min_x, max_x, max_y = extents
    return (max_x - min_x) / 1000.0, max_y / 1000.0

def zone_contains(zone, x, y):
    return zone[0] < x < zone[1] and zone[2] < y < zone[3]


# ============================================================
# MAIN
# ============================================================
def main():
    ser = serial.Serial(PORT, BAUD, timeout=1)

    camera = CameraStream(CAMERA_SRC) if CAMERA_PREVIEW_ENABLED else None
    _camera_ref['obj'] = camera

    signage = Signage(show_local_window=SIGNAGE_LOCAL_WINDOW_ENABLED)
    _signage_ref['obj'] = signage

    room_view = RoomView() if ROOM_VIEW_ENABLED else None
    _room_ref['obj'] = room_view

    start_stream_server()

    # NEW - connect to the PC's WebSocket server in the background.
    # This starts trying to connect immediately and keeps retrying if
    # the PC isn't up yet, so you can start this script before or after
    # the PC's player - order doesn't matter.
    zone_signaler = ZoneSignaler(PC_HOST, PC_PORT)

    packet_buffer = bytearray()
    last_angle = 0
    calibrating = True
    calib_start = time.time()
    bin_samples = [[] for _ in range(NUM_BINS)]
    baseline, baseline_xy, extents = None, None, None
    frame_points = []
    tracked_objects = {}
    last_debug_print = [0.0]

    prev_zone1_active = False
    prev_zone2_active = False
    zone1_trigger_time = 0
    zone2_trigger_time = 0
    last_sent_state = "__unset__"  # NEW - tracks what we last told the PC

    print(f"Calibrating room shape - keep the room clear for {CALIBRATION_SECONDS}s...")

    try:
        while True:
            if _recalib_ref['flag']:
                _recalib_ref['flag'] = False
                calibrating = True
                calib_start = time.time()
                bin_samples = [[] for _ in range(NUM_BINS)]
                baseline, baseline_xy, extents = None, None, None
                tracked_objects = {}
                print(f"Recalibrating - keep the room clear for {CALIBRATION_SECONDS}s...")

            raw_bytes = ser.read(47)
            if not raw_bytes:
                continue
            packet_buffer.extend(raw_bytes)

            while len(packet_buffer) >= 47:
                if packet_buffer[0] == 0x54 and packet_buffer[1] == 0x2C:
                    packet = packet_buffer[:47]
                    parsed_data = parse_packet(packet)

                    if parsed_data:
                        _, points = parsed_data

                        for ang, dist, intensity in points:
                            wrapped = ang < last_angle - 10
                            last_angle = ang

                            valid = (dist != 0 and MIN_DISTANCE <= dist <= MAX_DISTANCE
                                     and intensity >= MIN_INTENSITY)

                            if calibrating:
                                if valid:
                                    bin_samples[angle_to_bin(ang)].append(dist)
                                elapsed = time.time() - calib_start
                                if elapsed >= CALIBRATION_SECONDS:
                                    raw_baseline = build_baseline(bin_samples)
                                    if raw_baseline:
                                        baseline, extents = fit_room_rectangle(raw_baseline)
                                        baseline_xy = baseline_to_xy(baseline)
                                        w, d = room_dimensions(extents)
                                        print(f"Calibration done. Room size: {w:.2f}m x {d:.2f}m")
                                    calibrating = False
                                continue

                            if wrapped and frame_points:
                                frame_points.sort(key=lambda p: p[0])
                                xy = [(x, y) for _, x, y in frame_points]
                                clusters = cluster_points(xy)

                                new_tracked = {}
                                used_ids = set()
                                zone1_active = False
                                zone2_active = False

                                for cluster in clusters:
                                    cxs = [p[0] for p in cluster]
                                    cys = [p[1] for p in cluster]
                                    cx, cy = sum(cxs) / len(cxs), sum(cys) / len(cys)
                                    cw = max(max(cxs) - min(cxs), 150)
                                    ch = max(max(cys) - min(cys), 150)

                                    best_id, best_dist = None, MAX_MATCH_DIST_MM
                                    for oid, data in tracked_objects.items():
                                        if oid in used_ids:
                                            continue
                                        ox, oy = data['pos']
                                        d = math.hypot(cx - ox, cy - oy)
                                        if d < best_dist:
                                            best_id, best_dist = oid, d

                                    if best_id is not None:
                                        used_ids.add(best_id)
                                        prev = tracked_objects[best_id]
                                        streak = prev.get('streak', 0)
                                        if best_dist > MOTION_THRESHOLD_MM:
                                            streak = min(streak + 1, MOTION_STREAK_REQUIRED)
                                        else:
                                            streak = max(streak - 1, -MOTION_STREAK_DECAY)
                                        is_person = streak >= MOTION_STREAK_REQUIRED
                                        new_tracked[best_id] = {
                                            'pos': (cx, cy), 'w': cw, 'h': ch,
                                            'streak': streak, 'is_person': is_person, 'missed': 0
                                        }
                                    else:
                                        new_id = max(tracked_objects.keys(), default=0) + 1
                                        while new_id in new_tracked:
                                            new_id += 1
                                        new_tracked[new_id] = {
                                            'pos': (cx, cy), 'w': cw, 'h': ch,
                                            'streak': 0, 'is_person': False, 'missed': 0
                                        }

                                for oid, data in tracked_objects.items():
                                    if oid not in used_ids and data['missed'] < MAX_MISSED_FRAMES:
                                        carried = data.copy()
                                        carried['missed'] += 1
                                        new_tracked[oid] = carried

                                tracked_objects = new_tracked

                                for oid, data in tracked_objects.items():
                                    if data['missed'] != 0:
                                        continue
                                    if not ZONE_TRIGGER_ANY_OBJECT and not data['is_person']:
                                        continue
                                    px, py = data['pos']
                                    if zone_contains(ZONE_1, px, py):
                                        zone1_active = True
                                    if zone_contains(ZONE_2, px, py):
                                        zone2_active = True

                                now_dbg = time.time()
                                if now_dbg - last_debug_print[0] >= 1.0 and tracked_objects:
                                    last_debug_print[0] = now_dbg
                                    parts = []
                                    for oid, data in tracked_objects.items():
                                        if data['missed'] != 0:
                                            continue
                                        px, py = data['pos']
                                        tag = "person" if data['is_person'] else "object"
                                        parts.append(f"#{oid} {tag} x={px/1000:.2f}m y={py/1000:.2f}m")
                                    if parts:
                                        print("[TRACK] " + " | ".join(parts))

                                now = time.time()
                                if zone1_active and not prev_zone1_active:
                                    zone1_trigger_time = now
                                    print(f"[ZONE] Zone 1 triggered ({time.strftime('%H:%M:%S')})")
                                if zone2_active and not prev_zone2_active:
                                    zone2_trigger_time = now
                                    print(f"[ZONE] Zone 2 triggered ({time.strftime('%H:%M:%S')})")
                                if not zone1_active and prev_zone1_active:
                                    print("[ZONE] Zone 1 cleared")
                                if not zone2_active and prev_zone2_active:
                                    print("[ZONE] Zone 2 cleared")
                                prev_zone1_active, prev_zone2_active = zone1_active, zone2_active

                                if zone1_active and zone2_active:
                                    signage_state = 'zone2' if zone2_trigger_time > zone1_trigger_time else 'zone1'
                                elif zone2_active:
                                    signage_state = 'zone2'
                                elif zone1_active:
                                    signage_state = 'zone1'
                                else:
                                    signage_state = None

                                # NEW - tell the PC which video to play.
                                # Only fires when signage_state actually
                                # changed from last frame, so we don't
                                # spam the PC every LiDAR revolution.
                                if signage_state != last_sent_state:
                                    video_id = ZONE_TO_VIDEO_ID.get(signage_state, 0)  # 0 = idle/demo video
                                    zone_signaler.send(video_id)
                                    last_sent_state = signage_state

                                # Legacy local signage/debug stream - harmless to keep
                                signage.show(signage_state)
                                signage.render_local()
                                cv2.waitKey(1)
                                if room_view is not None:
                                    room_view.update(baseline_xy, extents, tracked_objects,
                                                      zone1_active, zone2_active)
                                frame_points = []

                            if not valid:
                                continue

                            b = angle_to_bin(ang)
                            if not is_front_bin(b) or baseline[b] is None:
                                continue
                            if baseline[b] - dist < FOREGROUND_THRESHOLD_MM:
                                continue

                            rad = math.radians(ang + ROTATION_OFFSET)
                            x, y = dist * math.cos(rad), max(dist * math.sin(rad), 0)
                            frame_points.append((ang, x, y))

                    del packet_buffer[:47]
                else:
                    del packet_buffer[0]

    except KeyboardInterrupt:
        print("\nStopped by user.")
    finally:
        if camera is not None:
            camera.release()
        signage.close()
        cv2.destroyAllWindows()
        if ser.is_open:
            ser.close()

if __name__ == "__main__":
    main()
