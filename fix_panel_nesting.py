"""Fix quality-panel nesting in HTML file"""
import re

# Read the HTML file
with open('assets/gothenburg_3d.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the quality-panel HTML block
quality_panel_start = content.find('<!-- Facade Quality result panel -->')
if quality_panel_start == -1:
    print("ERROR: Could not find quality panel comment")
    exit(1)

# Find the closing </div> for quality-panel by counting tags
panel_div_start = content.find('<div class="panel" id="quality-panel"', quality_panel_start)
if panel_div_start == -1:
    print("ERROR: Could not find quality-panel opening tag")
    exit(1)

# Count div tags to find the matching closing tag
pos = panel_div_start
depth = 0
while pos < len(content):
    if content[pos:pos+4] == '<div':
        depth += 1
    elif content[pos:pos+6] == '</div>':
        depth -= 1
        if depth == 0:
            # Found the closing tag
            quality_panel_end = pos + 6
            break
    pos += 1

if depth != 0:
    print(f"ERROR: Could not find closing tag for quality-panel (depth={depth})")
    exit(1)

# Extract the quality panel HTML (including comment)
quality_panel_html = content[quality_panel_start:quality_panel_end]

print(f"Found quality-panel from position {quality_panel_start} to {quality_panel_end}")
print(f"Length: {len(quality_panel_html)} characters")

# Remove it from its current location
content = content[:quality_panel_start] + content[quality_panel_end:]

# Find where to insert it - right before the Västtrafik panels
insert_marker = '<!-- Västtrafik departures panel -->'
insert_pos = content.find(insert_marker)

if insert_pos == -1:
    print("ERROR: Could not find insertion point")
    exit(1)

# Insert the quality panel before the marker
content = content[:insert_pos] + quality_panel_html + '\n\n' + content[insert_pos:]

# Write back
with open('assets/gothenburg_3d.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Successfully fixed quality-panel nesting")
print(f"Panel moved to position {insert_pos}")
