"""
This file contains the business logic for the Project Planning Guide.
It will be responsible for calculations, data transformations, and applying rules.
"""

from config.sensitivity_config import get_sensitivity_weight


def calculate_confidence(data_availability, proxies, all_items=None,
                         item_status=None, analysis_type=None, focus=None):
    """
    Calculate a confidence score based on data availability and selected proxies.
    
    If sensitivity parameters are provided (all_items, item_status),
    uses the weighted sensitivity analysis formula. Otherwise, falls back
    to a simple heuristic.
    
    Args:
        data_availability: dict or bool — legacy simple availability flag
        proxies: dict or list — legacy proxy info
        all_items: list of item dicts for sensitivity calculation
        item_status: dict mapping item_key -> status info for sensitivity
        analysis_type: str — (kept for API compat, weights are global now)
        focus: str — (kept for API compat)
    
    Returns:
        float: confidence score 0–100
    """
    # Use sensitivity-weighted calculation when full context is available
    if all_items and item_status:
        total_weight = sum(get_sensitivity_weight(it["key"]) for it in all_items)
        if total_weight == 0:
            return 0.0
        earned = 0.0
        for it in all_items:
            key = it["key"]
            w = get_sensitivity_weight(key)
            info = item_status.get(key, {})
            if info.get("available"):
                earned += w
            elif info.get("proxy_confidence") is not None:
                earned += w * info["proxy_confidence"] / 100.0
        return max(0, min(100, round(earned / total_weight * 95)))
    
    # Legacy fallback
    score = 100
    if not data_availability:
        score -= 50
    if proxies:
        score -= 10
    return score

def generate_recommendations(confidence_score):
    """
    Generate recommendations based on the confidence score.
    """
    if confidence_score > 80:
        return "Proceed with the project as planned."
    elif 50 < confidence_score <= 80:
        return "Proceed with caution. Consider addressing data gaps."
    else:
        return "High risk. It is recommended to find better data sources before proceeding."

def create_project_plan(scope, context, timeline):
    """
    Generates a project plan.
    """
    # Placeholder logic
    plan = {
        "scope": scope,
        "context": context,
        "timeline": timeline,
        "status": "Generated"
    }
    return plan
