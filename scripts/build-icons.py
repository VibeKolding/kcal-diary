# -*- coding: utf-8 -*-
"""
Иконки приложения: золотое кольцо с разрывом и лист внутри — тот же знак,
что встречает на заставке.

Кольцо строится масками, а не дугами: у дуг в PIL толщина откладывается
внутрь от рамки, из-за чего скруглённые концы не совпадают с осью линии.
"""
import math, os
from PIL import Image, ImageDraw, ImageFilter

BG = (11, 11, 12)
GOLD_1 = (245, 223, 168)
GOLD_2 = (196, 141, 38)
SS = 4  # избыточная отрисовка ради гладких краёв


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def disc(size, cx, cy, r, value=255):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).ellipse([cx - r, cy - r, cx + r, cy + r], fill=value)
    return m


def angular_gradient(S, start_deg, sweep_deg):
    """Градиент по углу вдоль видимой части кольца: на концах разные оттенки,
    поэтому шва, как у замкнутого градиента, не возникает."""
    img = Image.new('RGB', (S, S), GOLD_1)
    d = ImageDraw.Draw(img)
    steps = 240
    for i in range(steps):
        a0 = start_deg + sweep_deg * i / steps
        a1 = start_deg + sweep_deg * (i + 1) / steps + 1
        d.pieslice([0, 0, S, S], a0, a1, fill=lerp(GOLD_1, GOLD_2, i / steps))
    return img


def leaf_mask(S, cx, cy, half_len, half_wid, angle_deg):
    """Лист — пересечение двух окружностей (линза)."""
    lr = (half_len ** 2 + half_wid ** 2) / (2 * half_wid)
    d = lr - half_wid
    pad = int(S * 0.25)
    box = S + pad * 2
    c1 = disc(box, box/2 - d, box/2, lr)
    c2 = disc(box, box/2 + d, box/2, lr)
    lens = Image.composite(c1, Image.new('L', (box, box), 0), c2)
    lens = lens.rotate(-angle_deg, resample=Image.BICUBIC, center=(box/2, box/2))
    out = Image.new('L', (S, S), 0)
    out.paste(lens.crop((pad, pad, pad + S, pad + S)), (0, 0))
    return out


def draw_icon(size: int, content: float = 0.72) -> Image.Image:
    S = size * SS
    cx = cy = S / 2

    # Тёплое свечение за знаком
    img = Image.new('RGB', (S, S), BG)
    glow = Image.new('RGB', (S, S), BG)
    gd = ImageDraw.Draw(glow)
    for i in range(30, 0, -1):
        t = i / 30
        r = int(S * 0.5 * t)
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=lerp(BG, (66, 46, 20), (1 - t) ** 2))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(S * 0.05)), 0.9)

    r_out = S * content / 2
    stroke = r_out * 0.20
    r_mid = r_out - stroke / 2
    r_in = r_out - stroke

    GAP_START, GAP_LEN = 288, 52          # разрыв сверху справа
    arc_start = GAP_START + GAP_LEN
    arc_sweep = 360 - GAP_LEN

    # Кольцо: внешний круг минус внутренний, затем вырезаем клин разрыва
    ring = Image.new('L', (S, S), 0)
    rd = ImageDraw.Draw(ring)
    rd.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], fill=255)
    rd.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], fill=0)
    rd.pieslice([cx - r_out - 2, cy - r_out - 2, cx + r_out + 2, cy + r_out + 2],
                GAP_START, GAP_START + GAP_LEN, fill=0)
    # Скруглённые концы — ровно на оси линии
    for deg in (GAP_START, arc_start):
        a = math.radians(deg)
        ex, ey = cx + r_mid * math.cos(a), cy + r_mid * math.sin(a)
        rd.ellipse([ex - stroke/2, ey - stroke/2, ex + stroke/2, ey + stroke/2], fill=255)

    img.paste(angular_gradient(S, arc_start, arc_sweep), (0, 0), ring)

    # Лист внутри кольца, с воздухом до него
    half_len = r_in * 0.74
    leaf = leaf_mask(S, cx, cy, half_len, half_len * 0.44, 45)
    flat = Image.new('RGB', (S, S))
    fd = ImageDraw.Draw(flat)
    for i in range(S):
        fd.line([(0, i), (S, i)], fill=lerp(GOLD_1, GOLD_2, i / S))
    img.paste(flat, (0, 0), leaf)

    # Прожилка идёт ВДОЛЬ длинной оси листа и не достаёт до кончиков.
    # Знак угла здесь противоположен повороту маски: лист поворачивается
    # на -45°, значит его ось направлена вверх-вправо.
    v = half_len * 0.52
    a = math.radians(-45)
    ImageDraw.Draw(img).line(
        [cx - v*math.cos(a), cy - v*math.sin(a), cx + v*math.cos(a), cy + v*math.sin(a)],
        fill=BG, width=max(2, int(S * 0.013)))

    return img.resize((size, size), Image.LANCZOS)


os.makedirs('public/icons', exist_ok=True)
for s in (32, 180, 192, 512):
    p = f'public/icons/icon-{s}.png'
    draw_icon(s).save(p, optimize=True)
    print(f'icon-{s}.png — {os.path.getsize(p)//1024} КБ')

# Android обрезает иконку под форму своей темы: круг, скруглённый квадрат
# или каплю. Безопасная зона — центральные 80 %, поэтому знак уменьшен,
# иначе на части телефонов кольцо срежется по краям.
draw_icon(512, content=0.54).save('public/icons/icon-maskable-512.png', optimize=True)
print('icon-maskable-512.png —', os.path.getsize('public/icons/icon-maskable-512.png')//1024, 'КБ')
