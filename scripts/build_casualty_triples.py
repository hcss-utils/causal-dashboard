#!/usr/bin/env python3
r"""
Add the human-COST predicate to the temporal knowledge graph.

The TKG/decoupling pipeline turns knowledge_graph.triples into weekly count(*) series per predicate and tests
what drives RED_LINES / NUCLEAR_THREATS rhetoric. Every existing variable is an event-COUNT (STRIKES, ATTACKS,
THREATENS...) — none measure human COST. This emits one `SUSTAINS_DEATHS` triple per death so that the SAME
`date_trunc('week') count(*)` machinery (snapshots + GNN + decoupling) picks up weekly death intensity as a
first-class driver, exactly as the STRIKES predicate was added.

Three subject channels, each from the best-dated source (do NOT pool sources):
  forces:UA   <- UALosses (real day-precision death dates; the richest UA source)
  forces:RU   <- UCDP GED monthly ru_deaths (month-distributed; Mediazona has NO dates so is unusable here)
  civilians:UA<- OHCHR monthly civilians killed (month-distributed; early-2022/Mariupol = OHCHR's own undercount)

Idempotent: deletes existing SUSTAINS_DEATHS triples first. Re-run after each casualty refresh.
"""
import os, io, json, calendar, psycopg2
from datetime import date
from dotenv import load_dotenv
load_dotenv("/mnt/g/My Drive/SYSTEM_CREDENTIALS.env")

cn = psycopg2.connect(host=os.environ["PG_WARDATASETS_HOST"], port=os.environ["PG_WARDATASETS_PORT"],
    dbname=os.environ["PG_WARDATASETS_DATABASE"], user=os.environ["PG_WARDATASETS_USER"],
    password=os.environ["PG_WARDATASETS_PASSWORD"], connect_timeout=20)
cur = cn.cursor()
buf = io.StringIO()
COLS = ["subject_id", "predicate", "object_id", "event_date", "source_table", "source_id", "confidence", "attributes"]

def emit(subj, d, src_table, src_id, conf, attrs):
    row = [subj, "SUSTAINS_DEATHS", "conflict:RUUA", d.isoformat(), src_table, str(src_id), f"{conf}",
           json.dumps(attrs, ensure_ascii=False)]
    buf.write("\t".join(c.replace("\t", " ").replace("\n", " ") for c in row) + "\n")

def spread(start_month, n):
    """N evenly-spaced dates within the calendar month of start_month (a date d0 = YYYY-MM-01)."""
    dim = calendar.monthrange(start_month.year, start_month.month)[1]
    for i in range(n):
        day = 1 + (i * dim) // max(n, 1)
        yield date(start_month.year, start_month.month, min(day, dim))

n_ua = n_ru = n_civ = 0

# --- forces:UA  <- UALosses (real death dates; slug = unique source_id) ---
cur.execute("SELECT slug, dod FROM casualties.ualosses_kia WHERE status='dead' AND dod_precision='day' "
            "AND dod >= DATE '2022-02-24' AND dod <= now()")
for slug, d in cur.fetchall():
    emit("forces:UA", d, "casualties.ualosses_kia", slug, 0.9, {"src": "ualosses", "date_prec": "day"}); n_ua += 1

# --- forces:RU  <- UCDP GED monthly (month-distributed; source_id = month#index) ---
cur.execute("SELECT month, ru_deaths FROM casualties.ucdp_ged_monthly ORDER BY month")
for m, ru in cur.fetchall():
    for i, d in enumerate(spread(m, ru)):
        emit("forces:RU", d, "casualties.ucdp_ged_monthly", f"{m.isoformat()}#{i}", 0.6,
             {"src": "ucdp_ged", "date_prec": "month_distributed"}); n_ru += 1

# --- civilians:UA  <- OHCHR monthly killed (month-distributed; source_id = month#index) ---
cur.execute("SELECT month, killed, COALESCE(undercount_flag,false) FROM casualties.ohchr_current_monthly ORDER BY month")
for m, k, uc in cur.fetchall():
    for i, d in enumerate(spread(m, k)):
        emit("civilians:UA", d, "casualties.ohchr_current_monthly", f"{m.isoformat()}#{i}", 0.85,
             {"src": "ohchr", "date_prec": "month_distributed", "undercount": bool(uc)}); n_civ += 1

# register the new entities (FK target) before inserting triples
for eid, etype, cname in [("forces:UA", "armed_forces", "Ukrainian armed forces"),
                          ("forces:RU", "armed_forces", "Russian armed forces"),
                          ("civilians:UA", "population", "Civilians in Ukraine"),
                          ("conflict:RUUA", "conflict", "Russia-Ukraine war")]:
    cur.execute("INSERT INTO knowledge_graph.entities (entity_id, entity_type, canonical_name) "
                "VALUES (%s,%s,%s) ON CONFLICT (entity_id) DO NOTHING", (eid, etype, cname))

cur.execute("DELETE FROM knowledge_graph.triples WHERE predicate='SUSTAINS_DEATHS'")
deleted = cur.rowcount
buf.seek(0)
cur.copy_expert(f"COPY knowledge_graph.triples ({','.join(COLS)}) FROM STDIN", buf)
cn.commit()
cur.execute("""SELECT subject_id, count(*), min(event_date), max(event_date)
               FROM knowledge_graph.triples WHERE predicate='SUSTAINS_DEATHS' GROUP BY 1 ORDER BY 1""")
print(f"deleted {deleted} prior; emitted UA={n_ua:,} RU={n_ru:,} civ={n_civ:,}")
for s, n, mn, mx in cur.fetchall():
    print(f"  {s}: {n:,} triples  {mn} -> {mx}")
cn.close()
