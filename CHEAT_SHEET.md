# Quick Reference Cheat Sheet

## 📋 Where to Find Things in planning_guide.py

```
┌─────────────────────────────────────────────────┐
│ planning_guide.py Structure                     │
├─────────────────────────────────────────────────┤
│                                                 │
│ Lines 1-10:   Imports                          │
│                                                 │
│ Lines 11-450: ⭐ RULES ENGINE (Edit Here!) ⭐  │
│   ├─ 15-65:   ANALYSIS_REQUIREMENTS           │
│   ├─ 67-220:  PROXY_TIERS                     │
│   ├─ 222-245: SCALE_CONSIDERATIONS            │
│   ├─ 247-260: COUNTRY_DATA_QUALITY            │
│   ├─ 262-295: OUTPUT_WEIGHTS                  │
│   └─ 297-450: Functions (rarely edit)         │
│                                                 │
│ Lines 450-600: CSS Styling                     │
│                                                 │
│ Lines 600-900: UI Layout (Column 1, 2, 3)     │
│                                                 │
│ Lines 900+:    Visualizations                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 🎯 Most Common Edits (90% of what you'll do)

### 1️⃣ Change How Much Missing Data Hurts

**Location:** Line ~345
```python
critical_penalty = critical_missing * 20    # Change this number
important_penalty = important_missing * 10  # Change this number
```
**Values:** 
- Stricter: 25, 30, 35
- Standard: 20, 10
- Lenient: 15, 5

---

### 2️⃣ Add a New Country

**Location:** Line ~247
```python
"Your Country": {"adjustment": 5, "note": "Description"},
```
**Then add to dropdown:** Line ~667
```python
options=["Sweden", "Germany", ..., "Your Country"]
```

---

### 3️⃣ Change What an Analysis Needs

**Location:** Line ~15-65
```python
"Your Analysis": {
    "critical_data": ["must", "have", "these"],
    "important_data": ["nice", "to", "have"],
    "base_confidence": 70,
    "scale_preference": ["Building", "Neighborhood"]
}
```

---

### 4️⃣ Adjust Scale Bonuses

**Location:** Line ~222-245
```python
"City": {
    "confidence_multiplier": 1.2,  # Change this (1.0 = no bonus)
    "message": "Your message here"
}
```

---

### 5️⃣ Change Proxy Penalties

**Location:** Line ~67-220
```python
"tier1": {
    "confidence_impact": -15,  # Change this penalty
    "uncertainty": "Medium",   # Change this label
}
```

---

## 📊 Value Guidelines

### Confidence Penalties
```
-10   ░░       Small impact
-15   ░░░      Medium impact  
-20   ░░░░     Standard (recommended)
-25   ░░░░░    Large impact
-30   ░░░░░░   Very large impact
-50   ░░░░░░░░ Unusable
```

### Base Confidence
```
85-95  🟢 Excellent (rare)
75-84  🟢 Good
65-74  🟡 Medium
55-64  🟡 Fair (use caution)
<55    🔴 Low
```

### Scale Multipliers
```
0.8  = -20%  (very strict)
0.9  = -10%  (strict)
1.0  =   0%  (neutral)
1.1  = +10%  (lenient)
1.2  = +20%  (very lenient)
1.3  = +30%  (maximum reasonable)
```

### Country Adjustments
```
+10  🟢 Excellent (Sweden, Denmark)
+5-8 🟢 Very Good (Germany, Finland)
+2-4 🟡 Moderate (UK, France)
0    🟡 Average/Unknown
-5   🔴 Poor
```

---

## 🔤 Available Data Items (Use These Names Exactly)

```python
"building_footprints"    # Building geometry data
"construction_age"       # Building age/year built
"energy_consumption"     # Energy usage data
"building_materials"     # Envelope/facade materials
"occupancy_data"         # Occupancy patterns
"climate_data"           # Weather/climate info
"hvac_systems"           # Heating/cooling systems
"cost_data"              # Cost information
```

---

## 📝 Template: Add New Analysis Type

```python
# Step 1: Add to ANALYSIS_REQUIREMENTS (line ~60)
"Your Analysis Name": {
    "critical_data": ["building_footprints", "energy_consumption"],
    "important_data": ["construction_age"],
    "base_confidence": 70,
    "scale_preference": ["Building", "Neighborhood"]
},

# Step 2: Add to dropdown (line ~626)
options=[
    "PED Planning",
    # ... existing options ...
    "Your Analysis Name"  # Add here
]
```

---

## 🎨 Template: Add New Country

```python
# Step 1: Add to COUNTRY_DATA_QUALITY (line ~255)
"Your Country": {
    "adjustment": 5,
    "note": "Good data availability"
},

# Step 2: Add to dropdown (line ~667)
options=[
    "Sweden",
    # ... existing options ...
    "Your Country"  # Add here in alphabetical order
]
```

---

## ⚡ Quick Syntax Reminders

### Lists (use square brackets)
```python
["item1", "item2", "item3"]
```

### Dictionaries (use curly braces)
```python
{
    "key1": "value1",
    "key2": 123,
    "key3": ["list", "of", "items"]
}
```

### Always include commas between items
```python
# WRONG ❌
{
    "item1": 10
    "item2": 20  # Missing comma above!
}

# RIGHT ✅
{
    "item1": 10,  # Comma here
    "item2": 20
}
```

---

## 🧪 Testing Checklist

After making changes:

- [ ] File saved (Ctrl+S)
- [ ] Streamlit reloaded (automatic)
- [ ] No red error messages
- [ ] Select your new option from dropdown
- [ ] Confidence values are 0-100%
- [ ] Messages make sense
- [ ] Try different combinations

---

## 🆘 Emergency Undo

If something breaks:

```powershell
# In PowerShell terminal:
git checkout planning_guide.py
```

This reverts to the last saved version.

---

## 💡 Pro Tips

1. **Make one change at a time** - Easier to find issues
2. **Keep values reasonable** - Don't set confidence to 500%!
3. **Copy-paste existing entries** - Less chance of syntax errors
4. **Test immediately** - Don't make 10 changes before testing
5. **Use comments** - Add notes to remind yourself why
   ```python
   "base_confidence": 75,  # Increased from 70 on Jan 26
   ```

---

## 🎓 Learning Path

**Beginner:** (Start here!)
1. Change a penalty value (line ~345)
2. Add a new country (line ~247)
3. Adjust a base confidence (line ~15-65)

**Intermediate:**
1. Add a new analysis type (full template)
2. Modify proxy tiers (line ~67-220)
3. Change scale multipliers (line ~222)

**Advanced:**
1. Modify function logic (line ~297-450)
2. Add conditional rules (see EXAMPLES_RULES_ENGINE.md)
3. Create custom calculations

---

## 📚 Related Files

- **HOW_TO_EDIT_RULES.md** - Detailed step-by-step guide (you are here)
- **EXAMPLES_RULES_ENGINE.md** - 8 complete examples
- **RULES_ENGINE_DESIGN.md** - Technical architecture
- **planning_guide.py** - The actual code

---

## ✨ Remember

The system is designed so you **edit the configuration** (the dictionaries with rules), and everything else **updates automatically**. You don't need to touch the UI code or calculation functions - just define your rules!

Happy editing! 🚀
