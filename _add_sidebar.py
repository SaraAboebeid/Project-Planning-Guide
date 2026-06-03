import pathlib

p = pathlib.Path(r'c:\Users\saraabo\Desktop\Project Planning Guide\Project-Planning-Guide\assets\gothenburg_3d.html')
txt = p.read_text(encoding='utf-8')

OLD = '  </div><!-- /lp-layers -->\n\n  <!-- ══ ANALYSIS TOOLS ═════════════════════════════════════════════════ -->'

NEW = '''  </div><!-- /lp-layers -->

  <!-- ══ URBAN ANALYSIS ════════════════════════════════════════════════ -->
  <div id="urban-analysis-section">
    <div class="lp-divider"></div>
    <div style="display:flex;align-items:center">
      <div class="lp-section-title" style="flex:1">Urban Analysis</div>
    </div>
    <div style="padding:0 0 6px;display:flex;flex-direction:column;gap:5px;flex-shrink:0">
      <button class="tool-btn" id="btn-urban-green">🌿 Green Index</button>
      <button class="tool-btn" id="btn-urban-uhi">🌡️ Heat Island Proxy</button>
      <button class="tool-btn" id="btn-urban-access">🚶 Green Accessibility</button>
      <div id="urban-status" style="display:none;font-size:10px;color:var(--muted);padding:4px 6px;background:rgba(0,0,0,0.15);border-radius:6px"></div>
      <div id="urban-legend" style="display:none;font-size:10px;color:var(--text);padding:6px;background:rgba(0,0,0,0.18);border-radius:6px;line-height:1.6"></div>
    </div>
  </div><!-- /urban-analysis-section -->

  <!-- ══ ANALYSIS TOOLS ═════════════════════════════════════════════════ -->'''

count = txt.count(OLD)
print(f'OLD found: {count}x')
if count == 1:
    txt2 = txt.replace(OLD, NEW)
    p.write_text(txt2, encoding='utf-8')
    print('Sidebar HTML inserted.')
    print(f'HTML size: {len(txt2)} bytes')
else:
    # Show what's actually there
    import re
    m = re.search(r'</div><!-- /lp-layers -->', txt)
    if m:
        print('Context around closing div:')
        print(repr(txt[m.start():m.start()+300]))
    else:
        print('ERROR: closing div not found at all')
