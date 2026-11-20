"""从本地官方原图生成轻量背景、JPEG 兜底及独立缩略图。需要 Pillow，仅用于开发。"""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "jason-lucia": "jason-lucia.jpg",
    "beach": "beach.jpg",
    "rooftop": "rooftop.jpg",
    "duo-02": "duo-02.original.jpg",
    "lock-load": "lock-load.original.jpg",
    "robbery": "robbery.original.jpg",
    "motel": "motel.original.jpg",
}
TARGET = ROOT / "assets" / "backgrounds"
TARGET.mkdir(exist_ok=True)
sheet = Image.new("RGB", (960, ((len(SOURCES) + 2) // 3) * 202), "#20182c")
draw = ImageDraw.Draw(sheet)
for index, (name, filename) in enumerate(SOURCES.items()):
    image = ImageOps.exif_transpose(Image.open(ROOT / "assets" / "images" / filename)).convert("RGB")
    for width in (1280, 1600, 1920):
        resized = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        resized.save(TARGET / f"{name}.{width}.webp", quality=82, method=6)
        if width == 1600:
            resized.save(TARGET / f"{name}.fallback.jpg", quality=82, optimize=True, progressive=True)
    thumbnail = ImageOps.fit(image, (320, 180), method=Image.Resampling.LANCZOS)
    thumbnail.save(TARGET / f"{name}.thumb.jpg", quality=76, optimize=True)
    x, y = (index % 3) * 320, (index // 3) * 202
    sheet.paste(thumbnail, (x, y))
    draw.text((x + 8, y + 183), name, fill="white")
sheet.save(ROOT / "preview" / "artwork-contact.jpg", quality=88)
print(f"已生成 {len(SOURCES)} 组背景（1280/1600/1920 WebP、1600 JPEG、缩略图）")
