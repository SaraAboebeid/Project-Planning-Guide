"""
patch_boplats.py  –  injects Boplats integration into assets/gothenburg_3d.html
Run once (idempotent: checks for already-patched markers before modifying).
"""
from pathlib import Path

HTML = Path('assets/gothenburg_3d.html')

print(f'Reading {HTML} ({HTML.stat().st_size // 1024 // 1024} MB) ...')
content = HTML.read_text(encoding='utf-8', errors='replace')

GUARD = 'BOPLATS_PATCH_v1'
if GUARD in content:
    print('Already patched – nothing to do.')
    exit(0)

# ── Patch 1: add <div id="boplats-section"> inside info-panel ────────────────
OLD1 = 'id="info-content"></div>\n  </div>'
NEW1 = (
    'id="info-content"></div>\n'
    '  <div id="boplats-section" style="display:none;padding:0 2px"></div>\n'
    '  </div>'
)
assert content.count(OLD1) == 1, f'Patch 1 anchor found {content.count(OLD1)} times'
content = content.replace(OLD1, NEW1, 1)
print('Patch 1 applied: boplats-section div added')

# ── Patch 2: hover card badge ─────────────────────────────────────────────────
OLD2 = "    html += '</table>';\n    hoverCard.innerHTML = html;"
NEW2 = (
    "    html += '</table>';\n"
    "    // Boplats badge\n"
    "    if (window.BOPLATS) {\n"
    "      const _bhk = _normAddr(b.address || '');\n"
    "      const _bha = window.BOPLATS[_bhk];\n"
    "      if (_bha && _bha.length) {\n"
    "        const _minR = _bha.filter(a=>a.rent_sek).reduce((m,a)=>Math.min(m,a.rent_sek),Infinity);\n"
    "        html += '<div style=\"margin-top:7px;padding:4px 8px;background:#fff7ed;border:1px solid #fed7aa;border-radius:5px;font-size:11px;color:#9a3412\">&#127968; Boplats: from '+(_minR!==Infinity?_minR.toLocaleString()+' kr/mo':'&#8211;')+' &middot; '+_bha.length+' unit(s)</div>';\n"
    "      }\n"
    "    }\n"
    "    hoverCard.innerHTML = html;"
)
assert content.count(OLD2) == 1, f'Patch 2 anchor found {content.count(OLD2)} times'
content = content.replace(OLD2, NEW2, 1)
print('Patch 2 applied: hover card badge added')

# ── Patch 3: info panel boplats section ──────────────────────────────────────
OLD3 = (
    "  document.getElementById('info-content').innerHTML = rows.join('');\n"
    "  document.getElementById('info-panel').style.display = 'block';"
)
NEW3 = (
    "  document.getElementById('info-content').innerHTML = rows.join('');\n"
    "  // ── Boplats section ──────────────────────────────────────────────\n"
    "  (function() {\n"
    "    const bEl = document.getElementById('boplats-section');\n"
    "    if (!bEl) return;\n"
    "    const apts = (window.BOPLATS && window.BOPLATS[_normAddr(b.address || '')]) || [];\n"
    "    if (!apts.length) { bEl.style.display = 'none'; bEl.innerHTML = ''; return; }\n"
    "    const rents = apts.filter(a=>a.rent_sek && a.size_m2);\n"
    "    const avgRM2 = rents.length ? Math.round(rents.reduce((s,a)=>s+a.rent_sek/a.size_m2,0)/rents.length) : null;\n"
    "    const allR   = apts.filter(a=>a.rent_sek).map(a=>a.rent_sek);\n"
    "    const minR   = allR.length ? Math.min(...allR) : null;\n"
    "    const maxR   = allR.length ? Math.max(...allR) : null;\n"
    "    let h = '<div style=\"margin-top:10px;border-top:2px solid #fed7aa;padding-top:10px\">';\n"
    "    h += '<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:6px\">';\n"
    "    h += '<span style=\"font-size:12px;font-weight:700;color:#9a3412\">&#127968; Boplats listings</span>';\n"
    "    h += '<span style=\"font-size:11px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:1px 7px;color:#9a3412\">' + apts.length + ' unit(s)</span>';\n"
    "    h += '</div>';\n"
    "    h += '<table style=\"width:100%;border-collapse:collapse\">';\n"
    "    const tr = (l,v) => v!=null?'<tr><td style=\"color:#64748b;padding:2px 0;white-space:nowrap\">'+l+'</td><td style=\"text-align:right;padding:2px 0;font-weight:500\">'+v+'</td></tr>':'';\n"
    "    if (avgRM2) h += tr('Avg rent/m&sup2;', avgRM2+' kr/m&sup2;');\n"
    "    if (minR!==null) { const rs = minR===maxR ? minR.toLocaleString()+' kr/mo' : minR.toLocaleString()+'&ndash;'+maxR.toLocaleString()+' kr/mo'; h += tr('Rent range', rs); }\n"
    "    h += '</table>';\n"
    "    h += '<button onclick=\"var d=document.getElementById(\\'boplats-details\\');d.style.display=d.style.display===\\'none\\'?\\'block\\':\\'none\\'\" style=\"margin-top:8px;width:100%;padding:6px 0;background:#fff7ed;border:1px solid #fed7aa;border-radius:5px;font-size:11px;color:#9a3412;cursor:pointer;font-weight:600\">More data from Boplats &#9660;</button>';\n"
    "    h += '<div id=\"boplats-details\" style=\"display:none;margin-top:8px\">';\n"
    "    for (const apt of apts) {\n"
    "      h += '<div style=\"border:1px solid #e2e8f0;border-radius:6px;padding:8px;margin-bottom:8px;font-size:11px;background:#fafafa\">';\n"
    "      if (apt.rooms) h += '<div><span style=\"color:#64748b\">Rooms: </span><b>'+apt.rooms+'</b></div>';\n"
    "      if (apt.floor_current!=null) h += '<div><span style=\"color:#64748b\">Floor: </span><b>'+apt.floor_current+(apt.floor_total?' of '+apt.floor_total:'')+'</b></div>';\n"
    "      if (apt.rent_sek) h += '<div><span style=\"color:#64748b\">Rent: </span><b>'+apt.rent_sek.toLocaleString()+' kr/mo</b></div>';\n"
    "      if (apt.size_m2) h += '<div><span style=\"color:#64748b\">Size: </span>'+apt.size_m2+' m&sup2;</div>';\n"
    "      if (apt.last_seen) h += '<div style=\"color:#94a3b8;font-size:10px;margin-top:2px\">Retrieved: '+apt.last_seen.slice(0,10)+'</div>';\n"
    "      if (apt.image) h += '<img src=\"'+apt.image+'\" style=\"width:100%;border-radius:4px;margin-top:6px;border:1px solid #e2e8f0\" loading=\"lazy\">';\n"
    "      h += '</div>';\n"
    "    }\n"
    "    h += '</div></div>';\n"
    "    bEl.innerHTML = h;\n"
    "    bEl.style.display = 'block';\n"
    "  })();\n"
    "  // ── End Boplats ──────────────────────────────────────────────────\n"
    "  document.getElementById('info-panel').style.display = 'block';"
)
assert content.count(OLD3) == 1, f'Patch 3 anchor found {content.count(OLD3)} times'
content = content.replace(OLD3, NEW3, 1)
print('Patch 3 applied: info panel boplats section added')

# ── Patch 4: JS init – _normAddr helper + fetch ───────────────────────────────
OLD4 = "  buildPanel();\n})();\n\n</script>"
NEW4 = (
    "  buildPanel();\n"
    "})();\n\n"
    "// ── Boplats integration  " + GUARD + " ──────────────────────────────────\n"
    "function _normAddr(s) {\n"
    "  return (s||'').trim().toLowerCase().replace(/\\s+/g,' ').replace(/\\s+\\d{4}$/,'');\n"
    "}\n"
    "window.BOPLATS = null;\n"
    "fetch('/boplats_data.json')\n"
    "  .then(r => r.json())\n"
    "  .then(d => { window.BOPLATS = d; console.log('[Boplats] loaded', Object.keys(d).length, 'addresses'); })\n"
    "  .catch(e => console.warn('[Boplats] data not loaded:', e));\n"
    "// ── End Boplats ─────────────────────────────────────────────────────────\n"
    "\n</script>"
)
assert content.count(OLD4) == 1, f'Patch 4 anchor found {content.count(OLD4)} times'
content = content.replace(OLD4, NEW4, 1)
print('Patch 4 applied: _normAddr + fetch init added')

# ── Write ─────────────────────────────────────────────────────────────────────
print(f'Writing {len(content)//1024//1024} MB ...')
HTML.write_text(content, encoding='utf-8')
print('Done! Reload http://localhost:8765/gothenburg_3d.html')
