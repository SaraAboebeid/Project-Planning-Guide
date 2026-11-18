"""Floor plan raster -> unit geometry (metres) + element inventory.

Pipeline per image:
  1. binarise; estimate wall thickness from the distance transform
  2. thick-wall mask = ink pixels whose stroke is >= ~0.6 * wall thickness
  3. keep the dominant wall cluster (the apartment) - drops logos, legends, key plans
  4. footprint = walls closed + holes filled; scale from listed m2 (gross ~= 1.12 * BOA)
  5. openings = gaps that a 1.3 m linear closing bridges; on the outline they are
     windows (thin glazing lines inside the gap) or the entrance / balcony door
     (empty gap); inside the outline they are interior doors
  6. OCR inside the unit bbox -> room labels and appliance codes
"""
import cv2, numpy as np, json, re, sys
import pytesseract
THR = 0.3
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.ops import unary_union

APPL = {  # Swedish plan abbreviations -> element
    'dm': 'dishwasher', 'kf': 'fridge_freezer', 'k/f': 'fridge_freezer', 'kyl/frys': 'fridge_freezer',
    'k': 'fridge', 'kyl': 'fridge', 'f': 'freezer', 'frys': 'freezer', 'sp': 'stove', 'spis': 'stove',
    'ugn': 'oven', 'mv': 'microwave', 'mikro': 'microwave', 'tm': 'washing_machine', 'tt': 'tumble_dryer',
    'tork': 'drying_cabinet', 'ts': 'drying_cabinet', 'tsk': 'drying_cabinet', 'kfs': 'fridge_freezer',
}
ROOMS = {'vardagsrum': 'living', 'vardag': 'living', 'sovrum': 'bedroom', 'sov': 'bedroom', 'kok': 'kitchen',
         'kök': 'kitchen', 'bad': 'bathroom', 'wc': 'wc', 'dusch': 'bathroom', 'hall': 'hall', 'klk': 'wardrobe',
         'klädkammare': 'wardrobe', 'kladkammare': 'wardrobe', 'matplats': 'dining', 'balkong': 'balcony',
         'uteplats': 'terrace', 'allrum': 'living', 'rum': 'room', 'tvätt': 'laundry', 'tvatt': 'laundry',
         'förråd': 'storage', 'forrad': 'storage', 'gard': 'wardrobe', 'loggia': 'balcony', 'terrass': 'terrace'}


def wall_thickness(ink):
    dt = cv2.distanceTransform(ink, cv2.DIST_L2, 3)
    # local maxima of the distance transform = half stroke widths
    mx = cv2.dilate(dt, np.ones((3, 3)))
    ridge = dt[(dt == mx) & (dt >= 2)]
    if len(ridge) < 50:
        return 6.0
    h, e = np.histogram(ridge, bins=np.arange(2, 30, 0.5))
    # walls are the thick mode: take the upper-most strong peak
    sel = e[:-1] >= 4
    hh = h * sel
    j = int(np.argmax(hh))
    if hh[j] < 40:
        j = int(np.argmax(h))
    return float(2 * (e[j] + 0.25))


def extract(path, size_m2, dbg=None):
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    H, W = img.shape
    ink = (img < 140).astype(np.uint8)
    t = wall_thickness(ink)
    dt = cv2.distanceTransform(ink, cv2.DIST_L2, 3)
    core = (dt >= 0.3 * t).astype(np.uint8)
    walls = cv2.dilate(core, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.6 * t) | 1,) * 2)) & ink
    # remove short blobs (text, logos): keep elongated components
    n, lab, st, _ = cv2.connectedComponentsWithStats(walls, 8)
    keep = np.zeros_like(walls)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if max(w, h) >= 4 * t and a >= 3 * t * t:
            keep[lab == i] = 1
    walls = keep
    # dominant cluster
    big = cv2.dilate(walls, np.ones((int(11 * t), int(11 * t)), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(big, 8)
    if n < 2:
        return None
    wa = np.array([walls[lab == k].sum() for k in range(n)]); wa[0] = 0
    i = int(np.argmax(wa))
    walls = walls & (lab == i).astype(np.uint8)
    ys, xs = np.nonzero(walls)
    if len(xs) < 200:
        return None
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max(), ys.max()

    # openings: linear closings bridge door/window gaps (~1.3 m guessed from t: walls ~0.2-0.3 m)
    px_per_m_guess = t / 0.22
    def lin_close(m, L):
        c = m.copy()
        for k in (np.ones((1, L), np.uint8), np.ones((L, 1), np.uint8)):
            c = c | cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
        return c
    closed_long = lin_close(walls, int(3.8 * px_per_m_guess))
    closed_short = lin_close(walls, int(1.3 * px_per_m_guess))
    closed = closed_long
    # footprint: fill everything enclosed
    K = int(9 * t)
    pad = K + 2
    cl = cv2.copyMakeBorder(closed, pad, pad, pad, pad, cv2.BORDER_CONSTANT, 0)
    cl = cv2.morphologyEx(cl, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (K, K)))[pad:-pad, pad:-pad]
    ff = cl.copy() * 255
    msk = np.zeros((H + 2, W + 2), np.uint8)
    cv2.floodFill(ff, msk, (0, 0), 128)
    filled = ((ff != 128)).astype(np.uint8)
    cont, _ = cv2.findContours(filled, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cont = max(cont, key=cv2.contourArea)
    fp = np.zeros_like(walls)
    cv2.drawContours(fp, [cont], -1, 1, -1)
    area_px = float(fp.sum())
    if dbg is not None:
        o = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        o[closed > 0] = (255, 160, 0); o[walls > 0] = (0, 0, 255)
        cv2.drawContours(o, [cont], -1, (0, 200, 0), 3)
        globals()['_dbg'] = (o, dbg, bx0, by0, bx1, by1)
        cv2.imwrite(dbg, cv2.resize(o[max(0,by0-80):by1+80, max(0,bx0-80):bx1+80], None, fx=0.6, fy=0.6))
    gross = size_m2 * 1.12 if size_m2 else None
    ppm = np.sqrt(area_px / gross) if gross else px_per_m_guess
    # sanity: wall thickness 0.12-0.45 m, else fall back to thickness-based scale
    if not (0.10 <= t / ppm <= 0.5):
        ppm_note = 'scale_from_wall_thickness'
        ppm = px_per_m_guess
    else:
        ppm_note = 'scale_from_listed_area'

    edge0 = cv2.morphologyEx(fp, cv2.MORPH_GRADIENT, np.ones((int(1.5 * t) | 1,) * 2, np.uint8))
    gaps = (((closed_long & edge0) | (closed_short & (1 - edge0))) & (1 - walls)).astype(np.uint8)
    gaps = cv2.morphologyEx(gaps, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, lab, st, cen = cv2.connectedComponentsWithStats(gaps, 8)
    edge = cv2.morphologyEx(fp, cv2.MORPH_GRADIENT, np.ones((int(1.5 * t) | 1,) * 2, np.uint8))
    openings = []
    for k in range(1, n):
        x, y, w, h, a = st[k]
        long_, short = max(w, h) / ppm, min(w, h) / ppm
        if not (0.45 <= long_ <= 4.5) or short > 0.6 or a < 0.3 * t * t:
            continue
        m = lab[y:y + h, x:x + w] == k
        on_edge = edge[y:y + h, x:x + w][m].mean() > 0.5
        thin = ink[y:y + h, x:x + w][m].mean()
        if on_edge:
            kind = 'window' if thin > 0.08 else 'ext_door'
        else:
            kind = 'door'
            if long_ > 2.0:
                kind = 'opening'
        openings.append(dict(kind=kind, x=float((x + w / 2 - bx0) / ppm), y=float((y + h / 2 - by0) / ppm),
                             len=round(float(long_), 2), horiz=bool(w >= h)))

    # door swing arcs: quarter-ring template matching at door radii 0.7-1.0 m
    inkf = cv2.GaussianBlur(ink.astype(np.float32), (3, 3), 0)
    inkf = inkf * fp.astype(np.float32) if fp.sum() else inkf
    best = None
    arcs = []
    for rm in (0.72, 0.82, 0.92):
        r = int(rm * ppm)
        if r < 8:
            continue
        yy, xx = np.mgrid[-r - 2:r + 3, -r - 2:r + 3]
        dd = np.hypot(xx, yy)
        ring = (np.abs(dd - r) <= 1.6).astype(np.float32)
        for qx, qy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            sect = ((xx * qx) > 2) * ((yy * qy) > 2)
            q = ring * sect
            q /= q.sum()
            inner = ((dd > 0.25 * r) & (dd < 0.8 * r) & sect).astype(np.float32); inner /= inner.sum()
            outer = ((np.abs(dd - r - 5) <= 1.5) & sect).astype(np.float32); outer /= outer.sum()
            resp = cv2.filter2D(inkf, -1, q)
            resp = resp - 2.5 * cv2.filter2D(inkf, -1, inner) - 1.0 * cv2.filter2D(inkf, -1, outer)
            # leaf line: a straight radius along one edge of the quadrant
            pk = (resp > THR) & (resp == cv2.dilate(resp, np.ones((int(0.5 * ppm),) * 2)))
            for y_, x_ in zip(*np.nonzero(pk)):
                arcs.append((x_, y_, rm, float(resp[y_, x_])))
    arcs.sort(key=lambda a: -a[3])
    doors_arc = []
    for a in arcs:
        if all(np.hypot(a[0] - b[0], a[1] - b[1]) > 0.55 * ppm for b in doors_arc):
            doors_arc.append(a)
    door_swings = [dict(x=round(float((a[0] - bx0) / ppm), 2), y=round(float((a[1] - by0) / ppm), 2), r=a[2]) for a in doors_arc]

    # keep exterior door gaps only when a swing arc is close by (entrance / balcony door)
    openings = [o for o in openings if o['kind'] != 'ext_door' or
                any(np.hypot(o['x'] - d['x'], o['y'] - d['y']) < 1.3 for d in door_swings)]
    # wall polygons in metres (unit-local, y down -> flip later in viewer)
    wc, hier = cv2.findContours(walls, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    if hier is not None:
        for j, c in enumerate(wc):
            if hier[0][j][3] != -1 or cv2.contourArea(c) < 2 * t * t:
                continue
            c = cv2.approxPolyDP(c, 0.35 * t, True)
            if len(c) < 3:
                continue
            outer = [[round(float((p[0][0] - bx0) / ppm), 3), round(float((p[0][1] - by0) / ppm), 3)] for p in c]
            holes = []
            ch = hier[0][j][2]
            while ch != -1:
                hc = cv2.approxPolyDP(wc[ch], 0.35 * t, True)
                if len(hc) >= 3 and cv2.contourArea(wc[ch]) > 2 * t * t:
                    holes.append([[round(float((p[0][0] - bx0) / ppm), 3), round(float((p[0][1] - by0) / ppm), 3)] for p in hc])
                ch = hier[0][ch][0]
            polys.append([outer] + holes)
    fpc = cv2.approxPolyDP(cont, 0.5 * t, True)
    outline = [[round(float((p[0][0] - bx0) / ppm), 3), round(float((p[0][1] - by0) / ppm), 3)] for p in fpc]

    # OCR inside unit bbox (+margin)
    mg = int(0.8 * ppm)
    X0, Y0, X1, Y1 = max(0, bx0 - mg), max(0, by0 - mg), min(W, bx1 + mg), min(H, by1 + mg)
    crop = img[Y0:Y1, X0:X1]
    crop = cv2.resize(crop, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    d = pytesseract.image_to_data(crop, lang='eng', config='--psm 11', output_type=pytesseract.Output.DICT)
    appl, rooms, labels = [], [], []
    for txt, conf, lx, ly, lw, lh in zip(d['text'], d['conf'], d['left'], d['top'], d['width'], d['height']):
        s = re.sub(r'[^a-zåäö/0-9.,:]', '', txt.lower())
        if not s or float(conf) < 35:
            continue
        cx = (X0 + (lx + lw / 2) / 3 - bx0) / ppm
        cy = (Y0 + (ly + lh / 2) / 3 - by0) / ppm
        if s in APPL and len(s) >= 1:
            # single letters only when they are standalone and small (symbol tags)
            if len(s) == 1 and lh / 3 > 0.6 * ppm:
                continue
            appl.append(dict(kind=APPL[s], code=s, x=round(cx, 2), y=round(cy, 2)))
        for key, r in ROOMS.items():
            if s.startswith(key) and (len(key) >= 3 or s == key):
                rooms.append(dict(kind=r, label=s, x=round(cx, 2), y=round(cy, 2)))
                break
        if re.fullmatch(r'\d{1,2}[.,:]\d', s):
            labels.append(float(re.sub('[,:]', '.', s)))
    w_m, h_m = (bx1 - bx0) / ppm, (by1 - by0) / ppm
    return dict(px_bbox=[int(bx0), int(by0), int(bx1), int(by1)], ppm=round(float(ppm), 2), scale_note=ppm_note, wall_t_m=round(t / ppm, 3),
                bbox_m=[round(float(w_m), 2), round(float(h_m), 2)], outline=outline, walls=polys,
                openings=openings, door_swings=door_swings, appliances=appl, rooms=rooms, room_areas_sum=round(sum(labels), 1),
                gross_px_m2=round(area_px / ppm ** 2, 1))


if __name__ == '__main__':
    r = extract(sys.argv[1], float(sys.argv[2]))
    print(json.dumps({k: (v if k not in ('walls', 'outline') else len(v)) for k, v in r.items()}, indent=1))


def debug_png(path, size_m2, out):
    r = extract(path, size_m2)
    img = cv2.imread(path)
    ink = (cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) < 140).astype(np.uint8)
    return r
