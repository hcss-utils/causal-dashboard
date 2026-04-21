import { useEffect, useState } from 'react';
import Plot from './Plot';
import { load } from '../data';
import type { EntityTimeseries } from '../types';
import { predColor } from '../colors';
import Takeaway from './Takeaway';

const ENTITY_COLORS = [
  '#ff7b72', '#ffa657', '#ffd700', '#3fb950', '#58a6ff',
  '#d2a8ff', '#f778ba', '#79c0ff', '#a5d6ff', '#56d364',
];

export default function EntityAnalysis() {
  const [data, setData] = useState<EntityTimeseries | null>(null);
  const [focusPred, setFocusPred] = useState('RED_LINES');

  useEffect(() => {
    load<EntityTimeseries>('entity_timeseries.json').then(setData);
  }, []);

  if (!data) return <div className="loading">Loading...</div>;

  const pairs = data.pairs.filter(p => p.predicate === focusPred);

  return (
    <div className="tab-content">
      <h2>Entity-Level Analysis</h2>
      <p className="subtitle">
        Top source-target entity pairs for rhetoric predicates. Shows which actors direct rhetoric at whom.
      </p>

      <div className="controls">
        <div className="toggle-row">
          <button
            className={`pred-toggle ${focusPred === 'RED_LINES' ? 'active' : ''}`}
            style={{
              borderColor: predColor('RED_LINES'),
              backgroundColor: focusPred === 'RED_LINES' ? predColor('RED_LINES') + '33' : 'transparent',
              color: focusPred === 'RED_LINES' ? predColor('RED_LINES') : '#8b949e',
            }}
            onClick={() => setFocusPred('RED_LINES')}
          >RED_LINES</button>
          <button
            className={`pred-toggle ${focusPred === 'NUCLEAR_THREATS' ? 'active' : ''}`}
            style={{
              borderColor: predColor('NUCLEAR_THREATS'),
              backgroundColor: focusPred === 'NUCLEAR_THREATS' ? predColor('NUCLEAR_THREATS') + '33' : 'transparent',
              color: focusPred === 'NUCLEAR_THREATS' ? predColor('NUCLEAR_THREATS') : '#8b949e',
            }}
            onClick={() => setFocusPred('NUCLEAR_THREATS')}
          >NUCLEAR_THREATS</button>
        </div>
      </div>

      <div className="chart-row">
        <div className="chart-box">
          <h4>Top Entity Pairs — {focusPred}</h4>
          <Plot
            data={[{
              type: 'bar',
              y: pairs.map(p => `${p.source_entity} → ${p.target_entity}`),
              x: pairs.map(p => p.total),
              orientation: 'h',
              marker: { color: pairs.map((_, i) => ENTITY_COLORS[i % ENTITY_COLORS.length]) },
              text: pairs.map(p => p.total.toLocaleString()),
              textposition: 'outside',
            }]}
            layout={{
              paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
              font: { color: '#e0e0e0' },
              margin: { t: 10, b: 30, l: 220, r: 60 },
              height: Math.max(250, pairs.length * 35 + 60),
              yaxis: { autorange: 'reversed', type: 'category' },
              xaxis: { title: 'Total Edges', gridcolor: '#21262d' },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
          {(() => {
            if (pairs.length === 0) return <Takeaway variant="warning">No entity pairs available for {focusPred}.</Takeaway>;
            const total = pairs.reduce((s, p) => s + p.total, 0);
            const top3 = pairs.slice(0, 3).reduce((s, p) => s + p.total, 0);
            const top3Pct = Math.round((top3 / total) * 100);
            const top = pairs[0];
            return (
              <Takeaway>
                Most {focusPred.toLowerCase().replace('_', ' ')} rhetoric flows <strong>{top.source_entity} → {top.target_entity}</strong> ({top.total.toLocaleString()} edges).
                Top-3 pairs account for <strong>{top3Pct}%</strong> of the total {total.toLocaleString()} — rhetoric is concentrated on a small set of source/target dyads,
                not diffuse. That's useful if you want to know <em>whom</em> Russia is addressing when it issues red-line statements.
              </Takeaway>
            );
          })()}
        </div>

        <div className="chart-box">
          <h4>Top Pairs Over Time — {focusPred}</h4>
          <Plot
            data={pairs.slice(0, 6).map((p, i) => ({
              type: 'scatter' as const,
              mode: 'lines' as const,
              name: `${p.source_entity} → ${p.target_entity}`,
              x: data.dates,
              y: p.series,
              line: { color: ENTITY_COLORS[i % ENTITY_COLORS.length], width: 1.5 },
            }))}
            layout={{
              paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
              font: { color: '#e0e0e0' },
              margin: { t: 10, b: 50, l: 50, r: 20 },
              height: 400,
              xaxis: { title: 'Week', gridcolor: '#21262d' },
              yaxis: { title: 'Edge Count', gridcolor: '#21262d' },
              legend: { orientation: 'h', y: 1.15, font: { size: 9 } },
              hovermode: 'x unified',
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
          {(() => {
            if (pairs.length === 0) return null;
            // Find peak week across the top 6 pairs
            const top6 = pairs.slice(0, 6);
            let peak = { i: 0, total: 0 };
            for (let i = 0; i < data.dates.length; i++) {
              const tot = top6.reduce((s, p) => s + (p.series[i] || 0), 0);
              if (tot > peak.total) peak = { i, total: tot };
            }
            const peakDate = data.dates[peak.i];
            return (
              <Takeaway>
                Peak week across the top 6 {focusPred.toLowerCase().replace('_', ' ')} pairs: <strong>{peakDate}</strong> ({peak.total} combined edges).
                Sharp step-changes in individual lines usually correspond to specific diplomatic or military events —
                e.g. cross-reference the date against the Time Series tab for the matching ATTACKS / THREATENS surge.
              </Takeaway>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
