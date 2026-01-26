# Troubleshooting Guide

## 🔍 Common Issues & Solutions

### Problem 1: "SyntaxError: invalid syntax"

**Error looks like:**
```
  File "planning_guide.py", line 123
    "critical_data": ["item1", "item2"]
                                       ^
SyntaxError: invalid syntax
```

**Cause:** Missing comma

**Fix:**
```python
# BEFORE (broken):
"critical_data": ["item1", "item2"]
"important_data": ["item3"]

# AFTER (fixed):
"critical_data": ["item1", "item2"],  # ← Added comma
"important_data": ["item3"]
```

---

### Problem 2: "KeyError: 'my_data_item'"

**Error looks like:**
```
KeyError: 'window_data'
```

**Cause:** Referenced a data item that doesn't exist in session state

**Fix:** Only use these data item names:
- `building_footprints`
- `construction_age`
- `energy_consumption`
- `building_materials`
- `occupancy_data`
- `climate_data`
- `hvac_systems`
- `cost_data`

If you need a new data item:
1. Add to session state (line ~600)
2. Add to display dict (line ~735)
3. Use in rules

---

### Problem 3: Dropdown doesn't show my new option

**Cause:** Added to rules but forgot to add to UI dropdown

**Fix:**
1. Find the selectbox code (line ~626 for analysis, ~667 for country)
2. Add your option to the `options=[]` list:
```python
options=[
    "PED Planning",
    "ECOM Planning",
    "Your New Option"  # ← Add here
]
```

---

### Problem 4: Confidence is showing >100% or negative

**Cause:** Multipliers or penalties are too extreme

**Fix:** Check these values:
```python
# Scale multiplier should be 0.8-1.3:
"confidence_multiplier": 1.2,  # ✅ Good
"confidence_multiplier": 5.0,  # ❌ Too high!

# Country adjustment should be -10 to +15:
"adjustment": 10,  # ✅ Good
"adjustment": 50,  # ❌ Too high!

# Penalties should be negative:
"confidence_impact": -20,  # ✅ Good
"confidence_impact": 20,   # ❌ Should be negative!
```

---

### Problem 5: Changes don't appear in the app

**Solutions:**

1. **Make sure you saved the file** (Ctrl+S)

2. **Manually refresh** the browser page (Ctrl+R or F5)

3. **Restart Streamlit:**
   - Stop terminal (Ctrl+C)
   - Run again:
     ```powershell
     .venv\Scripts\python.exe -m streamlit run planning_guide.py
     ```

4. **Check for errors in terminal** - Red text = something broke

---

### Problem 6: "NameError: name 'calcualte_confidence' is not defined"

**Cause:** Typo in function name (calculate vs calcualte)

**Fix:** Make sure function names match exactly:
- `calculate_confidence` (not calcualte)
- `get_recommended_proxies` (not get_recomended_proxies)
- `get_analysis_messages` (not get_analysis_message)

---

### Problem 7: Proxy recommendations not showing

**Possible causes:**

1. **No data is missing** - Proxies only show for missing data
   - Check session state (line ~600): Set some items to `False`

2. **Data item name mismatch:**
   ```python
   # Session state says:
   'construction_age': False
   
   # But PROXY_TIERS says:
   "building_age": { ... }  # ❌ Wrong name!
   
   # Fix: Use same name everywhere:
   "construction_age": { ... }  # ✅ Correct
   ```

---

### Problem 8: Quotes or brackets don't match

**Error looks like:**
```
SyntaxError: unexpected EOF while parsing
```

**Cause:** Unclosed bracket or quote

**How to find:**
Look for highlighted mismatched brackets in VS Code, or count them:
```python
{  # Opening brace
    "key": "value",
    "list": [1, 2, 3],  # Brackets match: [ ]
}  # Closing brace matches opening
```

**VS Code tip:** Click on a bracket `{` and it highlights the matching `}`

---

### Problem 9: Indentation Error

**Error looks like:**
```
IndentationError: unexpected indent
```

**Cause:** Mixed tabs and spaces, or wrong indentation level

**Fix:** Python requires consistent indentation (4 spaces per level)

```python
# WRONG:
def my_function():
  statement1     # 2 spaces
    statement2   # 4 spaces - inconsistent!

# RIGHT:
def my_function():
    statement1   # 4 spaces
    statement2   # 4 spaces - consistent!
```

**VS Code tip:** Set "Tab Size" to 4 and "Insert Spaces" on

---

### Problem 10: Values don't make sense

**Example:** Confidence is 45% when you expected 70%

**Debug steps:**

1. **Check base confidence** for your analysis type (line ~15-65)
   ```python
   "base_confidence": 70,  # What does yours say?
   ```

2. **Check for missing critical data** - Each one is -20%
   - If 2 critical items are missing: 70 - 40 = 30%

3. **Check scale multiplier** (line ~222-245)
   ```python
   "confidence_multiplier": 1.1,  # Multiplies by 1.1
   ```

4. **Check country adjustment** (line ~247-260)
   ```python
   "adjustment": 5,  # Adds 5%
   ```

**Formula:**
```
Final = (Base - Penalties) × Scale Multiplier + Country Adjustment
```

---

## 🔧 Debugging Tips

### Tip 1: Use Print Statements

Add temporary debugging:
```python
def calculate_confidence(...):
    base_conf = ANALYSIS_REQUIREMENTS[analysis_type]["base_confidence"]
    print(f"DEBUG: Base confidence is {base_conf}")  # ← Add this
    ...
```

Check terminal output when you run the app.

### Tip 2: Check One Thing at a Time

Don't change 5 things at once! Make one edit, test, then make next edit.

### Tip 3: Use Git to Undo

Before making changes:
```powershell
# Save current state
git add .
git commit -m "Before my changes"

# After changes, if broken:
git diff planning_guide.py    # See what you changed
git checkout planning_guide.py  # Undo all changes
```

### Tip 4: Copy-Paste Existing Entries

Want to add something new? Copy an existing one:
```python
# Copy this:
"PED Planning": {
    "critical_data": ["building_footprints"],
    "important_data": ["construction_age"],
    "base_confidence": 70,
    "scale_preference": ["Neighborhood"]
},

# Paste and modify:
"My Planning": {  # Change name
    "critical_data": ["building_footprints"],  # Keep or change
    "important_data": ["construction_age"],    # Keep or change
    "base_confidence": 65,                     # Change value
    "scale_preference": ["Building"]           # Change value
},
```

---

## 🆘 Still Stuck?

### Check These Files:

1. **HOW_TO_EDIT_RULES.md** - Step-by-step instructions
2. **CHEAT_SHEET.md** - Quick reference
3. **EXAMPLES_RULES_ENGINE.md** - Complete examples

### Ask Yourself:

- [ ] Did I save the file?
- [ ] Are there red errors in the terminal?
- [ ] Do all my brackets match?
- [ ] Did I use exact data item names?
- [ ] Are my values in reasonable ranges?
- [ ] Did I add commas between items?

### Emergency Reset:

```powershell
# Undo all changes to the file:
git checkout planning_guide.py

# Restart Streamlit:
.venv\Scripts\python.exe -m streamlit run planning_guide.py
```

---

## 📞 Error Message Decoder

| Error | Meaning | Usual Fix |
|-------|---------|-----------|
| SyntaxError | Typo or missing punctuation | Check commas, quotes, brackets |
| KeyError | Referenced something that doesn't exist | Check spelling, check if data item is in session state |
| NameError | Variable/function not found | Check spelling, check if it's defined |
| IndentationError | Inconsistent spaces/tabs | Fix indentation to 4 spaces per level |
| TypeError | Wrong data type | Check if you used number vs string correctly |
| ValueError | Invalid value | Check if value is in acceptable range |

---

## ✅ Prevention Checklist

Before making changes:

- [ ] I've read HOW_TO_EDIT_RULES.md
- [ ] I know which section to edit (line numbers)
- [ ] I have a backup (git commit or copy file)

After making changes:

- [ ] File is saved
- [ ] No red errors in terminal
- [ ] App reloaded successfully
- [ ] I tested the change works
- [ ] Values make sense (confidence 0-100%)

---

## 🎯 Quick Fixes Summary

```
Problem                           → Line to Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SyntaxError: missing comma        → Where you just edited
KeyError: data item               → ~600 (session state)
New option doesn't show           → ~626 or ~667 (dropdowns)
Confidence >100% or <0%           → ~345 (penalties) or ~222 (multipliers)
Proxy not showing                 → ~67-220 (PROXY_TIERS)
Changes not appearing             → Save file, refresh browser
Function name error               → Check spelling matches exactly
```

---

Remember: The rules engine is designed to be forgiving - small mistakes won't break everything, and you can always undo! 🛡️
