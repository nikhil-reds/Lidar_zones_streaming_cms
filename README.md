# LiDAR Zones Streaming CMS

This repository contains the software for a LiDAR-based interactive zone detection and video streaming content management system (CMS).

## Architecture overview
The system is divided into two primary components:

1. **Raspberry Pi (LiDAR Client)**: Runs the LiDAR sensing and zone detection logic.
2. **Windows PC (Video Server)**: Runs a video playback system powered by VLC, listening to commands from the Raspberry Pi over WebSockets.

### Raspberry Pi Codes (`rasp pi codes/`)
The scripts in this directory are responsible for capturing data from an LD19 LiDAR sensor, tracking objects in the room, and triggering events based on predefined spatial zones.

*   **`lidar1_zone.py`**: The main entry point. Reads LiDAR data, handles object tracking, calibrates the room, detects if someone is inside Zone 1 or Zone 2, and communicates this to the PC via WebSockets. It also serves MJPEG streams via Flask for debugging and viewing (camera, signage, and room view).
*   **`read_ld19.py`**: Handles parsing the raw serial data packets from the LD19 LiDAR sensor.
*   **`ws_client.py`**: A background WebSocket client that maintains a persistent connection to the Windows PC. When a zone is triggered in the LiDAR script, this client sends a simple JSON payload (`{"video": 1}` or `{"video": 2}`) to the PC.
*   **`lidar_zone_signage.py`**: A variation of the main logic with signage integrations.

### Laptop / PC Codes (`Laptopcodes/`)
The scripts in this directory are run on the display PC to play media corresponding to the zone triggers.

*   **`pc_server.py`**: A WebSocket server and VLC-based media player. It creates a borderless, full-screen, always-on-top black window using Tkinter and embeds VLC into it. When it receives a trigger from the Raspberry Pi (e.g. `{"video": 1}`), it seamlessly switches to the designated video for that zone. If no one is in any zone, it plays an idle/demo video.

## Setup and Installation

### Windows PC
1. Install [VLC Media Player](https://www.videolan.org/vlc/).
2. Install Python dependencies:
   ```bash
   pip install websockets python-vlc
   ```
3. Update the `VIDEO_MAP` and `IDLE_VIDEO` paths in `pc_server.py` to match the local paths of your video files.
4. Run the server:
   ```bash
   python pc_server.py
   ```
   *Press `Escape` to quit the full-screen player.*

### Raspberry Pi
1. Ensure you have the required libraries installed:
   ```bash
   pip install opencv-python flask pyserial websockets
   ```
2. Update the `PC_HOST` variable in `lidar1_zone.py` to the local IP address of your Windows PC.
3. Run the system:
   ```bash
   python lidar1_zone.py
   ```

## Flow

1. The **Windows PC** boots up, runs `pc_server.py`, and waits for WebSocket connections while playing the idle `demo.mp4` video.
2. The **Raspberry Pi** runs `lidar1_zone.py` and actively scans the room using the LD19 LiDAR sensor.
3. The Raspberry Pi connects to the Windows PC via WebSocket.
4. When a person steps into a designated spatial boundary (Zone 1 or Zone 2), the Raspberry Pi detects this using object tracking.
5. The Pi sends a WebSocket payload (e.g., `{"video": 1}`) to the Windows PC.
6. The PC receives the message, stops the idle video, and immediately plays the assigned zone video (e.g., `video1.mp4`).
7. Once the person leaves the zone, the Pi sends `{"video": 0}`, and the PC returns to the idle demo video.
