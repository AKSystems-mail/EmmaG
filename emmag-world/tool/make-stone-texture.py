#!/usr/bin/env python3
"""Tileable stone + moss + lichen texture for the scanned giant. numpy only.

    python3 tool/make-stone-texture.py   ->  public/models/giant_stone.png
"""
import numpy as np
from PIL import Image

S = 1024


def noise(scale, seed):
    """Tileable smooth noise: white noise filtered in the frequency domain."""
    r = np.random.default_rng(seed)
    f = np.fft.fft2(r.normal(size=(S, S)))
    fy = np.fft.fftfreq(S)[:, None]
    fx = np.fft.fftfreq(S)[None, :]
    f *= np.exp(-((fx * fx + fy * fy) * (scale * scale) * 8.0))
    n = np.real(np.fft.ifft2(f))
    return (n - n.min()) / (np.ptp(n) + 1e-9)


def smooth(x, edge=0.12):
    return np.clip((x - 0.5) / edge + 0.5, 0, 1)


big = noise(42, 1)      # broad moss regions
mid = noise(15, 2)      # mottling
fine = noise(3.6, 3)    # rock grain
grit = noise(2.2, 4)    # speckle

# rock: cool grey, value from layered noise, slight warm drift
base = np.array([0.545, 0.565, 0.590])
warm = np.array([0.560, 0.530, 0.485])
v = (0.62 * mid + 0.35 * fine + 0.03 * grit)[..., None]
img = base * (0.95 + 0.85 * v) + warm * (0.10 * (mid[..., None] - 0.5))
img -= ((fine > 0.74) & (grit > 0.60))[..., None] * 0.10        # dark pits
img += ((grit > 0.90) & (fine < 0.40))[..., None] * 0.06         # bright mineral

# hairline cracks, sparse and faint
ridge = np.abs(noise(7.0, 5) - 0.5)
crack = np.clip(1.0 - ridge * 42.0, 0, 1)[..., None] * (0.30 + 0.35 * mid[..., None])
img = img * (1 - crack * 0.45)

# moss: soft patches, colour varies between two greens
m = smooth(big) * smooth(mid, 0.35)
m = np.clip((m - 0.34) * 2.1, 0, 1)[..., None]
moss_dark = np.array([0.215, 0.310, 0.150])
moss_light = np.array([0.390, 0.500, 0.250])
moss = moss_dark + (moss_light - moss_dark) * fine[..., None]
img = img * (1 - m * 0.92) + moss * (m * 0.92)

# pale lichen, small crusty flecks on bare rock
lk = smooth(fine, 0.10) * (1 - m[..., 0])
fleck = ((lk > 0.88) & (grit > 0.70))[..., None].astype(float)
img = img * (1 - fleck * 0.7) + np.array([0.760, 0.770, 0.700]) * fleck * 0.7

img = np.clip(img, 0, 1)
Image.fromarray((img * 255).astype(np.uint8)).save(
    "public/models/giant_stone.png", optimize=True)
print("wrote public/models/giant_stone.png mean", img.mean(axis=(0, 1)).round(3),
      "moss", round(float(m.mean()), 2))
