# Step-by-Step Guide: How to Edit the Rules Engine

This guide shows you **exactly where and how** to make changes to customize the rules engine for your needs.

---

## 📍 Where Everything Lives

All the rules are in **`planning_guide.py`** starting at **line 11** (right after imports).

Here's the map:

| What | Line Range | What It Does |
|------|-----------|--------------|
| `ANALYSIS_REQUIREMENTS` | ~15-65 | Defines what each analysis type needs |
| `PROXY_TIERS` | ~67-220 | All proxy options for missing data (3 tiers each) |
| `SCALE_CONSIDERATIONS` | ~222-245 | Scale-specific rules (Building/Neighborhood/City) |
| `COUNTRY_DATA_QUALITY` | ~247-260 | Country data quality bonuses |
| `OUTPUT_WEIGHTS` | ~262-295 | What data each output needs |
| Functions | ~297-450 | The calculation logic (rarely need to edit) |

---

## 🎯 Common Edits You'll Make

### **Edit 1: Change Confidence Penalties**

**What:** Adjust how much missing data hurts confidence

**Where:** Line ~345 in `calculate_confidence()` function

**Find this code:**
```python
# Check critical data availability
critical_data = OUTPUT_WEIGHTS[output]["critical_data"]
critical_missing = sum(1 for d in critical_data if not data_inputs.get(d, False))
critical_penalty = critical_missing * 20  # ← THIS NUMBER

# Check important data availability
important_data = OUTPUT_WEIGHTS[output]["important_data"]
important_missing = sum(1 for d in important_data if not data_inputs.get(d, False))
important_penalty = important_missing * 10  # ← THIS NUMBER
```

**How to change:**
- **Make stricter:** Increase the numbers (e.g., 30 and 15)
- **Make more lenient:** Decrease the numbers (e.g., 15 and 5)

**Example:**
```python
critical_penalty = critical_missing * 25  # Was 20, now 25 = stricter
important_penalty = important_missing * 8   # Was 10, now 8 = more lenient
```

---

### **Edit 2: Add a New Country**

**What:** Add a country with its data quality rating

**Where:** Line ~247 in `COUNTRY_DATA_QUALITY`

**Step 1:** Find the dictionary:
```python
COUNTRY_DATA_QUALITY = {
    "Sweden": {"adjustment": 10, "note": "Excellent data infrastructure"},
    "Denmark": {"adjustment": 10, "note": "Excellent data infrastructure"},
    # ... other countries ...
```

**Step 2:** Add your country:
```python
    "Spain": {"adjustment": 2, "note": "Moderate data availability"},
```

**Adjustment values:**
- `10` = Excellent (Sweden, Denmark)
- `5-8` = Very Good (Germany, Finland)
- `2-4` = Moderate (Spain, Italy)
- `0` = Average
- Negative = Poor data infrastructure

**Step 3:** Add to the dropdown (line ~667):
```python
country = st.selectbox(
    "Select country:",
    options=[
        "Sweden",
        "Germany",
        # ... existing countries ...
        "Spain"  # ← Add here
    ],
    ...
)
```

---

### **Edit 3: Modify What an Analysis Type Needs**

**What:** Change which data is critical/important for an analysis

**Where:** Line ~15 in `ANALYSIS_REQUIREMENTS`

**Example:** Make "PED Planning" more strict

**Find this:**
```python
"PED Planning": {
    "critical_data": ["building_footprints", "energy_consumption", "climate_data"],
    "important_data": ["construction_age", "building_materials", "occupancy_data"],
    "base_confidence": 70,
    "scale_preference": ["Neighborhood", "City"]
},
```

**Change to:**
```python
"PED Planning": {
    "critical_data": ["building_footprints", "energy_consumption", "climate_data", "construction_age"],  # ← Moved construction_age here
    "important_data": ["building_materials", "occupancy_data"],  # ← Removed construction_age
    "base_confidence": 75,  # ← Increased from 70
    "scale_preference": ["Neighborhood", "City"]
},
```

**Result:** Now construction age is critical (bigger penalty if missing), and base confidence is higher

---

### **Edit 4: Change Proxy Recommendations**

**What:** Modify a proxy tier's properties

**Where:** Line ~67 in `PROXY_TIERS`

**Example:** Make Tier 1 for construction age less strict

**Find this:**
```python
"construction_age": {
    "tier1": {
        "name": "National typology by age period",
        "description": "Use national building archetypes categorized by construction period",
        "uncertainty": "Medium",
        "confidence_impact": -15,  # ← THIS IS THE PENALTY
        "suitable_for": ["Scenario Planning", "Retrofit Ranking"],
        "not_suitable_for": ["Detailed Analysis", "Individual Building Assessment"],
        "outputs_affected": ["Annual Energy Demand", "Retrofit Prioritization"]
    },
```

**Change to:**
```python
        "uncertainty": "Medium-Low",  # ← Better uncertainty rating
        "confidence_impact": -10,     # ← Smaller penalty (was -15)
        "suitable_for": ["Scenario Planning", "Retrofit Ranking", "Comparative Studies"],  # ← Added one more
        "not_suitable_for": ["Individual Building Assessment"],  # ← Removed "Detailed Analysis"
```

**Result:** Tier 1 proxy is now more acceptable, smaller confidence penalty

---

### **Edit 5: Adjust Scale Multipliers**

**What:** Change how scale affects confidence

**Where:** Line ~222 in `SCALE_CONSIDERATIONS`

**Find this:**
```python
SCALE_CONSIDERATIONS = {
    "Building": {
        "required_detail": "High",
        "aggregation_acceptable": False,
        "typical_outputs": ["Annual Energy Demand", "Peak Power Load", "Retrofit Prioritization"],
        "confidence_multiplier": 1.0,  # ← THIS NUMBER
        "message": "Building-scale analysis requires detailed, building-specific data for reliable results."
    },
    "Neighborhood": {
        ...
        "confidence_multiplier": 1.1,  # ← THIS NUMBER
        ...
    },
    "City": {
        ...
        "confidence_multiplier": 1.2,  # ← THIS NUMBER
        ...
    }
}
```

**How multipliers work:**
- `1.0` = No change
- `1.1` = 10% bonus (confidence increased by 10%)
- `1.2` = 20% bonus
- `0.9` = 10% penalty (confidence decreased by 10%)

**Example:** Make City scale more forgiving:
```python
"City": {
    ...
    "confidence_multiplier": 1.3,  # ← Was 1.2, now 1.3 = 30% bonus
    ...
}
```

---

### **Edit 6: Change What Data an Output Needs**

**What:** Define which data items affect a specific output

**Where:** Line ~262 in `OUTPUT_WEIGHTS`

**Example:** Make "Peak Power Load" less dependent on HVAC systems

**Find this:**
```python
"Peak Power Load": {
    "critical_data": ["energy_consumption", "occupancy_data", "hvac_systems"],
    "important_data": ["construction_age", "climate_data"],
    "base_confidence": 60
},
```

**Change to:**
```python
"Peak Power Load": {
    "critical_data": ["energy_consumption", "occupancy_data"],  # ← Removed hvac_systems
    "important_data": ["construction_age", "climate_data", "hvac_systems"],  # ← Moved here
    "base_confidence": 65  # ← Increased since less strict
},
```

**Result:** Missing HVAC data is now a smaller penalty for Peak Power Load

---

## 🔧 Step-by-Step: Adding a Complete New Analysis Type

Let's add "District Heating Planning" step by step:

### **Step 1: Add to ANALYSIS_REQUIREMENTS**

**Line ~60** (after last analysis type), add:
```python
    "District Heating Planning": {
        "critical_data": ["building_footprints", "energy_consumption", "climate_data", "hvac_systems"],
        "important_data": ["construction_age", "building_materials"],
        "base_confidence": 68,
        "scale_preference": ["Neighborhood", "City"]
    }
```

### **Step 2: Add to UI Dropdown**

**Line ~626**, find the selectbox and add:
```python
analysis_type = st.selectbox(
    "Select your analysis:",
    options=[
        "PED Planning",
        "ECOM Planning",
        "Academic Research",
        "Investment Feasibility",
        "Energy Audit",
        "Carbon Assessment",
        "Retrofit Planning",
        "District Heating Planning"  # ← Add here at the end
    ],
    ...
)
```

### **Step 3: Test It!**

1. Save the file
2. Refresh your Streamlit app (it should auto-reload)
3. Select "District Heating Planning" from the dropdown
4. Watch the confidence scores recalculate!

✅ **Done!** The system automatically:
- Calculates confidence based on your rules
- Recommends appropriate proxies
- Generates contextual messages

---

## 🧪 Testing Your Changes

After making any edit:

1. **Save the file** (`Ctrl+S`)
2. **Check the Streamlit app** - It should auto-reload
3. **If you see an error:**
   - Check for typos in your edits
   - Make sure all brackets `{}` and quotes `""` match
   - Look at the error message in the terminal

4. **Test the logic:**
   - Select different analysis types
   - Change the scale
   - Toggle different outputs
   - Make sure confidence values make sense (0-100%)

---

## 🎨 Quick Reference: Common Values

### Confidence Penalties
```python
-10  # Small penalty
-15  # Medium penalty
-20  # Standard critical data penalty
-25  # Large penalty
-30  # Very large penalty
-50  # Massive penalty (essentially makes it unusable)
```

### Base Confidence Levels
```python
80-90  # High confidence analysis (e.g., Energy Audit with good data)
70-79  # Good confidence (e.g., PED Planning, Carbon Assessment)
60-69  # Medium confidence (e.g., Investment Feasibility)
50-59  # Lower confidence (use with caution)
```

### Scale Multipliers
```python
0.8   # 20% penalty (very strict)
0.9   # 10% penalty
1.0   # No change (Building scale)
1.1   # 10% bonus (Neighborhood scale)
1.2   # 20% bonus (City scale)
1.3   # 30% bonus (very forgiving)
```

### Country Adjustments
```python
10    # Excellent data (Sweden, Denmark)
5-8   # Very good (Germany, Finland, Norway)
2-4   # Moderate (UK, France, Belgium)
0     # Average/Unknown
-5    # Poor data infrastructure
```

---

## ⚠️ Common Mistakes to Avoid

### ❌ **Mistake 1: Forgetting Commas**
```python
# WRONG:
"PED Planning": {
    "critical_data": ["item1", "item2"]
    "important_data": ["item3"]  # ← Missing comma above!
}

# RIGHT:
"PED Planning": {
    "critical_data": ["item1", "item2"],  # ← Comma here
    "important_data": ["item3"]
}
```

### ❌ **Mistake 2: Referencing Non-existent Data**
```python
# WRONG:
"critical_data": ["building_footprints", "window_data"]  # ← "window_data" doesn't exist!

# RIGHT - only use existing data items:
# building_footprints, construction_age, energy_consumption, 
# building_materials, occupancy_data, climate_data, hvac_systems, cost_data
```

### ❌ **Mistake 3: Unrealistic Values**
```python
# WRONG:
"confidence_multiplier": 5.0  # ← This would give 500% confidence!

# RIGHT:
"confidence_multiplier": 1.5  # ← 50% bonus is maximum reasonable
```

---

## 🎯 Your Turn: Practice Exercise

Try this simple edit:

**Goal:** Make Germany have better data infrastructure

**Steps:**
1. Open `planning_guide.py`
2. Find line ~250 (COUNTRY_DATA_QUALITY)
3. Find Germany's entry:
   ```python
   "Germany": {"adjustment": 5, "note": "Good data availability"},
   ```
4. Change to:
   ```python
   "Germany": {"adjustment": 8, "note": "Very good data availability"},
   ```
5. Save and test!

**Expected result:** Selecting Germany should now give ~3% higher confidence

---

## 📞 Need Help?

**If you get stuck:**

1. **Syntax Error?** Check for:
   - Matching quotes: `"` and `"`
   - Matching brackets: `{` and `}`
   - Commas between items
   - Proper indentation

2. **Logic Error?** Check:
   - Are data item names spelled correctly?
   - Are values in reasonable ranges?
   - Did you add the item to both the rules AND the UI?

3. **Want to undo?** Use Git:
   ```powershell
   git checkout planning_guide.py
   ```

---

## 🚀 Next Steps

Once you're comfortable with basic edits, try:

1. ✅ Add a new country relevant to your work
2. ✅ Adjust penalties to match your expectations
3. ✅ Create a custom analysis type for your specific needs
4. ✅ Modify proxy tiers based on your data sources
5. ✅ Add conditional logic for special cases (see EXAMPLES_RULES_ENGINE.md)

**Remember:** The beauty of this system is that you define the rules once, and everything else updates automatically! 🎉
