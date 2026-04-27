"""
Check for material overlaps between Wikells and Boverket databases.
"""
import sys
sys.path.insert(0, '.')

from utils.boverket_api import get_categories, get_resources_by_category

# Get all Boverket materials
print('Fetching Boverket materials...')
categories = get_categories()
print(f'Found {len(categories)} categories')

boverket_materials = {}
for cat in categories:
    cat_id = cat['Id']
    cat_title = cat['Title']
    resources = get_resources_by_category.__wrapped__(cat_id, version='02.07.000', culture='en')
    for r in resources:
        name = r.get('Name', '')
        name_lower = name.lower()
        boverket_materials[name_lower] = {
            'original_name': name,
            'category': cat_title
        }

print(f'\nTotal Boverket materials: {len(boverket_materials)}')

# Import Wikells data from TypeScript file
print('\nExtracting Wikells materials from TypeScript...')
import re

wikells_file = r'c:\Users\saraabo\Desktop\Project Planning Guide\frontend\src\config\wikellsData.ts'
with open(wikells_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Extract description fields from WikellsItem objects
# Pattern: { code: "...", description: "...", ...}
pattern = r'description:\s*"([^"]+)"'
wikells_descriptions = re.findall(pattern, content)

print(f'Total Wikells items: {len(wikells_descriptions)}')

# Search for overlaps - check key material terms
print('\n' + '='*80)
print('SEARCHING FOR MATERIAL OVERLAPS...')
print('='*80)

# Key material terms to search for
material_keywords = [
    'concrete', 'betong', 'steel', 'stål', 'wood', 'timber', 'trä',
    'insulation', 'isolering', 'mineral wool', 'glass wool', 'rock wool',
    'gypsum', 'gips', 'plywood', 'plasterboard', 'brick', 'tegel',
    'tile', 'kakel', 'stone', 'sten', 'aluminum', 'aluminium',
    'plastic', 'plast', 'vinyl', 'linoleum', 'cement',
    'fiber', 'fibre', 'cellulose', 'cellulosa'
]

matches = []
for wikells_desc in wikells_descriptions:
    wikells_lower = wikells_desc.lower()
    
    # Check if any keyword appears in both
    for keyword in material_keywords:
        if keyword in wikells_lower:
            # Search Boverket materials for same keyword
            for bov_name_lower, bov_data in boverket_materials.items():
                if keyword in bov_name_lower:
                    matches.append({
                        'wikells': wikells_desc,
                        'boverket': bov_data['original_name'],
                        'category': bov_data['category'],
                        'keyword': keyword
                    })
                    break  # Only first match per Wikells item

# Remove duplicates
seen = set()
unique_matches = []
for m in matches:
    key = (m['wikells'], m['boverket'])
    if key not in seen:
        seen.add(key)
        unique_matches.append(m)

print(f'\nFound {len(unique_matches)} potential material overlaps')
print('\nTop 30 matches:')
print('-'*80)

for i, match in enumerate(unique_matches[:30], 1):
    print(f"\n{i}. WIKELLS: {match['wikells']}")
    print(f"   BOVERKET: {match['boverket']} ({match['category']})")
    print(f"   Common term: {match['keyword']}")

if len(unique_matches) > 30:
    print(f"\n... and {len(unique_matches) - 30} more matches")

print('\n' + '='*80)
print('SUMMARY')
print('='*80)
print(f"Wikells items: {len(wikells_descriptions)}")
print(f"Boverket materials: {len(boverket_materials)}")
print(f"Material overlaps: {len(unique_matches)}")
print('\nNote: These are keyword-based matches. Exact specification overlaps')
print('would require detailed comparison of assembly properties.')
