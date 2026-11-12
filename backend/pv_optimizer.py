"""
Rooftop PV sizing against a building's own hourly electricity use.

For a range of system sizes (0 … what the roof fits) it matches hourly solar
output with hourly demand, splits production into self-used and exported
electricity, and values each size over its life:

    self-used kWh  × price of electricity bought   (it replaces purchases)
  + exported kWh   × price paid for exported power
  − upfront cost and yearly upkeep, discounted

The best size is the one with the highest net present value. Self-use is the
heart of it: since 1 January 2026 exported solar power no longer earns the
60 öre/kWh tax credit, so in Sweden a kWh used in the building is worth several
times a kWh sold.

Hourly demand: households' electricity (lighting + equipment from the EnergyPlus
baseline, Sveby profile) when they share the building's meter, plus the
building's own property electricity (EPC EgiFastighet, spread evenly — fans and
pumps run around the clock). Hourly solar: PVGIS v5.3 seriescalc for one real
year (2019, SARAH3), 1 kWp, scaled.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

HOURS = 8760


@dataclass
class PvEconomics:
    buy_sek_kwh: float          # all-in variable price avoided per self-used kWh
    sell_sek_kwh: float         # paid per exported kWh
    capex_small_sek_kwp: float  # ≤ 100 kWp
    capex_large_sek_kwp: float  # > 100 kWp
    vat_on_capex: bool          # owner can't deduct VAT (e.g. residential rental)
    discount_rate: float
    lifetime_yr: int
    degradation: float          # output lost per year
    om_pct_capex: float         # yearly upkeep as a share of the upfront cost


@dataclass
class PvPoint:
    kwp: float
    production_kwh: float
    self_used_kwh: float
    exported_kwh: float
    self_use_share: float       # of production
    demand_coverage: float      # of demand
    capex_sek: float
    yearly_value_sek: float
    npv_sek: float
    payback_yr: Optional[float]


def capex_of(kwp: float, e: PvEconomics) -> float:
    per = e.capex_small_sek_kwp if kwp <= 100 else e.capex_large_sek_kwp
    return kwp * per * (1.25 if e.vat_on_capex else 1.0)


def evaluate(kwp: float, pv_per_kwp: list[float], demand: list[float], e: PvEconomics) -> PvPoint:
    prod = [p * kwp for p in pv_per_kwp]
    self_used = sum(min(p, d) for p, d in zip(prod, demand))
    production = sum(prod)
    exported = production - self_used
    capex = capex_of(kwp, e)
    om = capex * e.om_pct_capex
    year1 = self_used * e.buy_sek_kwh + exported * e.sell_sek_kwh
    npv, cum, payback = -capex, -capex, None
    for t in range(1, e.lifetime_yr + 1):
        # Degradation shrinks production; self-use falls a little less than
        # output in reality, so this is slightly conservative.
        cash = year1 * (1 - e.degradation) ** (t - 1) - om
        npv += cash / (1 + e.discount_rate) ** t
        prev, cum = cum, cum + cash
        if payback is None and cum >= 0 and kwp > 0:
            payback = round(t - 1 + (-prev / cash if cash > 0 else 0), 1)
    total_demand = sum(demand)
    return PvPoint(
        kwp=round(kwp, 1), production_kwh=round(production), self_used_kwh=round(self_used),
        exported_kwh=round(exported), self_use_share=round(self_used / production, 3) if production else 0.0,
        demand_coverage=round(self_used / total_demand, 3) if total_demand else 0.0,
        capex_sek=round(capex), yearly_value_sek=round(year1 - om), npv_sek=round(npv), payback_yr=payback,
    )


# The cost statistics cover 10–250 kWp systems. Below 10 kWp fixed costs
# (design, grid connection, scaffolding) dominate and the per-kWp price climbs
# steeply, so pricing a 3 kWp system at the 10–100 kWp rate would flatter it.
MIN_KWP = 10.0


def sweep(pv_per_kwp: list[float], demand: list[float], max_kwp: float, e: PvEconomics) -> list[PvPoint]:
    """1 kWp steps from MIN_KWP to what the roof fits (≤ 200 sizes)."""
    if max_kwp < MIN_KWP:
        return []
    step = max(1.0, round((max_kwp - MIN_KWP) / 200, 1))
    sizes, k = [], MIN_KWP
    while k <= max_kwp + 1e-9:
        sizes.append(round(k, 1))
        k += step
    if sizes[-1] < max_kwp:
        sizes.append(round(max_kwp, 1))
    return [evaluate(s, pv_per_kwp, demand, e) for s in sizes]


def monthly(values: list[float]) -> list[float]:
    month_hours = [744, 672, 744, 720, 744, 720, 744, 744, 720, 744, 720, 744]
    out, i = [], 0
    for h in month_hours:
        out.append(round(sum(values[i:i + h])))
        i += h
    return out


def utc_to_local_standard(series: list[float]) -> list[float]:
    """PVGIS hours are UTC; EnergyPlus runs on local standard time (UTC+1 in
    Sweden, no daylight saving), so the solar series moves one hour later."""
    return series[-1:] + series[:-1]
