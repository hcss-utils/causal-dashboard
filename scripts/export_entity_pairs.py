#!/usr/bin/env python3
r"""
Rebuild entity_timeseries.json (the "Top Entity Pairs" / EntityAnalysis tab) with the TKG entity layer
CANONICALISED to country/bloc level.

Why: the raw triples split one real-world entity across many ids — the US appears as country:USA,
actor:united_states, actor:the_united_states; Ukraine as country:UKR, actor:ukraine, actor:kyiv_regime,
actor:the_kyiv_regime; Russia as country:RUS plus every Russian official/body (MFA_RUS, Putin, State_Duma_RUS,
...). The dashboard then showed "country:RUS -> actor:united_states" next to "Putin -> country:USA" as if they
were different dyads, inflating and fragmenting the Top Pairs (team feedback, 2026-06-24). This collapses each
to a single canonical so the pairs read as clean geopolitical dyads (Russia -> United States, etc.).

Non-destructive: only regenerates the dashboard's entity_timeseries.json; the triples are untouched. The
canonicalisation map below is the single editable place to refine the buckets.
"""
import os, json
from datetime import date, timedelta
import psycopg2
from dotenv import load_dotenv
load_dotenv("/mnt/g/My Drive/SYSTEM_CREDENTIALS.env")

OUT = os.environ.get("REDLINE_OUT", os.path.join(os.path.dirname(__file__), "..", "public", "data"))
PREDS = ("RED_LINES", "NUCLEAR_THREATS")
TOP_N = 10

# --- canonicalisation: entity_id -> canonical country/bloc display name ---
# Explicit combos first (multi-actor ids that must not fall through to a single country).
_COMBO = {
    "actor:united_states_and_nato": "The West", "actor:united_states_nato": "The West",
    "actor:united_states_and_its_allies": "The West", "actor:nato_western_countries": "The West",
    "actor:ukraine_and_nato": "Ukraine",
}
# Ordered substring buckets (checked after combos). Russia first so "russian_embassy_usa" -> Russia.
_BUCKETS = [
    ("Russia", ["russia", "russian", "kremlin", "_rus", "putin", "medvedev", "zakharova", "kadyrov",
                "delimkhanov", "volodin", "akhmedova", "roskomnadzor", "minfin", "mfa_rus", "mod_rus",
                "state_duma", "federation_council", "government_rus", "russky_dom", "lavrov", "peskov",
                "shoigu", "patrushev", "naryshkin", "nebenzya"]),
    ("Ukraine", ["ukrain", "kyiv", "kiev", "zelensk", "budanov", "zaluzh"]),
    ("United States", ["united_states", ":usa", "u.s.", "america", "biden", "washington", "blinken"]),
    ("NATO", ["nato"]),
    ("European Union", ["european_union", ":eu", "eu_", "brussels"]),
    ("United Kingdom", ["united_kingdom", "britain", "_gbr", "london", "uk_"]),
    ("The West", ["the_west", "western_countr", "western_state", "collective_west", "the_collective"]),
    ("Japan", ["japan"]),
    ("Poland", ["poland", "polish"]),
    ("Latvia", ["latvia"]),
    ("China", ["china", "_chn", "beijing"]),
]

def canon(eid: str) -> str:
    if eid in _COMBO:
        return _COMBO[eid]
    e = eid.lower()
    for name, keys in _BUCKETS:
        if any(k in e for k in keys):
            return name
    # fallback: a cleaned display of the raw id (keeps minor entities readable, not merged)
    raw = eid.split(":", 1)[-1].replace("_", " ").strip()
    return raw.title() if raw else eid

cn = psycopg2.connect(host=os.environ["PG_WARDATASETS_HOST"], port=os.environ["PG_WARDATASETS_PORT"],
                      dbname=os.environ["PG_WARDATASETS_DATABASE"], user=os.environ["PG_WARDATASETS_USER"],
                      password=os.environ["PG_WARDATASETS_PASSWORD"])
cur = cn.cursor()

# weekly date grid from war onset to the latest rhetoric event
cur.execute("SELECT max(event_date) FROM knowledge_graph.triples WHERE predicate IN %s", (PREDS,))
maxd = cur.fetchone()[0]
d0 = date(2022, 2, 24)
n_weeks = ((maxd - d0).days // 7) + 1
dates = [(d0 + timedelta(days=7 * i)).isoformat() for i in range(n_weeks)]

cur.execute("SELECT predicate, subject_id, object_id, event_date FROM knowledge_graph.triples WHERE predicate IN %s", (PREDS,))
agg = {}  # (pred, src, tgt) -> series list
for pred, s, t, ed in cur.fetchall():
    wi = (ed - d0).days // 7
    if wi < 0 or wi >= n_weeks:
        continue
    key = (pred, canon(s), canon(t))
    agg.setdefault(key, [0.0] * n_weeks)[wi] += 1

out_pairs = []
for pred in PREDS:
    items = [(k, v) for k, v in agg.items() if k[0] == pred]
    items.sort(key=lambda kv: -sum(kv[1]))
    for (p, s, t), series in items[:TOP_N]:
        out_pairs.append({"predicate": p, "source_entity": s, "target_entity": t,
                          "total": int(sum(series)), "series": series})

json.dump({"dates": dates, "pairs": out_pairs}, open(os.path.join(OUT, "entity_timeseries.json"), "w"))
print(f"wrote entity_timeseries.json | {len(dates)} weeks (-> {dates[-1]}) | {len(out_pairs)} canonical pairs")
for pred in PREDS:
    top = [p for p in out_pairs if p["predicate"] == pred][:5]
    print(f"  {pred}:")
    for p in top:
        print(f"    {p['source_entity']} -> {p['target_entity']}: {p['total']}")
cn.close()
