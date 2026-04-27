"""
Detailed material overlap analysis between Wikells and Boverket.
"""
import sys
sys.path.insert(0, '.')

from utils.boverket_api import get_categories, get_resources_by_category
from collections import Counter
import re

# Get Boverket materials
print('Fetching Boverket materials...')
categories = get_categories()
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

# Extract Wikells materials
wikells_file = r'c:\Users\saraabo\Desktop\Project Planning Guide\frontend\src\config\wikellsData.ts'
with open(wikells_file, 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'description:\s*"([^"]+)"'
wikells_descriptions = re.findall(pattern, content)

print(f'\nBoverket materials: {len(boverket_materials)}')
print(f'Wikells items: {len(wikells_descriptions)}')

# Analyze material type distribution
print('\n' + '='*80)
print('MATERIAL TYPE DISTRIBUTION IN WIKELLS')
print('='*80)

material_types = Counter()
for desc in wikells_descriptions:
    desc_lower = desc.lower()
    if 'timber' in desc_lower or 'wood' in desc_lower or 'trä' in desc_lower:
        material_types['timber/wood'] += 1
    if 'concrete' in desc_lower or 'betong' in desc_lower:
        material_types['concrete'] += 1
    if 'steel' in desc_lower or 'stål' in desc_lower or 'metal' in desc_lower:
        material_types['steel/metal'] += 1
    if 'brick' in desc_lower or 'tegel' in desc_lower:
        material_types['brick'] += 1
    if 'gypsum' in desc_lower or 'gips' in desc_lower:
        material_types['gypsum'] += 1
    if 'insulation' in desc_lower or 'isolering' in desc_lower or 'mineral wool' in desc_lower:
        material_types['insulation'] += 1
    if 'window' in desc_lower or 'fönster' in desc_lower:
        material_types['windows'] += 1
    if 'paint' in desc_lower or 'målning' in desc_lower:
        material_types['paint'] += 1
    if 'tile' in desc_lower or 'kakel' in desc_lower or 'linoleum' in desc_lower:
        material_types['flooring/tiles'] += 1

for mat_type, count in material_types.most_common():
    print(f'  {mat_type}: {count} items')

# Check which Boverket categories are most relevant
print('\n' + '='*80)
print('BOVERKET CATEGORIES WITH POTENTIAL MATCHES')
print('='*80)

boverket_categories = Counter()
for bov_name_lower, bov_data in boverket_materials.items():
    boverket_categories[bov_data['category']] += 1

for cat, count in boverket_categories.most_common():
    print(f'  {cat}: {count} materials')

# Key findings
print('\n' + '='*80)
print('KEY FINDINGS')
print('='*80)
print("""
1. STRONG OVERLAPS:
   - Timber/Wood materials: Wikells has extensive timber assemblies, Boverket
     has "Sawn timber" and various wood products
   - Concrete: Both databases include concrete materials
   - Steel/Metal: Both have steel and metal products
   - Insulation: Overlaps in mineral wool, cellulose, etc.
   - Windows: Boverket has window materials, Wikells has window assemblies

2. COMPLEMENTARY:
   - Wikells focuses on INSTALLED ASSEMBLIES (walls, floors, roofs)
   - Boverket focuses on BASE MATERIALS with carbon footprint data
   
3. INTEGRATION OPPORTUNITY:
   - Wikells assemblies could be enriched with Boverket carbon data
   - Example: "EW timber stud 95 M0" → link to "Sawn timber" carbon footprint
   - This would enable carbon impact calculations for renovation options

4. DATA STRUCTURE:
   - Wikells: Cost per m² for complete assemblies
   - Boverket: GWP (Global Warming Potential) per kg or m³ for materials
   - Integration requires material quantity estimation from assemblies
""")
