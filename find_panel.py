with open('assets/gothenburg_3d.html', encoding='utf-8', errors='replace') as f:
    content = f.read()

needle = 'id="info-panel"'
idx = content.find(needle)
print('=== info-panel element (idx=%d) ===' % idx)
print(content[idx:idx+2500])

needle2 = 'id="info-content"'
idx2 = content.find(needle2)
print('\n=== info-content element (idx=%d) ===' % idx2)
print(content[idx2:idx2+500])

# Also find lp-no-selection
needle3 = 'id="lp-no-selection"'
idx3 = content.find(needle3)
print('\n=== lp-no-selection (idx=%d) ===' % idx3)
print(content[idx3:idx3+500])
