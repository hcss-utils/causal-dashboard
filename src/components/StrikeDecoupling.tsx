import { useEffect, useState } from 'react';
import Plot from './Plot';
import { load } from '../data';
import Takeaway from './Takeaway';

interface IRFPanel { driver: string; target: string; horizon: number[]; cum: number[]; lo: number[]; hi: number[]; }
interface BatteryRow { method: string; controls: string; strike_effect: string; }
interface EventStudy {
  dates: string[]; RED_LINES: number[]; NUCLEAR_THREATS: number[];
  UA_strikes_all: number[]; UA_strikes_deep: number[]; UA_strikes_western: number[];
  events: { date: string; label: string }[];
}
interface Tier1 {
  favar_full_controls: { p?: number; survives?: boolean; error?: string };
  reverse_causality: { forward_p: number; reverse_p: number; simultaneous: boolean };
  specification_curve: { n_specs: number; frac_p_lt_05: number; median_p: number };
  out_of_sample: { improvement_pct: number; deaths_help: boolean };
  hurdles_passed: string;
}
interface CostChannel {
  tests: Record<string, { granger_p?: number; fdr_q?: number; cond_p_intensity?: number; p_2023plus?: number; robust?: boolean; error?: string }>;
  robust_links: string[];
  tier1_DEATHS_UA_to_NUCLEAR: Tier1;
  tier1_DEATHS_UA_to_NUCLEAR_PURIFIED: Tier1;
  purification: { outcome: string; impure_hurdles: string; purified_hurdles: string; verdict: string };
}
interface RedlineData {
  meta: { n_weeks: number; date_start: string; date_end: string; generated: string; n_methods_agree: number };
  headline: string; battery: BatteryRow[]; irf: IRFPanel[];
  varx: Record<string, { coef: number; p: number } | string>;
  event_study: EventStudy; favar_explained_var: number; favar_min_p: number;
  cost_channel?: CostChannel;
}

const RED = '#d35f5f', GOLD = '#dbad50', LB = '#82a0bc', GREY = '#a9abb8', GREEN = '#76c893';
const TARGETS = ['NUCLEAR_THREATS', 'RED_LINES'];
const DRIVERS = ['russia', 'western', 'annexed', 'energy'];
const DRIVER_LABEL: Record<string, string> = { russia: 'on Russia-proper', western: 'Western-supplied', annexed: 'on annexed territory', energy: 'on energy/refineries' };

export default function StrikeDecoupling() {
  const [d, setD] = useState<RedlineData | null>(null);
  const [target, setTarget] = useState('NUCLEAR_THREATS');
  const [driver, setDriver] = useState('western');
  useEffect(() => { load<RedlineData>('redline_decoupling.json').then(setD); }, []);
  if (!d) return <div className="loading">Loading...</div>;

  const es = d.event_study;
  const evShapes = es.events.map(e => ({
    type: 'line' as const, x0: e.date, x1: e.date, y0: 0, y1: 1, yref: 'paper' as const,
    line: { color: GOLD, width: 1.5, dash: 'dash' as const },
  }));
  const evAnnos = es.events.map((e, i) => ({
    x: e.date, y: 1 - i * 0.07, yref: 'paper' as const, xanchor: 'right' as const,
    text: ' ' + e.label, showarrow: false, font: { size: 10, color: GOLD },
  }));

  const panel = d.irf.find(p => p.target === target && p.driver === driver) || d.irf[0];
  // straddles zero at EVERY horizon h>=1 (h=0 is trivially 0)? — the honest, per-panel test.
  const straddlesAll = panel.lo.slice(1).every((lo, i) => lo < 0 && panel.hi[i + 1] > 0);
  const varxKey = `D_Nov2024_signal->NUCLEAR_THREATS`;
  const varxNuc = d.varx[varxKey] as { coef: number; p: number } | undefined;

  return (
    <div className="tab-content">
      <h2>Strike Decoupling</h2>
      <p className="subtitle">
        Do Ukrainian strikes on Russia drive Russian nuclear/red-line rhetoric? The focused
        VAR · FAVAR · LASSO · Ridge · VARX battery (2022–{d.meta.date_end.slice(0, 4)}, {d.meta.n_weeks} weeks) says no —
        and the GNN's own causal module agrees. <strong>{d.meta.n_methods_agree} methods.</strong>
      </p>

      {/* 1. The six-method battery */}
      <div className="chart-row">
        <div className="chart-box" style={{ minWidth: '100%' }}>
          <h4>Six methods, one answer: strikes do not drive the rhetoric</h4>
          <table className="data-table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: LB }}>
              <th style={{ padding: '6px 10px' }}>Method</th>
              <th style={{ padding: '6px 10px' }}>Controls for</th>
              <th style={{ padding: '6px 10px' }}>Strike → rhetoric</th>
            </tr></thead>
            <tbody>
              {d.battery.map((b, i) => (
                <tr key={i} style={{ borderTop: '1px solid #2a3f63' }}>
                  <td style={{ padding: '6px 10px', fontWeight: 600 }}>{b.method}</td>
                  <td style={{ padding: '6px 10px', color: GREY }}>{b.controls}</td>
                  <td style={{ padding: '6px 10px', color: GOLD }}>{b.strike_effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Takeaway>
            Across every instrument — controlling for nothing, for the policy series, for {(d.favar_explained_var * 100).toFixed(0)}%
            of the whole dataset's variance (FAVAR), and for all lagged predictors (LASSO/Ridge) — no slice of the
            Ukrainian strike campaign robustly predicts the rhetoric. The lone exception is the <strong>VARX</strong>: when you
            add Russia's <em>own</em> Nov-2024 signaling event (Oreshnik + nuclear doctrine) as an exogenous regressor, <em>that</em>
            drives nuclear threats{varxNuc ? ` (coef +${varxNuc.coef}, p${varxNuc.p < 0.001 ? '<0.001' : `=${varxNuc.p}`})` : ''} — the strikes still don't.
          </Takeaway>
        </div>
      </div>

      {/* 2. The full-war event study (descriptive decoupling) */}
      <div className="chart-row">
        <div className="chart-box" style={{ minWidth: '100%' }}>
          <h4>The decoupling, visible: strikes escalate while nuclear rhetoric cools</h4>
          <Plot
            data={[
              { type: 'scatter', mode: 'lines', name: 'RED_LINES (rhetoric)', x: es.dates, y: es.RED_LINES, line: { color: RED, width: 1.6 }, yaxis: 'y' },
              { type: 'scatter', mode: 'lines', name: 'NUCLEAR_THREATS (rhetoric)', x: es.dates, y: es.NUCLEAR_THREATS, line: { color: GOLD, width: 1.6 }, yaxis: 'y' },
              { type: 'scatter', mode: 'lines', name: 'UA strikes (all)', x: es.dates, y: es.UA_strikes_all, line: { color: GREY, width: 1.2 }, yaxis: 'y2' },
              { type: 'scatter', mode: 'lines', name: 'UA strikes >600km (deep)', x: es.dates, y: es.UA_strikes_deep, line: { color: RED, width: 1, dash: 'dot' }, yaxis: 'y2' },
              { type: 'scatter', mode: 'lines', name: 'UA strikes Western', x: es.dates, y: es.UA_strikes_western, line: { color: LB, width: 1, dash: 'dot' }, yaxis: 'y2' },
            ] as Plotly.Data[]}
            layout={{
              paper_bgcolor: 'transparent', plot_bgcolor: 'transparent', font: { color: '#e8edf3' },
              margin: { t: 20, b: 50, l: 60, r: 65 }, height: 460,
              xaxis: { gridcolor: '#2a3f63' },
              yaxis: { title: 'rhetoric / week', gridcolor: '#2a3f63' },
              yaxis2: { title: 'strikes / week', overlaying: 'y', side: 'right', gridcolor: '#2a3f6322' },
              legend: { orientation: 'h', y: 1.13, font: { size: 11 } },
              hovermode: 'x unified', shapes: evShapes, annotations: evAnnos,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
          <Takeaway variant="surprise">
            The grey strike line climbs to ~300–400/week and stays high through {d.meta.date_end.slice(0, 4)}, while the gold
            nuclear-threats line peaks in 2024 and cools toward zero. The one rhetoric spike (Nov-2024) sits at Russia's own
            Oreshnik/doctrine cluster — not a strike response. <strong>Strikes up, nuclear-signaling down.</strong>
          </Takeaway>
        </div>
      </div>

      {/* 3. The IRF (inferential null) */}
      <div className="chart-row">
        <div className="chart-box" style={{ minWidth: '100%' }}>
          <h4>Impulse response: rhetoric's reaction to a strike shock (95% CI)</h4>
          <div className="controls"><div className="toggle-row">
            <span className="label">Rhetoric:</span>
            {TARGETS.map(t => (
              <button key={t} className={`btn-sm ${target === t ? 'active' : ''}`} onClick={() => setTarget(t)}>{t.replace('_', ' ')}</button>
            ))}
            <span className="label" style={{ marginLeft: 16 }}>Strike type:</span>
            {DRIVERS.map(dr => (
              <button key={dr} className={`btn-sm ${driver === dr ? 'active' : ''}`} onClick={() => setDriver(dr)}>{dr}</button>
            ))}
          </div></div>
          <Plot
            data={[
              { type: 'scatter', mode: 'lines', name: 'upper 95%', x: panel.horizon, y: panel.hi, line: { width: 0 }, showlegend: false, hoverinfo: 'skip' },
              { type: 'scatter', mode: 'lines', name: '95% CI', x: panel.horizon, y: panel.lo, fill: 'tonexty', fillcolor: `${LB}33`, line: { width: 0 }, hoverinfo: 'skip' },
              { type: 'scatter', mode: 'lines', name: 'cumulative response', x: panel.horizon, y: panel.cum, line: { color: '#16304f' === '#16304f' ? GOLD : GOLD, width: 2.5 } },
            ] as Plotly.Data[]}
            layout={{
              paper_bgcolor: 'transparent', plot_bgcolor: 'transparent', font: { color: '#e8edf3' },
              margin: { t: 20, b: 50, l: 60, r: 30 }, height: 380,
              xaxis: { title: 'weeks after a 1-SD strike shock', gridcolor: '#2a3f63' },
              yaxis: { title: `cumulative Δ ${target.replace('_', ' ')}`, gridcolor: '#2a3f63', zeroline: true, zerolinecolor: GREY, zerolinewidth: 1.5 },
              legend: { orientation: 'h', y: 1.13, font: { size: 11 } }, hovermode: 'x unified',
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
          <Takeaway variant={straddlesAll ? 'success' : 'warning'}>
            Cumulative response of <strong>{target.replace('_', ' ')}</strong> to a 1-SD shock in Ukrainian strikes {DRIVER_LABEL[driver]}.
            {straddlesAll
              ? ' The 95% band includes zero at every horizon — no statistically distinguishable effect.'
              : ' The band sits marginally above zero at the shortest horizons — this is the lone flicker (Western strikes → nuclear, p≈0.07) — but it widens to include zero within a few weeks, and crucially it does NOT survive the full-dataset controls (FAVAR/LASSO/Ridge are all null — see the battery above). Suggestive, not robust.'}
          </Takeaway>
        </div>
      </div>

      {d.cost_channel && (() => {
        const cc = d.cost_channel!;
        const imp = cc.tier1_DEATHS_UA_to_NUCLEAR, pur = cc.tier1_DEATHS_UA_to_NUCLEAR_PURIFIED;
        return (
          <div className="card" style={{ marginTop: 20 }}>
            <h4>Beyond strikes: does the war's human COST drive the rhetoric? (Also no — and a case study in catching a false positive)</h4>
            <p style={{ fontSize: 13, color: LB }}>
              The battery above tests strike <em>volume</em>. We then added the war's human <strong>cost</strong> to the
              same temporal knowledge graph — a <code>SUSTAINS_DEATHS</code> predicate (Ukrainian military deaths from
              UALosses' real-dated obituaries, Russian deaths from UCDP, civilians from OHCHR) — and ran the identical
              machinery. Of six cost→rhetoric links, robustness (FDR + intensity control + dropping 2022) left exactly
              one: <strong>Ukrainian military deaths → Russian nuclear threats</strong>. It then passed a full four-test
              rigor battery <strong>{imp.hurdles_passed}</strong> (full-control FAVAR, no reverse-causality, 128/128
              specifications, out-of-sample forecast). Suggestive of a real cost→signal channel.
            </p>
            <p style={{ fontSize: 13, color: LB }}>
              But reading the <em>actual statements</em> that followed the deadliest weeks deflated it twice over: they
              are overwhelmingly <strong>deterrence aimed at the West</strong> (“don't intervene”), not reactions to
              Ukrainian losses; and the <code>NUCLEAR_THREATS</code> measure was ~⅓ <strong>third parties</strong>
              (Ukrainian and Western officials <em>warning the world</em> after heavy casualties). Purifying the outcome
              to genuine Russian-<strong>state</strong> signaling and re-running the battery collapsed it from{' '}
              <strong>{cc.purification.impure_hurdles}</strong> to <strong style={{ color: RED }}>{cc.purification.purified_hurdles}</strong>:
            </p>
            <table className="data-table" style={{ fontSize: 12, marginBottom: 10 }}>
              <thead><tr><th>Tier-1 test</th><th>impure (all nuclear talk)</th><th>purified (Russian state only)</th></tr></thead>
              <tbody>
                <tr><td>FAVAR full-control</td><td style={{ color: GREEN }}>p={imp.favar_full_controls.p} ✓</td><td style={{ color: RED }}>p={pur.favar_full_controls.p} ✗ fails</td></tr>
                <tr><td>Reverse causality</td><td>one-way (rev p={imp.reverse_causality.reverse_p})</td><td style={{ color: RED }}>simultaneous (rev p={pur.reverse_causality.reverse_p})</td></tr>
                <tr><td>Specification curve</td><td style={{ color: GREEN }}>{Math.round(imp.specification_curve.frac_p_lt_05 * 100)}% sig</td><td>{Math.round(pur.specification_curve.frac_p_lt_05 * 100)}% sig</td></tr>
                <tr><td>Hurdles passed</td><td style={{ color: GREEN }}>{imp.hurdles_passed}</td><td style={{ color: RED }}>{pur.hurdles_passed}</td></tr>
              </tbody>
            </table>
            <Takeaway variant="success">
              Properly measured, Russian state nuclear signaling is <strong>not</strong> cleanly driven by Ukrainian
              deaths — it's bidirectional and fails the full controls. The apparent link rode on measurement impurity +
              confounding. So the decoupling <strong>broadens</strong>: neither strike volume <em>nor</em> human cost
              drives the rhetoric. And the chain that killed it — read the statements → purify the measure → re-test —
              is the difference between a defensible finding and a confound dressed as a discovery.
            </Takeaway>
          </div>
        );
      })()}

      <p className="subtitle" style={{ fontSize: 12, color: GREY, marginTop: 8 }}>
        Generated {d.meta.generated} from the live war_datasets DB. Method: <code>scripts/export_redline_decoupling.py</code>.
        Full methodology + caveats: <em>RED_LINES_CAUSAL_FINDINGS.md</em> (worklog §10.10–10.13).
        The aggregate is descriptive; the causal claim is carried by the controlled VAR/FAVAR battery.
      </p>
    </div>
  );
}
