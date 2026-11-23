"""Staged renovation planning for the Poseidon app: which year each measure of
each building's plan is carried out, within a budget.

A mixed-integer linear programme (the staged-retrofit MILP family of Maia,
Kranzl & Müller 2021 and the budget-constrained portfolio scheduling of
Farahani, Wallbaum & Dalenbäck, Chalmers), solved with HiGHS via
scipy.optimize.milp. The building physics and economics are done in the app
(poseidon/src/analysis.ts: stageItems / stageValue); this endpoint only gets,
per measure, its cost per plan year and the present value of doing it in each
year, plus the rules:

  x[i,y] ∈ {0,1}     measure i is done in plan year y (at most once)
  budget             spending up to year t ≤ the budget released by year t
                     (even release over the period, unspent money carries over)
  order              "after" rules: B done by year y ⇒ A done by year y
                     (heating system after the building's envelope steps;
                     windows with or after the walls)
  capacity           optionally at most K buildings under works per year

  milestones         soft "by year Y, at least this much saved" rows, e.g. a
                     building's primary energy down to Gothenburg's 84 kWh/m²
                     by 2030, or the portfolio −16 % by 2030 (EU EPBD)

Solved lexicographically:
  0. reach the milestones as far as the budget allows (smallest relative
     shortfall; reported per milestone);
  1. keeping that, fit as much of the plan (by today's cost) as possible;
  2. keeping both, maximise the total present value — the timing that saves
     the most money (and CO2 at the user's carbon price).
"""
from __future__ import annotations

import time
from typing import Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

MAX_VARS = 60_000


class StageItemIn(BaseModel):
    id: str = Field(max_length=120)
    building: str = Field(max_length=60)
    cost0: float = Field(ge=0)               # today's price (coverage weight)
    costs: list[float]                       # price if done in plan year y (escalated), len = years
    values: list[float]                      # present value of doing it in plan year y, len = years


class MilestoneIn(BaseModel):
    """Σ coeff_i · [item i done in a plan year < by]  ≥  need   (soft: shortfall is minimised first).
    E.g. a building's PET kWh/yr that must be saved by 2030 to reach 84 kWh/m²."""
    id: str = Field(max_length=120)
    by: int = Field(ge=0)                    # plan years counted: 0 … by-1
    need: float                              # what must be saved (already-done steps subtracted)
    coeffs: list[tuple[str, float]]          # (item id, saving)


class StagePlanIn(BaseModel):
    years: int = Field(ge=1, le=40)
    budget: float = Field(ge=0)              # SEK over the whole period
    items: list[StageItemIn]
    after: list[tuple[str, str]] = []        # (A, B): B may not be done before A
    max_buildings_per_year: Optional[int] = Field(default=None, ge=1)
    milestones: list[MilestoneIn] = []
    time_limit_s: float = Field(default=20, gt=0, le=120)


def solve(req: StagePlanIn) -> dict:
    from scipy.optimize import Bounds, LinearConstraint, milp
    from scipy.sparse import lil_matrix

    T, items = req.years, req.items
    n = len(items)
    if not n:
        return {"status": "empty", "schedule": {}, "covered": 0, "total": 0}
    for it in items:
        if len(it.costs) != T or len(it.values) != T:
            raise HTTPException(400, f"item {it.id}: costs/values must have {T} entries")
    buildings = sorted({it.building for it in items})
    bidx = {b: k for k, b in enumerate(buildings)}
    cap = req.max_buildings_per_year
    ms = [m for m in req.milestones if m.need > 1e-9]
    nx = n * T
    nz = len(buildings) * T if cap else 0
    nv = nx + nz + len(ms)                           # + one shortfall variable per milestone
    if nv > MAX_VARS:
        raise HTTPException(413, "too many measures × years for one plan")
    X = lambda i, y: i * T + y                       # noqa: E731
    Z = lambda b, y: nx + b * T + y                  # noqa: E731
    S = lambda k: nx + nz + k                        # noqa: E731
    idx = {it.id: i for i, it in enumerate(items)}

    rows, lo, hi = [], [], []
    def add(coeffs: dict[int, float], l: float, h: float):
        rows.append(coeffs); lo.append(l); hi.append(h)

    for i in range(n):                                # at most once
        add({X(i, y): 1.0 for y in range(T)}, -np.inf, 1.0)
    for t in range(T):                                # cumulative budget
        released = req.budget * (t + 1) / T
        add({X(i, y): items[i].costs[y] for i in range(n) for y in range(t + 1)}, -np.inf, released)
    for a, b in req.after:                            # order
        if a not in idx or b not in idx:
            continue
        ia, ib = idx[a], idx[b]
        for y in range(T):
            c = {X(ib, yy): 1.0 for yy in range(y + 1)}
            for yy in range(y + 1):
                c[X(ia, yy)] = c.get(X(ia, yy), 0.0) - 1.0
            add(c, -np.inf, 0.0)
    if cap:                                           # capacity
        for i, it in enumerate(items):
            for y in range(T):
                add({X(i, y): 1.0, Z(bidx[it.building], y): -1.0}, -np.inf, 0.0)
        for y in range(T):
            add({Z(b, y): 1.0 for b in range(len(buildings))}, -np.inf, float(cap))

    for k, m in enumerate(ms):                       # milestones (soft)
        c: dict[int, float] = {S(k): 1.0}
        for iid, coef in m.coeffs:
            if iid in idx and coef:
                for y in range(min(m.by, T)):
                    c[X(idx[iid], y)] = c.get(X(idx[iid], y), 0.0) + coef
        add(c, m.need, np.inf)

    A = lil_matrix((len(rows), nv))
    for r, coeffs in enumerate(rows):
        for j, v in coeffs.items():
            A[r, j] = v
    A = A.tocsr()
    integrality = np.ones(nv)
    upper = np.ones(nv)
    for k, m in enumerate(ms):                       # shortfall: continuous, 0 … need
        integrality[S(k)] = 0
        upper[S(k)] = m.need
    bounds = Bounds(np.zeros(nv), upper)
    cons = [LinearConstraint(A, np.array(lo), np.array(hi))]
    opts = {"time_limit": req.time_limit_s, "disp": False}

    def run(c: np.ndarray, label: str):
        r = milp(c, constraints=cons, integrality=integrality, bounds=bounds, options=opts)
        if r.x is None:
            raise HTTPException(500, f"solver failed ({label}): {r.message}")
        return r

    def fix(c: np.ndarray, best: float, minimise: bool):
        # keep the optimum of an earlier phase (with a little slack for rounding)
        tol = max(1e-6, 1e-6 * abs(best))
        cons.append(LinearConstraint(c.reshape(1, -1), -np.inf if minimise else best - tol, best + tol if minimise else np.inf))

    t0 = time.time()
    # 0) reach the milestones as far as possible (relative shortfall, each milestone weighs the same)
    shortfall = {}
    if ms:
        c0 = np.zeros(nv)
        for k, m in enumerate(ms):
            c0[S(k)] = 1.0 / m.need
        r0 = run(c0, "milestones")
        fix(c0, float(r0.fun), minimise=True)
    # 1) as much of the plan as fits (weighted by today's cost)
    c1 = np.zeros(nv)
    for i, it in enumerate(items):
        for y in range(T):
            c1[X(i, y)] = (it.cost0 or 1.0)
    r1 = run(-c1, "coverage")
    cover = -float(r1.fun)
    fix(c1, cover, minimise=False)
    # 2) keeping both, the best present value
    c2 = np.zeros(nv)
    for i, it in enumerate(items):
        for y in range(T):
            c2[X(i, y)] = -it.values[y]
    r2 = milp(c2, constraints=cons, integrality=integrality, bounds=bounds, options=opts)
    x = (r2.x if r2.x is not None else r1.x)
    schedule: dict[str, Optional[int]] = {}
    for i, it in enumerate(items):
        ys = [y for y in range(T) if x[X(i, y)] > 0.5]
        schedule[it.id] = ys[0] if ys else None
    for k, m in enumerate(ms):
        shortfall[m.id] = round(float(x[S(k)]), 3)
    total = sum(it.cost0 for it in items)
    return {
        "status": "optimal" if r2.status == 0 else ("time_limit" if r2.status == 1 else r2.message),
        "schedule": schedule, "covered": cover, "total": total, "shortfall": shortfall,
        "value": -float(r2.fun) if r2.x is not None else None,
        "seconds": round(time.time() - t0, 2), "variables": nv, "constraints": len(rows),
    }


router = APIRouter(prefix="/api/poseidon")


@router.post("/staged-plan")
async def staged_plan(req: StagePlanIn):
    return await run_in_threadpool(solve, req)
