from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = next((path for path in [ROOT / "Burn3.png", ROOT / "Burn2.png", ROOT / "Burn Mark.png"] if path.exists()), ROOT / "Burn2.png")
OUT_DIR = ROOT / "public" / "BurnOverlays"


CROPS = [
    ("burn-faint", (90, 92, 650, 438), 0.48),
    ("burn-medium", (665, 66, 1138, 440), 0.74),
    ("burn-severe", (1200, 92, 1672, 442), 0.82),
    ("burn-burst-wide", (1760, 88, 2260, 440), 0.8),
    ("burn-focused", (2340, 80, 2810, 420), 0.78),
    ("burn-low-burst", (95, 560, 580, 930), 0.84),
    ("burn-low-focused", (80, 1030, 560, 1395), 0.78),
    ("burn-chaotic", (650, 1040, 1120, 1365), 0.76),
]


def checker_plate(width, height, origin_x, origin_y, tile):
    y, x = np.indices((height, width))
    tile_h, tile_w, _ = tile.shape
    return tile[(y + origin_y) % tile_h, (x + origin_x) % tile_w]


def remove_checker(crop, origin_x, origin_y, tile):
    rgb = np.asarray(crop.convert("RGB"), dtype=np.float32)
    background = checker_plate(crop.width, crop.height, origin_x, origin_y, tile)
    dist = np.sqrt(((rgb - background) ** 2).sum(axis=2))
    brightness = rgb.mean(axis=2)
    saturation = rgb.max(axis=2) - rgb.min(axis=2)

    warm_smoke = ((rgb[:, :, 0] > rgb[:, :, 1] * 1.06) & (rgb[:, :, 0] > rgb[:, :, 2] * 1.18))
    ember = ((rgb[:, :, 0] > 82) & (rgb[:, :, 1] < 74) & (rgb[:, :, 2] < 64))
    char = (brightness < 18) & (dist > 34)
    warm_soot = (saturation > 30) & (dist > 32) & (brightness < 132)

    alpha = np.zeros_like(dist, dtype=np.float32)
    alpha = np.maximum(alpha, warm_soot.astype(np.float32) * np.clip((saturation - 18) / 82, 0, 0.74))
    alpha = np.maximum(alpha, warm_smoke.astype(np.float32) * np.clip((saturation - 18) / 70, 0, 0.42))
    alpha = np.maximum(alpha, ember.astype(np.float32) * 0.88)
    alpha = np.maximum(alpha, char.astype(np.float32) * 0.72)

    neutral_checker = saturation < 18
    alpha[neutral_checker & (brightness > 15)] = 0
    alpha[dist < 34] = 0

    white_text = (brightness > 150) & (saturation < 42)
    alpha[white_text] = 0

    alpha = Image.fromarray((alpha * 255).astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(4.25))
    alpha_arr = np.asarray(alpha, dtype=np.float32)
    alpha_arr[alpha_arr < 18] = 0

    ember_strength = np.clip((rgb[:, :, 0] - np.maximum(rgb[:, :, 1], rgb[:, :, 2]) - 10) / 72, 0, 1)
    soot = np.array([27, 20, 15], dtype=np.float32)
    warm = np.array([122, 72, 31], dtype=np.float32)
    ember_color = np.array([255, 84, 24], dtype=np.float32)
    warmth = np.clip(saturation / 82, 0, 1)[:, :, None]
    colored = soot * (1 - warmth) + warm * warmth
    colored = colored * (1 - ember_strength[:, :, None]) + ember_color * ember_strength[:, :, None]
    rgba = np.dstack([colored.astype(np.uint8), alpha_arr.astype(np.uint8)])
    return Image.fromarray(rgba, "RGBA")


def remove_white(crop):
    rgb = np.asarray(crop.convert("RGB"), dtype=np.float32)
    brightness = rgb.mean(axis=2)
    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    white_dist = np.sqrt(((255 - rgb) ** 2).sum(axis=2))
    warm = (rgb[:, :, 0] > rgb[:, :, 1] * 1.03) & (rgb[:, :, 0] > rgb[:, :, 2] * 1.08)
    soot = brightness < 132
    ember = (rgb[:, :, 0] > 105) & (rgb[:, :, 1] < 96) & (rgb[:, :, 2] < 84)

    alpha = np.clip((white_dist - 42) / 95, 0, 1)
    alpha = np.maximum(alpha, soot.astype(np.float32) * np.clip((150 - brightness) / 140, 0, 0.92))
    alpha = np.maximum(alpha, warm.astype(np.float32) * np.clip(saturation / 95, 0, 0.58))
    alpha = np.maximum(alpha, ember.astype(np.float32) * 0.9)

    alpha[(brightness > 222) & (saturation < 28)] = 0
    alpha = Image.fromarray((alpha * 255).astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    alpha_arr = np.asarray(alpha, dtype=np.float32)
    alpha_arr[alpha_arr < 12] = 0

    rgba = np.dstack([rgb.astype(np.uint8), alpha_arr.astype(np.uint8)])
    return Image.fromarray(rgba, "RGBA")


def normalize(sprite, strength):
    alpha = sprite.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return Image.new("RGBA", (768, 768), (0, 0, 0, 0))

    sprite = sprite.crop(bbox)
    alpha = sprite.getchannel("A")
    alpha = alpha.point(lambda value: min(255, int(value * strength)))
    sprite.putalpha(alpha)

    canvas = Image.new("RGBA", (768, 768), (0, 0, 0, 0))
    max_w, max_h = 650, 610
    scale = min(max_w / sprite.width, max_h / sprite.height, 1.0)
    if scale != 1.0:
        sprite = sprite.resize((int(sprite.width * scale), int(sprite.height * scale)), Image.Resampling.LANCZOS)

    x = (canvas.width - sprite.width) // 2
    y = (canvas.height - sprite.height) // 2
    canvas.alpha_composite(sprite, (x, y))
    return canvas


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("burn-*.png"):
        old.unlink()
    sheet = Image.open(SOURCE)
    white_source = SOURCE.name.lower().startswith("burn3")
    tile = None if white_source else np.asarray(sheet.crop((0, 0, 48, 48)).convert("RGB"), dtype=np.float32)
    generated = []
    for name, box, strength in CROPS:
        crop = sheet.crop(box)
        sprite = remove_white(crop) if white_source else remove_checker(crop, box[0], box[1], tile)
        sprite = normalize(sprite, strength)
        out = OUT_DIR / f"{name}.png"
        sprite.save(out)
        generated.append(out)

    thumb = Image.new("RGBA", (len(generated) * 190, 190), (0, 0, 0, 0))
    for index, path in enumerate(generated):
        img = Image.open(path).resize((180, 180), Image.Resampling.LANCZOS)
        thumb.alpha_composite(img, (index * 190 + 5, 5))
    thumb.save(OUT_DIR / "_preview.png")
    print(f"Generated {len(generated)} burn overlays from {SOURCE.name} in {OUT_DIR}")


if __name__ == "__main__":
    main()
