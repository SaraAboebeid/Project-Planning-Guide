path = r'C:/Users/saraabo/Desktop/Project Planning Guide/Project-Planning-Guide/assets/gothenburg_3d.html'
with open(path, encoding='utf-8') as f:
    content = f.read()

# Fix 1: search button textContent HTML entity
# textContent assigns raw text; HTML entities are not parsed, so &#128269; shows literally.
old1 = "searchBtn.textContent = '&#128269;';"
new1 = "searchBtn.textContent = '\U0001F50D';"
count1 = content.count(old1)
assert count1 == 1, f'Expected 1 match for fix1, got {count1}'

# Fix 2: Trafikverket LEFT_CLICK uses viewer.screenSpaceEventHandler.setInputAction
# which REPLACES the building info panel click handler registered earlier.
# Fix: use a separate ScreenSpaceEventHandler (same pattern as transit/parking handlers).
old2 = (
    "  viewer.screenSpaceEventHandler.setInputAction(function (click) {\n"
    "    const hit = tvPick(click.position);\n"
    "    if (!hit) return;\n"
    "    showPopup(hit.t, hit.d, click.position);\n"
    "  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);"
)
new2 = (
    "  const _tvClickHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);\n"
    "  _tvClickHandler.setInputAction(function (click) {\n"
    "    const hit = tvPick(click.position);\n"
    "    if (!hit) return;\n"
    "    showPopup(hit.t, hit.d, click.position);\n"
    "  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);"
)
count2 = content.count(old2)
assert count2 == 1, f'Expected 1 match for fix2, got {count2}'

content = content.replace(old1, new1)
content = content.replace(old2, new2)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Both fixes applied successfully.')
print(f'  Fix1 replacements: {count1}')
print(f'  Fix2 replacements: {count2}')
