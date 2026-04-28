"""
Innovative Sensitivity Analysis Visualizations

Advanced visualization techniques for presenting parameter importance
and uncertainty in intuitive, engaging ways.

New visualizations:
  1. Treemap - Hierarchical importance with nested categories
  2. Sankey Flow - Uncertainty flow through parameter categories
  3. Bubble Chart - Impact landscape (importance vs range)
  4. Sunburst - Interactive hierarchical breakdown
  5. Ridgeline Plot - Distribution shapes for top parameters
"""

from __future__ import annotations

import numpy as np
import plotly.graph_objects as go

from config.sensitivity_config import (
    BASELINE_HEATING_KWH,
    OAT_PARAMETERS,
    OAT_IMPORTANCE,
)

# Style constants
BG = "rgba(0,0,0,0)"
GRID = "rgba(0,0,0,0.06)"
FONT = "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
PALETTE = [
    "#FF0D57", "#1E88E5", "#FFC107", "#4CAF50", "#9C27B0", "#FF5722",
    "#00BCD4", "#E91E63", "#8BC34A", "#3F51B5", "#FF9800", "#607D8B",
]


def _base(**kw):
    """Shared Plotly layout defaults."""
    d = dict(
        font=dict(family=FONT, size=12, color="#374151"),
        plot_bgcolor=BG,
        paper_bgcolor=BG,
        margin=dict(l=10, r=10, t=50, b=30),
        showlegend=False,
    )
    d.update(kw)
    return d


def create_treemap_importance() -> go.Figure:
    """
    Treemap showing parameter importance hierarchy with nested categories.
    Groups parameters by type (Building Envelope, Systems, Geometry).
    """
    # Categorize parameters
    categories = {
        "Building Envelope": ["construction_package", "glazing_package", "infiltration", 
                              "window_to_wall_ratio"],
        "Building Geometry": ["floors_total", "footprint_length", "footprint_width", "roof_shape_angle"],
        "Systems & Operations": ["heating_setpoint"],
    }
    
    labels, parents, values, colors = ["All Parameters"], [""], [0], [""]
    
    # Add category totals
    for cat, params in categories.items():
        cat_total = sum(OAT_IMPORTANCE.get(p, 0) for p in params if p in OAT_IMPORTANCE)
        labels.append(cat)
        parents.append("All Parameters")
        values.append(cat_total)
        colors.append("")
    
    # Add individual parameters
    for cat, params in categories.items():
        for p in params:
            if p in OAT_IMPORTANCE:
                labels.append(OAT_PARAMETERS[p]["label"])
                parents.append(cat)
                values.append(OAT_IMPORTANCE[p])
                # Color by importance
                imp = OAT_IMPORTANCE[p]
                if imp > 15:
                    colors.append("#dc2626")  # Critical
                elif imp > 8:
                    colors.append("#ea580c")  # High
                elif imp > 4:
                    colors.append("#f59e0b")  # Medium
                else:
                    colors.append("#84cc16")  # Low
    
    fig = go.Figure(go.Treemap(
        labels=labels,
        parents=parents,
        values=values,
        text=[f"{v:.1f}%" if v > 0 else "" for v in values],
        textposition="middle center",
        textfont=dict(size=11, color="white", family=FONT),
        marker=dict(
            colors=colors,
            line=dict(color="white", width=2),
            colorscale=[[0, "#84cc16"], [0.33, "#f59e0b"], [0.66, "#ea580c"], [1, "#dc2626"]],
        ),
        hovertemplate="<b>%{label}</b><br>Importance: %{value:.1f}%<extra></extra>",
    ))
    
    fig.update_layout(**_base(
        title=dict(
            text="Parameter Importance Hierarchy - Treemap View",
            font=dict(size=15, color="#1a1a2e"),
        ),
        height=520,
        margin=dict(l=10, r=10, t=50, b=10),
    ))
    return fig


def create_sankey_flow() -> go.Figure:
    """
    Sankey diagram showing how uncertainty flows through parameter categories
    to final output uncertainty. Width represents magnitude of impact.
    """
    # Categorize parameters
    envelope_params = ["construction_package", "glazing_package", "infiltration",
                       "window_to_wall_ratio"]
    geometry_params = ["floors_total", "footprint_length", "footprint_width", "roof_shape_angle"]
    systems_params = ["heating_setpoint"]
    
    # Calculate category contributions
    envelope_total = sum(OAT_IMPORTANCE.get(p, 0) for p in envelope_params if p in OAT_IMPORTANCE)
    geometry_total = sum(OAT_IMPORTANCE.get(p, 0) for p in geometry_params if p in OAT_IMPORTANCE)
    systems_total = sum(OAT_IMPORTANCE.get(p, 0) for p in systems_params if p in OAT_IMPORTANCE)
    
    # Build nodes: [categories, sub-categories, output]
    node_labels = [
        "Building Envelope", "Building Geometry", "Systems & Operations",
        "Insulation & Air Tightness", "Windows", "Building Form", "Roof Design",
        "Annual Heating Demand Uncertainty"
    ]
    
    # Node colors
    node_colors = [
        "#3b82f6", "#8b5cf6", "#ec4899",  # Categories
        "#60a5fa", "#93c5fd", "#a78bfa", "#c084fc",  # Sub-categories
        "#dc2626"  # Output
    ]
    
    # Build links (source, target, value)
    source, target, value, link_colors = [], [], [], []
    
    # Envelope breakdown
    insulation = OAT_IMPORTANCE.get("construction_package", 0) + OAT_IMPORTANCE.get("infiltration", 0)
    windows = (OAT_IMPORTANCE.get("glazing_package", 0) + 
               OAT_IMPORTANCE.get("wwr_north", 0) +
               OAT_IMPORTANCE.get("wwr_south", 0) +
               OAT_IMPORTANCE.get("wwr_east", 0) +
               OAT_IMPORTANCE.get("wwr_west", 0))
    
    source.extend([0, 0])  # Building Envelope → sub-categories
    target.extend([3, 4])  # Insulation & Air Tightness, Windows
    value.extend([insulation, windows])
    link_colors.extend(["rgba(59, 130, 246, 0.3)"] * 2)
    
    # Geometry breakdown
    form = (OAT_IMPORTANCE.get("floors_total", 0) +
            OAT_IMPORTANCE.get("footprint_length", 0) +
            OAT_IMPORTANCE.get("footprint_width", 0))
    roof = OAT_IMPORTANCE.get("roof_shape_angle", 0)
    
    source.extend([1, 1])  # Building Geometry → sub-categories
    target.extend([5, 6])  # Building Form, Roof Design
    value.extend([form, roof])
    link_colors.extend(["rgba(139, 92, 246, 0.3)"] * 2)
    
    # All sub-categories → Output
    source.extend([2, 3, 4, 5, 6])  # All sub-categories
    target.extend([7] * 5)  # To output
    value.extend([systems_total, insulation, windows, form, roof])
    link_colors.extend([
        "rgba(236, 72, 153, 0.3)",
        "rgba(96, 165, 250, 0.3)",
        "rgba(147, 197, 253, 0.3)",
        "rgba(167, 139, 250, 0.3)",
        "rgba(192, 132, 252, 0.3)",
    ])
    
    fig = go.Figure(go.Sankey(
        node=dict(
            pad=15,
            thickness=20,
            line=dict(color="white", width=2),
            label=node_labels,
            color=node_colors,
            hovertemplate="<b>%{label}</b><br>Contribution: %{value:.1f}%<extra></extra>",
        ),
        link=dict(
            source=source,
            target=target,
            value=value,
            color=link_colors,
            hovertemplate="Flow: %{value:.1f}%<extra></extra>",
        ),
    ))
    
    fig.update_layout(**_base(
        title=dict(
            text="Uncertainty Flow - How Parameters Contribute to Output Variability",
            font=dict(size=15, color="#1a1a2e"),
        ),
        height=520,
        margin=dict(l=10, r=10, t=50, b=10),
    ))
    return fig


def create_bubble_chart_impact() -> go.Figure:
    """
    Bubble chart showing parameter importance vs uncertainty range.
    X-axis: Importance (%), Y-axis: Range (MWh), Bubble size: % of baseline.
    """
    baseline = BASELINE_HEATING_KWH / 1000  # Convert to MWh
    
    x_vals, y_vals, sizes, labels_list, colors_list = [], [], [], [], []
    
    for name, data in OAT_PARAMETERS.items():
        importance = OAT_IMPORTANCE[name]
        range_mwh = data["range_kwh"] / 1000
        pct_baseline = (range_mwh / baseline) * 100
        
        x_vals.append(importance)
        y_vals.append(range_mwh)
        sizes.append(max(10, pct_baseline * 2))  # Scale for visibility
        labels_list.append(data["label"])
        
        # Color by category
        if name in ["construction_package", "glazing_package", "infiltration"]:
            colors_list.append("#3b82f6")  # Envelope
        elif name in ["floors_total", "footprint_length", "footprint_width", "roof_shape_angle"]:
            colors_list.append("#8b5cf6")  # Geometry
        elif name == "window_to_wall_ratio":
            colors_list.append("#06b6d4")  # Windows
        else:
            colors_list.append("#ec4899")  # Systems
    
    fig = go.Figure()
    
    # Add bubbles
    fig.add_trace(go.Scatter(
        x=x_vals,
        y=y_vals,
        mode="markers+text",
        text=labels_list,
        textposition="top center",
        textfont=dict(size=9, color="#1f2937"),
        marker=dict(
            size=sizes,
            color=colors_list,
            opacity=0.6,
            line=dict(color="white", width=2),
        ),
        hovertemplate=(
            "<b>%{text}</b><br>"
            "Importance: %{x:.1f}%<br>"
            "Range: %{y:.1f} MWh<br>"
            "<extra></extra>"
        ),
    ))
    
    # Add quadrant lines
    x_median = np.median(x_vals)
    y_median = np.median(y_vals)
    
    fig.add_vline(x=x_median, line=dict(color="#94a3b8", width=1, dash="dash"))
    fig.add_hline(y=y_median, line=dict(color="#94a3b8", width=1, dash="dash"))
    
    # Quadrant labels
    fig.add_annotation(x=max(x_vals) * 0.95, y=max(y_vals) * 0.95,
                      text="High Impact<br>High Range", showarrow=False,
                      font=dict(size=10, color="#dc2626"), bgcolor="rgba(255,255,255,0.8)")
    fig.add_annotation(x=min(x_vals) * 1.5, y=max(y_vals) * 0.95,
                      text="Low Impact<br>High Range", showarrow=False,
                      font=dict(size=10, color="#f59e0b"), bgcolor="rgba(255,255,255,0.8)")
    
    fig.update_layout(**_base(
        title=dict(
            text="Parameter Impact Landscape - Importance vs Absolute Range",
            font=dict(size=15, color="#1a1a2e"),
        ),
        xaxis=dict(
            title="Relative Importance (% of total variability)",
            gridcolor=GRID,
        ),
        yaxis=dict(
            title="Absolute Range (MWh/year)",
            gridcolor=GRID,
        ),
        height=580,
        margin=dict(l=60, r=60, t=50, b=50),
        showlegend=False,
    ))
    
    return fig


def create_sunburst_chart() -> go.Figure:
    """
    Sunburst chart showing hierarchical importance breakdown.
    Inner ring: Parameter categories. Outer ring: Individual parameters.
    """
    # Categorize parameters
    categories = {
        "Envelope Thermal": ["construction_package", "infiltration"],
        "Windows & Glazing": ["glazing_package", "window_to_wall_ratio"],
        "Building Form": ["floors_total", "footprint_length", "footprint_width"],
        "Roof & Top Floor": ["roof_shape_angle"],
        "HVAC & Controls": ["heating_setpoint"],
    }
    
    labels, parents, values, colors = ["Building Energy Model"], [""], [100], ["#64748b"]
    
    # Add categories (inner ring)
    cat_colors = {
        "Envelope Thermal": "#3b82f6",
        "Windows & Glazing": "#06b6d4",
        "Building Form": "#8b5cf6",
        "Roof & Top Floor": "#ec4899",
        "HVAC & Controls": "#f59e0b",
    }
    
    for cat, params in categories.items():
        cat_total = sum(OAT_IMPORTANCE.get(p, 0) for p in params if p in OAT_IMPORTANCE)
        if cat_total > 0:
            labels.append(cat)
            parents.append("Building Energy Model")
            values.append(cat_total)
            colors.append(cat_colors[cat])
    
    # Add parameters (outer ring)
    for cat, params in categories.items():
        for p in params:
            if p in OAT_IMPORTANCE and OAT_IMPORTANCE[p] > 0:
                labels.append(OAT_PARAMETERS[p]["label"])
                parents.append(cat)
                values.append(OAT_IMPORTANCE[p])
                # Lighter shade of category color for parameters
                base_color = cat_colors[cat]
                colors.append(base_color + "aa")  # Add alpha for transparency
    
    fig = go.Figure(go.Sunburst(
        labels=labels,
        parents=parents,
        values=values,
        branchvalues="total",
        marker=dict(
            colors=colors,
            line=dict(color="white", width=2),
        ),
        text=[f"{v:.1f}%" if v < 100 else "" for v in values],
        textfont=dict(size=11, color="white", family=FONT),
        hovertemplate="<b>%{label}</b><br>Importance: %{value:.1f}%<extra></extra>",
    ))
    
    fig.update_layout(**_base(
        title=dict(
            text="Hierarchical Parameter Importance - Sunburst View",
            font=dict(size=15, color="#1a1a2e"),
        ),
        height=560,
        margin=dict(l=10, r=10, t=50, b=10),
    ))
    
    return fig


def create_ridgeline_distributions() -> go.Figure:
    """
    Ridgeline plot (joyplot) showing distributions of heating demand
    for each parameter's range. Visualizes the shape and spread of
    uncertainty for each parameter.
    """
    sorted_params = sorted(
        OAT_PARAMETERS.items(),
        key=lambda x: x[1]["range_kwh"],
        reverse=True
    )[:8]  # Top 8 for readability
    
    fig = go.Figure()
    baseline = BASELINE_HEATING_KWH / 1000
    
    for idx, (name, data) in enumerate(sorted_params):
        outputs = [v / 1000 for v in data["outputs_kwh"]]
        label = data["label"]
        
        # Create a smoothed distribution using histogram
        hist, bins = np.histogram(outputs, bins=15, density=True)
        bin_centers = (bins[:-1] + bins[1:]) / 2
        
        # Normalize for plotting
        hist_norm = hist / hist.max() * 0.8 if hist.max() > 0 else hist
        
        # Offset each distribution vertically
        y_offset = idx * 1.2
        y_vals = hist_norm + y_offset
        
        color = PALETTE[idx % len(PALETTE)]
        
        # Fill under curve
        fig.add_trace(go.Scatter(
            x=bin_centers,
            y=y_vals,
            fill='tonexty' if idx > 0 else 'tozeroy',
            fillcolor=f"rgba({int(color[1:3], 16)}, {int(color[3:5], 16)}, {int(color[5:7], 16)}, 0.5)",
            line=dict(color=color, width=2),
            name=label,
            showlegend=False,
            hovertemplate=f"<b>{label}</b><br>Heating: %{{x:.1f}} MWh<extra></extra>",
        ))
        
        # Add label on the left
        fig.add_annotation(
            x=min(outputs) - 5,
            y=y_offset + 0.4,
            text=label,
            showarrow=False,
            font=dict(size=10, color="#1f2937"),
            xanchor="right",
        )
    
    # Add baseline line
    fig.add_vline(x=baseline, line=dict(color="#dc2626", width=2, dash="dash"))
    fig.add_annotation(
        x=baseline,
        y=len(sorted_params) * 1.2 + 0.5,
        text="Baseline",
        showarrow=False,
        font=dict(size=11, color="#dc2626"),
    )
    
    fig.update_layout(**_base(
        title=dict(
            text="Parameter Uncertainty Distributions - Ridgeline Plot",
            font=dict(size=15, color="#1a1a2e"),
        ),
        xaxis=dict(
            title="Annual Heating Demand (MWh/year)",
            gridcolor=GRID,
        ),
        yaxis=dict(
            visible=False,
            range=[-0.5, len(sorted_params) * 1.2 + 1],
        ),
        height=max(420, len(sorted_params) * 60),
        margin=dict(l=160, r=10, t=50, b=50),
    ))
    
    return fig
