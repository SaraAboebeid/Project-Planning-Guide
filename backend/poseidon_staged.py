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

Solved lexicographically:
  1. fit as much of the plan (by today's cost) as the budget allows;
  2. keeping that, maximise the total present value — the timing that saves
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


class StagePlanIn(BaseModel):
    years: int = Field(ge=1, le=40)
    budget: float = Field(ge=0)              # SEK over the whole period
    items: list[StageItemIn]
    after: list[tuple[str, str]] = []        # (A, B): B may not be done before A
    max_buildings_per_year: Optional[int] = Field(default=None, ge=1)
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
    nx = n * T
    nz = len(buildings) * T if cap else 0
    nv = nx + nz
    if nv > MAX_VARS:
        raise HTTPException(413, "too many measures × years for one plan")
    X = lambda i, y: i * T + y                       # noqa: E731
    Z = lambda b, y: nx + b * T + y                  # noqa: E731
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

    A = lil_matrix((len(rows), nv))
    for r, coeffs in enumerate(rows):
        for j, v in coeffs.items():
            A[r, j] = v
    A = A.tocsr()
    integrality = np.ones(nv)
    bounds = Bounds(np.zeros(nv), np.ones(nv))
    base = [LinearConstraint(A, np.array(lo), np.array(hi))]
    opts = {"time_limit": req.time_limit_s, "disp": False}

    t0 = time.time()
    # 1) as much of the plan as fits (weighted by today's cost)
    c1 = np.zeros(nv)
    for i, it in enumerate(items):
        for y in range(T):
            c1[X(i, y)] = -(it.cost0 or 1.0)
    r1 = milp(c1, constraints=base, integrality=integrality, bounds=bounds, options=opts)
    if r1.x is None:
        raise HTTPException(500, f"solver failed: {r1.message}")
    cover = -float(r1.fun)
    # 2) keep that coverage, best present value
    keep = LinearConstraint(-c1.reshape(1, -1), cover - max(1.0, 1e-6 * cover), np.inf)
    c2 = np.zeros(nv)
    for i, it in enumerate(items):
        for y in range(T):
            c2[X(i, y)] = -it.values[y]
    r2 = milp(c2, constraints=base + [keep], integrality=integrality, bounds=bounds, options=opts)
    x = (r2.x if r2.x is not None else r1.x)
    schedule: dict[str, Optional[int]] = {}
    for i, it in enumerate(items):
        ys = [y for y in range(T) if x[X(i, y)] > 0.5]
        schedule[it.id] = ys[0] if ys else None
    total = sum(it.cost0 for it in items)
    return {
        "status": "optimal" if r2.status == 0 else ("time_limit" if r2.status == 1 else r2.message),
        "schedule": schedule, "covered": cover, "total": total,
        "value": -float(r2.fun) if r2.x is not None else None,
        "seconds": round(time.time() - t0, 2), "variables": nv, "constraints": len(rows),
    }


router = APIRouter(prefix="/api/poseidon")


@router.post("/staged-plan")
async def staged_plan(req: StagePlanIn):
    return await run_in_threadpool(solve, req)
