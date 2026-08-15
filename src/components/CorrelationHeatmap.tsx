import { useEffect, useState } from 'react';
import Plot from './Plot';
import { load } from '../data';
import type { CorrelationMatrix } from '../types';
import Takeaway from './Takeaway';

export default function CorrelationHeatmap() {
  const [data, setData] = useState<CorrelationMatrix | null>(null);

  useEffect(() => {
    load<CorrelationMatrix>('correlation_matrix.json').then(setData);
  }, []);

  if (!data) return <div className="loading">Loading...</div>;

  return (
    <div className="tab-content">
      <h2>Contemporaneous Correlation Matrix</h2>
      <p className="subtitle">
        Pearson correlation between predicate X and predicate Y in the <strong>same week</strong> (lag&nbsp;0) — descriptive
        co-movement only, <strong>not</strong> lead/lag. For lead/lag see the Cross-Correlation tab; for direction, the Granger and
        Strike-Decoupling tabs.
      </p>

      <div className="chart-row">
        <div className="chart-box" style={{ minWidth: '100%' }}>
          <Plot
            data={[{
              type: 'heatmap',
              z: data.matrix,
              x: data.predicates,
              y: data.predicates,
              colorscale: [
                [0, '#82a0bc'],
                [0.27, '#16304f'],
                [0.55, '#5a6f8e'],
                [0.78, '#c9962f'],
                [1, '#dbad50'],
              ],
              zmin: -0.3,
              zmax: 0.8,
              text: data.matrix.map(row => row.map(v => v.toFixed(3))),
              texttemplate: '%{text}',
              textfont: { size: 9, color: '#e8edf3' },
              hovertemplate: '%{y} ↔ %{x} (same week)<br>Correlation: %{z:.3f}<extra></extra>',
            }]}
            layout={{
              paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
              font: { color: '#e8edf3' },
              margin: { t: 20, b: 100, l: 130, r: 20 },
              height: 550,
              xaxis: { tickangle: -45, side: 'bottom' },
              yaxis: { autorange: 'reversed' },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
          {(() => {
            // Find strongest off-diagonal pair
            let best = { r: 0, src: '', tgt: '' };
            for (let i = 0; i < data.predicates.length; i++) {
              for (let j = 0; j < data.predicates.length; j++) {
                if (i === j) continue;
                const v = data.matrix[i][j];
                if (Math.abs(v) > Math.abs(best.r)) {
                  best = { r: v, src: data.predicates[i], tgt: data.predicates[j] };
                }
              }
            }
            // Strongest INTO rhetoric
            const rhetoric = ['RED_LINES', 'NUCLEAR_THREATS'];
            let bestIn = { r: 0, src: '', tgt: '' };
            for (let i = 0; i < data.predicates.length; i++) {
              for (let j = 0; j < data.predicates.length; j++) {
                if (!rhetoric.includes(data.predicates[j]) || rhetoric.includes(data.predicates[i])) continue;
                const v = data.matrix[i][j];
                if (Math.abs(v) > Math.abs(bestIn.r)) {
                  bestIn = { r: v, src: data.predicates[i], tgt: data.predicates[j] };
                }
              }
            }
            return (
              <Takeaway>
                Strongest contemporaneous pair overall: <strong>{best.src} ↔ {best.tgt}</strong> with r = {best.r.toFixed(3)}.
                {bestIn.src && <> The strongest <em>event ↔ rhetoric</em> same-week correlation is <strong>{bestIn.src} ↔ {bestIn.tgt}</strong> at r = {bestIn.r.toFixed(3)}.</>}
                {' '}This is <strong>same-week co-movement</strong>, not lead/lag and not causation — events and rhetoric rising in the
                same weeks says nothing about which moves first. Lead/lag lives in the Cross-Correlation tab; the controlled causal
                test is the Strike-Decoupling battery, which finds no robust strike → rhetoric effect.
              </Takeaway>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
