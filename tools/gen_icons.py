"""Generate PNG app icons (a progress ring) using only the standard library."""
import math, os, struct, zlib

def chunk(tag, data):
    body = tag + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

def make_icon(path, size):
    cx = cy = size / 2
    r_out, r_in = size * 0.34, size * 0.24
    rows = []
    for y in range(size):
        row = bytearray([0])  # filter byte
        for x in range(size):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            color = (20, 38, 46)  # background
            if r_in <= math.hypot(dx, dy) <= r_out:
                angle = (math.degrees(math.atan2(dx, -dy)) + 360) % 360  # clockwise from top
                color = (53, 201, 162) if angle <= 240 else (39, 64, 74)
            row += bytes(color)
        rows.append(bytes(row))
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
        make_icon(os.path.join(out, name), size)
