#!/usr/bin/env python3
r"""
Mechanism trace for the one robust link (UA military deaths -> RU nuclear rhetoric).

Statistics gave us a robust PREDICTIVE relationship; they cannot tell us WHY. This pulls the actual nuclear
statements that FOLLOWED the largest Ukrainian-casualty weeks so a human can read whether Russia's nuclear
talk is responding to / anticipating the losses — or whether the statements are about something else entirely
(Western aid votes, NATO, summits, anniversaries), which would mean the Granger link is the "RU offensive
momentum" confound rather than a real cost->signal mechanism.

For each top casualty-spike week it lists every NUCLEAR_THREATS statement in the +1..+4 week lead window,
with speaker, threat type/intensity, purpose, audience, conditionality, and the quoted text (Russian).
Writes a readable MECHANISM_TRACE.md + a mechanism_trace.json (for the dashboard).
"""
import os, json, datetime as dt
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
load_dotenv("/mnt/g/My Drive/SYSTEM_CREDENTIALS.env")

H, P = os.environ["PG_WARDATASETS_HOST"], os.environ["PG_WARDATASETS_PORT"]
U, PW = os.environ["PG_WARDATASETS_USER"], os.environ["PG_WARDATASETS_PASSWORD"]
wd = psycopg2.connect(host=H, port=P, dbname=os.environ["PG_WARDATASETS_DATABASE"], user=U, password=PW)
rl = psycopg2.connect(host=H, port=P, dbname="redlines", user=U, password=PW)
TOPN, LEAD_LO, LEAD_HI = 10, 7, 35   # weeks +1 .. +4 after the spike week

c = wd.cursor(cursor_factory=RealDictCursor)
# weekly UA military deaths (real-dated); drop the last 4 weeks (reporting censoring)
c.execute("""SELECT date_trunc('week',dod)::date wk, count(*) n FROM casualties.ualosses_kia
             WHERE status='dead' AND dod_precision='day' AND dod >= DATE '2022-02-24'
               AND dod < (now()::date - INTERVAL '4 weeks') GROUP BY 1 ORDER BY 2 DESC LIMIT %s""", (TOPN,))
spikes = c.fetchall()

rc = rl.cursor(cursor_factory=RealDictCursor)
cases = []
for s in spikes:
    wk, n = s["wk"], s["n"]
    lo, hi = wk + dt.timedelta(days=LEAD_LO), wk + dt.timedelta(days=LEAD_HI)
    c.execute("""SELECT event_date, source_id, attributes FROM knowledge_graph.triples
                 WHERE predicate='NUCLEAR_THREATS' AND event_date >= %s AND event_date <= %s
                 ORDER BY event_date""", (lo, hi))
    trips = c.fetchall()
    stmts = []
    for t in trips:
        a = t["attributes"] or {}
        sid = t["source_id"]
        txt = purpose = audience = cond = ttype = inten = None
        try:
            rc.execute("""SELECT threat_text_span, nts_threat_type, threat_intensity, purpose, audience,
                          conditionality, target_normalized FROM public.nts_annotation WHERE id=%s""", (int(sid),))
            r = rc.fetchone() or {}
            txt, ttype, inten = r.get("threat_text_span"), r.get("nts_threat_type"), r.get("threat_intensity")
            purpose, audience, cond = r.get("purpose"), r.get("audience"), r.get("conditionality")
        except Exception:
            pass
        stmts.append({"date": t["event_date"].isoformat(),
                      "speaker": a.get("source_speaker"), "threat_type": ttype or a.get("nts_threat_type"),
                      "intensity": inten, "severity": a.get("severity_score"),
                      "purpose": purpose, "audience": audience, "conditionality": cond,
                      "text_ru": (txt or "").strip()[:400]})
    cases.append({"spike_week": wk.isoformat(), "ua_deaths_that_week": n,
                  "lead_window": f"{lo.isoformat()}..{hi.isoformat()}",
                  "n_nuclear_statements": len(stmts), "statements": stmts})

out = {"generated": dt.date.today().isoformat(),
       "link": "UA military deaths -> RU nuclear rhetoric (the one robust Tier-1 link)",
       "method": f"Top {TOPN} Ukrainian-casualty weeks (UALosses real-dated, last 4 wks dropped); for each, "
                 f"every NUCLEAR_THREATS statement in the +1..+4 week lead window, with the why/about-what "
                 f"annotation fields. READ to judge: do the statements respond to the losses, or are they "
                 f"about Western aid / NATO / summits (= the momentum confound)?",
       "cases": cases}
OUT = os.environ.get("REDLINE_OUT", "/home/stephan/src/causal-dashboard/public/data")
json.dump(out, open(f"{OUT}/mechanism_trace.json", "w"), ensure_ascii=False)

# readable markdown
md = [f"# Mechanism trace — UA military deaths → RU nuclear rhetoric\n",
      f"_Generated {out['generated']}._ {out['method']}\n"]
for cs in cases:
    md.append(f"\n## Casualty spike: week of {cs['spike_week']} — **{cs['ua_deaths_that_week']} UA military deaths**")
    md.append(f"Nuclear statements in the following 1–4 weeks ({cs['lead_window']}): **{cs['n_nuclear_statements']}**\n")
    for st in cs["statements"]:
        md.append(f"- **{st['date']} · {st['speaker'] or '?'}** ({st['threat_type'] or '?'}, intensity {st['intensity'] or '?'})")
        meta = " · ".join(f"{k}: {st[k]}" for k in ("purpose", "audience", "conditionality") if st.get(k))
        if meta: md.append(f"  - _{meta}_")
        if st["text_ru"]: md.append(f"  - «{st['text_ru']}»")
mdpath = "/home/stephan/src/causal-dashboard/MECHANISM_TRACE.md"
open(mdpath, "w", encoding="utf-8").write("\n".join(md))
print(f"wrote {OUT}/mechanism_trace.json + {mdpath}")
print(f"{len(cases)} casualty spikes; nuclear statements in lead windows: {[c['n_nuclear_statements'] for c in cases]}")
wd.close(); rl.close()
