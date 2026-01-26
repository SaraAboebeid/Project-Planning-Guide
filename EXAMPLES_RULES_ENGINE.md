# Examples: How to Modify the Rules Engine

## Example 1: Add a New Analysis Type

Let's add "Sustainability Certification" analysis:

```python
# In ANALYSIS_REQUIREMENTS dictionary, add:
"Sustainability Certification": {
    "critical_data": ["building_footprints", "energy_consumption", "building_materials", "hvac_systems"],
    "important_data": ["construction_age", "climate_data", "occupancy_data"],
    "base_confidence": 75,
    "scale_preference": ["Building"]
}
```

Then update the UI selectbox:
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
        "Sustainability Certification"  # Add here
    ],
    ...
)
```

**That's it!** The system will automatically:
- Calculate appropriate confidence levels
- Recommend relevant proxies
- Generate contextual messages

---

## Example 2: Add New Proxy Tier

Let's add proxy tiers for a new data item "Indoor Air Quality":

```python
# In PROXY_TIERS dictionary, add:
"indoor_air_quality": {
    "tier1": {
        "name": "CO2 monitoring sample extrapolation",
        "description": "Install temporary sensors in representative spaces and extrapolate",
        "uncertainty": "Medium",
        "confidence_impact": -18,
        "suitable_for": ["Ventilation Planning", "Occupant Comfort Assessment"],
        "not_suitable_for": ["Real-time Control", "Individual Space Analysis"],
        "outputs_affected": ["Annual Energy Demand", "Occupant Comfort"]
    },
    "tier2": {
        "name": "Standard ventilation assumptions",
        "description": "Apply standard ventilation rates from building codes",
        "uncertainty": "High",
        "confidence_impact": -30,
        "suitable_for": ["Initial Assessment", "Comparative Studies"],
        "not_suitable_for": ["Health Impact Assessment", "Detailed Design"],
        "outputs_affected": ["Annual Energy Demand"]
    },
    "tier3": {
        "name": "Building type defaults",
        "description": "Use typical IAQ values for building category",
        "uncertainty": "Very High",
        "confidence_impact": -45,
        "suitable_for": ["Rough Estimation Only"],
        "not_suitable_for": ["Most Practical Applications"],
        "outputs_affected": ["Annual Energy Demand", "Occupant Comfort"]
    }
}
```

Don't forget to:
1. Add to session state: `'indoor_air_quality': False`
2. Add to display dict: `'indoor_air_quality': {'label': 'Indoor Air Quality', 'desc': 'IAQ monitoring data'}`

---

## Example 3: Change Confidence Penalties

Currently:
- Missing critical data: -20% per item
- Missing important data: -10% per item

To make the system more strict:

```python
def calculate_confidence(...):
    # ... existing code ...
    
    # Change these lines:
    critical_penalty = critical_missing * 30  # Was 20, now 30
    important_penalty = important_missing * 15  # Was 10, now 15
    
    # ... rest of function ...
```

This makes missing data have a bigger impact on confidence.

---

## Example 4: Add Scale-Specific Logic

Let's make "District" scale available:

```python
# In SCALE_CONSIDERATIONS, add:
"District": {
    "required_detail": "Medium",
    "aggregation_acceptable": True,
    "typical_outputs": ["Annual Energy Demand", "Peak Power Load", "Cost Estimates"],
    "confidence_multiplier": 1.15,
    "message": "District-scale analysis balances detail with coverage for optimal planning."
}
```

Update the selectbox:
```python
project_scale = st.selectbox(
    "Project scale:",
    options=["Building", "Neighborhood", "District", "City"],
    ...
)
```

Update proxy recommendation logic in `get_recommended_proxies()`:
```python
if project_scale == "Building":
    recommended_tier = "tier1" if is_critical else "tier2"
elif project_scale in ["Neighborhood", "District"]:
    recommended_tier = "tier1"
else:  # City
    recommended_tier = "tier2" if is_critical else "tier3"
```

---

## Example 5: Add Country-Specific Rules

Add more nuanced country logic:

```python
# In COUNTRY_DATA_QUALITY, modify Sweden entry:
"Sweden": {
    "adjustment": 10,
    "note": "Excellent data infrastructure",
    "typical_data_gaps": [],  # New field
    "data_collection_ease": "High"  # New field
}

# For a country with known data challenges:
"Spain": {
    "adjustment": 0,
    "note": "Variable data availability by region",
    "typical_data_gaps": ["construction_age", "hvac_systems"],
    "data_collection_ease": "Medium"
}
```

Then modify `calculate_confidence()` to use these:
```python
def calculate_confidence(...):
    # ... existing code ...
    
    country_info = COUNTRY_DATA_QUALITY[country]
    country_adj = country_info["adjustment"]
    
    # Additional penalty if data is typically hard to get in this country
    if data_item in country_info.get("typical_data_gaps", []):
        country_adj -= 5
    
    # ... rest of function ...
```

---

## Example 6: Add Output-Specific Messages

Modify `get_analysis_messages()` to add output-specific guidance:

```python
def get_analysis_messages(...):
    messages = {
        "warnings": [],
        "recommendations": [],
        "limitations": [],
        "output_guidance": {}  # New section
    }
    
    # ... existing code ...
    
    # Add output-specific guidance
    for output in desired_outputs:
        if confidence_results["by_output"][output] < 50:
            messages["output_guidance"][output] = f"⚠ {output}: Insufficient data - not recommended"
        elif confidence_results["by_output"][output] < 70:
            messages["output_guidance"][output] = f"⚠ {output}: Use for planning only, not final design"
        else:
            messages["output_guidance"][output] = f"✓ {output}: Good confidence for this application"
    
    return messages
```

Then display in Column 3:
```python
# In Column 3, after displaying confidence scores:
if analysis_messages.get("output_guidance"):
    st.subheader("Output-Specific Guidance")
    for output, guidance in analysis_messages["output_guidance"].items():
        if "⚠" in guidance:
            st.warning(guidance)
        else:
            st.success(guidance)
```

---

## Example 7: Create Conditional Rules

Add rules that depend on multiple conditions:

```python
def get_special_warnings(analysis_type, project_scale, country, missing_data):
    """
    Generate warnings for specific combinations of parameters.
    """
    warnings = []
    
    # Rule: Investment analysis at city scale in countries with poor data = warning
    if (analysis_type == "Investment Feasibility" and 
        project_scale == "City" and 
        COUNTRY_DATA_QUALITY[country]["adjustment"] < 3):
        warnings.append("⚠ Investment analysis at city scale requires high-quality data. "
                       "Consider narrowing scope to neighborhood or district level.")
    
    # Rule: PED planning without construction age = critical warning
    if (analysis_type == "PED Planning" and 
        not missing_data.get("construction_age")):
        warnings.append("⚠ PED planning typically requires construction age data for accurate baseline.")
    
    # Rule: Academic research with too many proxies = warning
    proxy_count = sum(1 for v in missing_data.values() if not v)
    if analysis_type == "Academic Research" and proxy_count > 3:
        warnings.append("⚠ Academic research with >3 proxy data sources may not meet publication standards.")
    
    return warnings
```

Call this in the main flow:
```python
# After getting analysis_messages
special_warnings = get_special_warnings(analysis_type, project_scale, country, st.session_state.data_inputs)
analysis_messages["warnings"].extend(special_warnings)
```

---

## Example 8: Add Interactive Confidence Adjustment

Let users see impact of getting more data:

```python
# In Column 3, add a "What-if" section:
st.subheader("What-If Analysis")

st.caption("See how acquiring more data would improve confidence:")

for data_item, is_available in st.session_state.data_inputs.items():
    if not is_available:  # Only show missing data
        # Calculate confidence if we had this data
        temp_inputs = st.session_state.data_inputs.copy()
        temp_inputs[data_item] = True
        
        hypothetical_conf = calculate_confidence(
            analysis_type, temp_inputs, project_scale, country, outputs
        )
        
        improvement = hypothetical_conf["overall"] - confidence_results["overall"]
        
        if improvement > 5:  # Only show if meaningful improvement
            data_label = data_items_display[data_item]['label']
            st.metric(
                label=f"If you get {data_label}",
                value=f"+{improvement}%",
                delta="confidence gain"
            )
```

---

## Best Practices

1. **Keep it declarative:** Define rules in configuration dicts, not in procedural code
2. **Be consistent:** Use same structure for all entries (e.g., all proxy tiers have same keys)
3. **Document assumptions:** Add comments explaining penalty values
4. **Test edge cases:** What happens with 0 data? All data available?
5. **Validate inputs:** Ensure all referenced data items exist in session state
6. **Use constants:** Define magic numbers (like penalty values) as named constants

## Testing Your Changes

After modifying rules, test these scenarios:

1. ✅ Select each analysis type - does it behave correctly?
2. ✅ Toggle each scale - do confidence multipliers work?
3. ✅ Remove all data - does confidence hit reasonable minimum?
4. ✅ Add all data - does confidence hit reasonable maximum?
5. ✅ Change countries - do adjustments apply?
6. ✅ Select each output - are dependencies correct?

## Common Pitfalls to Avoid

❌ **Don't hardcode UI values** - Pull from configuration
❌ **Don't duplicate logic** - Use the functions, don't recalculate
❌ **Don't forget to update all parts** - Session state + display dict + rules
❌ **Don't make rules too complex** - Keep them simple and composable
❌ **Don't use circular dependencies** - Data A shouldn't depend on Data A
