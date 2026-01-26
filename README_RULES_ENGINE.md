# 🏗️ Project Planning Guide - Rules Engine Edition

A **smart, configuration-driven dashboard** for analyzing building energy projects with automatic confidence scoring and intelligent proxy data recommendations.

---

## 🎯 What This Tool Does

This dashboard helps you:

✅ **Assess your data** - See what you have vs. what you need  
✅ **Calculate confidence** - Automatic scoring based on data availability  
✅ **Get recommendations** - Smart proxy suggestions for missing data  
✅ **Understand impacts** - See how scale, location, and data affect results  
✅ **Make decisions** - Prioritize data collection efforts  

---

## 🚀 Quick Start

### Running the Dashboard

```powershell
cd "C:\Users\saraabo\Desktop\Project Planning Guide"
.venv\Scripts\python.exe -m streamlit run planning_guide.py
```

Open your browser to http://localhost:8501

### Using the Dashboard

1. **Select Parameters** (Column 1)
   - Choose analysis type (PED Planning, Energy Audit, etc.)
   - Define scale (Building, Neighborhood, City)
   - Select country
   - Pick desired outputs

2. **Review Data** (Column 2)
   - See available data (green badges)
   - See missing data (red badges)
   - Get proxy recommendations for gaps

3. **Check Confidence** (Column 3)
   - Overall confidence score
   - Confidence by output type
   - Warnings and recommendations

---

## 🎨 Customization - That's Why You're Here!

### 📘 Documentation for Editors

**Start here:** [HOW_TO_EDIT_RULES.md](HOW_TO_EDIT_RULES.md) ← **Your complete guide!**

Quick references:
- [CHEAT_SHEET.md](CHEAT_SHEET.md) - Find things fast
- [EXAMPLES_RULES_ENGINE.md](EXAMPLES_RULES_ENGINE.md) - 8 complete examples  
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Fix common problems
- [RULES_ENGINE_DESIGN.md](RULES_ENGINE_DESIGN.md) - Technical details

### What You Can Customize

Everything is configuration-driven! No complex coding needed:

| What You Can Change | Time Needed | Difficulty |
|---------------------|-------------|------------|
| Add a country | 2 minutes | ⭐ Easy |
| Adjust confidence penalties | 2 minutes | ⭐ Easy |
| Add analysis type | 5 minutes | ⭐⭐ Medium |
| Modify proxy tiers | 5 minutes | ⭐⭐ Medium |
| Change scale multipliers | 2 minutes | ⭐ Easy |
| Add new data item | 10 minutes | ⭐⭐⭐ Advanced |

### Quick Edit Examples

#### Example 1: Add Spain
```python
# In planning_guide.py, line ~250:
"Spain": {"adjustment": 2, "note": "Moderate data availability"},

# Then line ~667:
options=["Sweden", "Germany", ..., "Spain"]
```

#### Example 2: Make System Stricter
```python
# In planning_guide.py, line ~345:
critical_penalty = critical_missing * 25  # Was 20
important_penalty = important_missing * 15  # Was 10
```

#### Example 3: Add New Analysis Type
```python
# In planning_guide.py, line ~60:
"Sustainability Certification": {
    "critical_data": ["building_footprints", "energy_consumption", "building_materials"],
    "important_data": ["construction_age", "climate_data"],
    "base_confidence": 75,
    "scale_preference": ["Building"]
}
```

**→ See [HOW_TO_EDIT_RULES.md](HOW_TO_EDIT_RULES.md) for step-by-step instructions!**

---

## 🏗️ How the Rules Engine Works

### The Magic Behind the Scenes

```
Your Selections → Rules Engine → Automated Results
                       ↓
        Analyzes 5 key factors:
        1. Analysis type requirements
        2. Available vs. missing data  
        3. Project scale considerations
        4. Country data quality
        5. Output-specific dependencies
                       ↓
     ┌─────────────────┴──────────────────┐
     ↓                                    ↓
Confidence Scores              Proxy Recommendations
Warnings & Messages            Context-aware Guidance
```

### Confidence Calculation Example

```
Starting with: PED Planning (base: 70%)

Calculations:
- Missing construction_age (critical):  -20%
- Missing HVAC data (important):        -10%
- City scale (more forgiving):          +8% (×1.2)
- Sweden (excellent data):              +10%
                                        ─────
Final confidence:                        58%

Message: "Suitable for planning, not detailed design"
Recommendation: "Use Tier 1 proxy for construction age"
```

### Configuration Files Location

All rules are in **`planning_guide.py`**, lines 11-450:

```python
ANALYSIS_REQUIREMENTS    # Lines ~15-65    → What each analysis needs
PROXY_TIERS             # Lines ~67-220   → Proxy options (3 tiers each)
SCALE_CONSIDERATIONS    # Lines ~222-245  → Scale multipliers & messages  
COUNTRY_DATA_QUALITY    # Lines ~247-260  → Country adjustments
OUTPUT_WEIGHTS          # Lines ~262-295  → Output dependencies
```

**Functions (rarely need to edit):** Lines 297-450

---

## 📚 Complete Documentation

### For Everyone
- **This README** - Overview and quick start

### For Dashboard Users  
- [QUICK_START.md](QUICK_START.md) - How to use the dashboard

### For Rule Editors (You!)
- **[HOW_TO_EDIT_RULES.md](HOW_TO_EDIT_RULES.md)** ← **START HERE!**
- [CHEAT_SHEET.md](CHEAT_SHEET.md) - Quick reference guide
- [EXAMPLES_RULES_ENGINE.md](EXAMPLES_RULES_ENGINE.md) - 8 complete examples
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common problems & solutions

### For Developers
- [RULES_ENGINE_DESIGN.md](RULES_ENGINE_DESIGN.md) - Technical architecture
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [CHANGELOG.md](CHANGELOG.md) - Version history

---

## 🎓 Learning Path

**I'm new to this** → Read [HOW_TO_EDIT_RULES.md](HOW_TO_EDIT_RULES.md) (15 min)

**I want quick reference** → Use [CHEAT_SHEET.md](CHEAT_SHEET.md)

**I want to see examples** → Check [EXAMPLES_RULES_ENGINE.md](EXAMPLES_RULES_ENGINE.md)

**Something broke** → Fix it with [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

**I want to understand the design** → Read [RULES_ENGINE_DESIGN.md](RULES_ENGINE_DESIGN.md)

---

## 🌟 Why This Design?

### Before: Hardcoded Chaos ❌

```python
# Nightmare to maintain
if analysis == "PED Planning":
    if scale == "City" and country == "Sweden":
        if missing_age and not missing_energy:
            confidence = 65
        elif missing_age and missing_energy:
            confidence = 45
        # ... 500 more lines of if statements
```

### After: Configuration-Driven ✅

```python
# Define once, use everywhere
"PED Planning": {
    "critical_data": ["energy_consumption"],
    "base_confidence": 70
}

# System automatically:
# - Calculates confidence
# - Recommends proxies
# - Generates messages
# - Updates UI
```

### Benefits

✅ **Maintainable** - Change one value, affects everything  
✅ **Consistent** - Same logic everywhere  
✅ **Scalable** - Add new options in minutes  
✅ **Transparent** - Users see why confidence is X%  
✅ **Testable** - Easy to validate

---

## 🔧 Installation

### Requirements
- Python 3.8+
- Streamlit
- Pandas  
- Plotly

### Setup

```powershell
# Install dependencies
pip install -r requirements.txt

# Run the dashboard
python -m streamlit run planning_guide.py
```

---

## 📊 Features

### Automatic Confidence Scoring
- Calculates based on 5+ factors
- Updates in real-time
- Shows per-output breakdown
- Displays warnings for low confidence

### Smart Proxy Recommendations
- Context-aware suggestions
- 3-tier system (varying uncertainty)
- Shows impact on confidence
- Lists suitable applications

### Flexible Configuration
- Add analysis types without touching UI
- Define data requirements once
- Customize penalties and bonuses
- Easy country additions

### Professional Interface
- Clean, modern design
- Intuitive 3-column layout
- Color-coded badges
- Interactive visualizations

---

## 🎯 Use Cases

### Scenario 1: Research Project

```
Analysis: Academic Research
Scale: Neighborhood
Country: Sweden
Data: 80% available

Result: 85% confidence ✅
"Excellent for publication-quality research"
```

### Scenario 2: Investment Decision

```
Analysis: Investment Feasibility  
Scale: Building
Country: Ireland
Missing: Age, Materials, Energy ⚠️

Result: 40% confidence ⚠️
"Insufficient - obtain critical data first"
Recommended: Get construction age (+20% confidence)
```

### Scenario 3: City Planning

```
Analysis: PED Planning
Scale: City
Country: Denmark
Missing: Construction age

Result: 72% confidence ✓
"Suitable for planning and scenario comparison"
Proxy: Use Tier 1 (National typology)
```

---

## 🤝 Contributing

We welcome improvements! See [CONTRIBUTING.md](CONTRIBUTING.md).

Quick contribution guide:
1. Fork the repository
2. Make your changes to `planning_guide.py`
3. Test thoroughly
4. Submit a pull request

---

## 📝 Version History

**v2.0** (Current) - Rules Engine Edition
- ✨ Configuration-driven architecture
- 🎯 Automatic confidence calculation
- 🔧 Dynamic proxy recommendations
- 📊 Context-aware messaging
- 📚 Comprehensive documentation

**v1.0** - Initial Release
- Basic dashboard layout
- Static confidence values
- Manual proxy selection

See [CHANGELOG.md](CHANGELOG.md) for details.

---

## 📄 License

MIT License - See [LICENSE](LICENSE)

---

## 🆘 Getting Help

**Using the dashboard?** → [QUICK_START.md](QUICK_START.md)

**Editing rules?** → [HOW_TO_EDIT_RULES.md](HOW_TO_EDIT_RULES.md)

**Need quick answer?** → [CHEAT_SHEET.md](CHEAT_SHEET.md)

**Hit a problem?** → [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

**Want examples?** → [EXAMPLES_RULES_ENGINE.md](EXAMPLES_RULES_ENGINE.md)

---

## 🎉 Ready to Get Started?

### To Use the Dashboard:
```powershell
.venv\Scripts\python.exe -m streamlit run planning_guide.py
```

### To Edit the Rules:
1. Open **[HOW_TO_EDIT_RULES.md](HOW_TO_EDIT_RULES.md)**
2. Follow the step-by-step guide
3. Make your first edit!
4. Test and celebrate! 🎊

---

**Built with ❤️ for flexible, maintainable decision support systems**

*Questions? Check the docs above or create an issue!*
