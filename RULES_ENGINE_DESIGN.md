# Rules Engine Design Documentation

## Overview

This dashboard now uses a **configuration-driven rules engine** that automatically determines:
- Which proxy tiers to recommend
- Confidence scores for each output
- Contextual warnings and recommendations
- Data quality impacts

## Architecture

### 1. Configuration Dictionaries

The system is built on structured configuration data:

#### **ANALYSIS_REQUIREMENTS**
- Maps each analysis type to its critical/important data needs
- Defines base confidence levels
- Specifies preferred scales

```python
"PED Planning": {
    "critical_data": ["building_footprints", "energy_consumption", "climate_data"],
    "important_data": ["construction_age", "building_materials"],
    "base_confidence": 70,
    "scale_preference": ["Neighborhood", "City"]
}
```

#### **PROXY_TIERS**
- Defines 3 tiers of proxy data for each missing data item
- Each tier specifies:
  - Name and description
  - Uncertainty level
  - Confidence impact (penalty %)
  - Suitable/not suitable applications
  - Affected outputs

```python
"construction_age": {
    "tier1": {
        "name": "National typology by age period",
        "uncertainty": "Medium",
        "confidence_impact": -15,
        "suitable_for": ["Scenario Planning", "Retrofit Ranking"],
        ...
    }
}
```

#### **SCALE_CONSIDERATIONS**
- Defines characteristics of each scale
- Confidence multipliers based on scale
- Scale-specific messages

#### **COUNTRY_DATA_QUALITY**
- Country-specific data quality adjustments
- Confidence bonuses for countries with better data infrastructure

#### **OUTPUT_WEIGHTS**
- Defines data dependencies for each output type
- Base confidence levels per output
- Critical vs. important data items

### 2. Core Functions

#### **calculate_confidence()**
Calculates confidence levels dynamically:

**Inputs:**
- analysis_type
- data_inputs (dict of available data)
- project_scale
- country
- desired_outputs

**Process:**
1. Get base confidence for analysis type
2. Apply scale multiplier
3. Apply country adjustment
4. For each output:
   - Check critical data availability (20% penalty per missing item)
   - Check important data availability (10% penalty per missing item)
   - Calculate final confidence (clamped 0-100%)

**Returns:**
```python
{
    "overall": 65,
    "by_output": {
        "Annual Energy Demand": 70,
        "Peak Power Load": 55,
        ...
    },
    "scale_message": "...",
    "country_note": "..."
}
```

#### **get_recommended_proxies()**
Determines which proxy tiers to recommend:

**Logic:**
- For Building scale: Prefer tier 1 for critical data, tier 2 for others
- For Neighborhood scale: Tier 1 usually sufficient
- For City scale: Can tolerate tier 2-3

**Returns:** Dict of recommended proxies with full tier information

#### **get_analysis_messages()**
Generates contextual messages:

**Returns:**
```python
{
    "warnings": ["Missing critical data: X"],
    "recommendations": ["Priority: Obtain Y data"],
    "limitations": ["Low confidence: screening only"]
}
```

## Data Flow

```
User Selects Parameters
         ↓
   [Rules Engine]
         ↓
    ┌────┴────┐
    ↓         ↓
Calculate   Get Proxies   Get Messages
Confidence    ↓               ↓
    ↓    ┌────┴────┐         ↓
    ↓    ↓         ↓         ↓
Column 2:  Column 3:  All Columns:
Display    Display    Display
Proxies    Confidence Messages
```

## How to Extend the System

### Adding a New Analysis Type

1. Add entry to `ANALYSIS_REQUIREMENTS`:
```python
"New Analysis": {
    "critical_data": ["list", "of", "required"],
    "important_data": ["nice", "to", "have"],
    "base_confidence": 65,
    "scale_preference": ["Building", "Neighborhood"]
}
```

2. Update selectbox options in UI
3. System automatically handles everything else!

### Adding a New Data Item

1. Add to session state initialization:
```python
'new_data_item': False
```

2. Add to `data_items_display` dict

3. If proxies exist, add to `PROXY_TIERS`:
```python
"new_data_item": {
    "tier1": { ... },
    "tier2": { ... },
    "tier3": { ... }
}
```

4. Update relevant entries in `OUTPUT_WEIGHTS` if this data affects outputs

### Adding a New Output Type

Add to `OUTPUT_WEIGHTS`:
```python
"New Output": {
    "critical_data": ["must", "have"],
    "important_data": ["should", "have"],
    "base_confidence": 60
}
```

### Modifying Confidence Calculation

The confidence penalties are currently:
- **Critical data missing:** -20% per item
- **Important data missing:** -10% per item

To modify, edit the `calculate_confidence()` function:
```python
critical_penalty = critical_missing * 20  # Change this value
important_penalty = important_missing * 10  # Change this value
```

## Benefits of This Design

✅ **Maintainable:** All rules in one place, easy to update
✅ **Scalable:** Add new analysis types, data items, or outputs without touching UI code
✅ **Consistent:** Same logic applied everywhere
✅ **Transparent:** Users see exactly why confidence is X%
✅ **Flexible:** Easy to adjust penalties, thresholds, messages
✅ **Testable:** Functions can be unit tested independently

## Example: How a Change Propagates

**Scenario:** User changes from "Building" to "City" scale

1. `project_scale` variable updates
2. Rules engine recalculates:
   - `calculate_confidence()` applies City scale multiplier (1.2x)
   - `get_recommended_proxies()` selects tier 2-3 proxies (more tolerant)
   - `get_analysis_messages()` generates scale-appropriate message
3. UI automatically updates:
   - Column 2 shows different recommended proxies
   - Column 3 displays new confidence scores
   - Messages reflect scale change

**No manual UI updates needed!**

## Future Enhancements

Possible extensions:
- Export rules to JSON/YAML for external editing
- Machine learning to adjust confidence based on actual results
- User-defined custom rules
- Monte Carlo simulation for confidence ranges
- Interactive confidence explorer
- Rule validation/testing interface

## Quick Reference: Key Variables

- `ANALYSIS_REQUIREMENTS` - What each analysis needs
- `PROXY_TIERS` - Available proxies for missing data
- `SCALE_CONSIDERATIONS` - Scale-specific adjustments
- `COUNTRY_DATA_QUALITY` - Country data quality bonuses
- `OUTPUT_WEIGHTS` - Output-specific data dependencies

## Configuration Priority

When conflicts arise, the system prioritizes in this order:
1. Critical data missing → Major penalty
2. Analysis type requirements → Sets baseline
3. Scale considerations → Applies multiplier
4. Country adjustment → Small bonus/penalty
5. Output-specific needs → Individual output scores
