"""
Sensitivity Analysis Visualizations

Generates interactive Plotly charts from the OAT and Global SA CSV data.
Reads directly from ``data/sensitivity/`` CSVs so the plots always reflect
the latest simulation results.

Visualisation catalogue
~~~~~~~~~~~~~~~~~~~~~~~
OAT (one-at-a-time):
  1. Tornado chart - horizontal bars ranked by output range
  2. Parameter sweep grid - line/bar subplots per parameter
  3. Waterfall - cumulative impact of each OAT parameter
  4. Radar / polar - normalised parameter importance

Global SA (all-at-once, 200 runs):
  5. Feature importance - |Spearman rho| bar chart
  6. SHAP-style beeswarm - dot-strip coloured by feature value
  7. Parallel-coordinates - every run as a line through all params
  8. Pairwise heatmap - correlation matrix between params + output

Combined:
  9. Side-by-side OAT vs Global SA comparison
"""

from __future__ import annotations

import os
from functools import lru_cache

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from config.sensitivity_config import (
    BASELINE_HEATING_KWH,
    CATEGORICAL_ENCODING,
    GLOBAL_SA_LABELS,
    OAT_PARAMETERS,
    OAT_IMPORTANCE,
)

# =====================================================================
# STYLE CONSTANTS
# =====================================================================

SHAP_BLUE = "#1E88E5"
SHAP_RED = "#FF0D57"
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


def _placeholder(msg: str) -> go.Figure:
    fig = go.Figure()
    fig.add_annotation(
        text=msg, xref="paper", yref="paper", x=0.5, y=0.5,
        showarrow=False, font=dict(size=14, color="#94a3b8"),
    )
    fig.update_layout(
        height=200, plot_bgcolor=BG, paper_bgcolor=BG,
        xaxis=dict(visible=False), yaxis=dict(visible=False),
    )
    return fig


# =====================================================================
# DATA LOADING  (cached per session)
# =====================================================================

def _project_root():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@lru_cache(maxsize=1)
def _load_oat():
    p = os.path.join(_project_root(), "data", "sensitivity", "all_oat_results.csv")
    if not os.path.exists(p):
        return None
    df = pd.read_csv(p)
    df = df[df["status"] == "ok"].copy()
    return df


@lru_cache(maxsize=1)
def _load_global():
    p = os.path.join(
        _project_root(), "data", "sensitivity", "global_sa_200_results.csv"
    )
    if not os.path.exists(p):
        return None
    df = pd.read_csv(p)
    df = df[df["status"] == "ok"].copy()
    feat_cols = [
        "infiltration", "length_factor", "width_factor",
        "wwr_n", "wwr_e", "wwr_s", "wwr_w",
        "roof_pitch_deg", "construction_pkg", "glazing_pkg",
        "floors_total", "roof_type",
    ]
    for col, mapping in CATEGORICAL_ENCODING.items():
        if col in df.columns:
            df[f"{col}_enc"] = df[col].map(mapping)
    return df, feat_cols


# =====================================================================
# OAT PLOT 1 - TORNADO CHART
# =====================================================================

def create_tornado_chart() -> go.Figure:
    """Horizontal bar chart of OAT output ranges, most important at top."""
    sorted_p = sorted(OAT_PARAMETERS.items(), key=lambda x: x[1]["range_kwh"])
    labels = [d["label"] for _, d in sorted_p]
    ranges = [d["range_kwh"] / 1000 for _, d in sorted_p]
    pcts = [OAT_IMPORTANCE[n] for n, _ in sorted_p]
    mx = max(ranges) if ranges else 1

    colors = [f"rgba(255,13,87,{0.25 + 0.75 * (r / mx)})" for r in ranges]

    fig = go.Figure(go.Bar(
        y=labels, x=ranges, orientation="h",
        marker=dict(color=colors, line=dict(width=0)),
        text=[f"  {r:.1f} MWh  ({p:.1f}%)" for r, p in zip(ranges, pcts)],
        textposition="outside",
        textfont=dict(size=12, color="#374151"),
        hovertemplate="<b>%{y}</b><br>Range: %{x:.1f} MWh/yr<extra></extra>",
    ))
    fig.update_layout(**_base(
        title=dict(
            text="Parameter Impact - One-at-a-Time (OAT)",
            font=dict(size=15, color="#1a1a2e"),
        ),
        xaxis=dict(title="Output Range (MWh/year)", gridcolor=GRID,
                   zeroline=True, zerolinecolor="#ddd"),
        yaxis=dict(title=""),
        height=max(320, 55 * len(labels)),
        margin=dict(l=10, r=140, t=50, b=40),
    ))
    return fig


# =====================================================================
# OAT PLOT 2 - PARAMETER SWEEP GRID
# =====================================================================

def create_parameter_sweeps() -> go.Figure:
    """Grid of line/bar subplots for each OAT parameter sweep."""
    CATEGORICAL_UNITS = {"category"}
    continuous = {
        k: v for k, v in OAT_PARAMETERS.items()
        if v.get("unit") not in CATEGORICAL_UNITS
    }
    categorical = {
        k: v for k, v in OAT_PARAMETERS.items()
        if v.get("unit") in CATEGORICAL_UNITS
    }
    n = len(continuous) + len(categorical)
    ncols = 3
    nrows = (n + ncols - 1) // ncols

    titles = [d["label"] for d in continuous.values()]
    titles += [d["label"] for d in categorical.values()]

    fig = make_subplots(
        rows=nrows, cols=ncols, subplot_titles=titles,
        vertical_spacing=max(0.06, 0.22 / nrows), horizontal_spacing=0.10,
    )
    bl = BASELINE_HEATING_KWH / 1000

    # --- Continuous parameters (line + markers) ---
    for idx, (name, data) in enumerate(continuous.items()):
        r, c = idx // ncols + 1, idx % ncols + 1
        col = PALETTE[idx % len(PALETTE)]
        xv = data["values"]
        yv = [v / 1000 for v in data["outputs_kwh"]]

        fig.add_trace(go.Scatter(
            x=xv, y=yv, mode="lines+markers",
            line=dict(color=col, width=2.5),
            marker=dict(size=5, color=col),
            showlegend=False,
            hovertemplate=(
                f"{data['label']}: %{{x}}<br>"
                f"Heating: %{{y:.1f}} MWh<extra></extra>"
            ),
        ), row=r, col=c)

        if data["baseline_value"] in xv:
            bi = xv.index(data["baseline_value"])
            fig.add_trace(go.Scatter(
                x=[xv[bi]], y=[yv[bi]], mode="markers",
                marker=dict(size=11, color=col, symbol="diamond",
                            line=dict(width=2, color="white")),
                showlegend=False,
                hovertemplate=(
                    f"Baseline<br>{data['label']}: %{{x}}<br>"
                    f"Heating: %{{y:.1f}} MWh<extra></extra>"
                ),
            ), row=r, col=c)

        fig.add_hline(
            y=bl, row=r, col=c,
            line=dict(color="#aaa", width=1, dash="dash"),
        )

    # --- Categorical parameters (bar charts) ---
    cat_colors = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"]
    for ci, (name, data) in enumerate(categorical.items()):
        idx_cat = len(continuous) + ci
        r, c = idx_cat // ncols + 1, idx_cat % ncols + 1
        nvals = len(data["values"])
        bar_colors = cat_colors[:nvals] if nvals <= len(cat_colors) else (
            [PALETTE[i % len(PALETTE)] for i in range(nvals)]
        )
        fig.add_trace(go.Bar(
            x=data["values"],
            y=[v / 1000 for v in data["outputs_kwh"]],
            marker=dict(color=bar_colors, line=dict(width=0)),
            showlegend=False,
            hovertemplate=(
                f"{data['label']}: %{{x}}<br>"
                f"Heating: %{{y:.1f}} MWh<extra></extra>"
            ),
        ), row=r, col=c)

    fig.update_layout(**_base(
        height=260 * nrows,
        margin=dict(l=10, r=10, t=30, b=10),
    ))
    fig.update_yaxes(title_text="MWh/year", gridcolor=GRID,
                     title_font=dict(size=10))
    fig.update_xaxes(gridcolor=GRID)
    return fig


# =====================================================================
# OAT PLOT 3 - WATERFALL (cumulative uncertainty)
# =====================================================================

def create_oat_waterfall() -> go.Figure:
    """Waterfall chart showing how each parameter's range accumulates."""
    sorted_p = sorted(
        OAT_PARAMETERS.items(),
        key=lambda x: x[1]["range_kwh"], reverse=True,
    )
    labels = [d["label"] for _, d in sorted_p]
    ranges = [d["range_kwh"] / 1000 for _, d in sorted_p]

    fig = go.Figure(go.Waterfall(
        x=labels + ["Total"],
        y=ranges + [None],
        measure=["relative"] * len(ranges) + ["total"],
        text=[f"+{r:.1f}" for r in ranges] + [""],
        textposition="outside",
        textfont=dict(size=11),
        connector=dict(line=dict(color="#d1d5db", width=1)),
        increasing=dict(marker=dict(color=SHAP_RED)),
        totals=dict(marker=dict(color="#475569")),
        hovertemplate="<b>%{x}</b><br>Uncertainty: %{y:.1f} MWh<extra></extra>",
    ))
    fig.update_layout(**_base(
        title=dict(
            text="Cumulative Uncertainty Build-up (OAT)",
            font=dict(size=15, color="#1a1a2e"),
        ),
        yaxis=dict(title="Cumulative Uncertainty (MWh)", gridcolor=GRID),
        xaxis=dict(title=""),
        height=max(380, 30 * len(labels) + 80),
        margin=dict(l=10, r=10, t=50, b=100),
    ))
    fig.update_xaxes(tickangle=-30)
    return fig


# =====================================================================
# OAT PLOT 4 - RADAR CHART
# =====================================================================

def create_oat_radar() -> go.Figure:
    """Polar/radar chart of normalised OAT importance."""
    names = list(OAT_IMPORTANCE.keys())
    labels = [OAT_PARAMETERS[n]["label"] for n in names]
    values = [OAT_IMPORTANCE[n] for n in names]
    labels_c = labels + [labels[0]]
    values_c = values + [values[0]]

    fig = go.Figure()
    fig.add_trace(go.Scatterpolar(
        r=values_c, theta=labels_c,
        fill="toself",
        fillcolor="rgba(255,13,87,0.15)",
        line=dict(color=SHAP_RED, width=2),
        marker=dict(size=7, color=SHAP_RED),
        hovertemplate="<b>%{theta}</b><br>Importance: %{r:.1f}%<extra></extra>",
    ))
    fig.update_layout(**_base(
        title=dict(
            text="Parameter Importance Radar (OAT)",
            font=dict(size=15, color="#1a1a2e"),
        ),
        polar=dict(
            radialaxis=dict(
                visible=True,
                range=[0, max(values) * 1.15],
                gridcolor=GRID,
                tickfont=dict(size=10),
            ),
            angularaxis=dict(tickfont=dict(size=11)),
            bgcolor=BG,
        ),
        height=420,
        margin=dict(l=60, r=60, t=50, b=30),
    ))
    return fig


# =====================================================================
# GLOBAL SA PLOT 5 - FEATURE IMPORTANCE (|Spearman rho|)
# =====================================================================

def create_global_sa_importance() -> go.Figure:
    """Horizontal bar chart of |Spearman rho| from the 200-run global SA."""
    result = _load_global()
    if result is None:
        return _placeholder("Global SA data not found.")
    df, feat_cols = result

    importances = {}
    for col in feat_cols:
        use = f"{col}_enc" if f"{col}_enc" in df.columns else col
        if use not in df.columns:
            continue
        try:
            corr = (
                df[use].astype(float)
                .corr(df["annual_heating_kwh"], method="spearman")
            )
            importances[GLOBAL_SA_LABELS.get(col, col)] = abs(corr)
        except Exception:
            pass

    if not importances:
        return _placeholder("Could not compute correlations.")

    s = sorted(importances.items(), key=lambda x: x[1])
    labs = [i[0] for i in s]
    vals = [i[1] for i in s]
    mx = max(vals) if vals else 1
    cols = [f"rgba(30,136,229,{0.25 + 0.75 * (v / mx)})" for v in vals]

    fig = go.Figure(go.Bar(
        y=labs, x=vals, orientation="h",
        marker=dict(color=cols, line=dict(width=0)),
        text=[f"  |rho| = {v:.3f}" for v in vals],
        textposition="outside",
        textfont=dict(size=11, color="#374151"),
        hovertemplate="<b>%{y}</b><br>|Spearman rho| = %{x:.3f}<extra></extra>",
    ))
    fig.update_layout(**_base(
        title=dict(
            text="Parameter Importance - Global SA (|Spearman rho|)",
            font=dict(size=15, color="#1a1a2e"),
        ),
        xaxis=dict(
            title="|Spearman Rank Correlation|", gridcolor=GRID,
            range=[0, mx * 1.3],
        ),
        yaxis=dict(title=""),
        height=420,
        margin=dict(l=10, r=120, t=50, b=40),
    ))
    return fig


# =====================================================================
# GLOBAL SA PLOT 6 - SHAP-STYLE BEESWARM
# =====================================================================

def create_global_sa_beeswarm() -> go.Figure:
    """
    SHAP-style beeswarm plot.
    X = linear SHAP approximation (MWh).
    Colour = normalised feature value (blue=low, red=high).
    """
    result = _load_global()
    if result is None:
        return _placeholder("Global SA data not found.")
    df, feat_cols = result

    X_cols, X_labels = [], []
    for col in feat_cols:
        enc = f"{col}_enc"
        use = enc if enc in df.columns else col
        if use not in df.columns:
            continue
        X_cols.append(use)
        X_labels.append(GLOBAL_SA_LABELS.get(col, col))

    X = df[X_cols].values.astype(float)
    y = df["annual_heating_kwh"].values

    # Standardise
    Xm = np.mean(X, axis=0)
    Xs = np.std(X, axis=0)
    Xs[Xs == 0] = 1
    Zs = (X - Xm) / Xs

    # OLS: y ~ b0 + b*z  =>  shap_i ~ b_i * z_i
    ones = np.ones((Zs.shape[0], 1))
    try:
        beta = np.linalg.lstsq(np.hstack([ones, Zs]), y, rcond=None)[0]
    except Exception:
        return _placeholder("Could not fit linear model for SHAP approximation.")
    shap = Zs * beta[1:]  # (n_samples, n_features)

    # Sort by mean|SHAP| ascending (most important at top of plot)
    order = np.argsort(np.mean(np.abs(shap), axis=0))

    rng = np.random.default_rng(42)
    fig = go.Figure()

    for pi, fi in enumerate(order):
        sv = shap[:, fi] / 1000  # MWh
        fv = X[:, fi]
        lo, hi = fv.min(), fv.max()
        fn = (fv - lo) / (hi - lo) if hi > lo else np.full_like(fv, 0.5)
        jitter = rng.normal(0, 0.16, len(sv))

        show_cb = bool(fi == order[-1])
        fig.add_trace(go.Scatter(
            x=sv,
            y=np.full(len(sv), pi) + jitter,
            mode="markers",
            marker=dict(
                size=5, opacity=0.75, color=fn,
                colorscale=[[0, SHAP_BLUE], [0.5, "#EEEEEE"], [1, SHAP_RED]],
                showscale=show_cb,
                colorbar=dict(
                    title=dict(text="Feature<br>Value", font=dict(size=11)),
                    tickvals=[0, 0.5, 1],
                    ticktext=["Low", "Mid", "High"],
                    len=0.35, y=0.5, thickness=12,
                ) if show_cb else None,
            ),
            showlegend=False,
            hovertemplate=(
                f"<b>{X_labels[fi]}</b><br>"
                "SHAP ~ %{x:.1f} MWh<extra></extra>"
            ),
        ))

    sorted_labs = [X_labels[i] for i in order]
    fig.add_vline(x=0, line=dict(color="#aaa", width=1))
    fig.update_layout(**_base(
        title=dict(
            text="SHAP-style Impact - Global SA (All Parameters Varying)",
            font=dict(size=15, color="#1a1a2e"),
        ),
        xaxis=dict(
            title="Impact on Annual Heating (MWh)", gridcolor=GRID,
            zeroline=False,
        ),
        yaxis=dict(
            tickmode="array",
            tickvals=list(range(len(sorted_labs))),
            ticktext=sorted_labs,
            title="",
        ),
        height=max(400, 38 * len(sorted_labs)),
        margin=dict(l=10, r=10, t=50, b=40),
    ))
    return fig


# =====================================================================
# GLOBAL SA PLOT 7 - PARALLEL COORDINATES
# =====================================================================

def create_global_parallel_coords() -> go.Figure:
    """
    Parallel-coordinates: every simulation as a polyline through all
    parameters, coloured by annual heating output.
    """
    result = _load_global()
    if result is None:
        return _placeholder("Global SA data not found.")
    df, feat_cols = result

    dims = []
    for col in feat_cols:
        enc = f"{col}_enc"
        use = enc if enc in df.columns else col
        if use not in df.columns:
            continue
        vals = df[use].astype(float)
        label = GLOBAL_SA_LABELS.get(col, col)
        d = dict(label=label, values=vals, range=[vals.min(), vals.max()])
        if col in CATEGORICAL_ENCODING:
            m = CATEGORICAL_ENCODING[col]
            d["tickvals"] = list(m.values())
            d["ticktext"] = list(m.keys())
        dims.append(d)

    # Output as last axis
    heat_mwh = df["annual_heating_kwh"] / 1000
    dims.append(dict(
        label="Heating<br>(MWh)",
        values=heat_mwh,
        range=[heat_mwh.min(), heat_mwh.max()],
    ))

    fig = go.Figure(go.Parcoords(
        line=dict(
            color=heat_mwh,
            colorscale=[[0, SHAP_BLUE], [0.5, "#EEEEEE"], [1, SHAP_RED]],
            showscale=True,
            colorbar=dict(title="Heating<br>(MWh)", thickness=14, len=0.5),
        ),
        dimensions=dims,
    ))
    fig.update_layout(**_base(
        title=dict(
            text="Parallel Coordinates - All 200 Simulations",
            font=dict(size=15, color="#1a1a2e"),
        ),
        height=520,
        margin=dict(l=80, r=80, t=60, b=30),
    ))
    return fig


# =====================================================================
# GLOBAL SA PLOT 8 - CORRELATION HEATMAP
# =====================================================================

def create_global_correlation_heatmap() -> go.Figure:
    """
    Heatmap of Spearman correlations between all parameters and the
    output variable.
    """
    result = _load_global()
    if result is None:
        return _placeholder("Global SA data not found.")
    df, feat_cols = result

    use_cols, use_labels = [], []
    for col in feat_cols:
        enc = f"{col}_enc"
        use = enc if enc in df.columns else col
        if use not in df.columns:
            continue
        use_cols.append(use)
        use_labels.append(GLOBAL_SA_LABELS.get(col, col))

    use_cols.append("annual_heating_kwh")
    use_labels.append("Annual Heating")

    corr = df[use_cols].astype(float).corr(method="spearman").values

    fig = go.Figure(go.Heatmap(
        z=corr, x=use_labels, y=use_labels,
        colorscale=[[0, SHAP_BLUE], [0.5, "#FFFFFF"], [1, SHAP_RED]],
        zmin=-1, zmax=1,
        text=np.round(corr, 2),
        texttemplate="%{text}",
        textfont=dict(size=9),
        hovertemplate="%{x} vs %{y}<br>rho = %{z:.3f}<extra></extra>",
        colorbar=dict(title="Spearman rho", thickness=12),
    ))
    fig.update_layout(**_base(
        title=dict(
            text="Pairwise Correlation Heatmap - Global SA",
            font=dict(size=15, color="#1a1a2e"),
        ),
        height=560,
        margin=dict(l=10, r=10, t=50, b=10),
        xaxis=dict(tickangle=-40, tickfont=dict(size=10)),
        yaxis=dict(tickfont=dict(size=10), autorange="reversed"),
    ))
    return fig


# =====================================================================
# COMBINED PLOT - OAT vs GLOBAL IMPORTANCE COMPARISON
# =====================================================================

def create_combined_importance() -> go.Figure:
    """
    Grouped horizontal bar chart comparing OAT importance (% of range)
    with Global SA importance (|Spearman rho| x 100) for shared params.
    """
    oat_map = {}
    for name, data in OAT_PARAMETERS.items():
        oat_map[name] = (data["label"], OAT_IMPORTANCE[name])

    global_map = {}
    result = _load_global()
    if result is not None:
        df, feat_cols = result
        for col in feat_cols:
            use = f"{col}_enc" if f"{col}_enc" in df.columns else col
            if use not in df.columns:
                continue
            try:
                rho = abs(
                    df[use].astype(float)
                    .corr(df["annual_heating_kwh"], method="spearman")
                )
                global_map[col] = rho
            except Exception:
                pass

    # Align OAT names to global column names
    align = {
        "infiltration": "infiltration",
        "construction_package": "construction_pkg",
        "window_to_wall_ratio": "wwr_n",  # Use north as representative since it has largest impact
        "floors_total": "floors_total",
        "footprint_length": "length_factor",
        "footprint_width": "width_factor",
        "glazing_package": "glazing_pkg",
        "roof_shape_angle": "roof_pitch_deg",
        # No direct Global SA match: heating_setpoint
    }
    # Reverse map: global col -> OAT name
    align_rev = {v: k for k, v in align.items()}

    labels, oat_vals, gsa_vals = [], [], []
    # 1) Add OAT parameters that also appear in Global SA
    for oat_name, (label, oat_pct) in sorted(
        oat_map.items(), key=lambda x: x[1][1], reverse=True
    ):
        gsa_col = align.get(oat_name)
        gsa_score = global_map.get(gsa_col, 0) * 100 if gsa_col else 0
        labels.append(label)
        oat_vals.append(oat_pct)
        gsa_vals.append(gsa_score)

    # 2) Add Global-SA-only parameters (not tested in OAT)
    covered_gsa_cols = set(align.values())
    for gsa_col, rho in sorted(global_map.items(), key=lambda x: x[1], reverse=True):
        if gsa_col not in covered_gsa_cols:
            labels.append(GLOBAL_SA_LABELS.get(gsa_col, gsa_col))
            oat_vals.append(0)  # not tested in OAT
            gsa_vals.append(rho * 100)

    if not labels:
        return _placeholder("No parameter importance data available.")

    fig = go.Figure()
    fig.add_trace(go.Bar(
        name="OAT (% of total range)", y=labels, x=oat_vals,
        orientation="h",
        marker=dict(color=SHAP_RED, opacity=0.8),
        texttemplate="%{x:.1f}%", textposition="outside",
    ))
    fig.add_trace(go.Bar(
        name="Global SA (|rho| x 100)", y=labels, x=gsa_vals,
        orientation="h",
        marker=dict(color=SHAP_BLUE, opacity=0.8),
        texttemplate="%{x:.1f}", textposition="outside",
    ))
    fig.update_layout(**_base(
        title=dict(
            text="OAT vs Global SA - Parameter Importance Comparison",
            font=dict(size=15, color="#1a1a2e"),
        ),
        barmode="group",
        showlegend=True,
        legend=dict(
            orientation="h", y=-0.15, x=0.5, xanchor="center",
            font=dict(size=11),
        ),
        xaxis=dict(title="Importance Score", gridcolor=GRID),
        yaxis=dict(title=""),
        height=max(360, 36 * len(labels)),
        margin=dict(l=10, r=100, t=50, b=60),
    ))
    return fig
