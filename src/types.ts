export interface PredicateTimeseries {
  dates: string[];
  predicates: Record<string, number[]>;
  severity_rl: number[];
  severity_nt: number[];
}

export interface GrangerResult {
  source: string;
  target: string;
  f_stat: number;
  p_value: number;
  lag: number;
  sig: boolean;
  fdr_sig?: boolean;   // Benjamini-Hochberg FDR (q=0.05) across all 110 tests
  bonf_sig?: boolean;  // Bonferroni family-wise — the bulletproof set
}

export interface CrossCorrelation {
  source: string;
  target: string;
  lags: number[];
  correlations: number[];
}

export interface CorrelationMatrix {
  predicates: string[];
  matrix: number[][];
}

export interface EntityPairSeries {
  predicate: string;
  source_entity: string;
  target_entity: string;
  total: number;
  series: number[];
}

export interface EntityTimeseries {
  dates: string[];
  pairs: EntityPairSeries[];
}

export interface SummaryStats {
  n_snapshots: number;
  date_start: string;
  date_end: string;
  total_triples: number;
  predicate_totals: Record<string, number>;
  n_significant_granger: number;
  n_predicates: number;
  confidence_threshold: number;
}

export interface CausalEdge {
  source: string;
  target: string;
  f_stat: number;
  p_value: number;
  lag: number;
  sig: boolean;
  fdr_sig?: boolean;   // survives Benjamini-Hochberg FDR (q=0.05) across all 110 tests
  bonf_sig?: boolean;  // survives Bonferroni (family-wise) — the bulletproof set
}

export interface RRLSStatement {
  chunk_id: string;
  date: string;
  source: string;
  db: string;
  overall_confidence?: number;
  speaker?: string;
  target?: string;
  context_text_span?: string;
  theme?: string;
  audience?: string;
  nature_of_threat?: string;
  level_of_escalation?: string;
  line_type?: string;
  threat_type?: string;
  specificity?: string;
  immediacy?: string;
}

export interface NTSStatement {
  chunk_id: string;
  date: string;
  source: string;
  db: string;
  overall_confidence?: number;
  speaker?: string;
  target?: string;
  context_text_span?: string;
  nts_statement_type?: string;
  nts_threat_type?: string;
  capability?: string;
  tone?: string;
  consequences?: string;
  specificity?: string;
  conditionality?: string;
}
