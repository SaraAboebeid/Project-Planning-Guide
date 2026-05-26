with open('assets/gothenburg_3d.html', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Find the info-content rendering line
needle = "document.getElementById('info-content').innerHTML = rows.join('');"
idx = content.find(needle)
print('=== info-content rendering (idx=%d) ===' % idx)
print(repr(content[idx: idx + 500]))
print()

# Find where boplats section should go - after info-panel show
needle2 = "document.getElementById('info-panel').style.display = 'block';"
idx2 = content.find(needle2)
print('=== info-panel show (idx=%d) ===' % idx2)
print(repr(content[idx2: idx2 + 300]))
print()

# Find good place to put JS init - near the end of the script, look for last </script>
last_script = content.rfind('</script>')
print('=== last </script> (idx=%d) ===' % last_script)
print(repr(content[last_script - 200: last_script + 20]))
print()

# Find where the DATA variable ends and the rest of script starts
needle3 = "html += '</table>';\n    hoverCard.innerHTML = html;"
idx3 = content.find(needle3)
print('=== hover card table end (idx=%d) ===' % idx3)
print(repr(content[idx3: idx3 + 200]))
