# How to Add New Analysis Types and Focuses

This guide explains how to extend the Project Planning Guide with new analysis types or focuses. The system is designed to be modular and maintainable.

## Architecture Overview

The data requirements system uses a centralized configuration approach:

1. **Page 1 (Define Scope)** - User selects analysis type and focus
2. **Configuration (Page 2)** - `ANALYSIS_FOCUS_REQUIREMENTS` maps (type, focus) → data needs
3. **Page 2 (Review Data)** - Automatically shows only relevant data items based on selection

## File Structure

- `pages/1_Define_Scope_and_Context.py` - Analysis type and focus selection
- `pages/2_Review_Data.py` - Data requirements configuration and data collection
  - `ANALYSIS_FOCUS_REQUIREMENTS` - Central configuration mapping
  - `DATA_ITEMS_WITH_PROXIES` - Complete catalog of all possible data items with proxy options
  - `get_requirements_for_analysis()` - Helper function to retrieve requirements
  - `get_filtered_data_items()` - Filters data items based on requirements

## Adding a New Focus to an Existing Analysis Type

### Step 1: Update Page 1 - Add Focus Option

In `pages/1_Define_Scope_and_Context.py`, locate the focus options for your analysis type:

```python
if selected_analysis == "Energy & Carbon Performance":
    focus_options = ["Electricity", "Heating", "Cooling"]  # Add new focus here
```

### Step 2: Update Page 2 - Define Data Requirements

In `pages/2_Review_Data.py`, locate `ANALYSIS_FOCUS_REQUIREMENTS` and add your new focus:

```python
ANALYSIS_FOCUS_REQUIREMENTS = {
    "Energy & Carbon Performance": {
        "Electricity": { ... },
        "Heating": { ... },
        "Cooling": { ... },
        "YourNewFocus": {  # Add new focus configuration
            "required_items": [
                # List data item keys that are absolutely required
                "building_footprints",
                "climate_data",
                # ... more items
            ],
            "optional_items": [
                # List data item keys that are nice-to-have
                "surroundings_data",
                # ... more items
            ],
        },
    },
}
```

### Step 3: Add Specialized Input Form (Optional)

If your new focus needs custom input forms (like the Electricity form), add a conditional block in `pages/2_Review_Data.py`:

```python
# After the electricity block, add your new focus block
show_yourfocus_block = (
    ("Energy & Carbon Performance" in analysis_types) and (analysis_focus == "YourNewFocus")
)

if show_yourfocus_block:
    st.markdown("### Required Inputs — YourNewFocus")
    with st.form("yourfocus_inputs_form"):
        # Add your custom inputs here
        st.markdown("**Category Name**")
        input_value = st.number_input("Input Label", min_value=0.0)
        
        submitted = st.form_submit_button("Save Inputs")
        if submitted:
            # Validation logic
            st.session_state["yourfocus_inputs"] = {
                "category": {"value": input_value}
            }
            st.success("Inputs saved.")
```

## Adding a Completely New Analysis Type

### Step 1: Update Page 1 - Add Analysis Type

In `pages/1_Define_Scope_and_Context.py`:

```python
analysis_options = [
    "Energy & Carbon Performance",
    "Renewable Energy & Local Production",
    "Climate Resilience",
    "Your New Analysis Type",  # Add here
]

# Add focus options for your new type
if selected_analysis == "Your New Analysis Type":
    focus_options = ["Focus A", "Focus B", "Focus C"]
```

### Step 2: Add to Configuration

In `pages/2_Review_Data.py`, add a complete configuration block:

```python
ANALYSIS_FOCUS_REQUIREMENTS = {
    # ... existing analysis types ...
    
    "Your New Analysis Type": {
        "Focus A": {
            "required_items": [
                "building_footprints",
                "climate_data",
                # ... add all required data keys
            ],
            "optional_items": [
                "surroundings_data",
                # ... add optional data keys
            ],
        },
        "Focus B": {
            "required_items": [ ... ],
            "optional_items": [ ... ],
        },
        "default": {  # Fallback when focus not specified
            "required_items": [ ... ],
            "optional_items": [ ... ],
        },
    },
}
```

## Adding a New Data Item

If you need a data item that doesn't exist in `DATA_ITEMS_WITH_PROXIES`:

### Step 1: Choose the Appropriate Category

Categories in `DATA_ITEMS_WITH_PROXIES`:
- `Building Geometry`
- `Building Fabric and Construction`
- `Building System`
- `Location Context`
- `Measured Energy Data`
- `Climate Data`
- `Carbon Accounting`
- `Renewable Energy Systems`
- `Building Use and Operation`

### Step 2: Add the Data Item Definition

```python
DATA_ITEMS_WITH_PROXIES = {
    "Appropriate Category": [
        # ... existing items ...
        {
            "label": "Human-readable label for display",
            "key": "unique_key_for_reference",  # Use snake_case
            "proxy_tiers": {
                "tier1": {  # Best proxy option
                    "name": "Short proxy name",
                    "description": "Detailed description of the proxy method",
                    "confidence_impact": -10,  # Negative number (penalty)
                    "uncertainty": "Low",  # Low, Medium, High, Very High
                },
                "tier2": {  # Next best proxy
                    "name": "Another proxy option",
                    "description": "Description",
                    "confidence_impact": -25,
                    "uncertainty": "High",
                },
                # Add tier3, tier4, etc. as needed
            },
        },
    ],
}
```

### Step 3: Reference the New Key in Requirements

Use the new key in your `ANALYSIS_FOCUS_REQUIREMENTS`:

```python
"YourAnalysisType": {
    "YourFocus": {
        "required_items": [
            "unique_key_for_reference",  # Your new data item
            # ... other items
        ],
    },
}
```

## Best Practices

### Data Item Keys
- Use lowercase with underscores: `annual_electricity_consumption`
- Be specific and descriptive
- Maintain consistency across similar items

### Confidence Impact Values
- Minor proxy (-5 to -10): Very close to actual data
- Moderate proxy (-10 to -20): Reasonable approximation
- Significant proxy (-20 to -35): Notable uncertainty
- Major proxy (-35+): High uncertainty, use only when necessary

### Uncertainty Levels
- **Low**: < 10% variation expected
- **Low-Medium**: 10-15% variation
- **Medium**: 15-25% variation
- **Medium-High**: 25-35% variation
- **High**: 35-50% variation
- **Very High**: > 50% variation

### Required vs Optional Items
- **Required**: Without this data, the analysis cannot proceed or will be meaningless
- **Optional**: Improves analysis quality but not strictly necessary

## Example: Adding "Water Efficiency" Analysis

### 1. Page 1 - Add analysis type
```python
analysis_options = [
    # ... existing ...
    "Water Efficiency",
]

if selected_analysis == "Water Efficiency":
    focus_options = ["Indoor Use", "Outdoor Use", "Overall"]
```

### 2. Page 2 - Add configuration
```python
ANALYSIS_FOCUS_REQUIREMENTS = {
    # ... existing ...
    "Water Efficiency": {
        "Indoor Use": {
            "required_items": [
                "building_footprints",
                "building_use_type",
                "occupancy_data",
                "water_consumption_annual",
                "fixture_inventory",
            ],
            "optional_items": [
                "water_consumption_hourly",
                "leak_detection_data",
            ],
        },
        "Outdoor Use": {
            "required_items": [
                "landscape_area",
                "irrigation_system_type",
                "climate_data",
                "water_consumption_annual",
            ],
            "optional_items": [
                "soil_data",
                "vegetation_types",
            ],
        },
        "default": {
            "required_items": [
                "building_footprints",
                "water_consumption_annual",
            ],
            "optional_items": [],
        },
    },
}
```

### 3. Add new data items (if needed)
```python
DATA_ITEMS_WITH_PROXIES = {
    "Water Systems": [  # New category
        {
            "label": "Annual water consumption",
            "key": "water_consumption_annual",
            "proxy_tiers": {
                "tier1": {
                    "name": "Utility bill aggregation",
                    "description": "Sum water bills over 12 months",
                    "confidence_impact": -5,
                    "uncertainty": "Low",
                },
                "tier2": {
                    "name": "Benchmark estimation",
                    "description": "Use L/person/day benchmarks",
                    "confidence_impact": -30,
                    "uncertainty": "High",
                },
            },
        },
    ],
}
```

## Testing Your Changes

1. Restart the Streamlit app
2. Navigate to Step 1 and select your new analysis type/focus
3. Move to Step 2 and verify:
   - Only relevant data items appear
   - Categories with no relevant items are hidden
   - Required vs optional labeling is correct
   - Proxy options display properly

## Troubleshooting

**Problem**: Categories appear/disappear when toggling data availability
**Solution**: Ensure all keys in `required_items` and `optional_items` exist in `DATA_ITEMS_WITH_PROXIES`

**Problem**: No data items shown for new analysis type
**Solution**: Check that analysis type string matches exactly in both Page 1 and Page 2 (case-sensitive)

**Problem**: Wrong data items shown
**Solution**: Verify `focus` parameter is passed correctly from Page 1 to Page 2 via `st.session_state["analysis_focus"]`

## Summary

The system is designed to be **modular** and **maintainable**:
- All data requirements are defined in one central location
- Each (analysis_type, focus) combination has independent requirements
- The UI automatically adapts to show only relevant data items
- Easy to extend without touching filtering logic

When adding new features, follow this checklist:
- [ ] Update Page 1 UI with new options
- [ ] Add configuration to `ANALYSIS_FOCUS_REQUIREMENTS`
- [ ] Define any new data items in `DATA_ITEMS_WITH_PROXIES`
- [ ] (Optional) Add specialized input forms
- [ ] Test thoroughly with different combinations
