import json, re, sqlite3

# ── buildings.json ────────────────────────────────────────────────────────────
data = json.load(open('assets/buildings.json', encoding='utf-8'))
cadastral = [b for b in data if b.get('address') and re.match(
    r'^[A-ZÅÄÖ\u00C0-\u017E\s]+ \d+:\d+$', str(b['address']).strip())]
street = [b for b in data if b.get('address') and not re.match(
    r'^[A-ZÅÄÖ\u00C0-\u017E\s]+ \d+:\d+$', str(b['address']).strip())]
print(f'Total buildings: {len(data)}')
print(f'  Cadastral addresses: {len(cadastral)}')
print(f'  Street addresses:    {len(street)}')
print(f'  No address:          {len(data)-len(cadastral)-len(street)}')
print('Cadastral samples:', [b['address'] for b in cadastral[:8]])
print('Street samples:   ', [b['address'] for b in street[:8]])

# ── boplats DB ────────────────────────────────────────────────────────────────
conn = sqlite3.connect('boplats_apartments.db')
apts = conn.execute(
    'SELECT address FROM apartments WHERE address IS NOT NULL').fetchall()
conn.close()
cad_apts = [a[0] for a in apts if re.search(r'\d+:\d+', a[0])]
print(f'\nBoplats cadastral addresses: {len(cad_apts)}')
for a in cad_apts:
    print(' ', a)
