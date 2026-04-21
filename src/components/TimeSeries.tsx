import { useEffect, useState, useMemo } from 'react';
import Plot from './Plot';
import { load } from '../data';
import type { PredicateTimeseries } from '../types';
import { predColor, PRED_COLORS } from '../colors';
import Takeaway from './Takeaway';

const ALL_PREDS = Object.keys(PRED_COLORS);

export default function TimeSeries() {
  const [data, setData] = useState<PredicateTimeseries | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(['RED_LINES', 'NUCLEAR_THREATS', 'ATTACKS', 'THREATENS']));
  const [normalize, setNormalize] = useState(false);
  const [showSeverity, setShowSeverity] = useState(true);

  useEffect(() => {
    load<PredicateTimeseries>('predicate_timeseries.json').then(setData);
  }, []);

  const toggle = (p: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const traces = useMemo(() => {
    if (!data) return [];
    const out: Plotly.Data[] = [];
    for (const p of ALL_PREDS) {
      if (!selected.has(p)) continue;
      let y = data.predicates[p];
      if (!y) continue;
      if (normalize) {
        const mean = y.reduce((s, v) => s + v, 0) / y.length;
        const std = Math.sqrt(y.reduce((s, v) => s + (v - mean) ** 2, 0) / y.length) || 1;
        y = y.map(v => (v - mean) / std);
      }
      out.push({
        type: 'scatter', mode: 'lines',
        name: p,
        x: data.dates, y,
        line: { color: predColor(p), width: p === 'RED_LINES' || p === 'NUCLEAR_THREATS' ? 2.5 : 1.2 },
        opacity: p === 'RED_LINES' || p === 'NUCLEAR_THREATS' ? 1 : 0.7,
      } as Plotly.Data);
    }
    if (showSeverity && !normalize && selected.has('RED_LINES')) {
      out.push({
        type: 'scatter', mode: 'lines',
        name: 'RL Severity',
        x: data.dates, y: data.severity_rl,
        line: { color: '#ff7b72', width: 1, dash: 'dot' },
        yaxis: 'y2',
      } as Plotly.Data);
    }
    if (showSeverity && !normalize && selected.has('NUCLEAR_THREATS')) {
      out.push({
        type: 'scatter', mode: 'lines',
        name: 'NT Severity',
        x: data.dates, y: data.severity_nt,
        line: { color: '#ffd700', width: 1, dash: 'dot' },
        yaxis: 'y2',
      } as Plotly.Data);
    }
    return out;
  }, [data, selected, normalize, showSeverity]);

  if (!data) return <div className="loading">Loading...</div>;

  return (
    <div className="tab-content">
      <h2>Predicate Time Series</h2>
      <p className="subtitle">Weekly edge counts across 210 TKG snapshots (Feb 2022 - Mar 2026)</p>

      <div className="controls">
        <div className="pred-toggles">
          {ALL_PREDS.map(p => (
            <button
              key={p}
              className={`pred-toggle ${selected.has(p) ? 'active' : ''}`}
              style={{
                borderColor: predColor(p),
                backgroundColor: selected.has(p) ? predColor(p) + '33' : 'transparent',
                color: selected.has(p) ? predColor(p) : '#8b949e',
              }}
              onClick={() => toggle(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="toggle-row">
          <label>
            <input type="checkbox" checked={normalize} onChange={e => setNormalize(e.target.checked)} />
            Normalize (z-score)
          </label>
          <label>
            <input type="checkbox" checked={showSeverity} onChange={e => setShowSeverity(e.target.checked)} />
            Show severity overlay
          </label>
          <button className="btn-sm" onClick={() => setSelected(new Set(ALL_PREDS))}>All</button>
          <button className="btn-sm" onClick={() => setSelected(new Set(['RED_LINES', 'NUCLEAR_THREATS']))}>Rhetoric only</button>
          <button className="btn-sm" onClick={() => setSelected(new Set())}>None</button>
        </div>
      </div>

      <div className="chart-row">
        <div className="chart-box" style={{ minWidth: '100%' }}>
          <Plot
            data={traces}
            layout={{
              paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
              font: { color: '#e0e0e0' },
              margin: { t: 20, b: 50, l: 60, r: 60 },
              height: 500,
              xaxis: { title: 'Week', gridcolor: '#21262d' },
              yaxis: { title: normalize ? 'Z-score' : 'Edge Count', gridcolor: '#21262d' },
              yaxis2: { title: 'Severity', overlaying: 'y', side: 'right', gridcolor: '#21262d33' },
              legend: { orientation: 'h', y: 1.12, font: { size: 10 } },
              hovermode: 'x unified',
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
          {(() => {
            // Peak week for RED_LINES and for NUCLEAR_THREATS if present in data
            const peak = (key: string) => {
              const arr = data.predicates[key];
              if (!arr || !arr.length) return null;
              let iMax = 0;
              for (let i = 1; i < arr.length; i++) if (arr[i] > arr[iMax]) iMax = i;
              return { date: data.dates[iMax], count: arr[iMax] };
            };
            const rl = peak('RED_LINES');
            const nt = peak('NUCLEAR_THREATS');
            const sel = [...selected].join(', ') || '(none selected)';
            return (
              <Takeaway>
                Weekly granularity: 210 snapshots Feb 2022 → Mar 2026. Peak RED_LINES week: <strong>{rl ? `${rl.date} (${rl.count} edges)` : 'n/a'}</strong>;
                peak NUCLEAR_THREATS: <strong>{nt ? `${nt.date} (${nt.count})` : 'n/a'}</strong>. Toggle ATTACKS/THREATENS alongside to see whether rhetoric <em>leads</em>
                or <em>lags</em> military events — visually the rhetoric spikes usually <strong>follow</strong> event surges by 1–3 weeks (confirm quantitatively in the Granger tab).
                Currently showing: {sel}.
              </Takeaway>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
