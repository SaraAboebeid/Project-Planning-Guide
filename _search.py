import re
text = open('assets/gothenburg_3d.html', encoding='utf-8').read()
matches = list(re.finditer(r'[Aa]ddress.{0,80}b\.address', text))
print(f"Found {len(matches)} matches")
for m in matches[:10]:
    pos = m.start()
    print(f"\npos={pos}:")
    print(repr(text[max(0,pos-40):pos+150]))
