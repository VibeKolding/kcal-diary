# -*- coding: utf-8 -*-
"""
Раскладка снимков упражнений.

Берёт папку со сгенерированными диптихами, узнаёт по имени файла упражнение
и пол, проверяет кадр и кладёт результат в public/images/gym/ex под тем
именем, которое ищет приложение.

    python3 scripts/add-shots.py "~/Downloads/Упражнения в приложение"
    python3 scripts/add-shots.py <папка> --dry   # только разбор, без записи

Имя файла достаточно человеческое: «Жим штанги лёжа, для женщин.jpg»,
«гантели на наклонной муж.jpg» или прямо «chest-incline-db-male.jpg».
Название сверяется со справочником упражнений, а не с отдельным списком:
второй список разошёлся бы с первым в первый же день. Пол берётся из имени,
а у адресного упражнения — из его audience, поэтому «Отжимания с колен.jpg»
раскладывается без уточнений.

Что проверяется до записи: пропорция кадра, положение шва между панелями и
вес готового файла. Шов — главное: стрелку направления рисует приложение и
привязывает ровно к середине кадра, поэтому уехавший шов виден сразу.
"""
import os
import re
import sys
import unicodedata
from io import BytesIO

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOGUE = os.path.join(ROOT, 'src', 'features', 'gym', 'exercises.ts')
OUT_DIR = os.path.join(ROOT, 'public', 'images', 'gym', 'ex')

WIDTH, HEIGHT = 1200, 800
BUDGET = 90 * 1024          # вес одного файла, байт
QUALITIES = (82, 78, 74, 70)
SEAM_TOLERANCE = 4          # допуск на смещение шва, пикселей исходника


def nfc(text):
    """macOS хранит имена файлов в разложенной форме: «ё» в них — две
    кодовых точки, и сравнение с обычной строкой молча не совпадает."""
    return unicodedata.normalize('NFC', text)


def stems(text):
    """Слова длиннее двух букв, обрезанные до корня. Сравнивать целиком
    нельзя: в именах файлов падежи гуляют («гантели» против «гантелей»)."""
    text = nfc(text).lower().replace('ё', 'е')
    return {w[:5] for w in re.split(r'[^0-9a-zа-я]+', text) if len(w) > 2}


def catalogue():
    """Справочник упражнений из исходника раздела: id, название, аудитория."""
    src = open(CATALOGUE, encoding='utf-8').read()
    out = []
    for block in src.split("    id: '")[1:]:
        eid = block.split("'")[0]
        title = re.search(r"title: '([^']+)'", block).group(1)
        audience = re.search(r"audience: '([^']+)'", block).group(1)
        out.append((eid, title, audience))
    return out


def identify(name, cat):
    """(id, пол) либо (None, почему не вышло)."""
    stem = nfc(os.path.splitext(os.path.basename(name))[0])
    low = stem.lower()

    sex = None
    if re.search(r'жен(щин|ск)?|female', low):
        sex = 'female'
    elif re.search(r'муж(чин|ск)?|male', low):
        sex = 'male'

    # Готовое имя вида chest-incline-db-male. Сверяется целиком, а не
    # началом строки: «chest-pushup» — начало «chest-pushup-knees», и
    # отжимания с колен уехали бы к обычным отжиманиям.
    for eid, _, audience in cat:
        if low == eid and audience != 'both':
            return (eid, audience), None
        for s in ('female', 'male'):
            if low == '%s-%s' % (eid, s):
                if audience != 'both' and s != audience:
                    return None, 'упражнение показано только другому полу'
                return (eid, s), None

    words = stems(re.sub(r'(?i)для\s+|жен\w*|муж\w*|female|male', ' ', stem))
    if not words:
        return None, 'в имени нет названия упражнения'

    # Две доли: сколько слов имени нашлось в названии и сколько названия
    # покрыто именем. Одной первой мало: «Подтягивания» целиком входят и в
    # «Подтягивания», и в «Подтягивания обратным хватом», а различает их
    # только вторая.
    def score(title):
        common = len(words & stems(title))
        return common / len(words), common / len(stems(title))

    scored = sorted(((score(title), eid, audience) for eid, title, audience in cat), reverse=True)
    (fwd, back), eid, audience = scored[0]
    (fwd2, back2), _, _ = scored[1]
    # Одно слово из трёх-четырёх может не совпасть — «поднятия» вместо
    # «подъём», опечатка, — и это не повод отказывать, если никакое другое
    # упражнение даже близко не подходит.
    if fwd < 0.8 and not (fwd >= 0.6 and fwd - fwd2 >= 0.4):
        return None, 'название не узнано'
    if fwd - fwd2 < 0.2 and back - back2 < 0.2:
        return None, 'название подходит сразу к двум упражнениям'

    if audience != 'both':
        if sex and sex != audience:
            return None, 'упражнение показано только другому полу'
        sex = audience
    if not sex:
        return None, 'в имени не указан пол'
    return (eid, sex), None


def seam(img):
    """Середина сплошной тёмной полосы между панелями. Полоса — заливка
    одним цветом, поэтому ищется по нулевому разбросу яркости в столбце,
    а не по темноте: тёмных столбцов в зале хватает и без неё."""
    grey = img.convert('L')
    w, h = grey.size
    px = grey.load()
    flat = []
    for x in range(int(w * 0.35), int(w * 0.65)):
        values = [px[x, y] for y in range(0, h, 4)]
        mean = sum(values) / len(values)
        spread = sum((v - mean) ** 2 for v in values) / len(values)
        flat.append(spread < 1.5)
    run = best = 0
    end = -1
    for i, ok in enumerate(flat + [False]):
        run = run + 1 if ok else 0
        if run > best:
            best, end = run, i
    if best == 0:
        return None, 0
    left = int(w * 0.35) + end - best
    return left + (best - 1) / 2, best


def grid_seam(img):
    """Насколько резок самый сильный поперечный стык в средней трети кадра:
    доля столбцов со скачком на этой строке минус та же доля на соседних."""
    grey = img.convert('L')
    w, h = grey.size
    px = grey.load()
    xs = range(0, w, 2)

    def cover(y):
        return sum(1 for x in xs if abs(px[x, y] - px[x, y + 1]) >= 12) / len(xs)

    lo, hi = int(h * 0.35), int(h * 0.65)
    cov = {y: cover(y) for y in range(lo - 2, hi + 2)}
    y = max(range(lo, hi), key=cov.get)
    return cov[y] - max(cov[y - 2], cov[y - 1], cov[y + 1], cov[y + 2])


def complaints(img):
    """Всё, из-за чего снимок не стоит класть в папку как есть."""
    out = []
    w, h = img.size
    if abs(w / h - 1.5) > 0.04:
        out.append('кадр %dx%d — это не 3:2' % (w, h))
    centre, band = seam(img)
    if centre is None:
        out.append('между панелями нет сплошной полосы: это диптих?')
    elif abs(centre - w / 2) > SEAM_TOLERANCE:
        out.append('шов увёл на %+.0f px от середины' % (centre - w / 2))

    # Сетка 2x2 вместо диптиха: генератор так иногда поступает с лежачими
    # упражнениями, которым тесно в высокой панели. Шов между рядами — это
    # стык двух разных картинок, поэтому он резкий в одну строку и идёт
    # почти через всю ширину. Край настоящего предмета — брусьев, пола,
    # скамьи — размыт на несколько строк, и соседние строки тоже дают
    # скачок. На первой партии: сетка 0.97, самый резкий честный кадр 0.07.
    if grid_seam(img) > 0.5:
        out.append('это сетка 2x2, а не две панели: нужен новый кадр')
    return out


def convert(img):
    """1200x800 webp в рамках бюджета. Обрезка только по высоте: любой сдвиг
    по горизонтали увёл бы шов от середины, а стрелка привязана к ней."""
    w, h = img.size
    keep = int(round(w / 1.5))
    if keep < h:
        top = (h - keep) // 2
        img = img.crop((0, top, w, top + keep))
    img = img.resize((WIDTH, HEIGHT), Image.LANCZOS)
    img = img.filter(ImageFilter.UnsharpMask(radius=0.8, percent=45, threshold=3))
    for q in QUALITIES:
        buf = BytesIO()
        img.save(buf, 'WEBP', quality=q, method=6)
        if buf.tell() <= BUDGET or q == QUALITIES[-1]:
            return buf.getvalue(), q
    return None, None


def main(argv):
    if not argv:
        print(__doc__)
        return 1
    folder = os.path.expanduser(argv[0])
    dry = '--dry' in argv
    cat = catalogue()
    os.makedirs(OUT_DIR, exist_ok=True)

    files = sorted(
        f for f in os.listdir(folder)
        if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))
    )
    taken, skipped = {}, []
    for name in files:
        found, why = identify(name, cat)
        if not found:
            skipped.append((name, why))
            continue
        target = '%s-%s' % found
        if target in taken:
            skipped.append((name, 'то же имя уже занял «%s»' % taken[target]))
            continue
        img = Image.open(os.path.join(folder, name))
        bad = complaints(img)
        if bad:
            skipped.append((name, '; '.join(bad)))
            continue
        data, q = convert(img.convert('RGB'))
        taken[target] = name
        if not dry:
            open(os.path.join(OUT_DIR, target + '.webp'), 'wb').write(data)
        print('%-34s %-30s %5.1f КБ  q%d' % (target, name[:30], len(data) / 1024, q))

    for name, why in skipped:
        print('пропущен: %-40s %s' % (name[:40], why))
    print('\nразложено %d, пропущено %d%s' % (len(taken), len(skipped), ' (пробный прогон)' if dry else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
