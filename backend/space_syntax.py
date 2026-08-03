"""
space_syntax.py — pure-Python spatial-network (space-syntax) analysis.

METHOD A of the urban-analysis layer: computes street-network centrality with
networkx, so no C++ (Pstalgo) build is needed. The /api/urban/space-syntax
endpoint in main.py fetches the OSM highways for a bbox and calls compute() here;
the viewer colours each street segment by the returned value.

The response is engine-agnostic on purpose — a GeoJSON FeatureCollection whose
features each carry a `value` and normalised `value_norm`. METHOD B (SMoG's
Pstalgo, exact numbers + angular measures) can later replace the compute behind
the same endpoint without the viewer changing at all.

Measures (metric/topological, on the PRIMAL graph — intersections = nodes,
street segments = edges weighted by metric length):
  integration — closeness centrality  (how central / accessible a street is)
  betweenness — betweenness centrality (through-movement / "choice")
  reach       — how much of the network is reachable within `radius` metres
These are the standard graph measures behind space syntax's *metric* analyses;
the *angular* measures (angular integration/choice, segment maps, unlinks) are a
later refinement best served by Pstalgo (method B).
"""
from __future__ import annotations

import math
import networkx as nx


def _haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _build_graph(nodes: dict, ways: list) -> nx.Graph:
    """Primal graph: OSM node ids = graph nodes; consecutive way vertices = edges
    weighted by metric length. Ways sharing a node id meet at that intersection,
    which is what makes the whole thing one connected street network."""
    G = nx.Graph()
    for w in ways:
        nds = [n for n in w.get("nodes", []) if n in nodes]
        for a, b in zip(nds, nds[1:]):
            (lo1, la1), (lo2, la2) = nodes[a], nodes[b]
            length = max(_haversine_m(lo1, la1, lo2, la2), 0.1)
            if G.has_edge(a, b):
                if length < G[a][b]["length"]:
                    G[a][b]["length"] = length
            else:
                G.add_edge(a, b, length=length)
    return G


# Above this many nodes the exact O(V·E) measures get slow; betweenness switches
# to k-sampling and we flag the result as approximate. The viewer requests a
# clamped bbox so the network normally stays well under this.
_APPROX_NODES = 2500


def compute(nodes: dict, ways: list, metric: str = "betweenness", radius: float = 1000.0) -> dict:
    G = _build_graph(nodes, ways)
    n = G.number_of_nodes()
    if n == 0:
        return {"type": "FeatureCollection", "features": [], "count": 0,
                "metric": metric, "min": 0.0, "max": 0.0, "nodes": 0, "approx": False}

    node_val: dict = {}
    approx = False

    if metric == "integration":
        node_val = nx.closeness_centrality(G, distance="length")
    elif metric == "reach":
        for nd in G.nodes():
            reached = nx.single_source_dijkstra_path_length(G, nd, cutoff=radius, weight="length")
            node_val[nd] = float(len(reached))  # network nodes reachable within `radius` m
    else:  # betweenness / "choice"
        metric = "betweenness"
        k = None
        if n > _APPROX_NODES:
            k = min(500, n)          # sample sources; O(k·E) instead of O(V·E)
            approx = True
        node_val = nx.betweenness_centrality(G, weight="length", normalized=True, k=k, seed=1)

    # Per-segment value = mean of its constituent nodes' values (colours the way).
    feats: list = []
    vals: list = []
    for w in ways:
        nds = [nd for nd in w.get("nodes", []) if nd in nodes]
        if len(nds) < 2:
            continue
        vv = [node_val[nd] for nd in nds if nd in node_val]
        if not vv:
            continue
        v = sum(vv) / len(vv)
        vals.append(v)
        tags = w.get("tags", {})
        feats.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": [list(nodes[nd]) for nd in nds]},
            "properties": {"value": round(v, 6),
                           "highway": tags.get("highway", ""),
                           "name": tags.get("name", "")},
        })

    lo, hi = (min(vals), max(vals)) if vals else (0.0, 0.0)
    rng = (hi - lo) or 1.0
    for f in feats:
        f["properties"]["value_norm"] = round((f["properties"]["value"] - lo) / rng, 4)

    return {
        "type": "FeatureCollection", "features": feats, "count": len(feats),
        "metric": metric, "radius_m": radius if metric == "reach" else None,
        "min": lo, "max": hi, "nodes": n, "approx": approx,
    }
