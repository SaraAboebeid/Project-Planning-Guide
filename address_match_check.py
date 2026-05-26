import json, sqlite3, re

with open('assets/gothenburg_3d.html', encoding='utf-8', errors='replace') as f:
    content = f.read()
idx = content.find('const DATA = [')
end = content.find('];', idx)
data = json.loads(content[idx + len('const DATA = '):end + 1])

conn = sqlite3.connect('boplats_apartments.db')
apts = conn.execute(
    'SELECT id, address, rooms, rent_sek, floor_current, floor_total, floorplan_image_path, last_seen FROM apartments WHERE address IS NOT NULL'
).fetchall()
conn.close()

print('Sample boplats addresses:')
for a in apts[:20]:
    print(' ', repr(a[1]))

def norm(s):
    s = s.strip().lower()
    s = re.sub(r'\s+', ' ', s)
    return s

boplats_map = {}
for row in apts:
    key = norm(row[1])
    if key not in boplats_map:
        boplats_map[key] = []
    boplats_map[key].append(row)

print(f'\nBoplats unique addresses: {len(boplats_map)}')
print(f'3D buildings total: {len(data)}')

matches = []
for i, b in enumerate(data):
    addr = b.get('address') or ''
    key = norm(addr)
    if key in boplats_map:
        matches.append((i, b, boplats_map[key]))

print(f'Direct matches: {len(matches)}')
for i, b, rows in matches[:20]:
    print(f'  bldg[{i}] {b["address"]!r} -> {len(rows)} apt(s)')
