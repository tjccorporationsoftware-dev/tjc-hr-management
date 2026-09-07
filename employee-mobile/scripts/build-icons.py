"""สร้างไอคอนแอปทุกไฟล์จากตราต้นฉบับใบเดียว

    python scripts/build-icons.py [ไฟล์ต้นฉบับ]

ต้นฉบับคือ `assets/logo-app-source.png` — ตราสี่เหลี่ยมมุมมน **พื้นหลังใส**
ถ้าได้ไฟล์ใหม่จากคนออกแบบ ให้ส่ง path มาเป็นอาร์กิวเมนต์ สคริปต์จะคัดลอกทับ
ต้นฉบับให้เองแล้วสร้างทุกขนาดใหม่

ไฟล์ที่ได้:
  icon-hrtjc.png            1024 ทึบทั้งใบ (iOS ห้ามมี alpha)
  adaptive-icon-hrtjc.png   1024 ชั้นหน้าของ Android — ตราย่อไว้กลางวงปลอดภัย
  adaptive-icon-bg.png      1024 ชั้นหลังของ Android — ตราขยายแล้วเบลอ
  favicon-hrtjc.png         64   สำหรับเว็บ

**ห้ามถมพื้นที่ใสด้วยสีขาวหรือสีทึบสีเดียว** ตราไล่สีจากฟ้าสด (ซ้ายบน) ไป
น้ำเงินเข้ม (ขวา) ไปฟ้าอ่อน (ซ้ายล่าง) — ขาวจะกลายเป็นกรอบล้อมตราอีกใบหลัง
ระบบครอบมุมของมันเอง ส่วนสีทึบสีเดียวจะเข้ากับขอบได้แค่ด้านเดียวแล้วเห็นเป็น
เส้นสี่เหลี่ยมที่ด้านอื่น สคริปต์จึงถมด้วยตัวตราเองที่ขยายแล้วเบลอ
"""

import shutil
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ASSETS = Path(__file__).resolve().parent.parent / 'assets'
SOURCE = ASSETS / 'logo-app-source.png'

if len(sys.argv) > 1:
    shutil.copyfile(sys.argv[1], SOURCE)

art = Image.open(SOURCE).convert('RGBA')

# ตัดขอบใสทิ้งให้ตราชิดขอบไฟล์พอดี
#
# เกณฑ์ 240 ไม่ใช่ 1 — ไฟล์ที่ส่งออกมามีเศษจุดจาง ๆ กระจายอยู่นอกตัวตรา
# ถ้าใช้ค่าต่ำ กรอบที่ได้จะกินเศษพวกนั้นเข้ามาด้วยแล้วตราจะเล็กกว่าที่ควรเป็น
alpha = art.getchannel('A')
art = art.crop(alpha.point(lambda v: 255 if v > 240 else 0).getbbox())


def scaled(size: int) -> Image.Image:
    return art.resize((size, size), Image.LANCZOS)


def glow_bed(canvas: int, zoom: float, blur: int) -> Image.Image:
    """พื้นถมมุม = ตัวตราเองขยายแล้วเบลอ (เหตุผลอยู่หัวไฟล์)"""
    big = int(canvas * zoom)
    bed = scaled(big).convert('RGB').filter(ImageFilter.GaussianBlur(blur))
    off = (big - canvas) // 2

    return bed.crop((off, off, off + canvas, off + canvas))


def save(image: Image.Image, name: str) -> None:
    image.save(ASSETS / name)
    print('เขียน', name, image.size)


# ---------------------------------------------------------- iOS / ตัวหลัก
icon = glow_bed(1024, zoom=1.35, blur=70)
mark = scaled(1024)
icon.paste(mark, (0, 0), mark)
save(icon, 'icon-hrtjc.png')

# ------------------------------------------------------- Android สองชั้น
# ชั้นหลังเบลอแรงกว่าและขยายมากกว่า เพราะ launcher ครอบเหลือแค่กลางภาพ
save(glow_bed(1024, zoom=1.6, blur=90), 'adaptive-icon-bg.png')

# ชั้นหน้า — Android ครอบด้วยหน้ากากที่ผู้ผลิตกำหนดเอง (วงกลม สี่เหลี่ยมมน
# หยดน้ำ) ขอบนอกราวหนึ่งในสามถูกตัดทิ้งได้เสมอ ตราจึงต้องย่อไว้กลางผืนใส
# ไม่งั้นตัว T กับ C โดนเฉือน
FOREGROUND = 1024
layer = Image.new('RGBA', (FOREGROUND, FOREGROUND), (0, 0, 0, 0))
mark = scaled(int(FOREGROUND * 0.62))
layer.paste(mark, ((FOREGROUND - mark.width) // 2,) * 2, mark)
save(layer, 'adaptive-icon-hrtjc.png')

# ------------------------------------------------------------------ เว็บ
save(scaled(64), 'favicon-hrtjc.png')
