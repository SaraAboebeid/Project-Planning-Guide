h = open('frontend/public/gothenburg_3d.html', encoding='utf-8').read()

# find the loading screen element
for kw in ['loading-screen', 'loadScreen', 'load-screen', 'splash-screen', 'init-overlay']:
    idx = h.find(kw)
    if idx >= 0:
        print(f'{kw} at {idx}:', repr(h[max(0,idx-30):idx+200]))
        print()

# find where loading text is set
idx = h.find('Loading buildings')
print('Loading buildings text at:', idx)
if idx >= 0:
    print(repr(h[max(0,idx-200):idx+500]))
