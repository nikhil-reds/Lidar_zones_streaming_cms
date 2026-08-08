import serial

PORT = "/dev/ttyUSB0"
BAUD = 230400

# Generate the CRC-8 table
CRC_TABLE = []
for i in range(256):
    crc = i
    for _ in range(8):
        if crc & 0x80:
            crc = ((crc << 1) ^ 0x4D) & 0xFF
        else:
            crc = (crc << 1) & 0xFF
    CRC_TABLE.append(crc)

def calc_crc8(data):
    crc = 0
    for byte in data:
        crc = CRC_TABLE[crc ^ byte]
    return crc

def parse_packet(packet):
    if calc_crc8(packet[:-1]) != packet[-1]:
        return None 

    speed = (packet[2] | (packet[3] << 8))  
    start_angle = (packet[4] | (packet[5] << 8)) / 100.0
    end_angle = (packet[42] | (packet[43] << 8)) / 100.0

    diff = end_angle - start_angle
    if diff < 0:
        diff += 360.0
    
    step = diff / 11.0  

    points = []
    for i in range(12):
        base_idx = 6 + (i * 3)
        distance = packet[base_idx] | (packet[base_idx + 1] << 8)
        intensity = packet[base_idx + 2]
        
        angle = (start_angle + i * step) % 360.0
        
        if distance > 0:
            points.append((angle, distance, intensity))
            
    return speed, points
