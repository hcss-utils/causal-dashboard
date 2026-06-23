#!/usr/bin/env python3
"""Export RRLS/NTS statement data from the redlines PostgreSQL DB.

The causal dashboard is a static Vite app. This script writes the four
RRLS/NTS JSON artifacts consumed by CrossDomainOverlay:

  - rrls_monthly.json
  - rrls_statements.json
  - nts_monthly.json
  - nts_statements.json

Connection env vars:
  REDLINES_DB_HOST / DB_HOST
  REDLINES_DB_PORT / DB_PORT
  REDLINES_DB_NAME / DB_NAME (defaults to redlines)
  REDLINES_DB_USER / DB_USER
  REDLINES_DB_PASSWORD / DB_PASSWORD
  REDLINES_OUTPUT_DIR / OUTPUT_DIR (defaults to public/data)
"""

from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras


ROOT = Path(__file__).resolve().parents[1]
OUT = Path(
    os.environ.get(
        "REDLINES_OUTPUT_DIR",
        os.environ.get("OUTPUT_DIR", str(ROOT / "public" / "data")),
    )
)


def env(name: str, fallback: str | None = None, default: str | None = None) -> str:
    value = os.environ.get(name) or None
    if value is None and fallback:
        value = os.environ.get(fallback) or None
    if value is None:
        value = default
    if value is None:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


DB = {
    "host": env("REDLINES_DB_HOST", "DB_HOST"),
    "port": int(env("REDLINES_DB_PORT", "DB_PORT", "5432")),
    "dbname": env("REDLINES_DB_NAME", "DB_NAME", "redlines"),
    "user": env("REDLINES_DB_USER", "DB_USER", "postgres"),
    "password": env("REDLINES_DB_PASSWORD", "DB_PASSWORD"),
}


def normalize_value(value: Any) -> Any:
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    return value


def normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: normalize_value(value) for key, value in row.items()}


def fetch(conn: psycopg2.extensions.connection, sql: str) -> list[dict[str, Any]]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql)
        return [normalize_row(dict(row)) for row in cur.fetchall()]


def save(data: Any, filename: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / filename
    path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    size_kb = path.stat().st_size // 1024
    count = len(data) if hasattr(data, "__len__") else 1
    print(f"{filename}: {count} rows, {size_kb}KB")


def refresh_materialized_views(conn: psycopg2.extensions.connection) -> None:
    """Keep the dashboard-confirmed RRLS/NTS views in sync with base tables."""
    with conn.cursor() as cur:
        for view in ("mv_rrls_confirmed", "mv_nts_confirmed"):
            cur.execute(f"REFRESH MATERIALIZED VIEW {view}")
            print(f"{view}: refreshed")
    conn.commit()


RRLS_MONTHLY_SQL = """
SELECT
  TO_CHAR(DATE_TRUNC('month', d.date), 'YYYY-MM') AS month,
  d.source,
  COUNT(*)::int AS count
FROM rls_annotation r
JOIN document_chunk dc ON dc.id = r.chunk_id
JOIN document d ON d.id = dc.document_id
WHERE r.is_relevant = true
  AND d.date IS NOT NULL
GROUP BY DATE_TRUNC('month', d.date), d.source
ORDER BY month, d.source NULLS LAST
"""


NTS_MONTHLY_SQL = """
SELECT
  TO_CHAR(DATE_TRUNC('month', d.date), 'YYYY-MM') AS month,
  d.source,
  COUNT(*)::int AS count
FROM nts_annotation n
JOIN document_chunk dc ON dc.id = n.chunk_id
JOIN document d ON d.id = dc.document_id
WHERE n.is_relevant = true
  AND d.date IS NOT NULL
GROUP BY DATE_TRUNC('month', d.date), d.source
ORDER BY month, d.source NULLS LAST
"""


RRLS_STATEMENTS_SQL = """
SELECT
  chunk_id,
  date,
  source,
  db,
  context_text_span,
  speaker,
  target,
  line_text_span,
  threat_text_span,
  line_type,
  threat_type,
  line_intensity,
  threat_intensity,
  theme,
  audience,
  nature_of_threat,
  level_of_escalation,
  geopolitical_area_of_concern,
  immediacy,
  durability,
  reciprocity,
  specificity,
  temporal_context,
  underlying_values_or_interests,
  unilateral_vs_multilateral,
  rhetorical_device,
  overall_confidence
FROM mv_rrls_confirmed
ORDER BY date DESC NULLS LAST, annotation_id DESC
"""


NTS_STATEMENTS_SQL = """
SELECT
  chunk_id,
  date,
  source,
  db,
  context_text_span,
  speaker,
  target,
  threat_text_span,
  nts_statement_type,
  nts_threat_type,
  capability,
  delivery_system,
  conditionality,
  purpose,
  tone,
  context,
  geographical_reach,
  consequences,
  timeline,
  audience,
  specificity,
  rhetorical_device,
  arms_control_and_testing,
  overall_confidence
FROM mv_nts_confirmed
ORDER BY date DESC NULLS LAST, annotation_id DESC
"""


def main() -> int:
    print(f"Writing redlines static JSON to {OUT}")
    with psycopg2.connect(**DB) as conn:
        refresh_materialized_views(conn)
        save(fetch(conn, RRLS_MONTHLY_SQL), "rrls_monthly.json")
        save(fetch(conn, NTS_MONTHLY_SQL), "nts_monthly.json")
        save(fetch(conn, RRLS_STATEMENTS_SQL), "rrls_statements.json")
        save(fetch(conn, NTS_STATEMENTS_SQL), "nts_statements.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
