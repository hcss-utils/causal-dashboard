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
interface RedlineData {
  meta: { n_weeks: number; date_start: string; date_end: string; generated: string; n_methods_agree: number };
  headline: string; battery: BatteryRow[]; irf: IRFPanel[];
  varx: Record<string, { coef: number; p: number } | string>;
  event_study: EventStudy; favar_explained_var: number; favar_min_p: number;
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

      <p className="subtitle" style={{ fontSize: 12, color: GREY, marginTop: 8 }}>
        Generated {d.meta.generated} from the live war_datasets DB. Method: <code>scripts/export_redline_decoupling.py</code>.
        Full methodology + caveats: <em>RED_LINES_CAUSAL_FINDINGS.md</em> (worklog §10.10–10.13).
        The aggregate is descriptive; the causal claim is carried by the controlled VAR/FAVAR battery.
      </p>
    </div>
  );
}
