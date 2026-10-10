"""Generate assets/yaga-studio.hdr: a dark studio with a warm key light top-left and an orange rim back-right."""
import math
import struct

W, H = 512, 256
OUT = "assets/yaga-studio.hdr"

# (direction from model towards light, angular radius in degrees, RGB intensity)
LIGHTS = [
    ((-1.0, 1.1, 1.0), 16, (34.0, 30.0, 24.0)),   # key: warm softbox, top-left, in front
    ((1.0, 0.35, -0.8), 10, (9.0, 4.2, 2.0)),     # rim: orange, back-right
    ((1.0, 0.0, 0.9), 28, (0.55, 0.55, 0.6)),     # faint fill: front-right
]


def normalize(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


def direction(u, v):
    """Equirectangular pixel centre -> unit direction (three.js convention)."""
    phi = (u - 0.5) * 2 * math.pi
    theta = (0.5 - v) * math.pi
    return (math.cos(theta) * math.cos(phi), math.sin(theta), math.cos(theta) * math.sin(phi))


def radiance(d):
    up = max(d[1], 0.0)
    r, g, b = 0.03 + 0.05 * up, 0.028 + 0.045 * up, 0.025 + 0.04 * up  # dark warm ambient
    for ldir, radius, (lr, lg, lb) in LIGHTS:
        cos = sum(a * b_ for a, b_ in zip(d, normalize(ldir)))
        angle = math.degrees(math.acos(max(-1.0, min(1.0, cos))))
        w = math.exp(-((angle / radius) ** 2) * 2.5)
        r, g, b = r + lr * w, g + lg * w, b + lb * w
    return r, g, b


def rgbe(r, g, b):
    m = max(r, g, b)
    if m < 1e-32:
        return b"\0\0\0\0"
    e = math.frexp(m)[1]
    s = 256.0 / (2.0 ** e)
    return bytes((int(r * s), int(g * s), int(b * s), e + 128))


def main():
    with open(OUT, "wb") as f:
        f.write(b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n")
        f.write(f"-Y {H} +X {W}\n".encode())
        for y in range(H):
            f.write(b"".join(rgbe(*radiance(direction((x + 0.5) / W, (y + 0.5) / H))) for x in range(W)))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
