import { useEffect, useState, useMemo } from 'react';
import Plot from './Plot';
import { load } from '../data';
import type { PredicateTimeseries, RRLSStatement, NTSStatement } from '../types';
import { predColor, PRED_COLORS } from '../colors';
import Takeaway from './Takeaway';

const EVENT_PREDS = ['ATTACKS', 'THREATENS', 'SANCTIONS', 'AIDS', 'TRADES_FOSSIL',
  'CONTROLS', 'LAUNCHES', 'DISPLACES', 'CYBER_ATTACKS', 'DISINFORMS', 'ARMS'];

type ChartMode = 'bars_bubbles' | 'dual_axis' | 'normalized';

export default function CrossDomainOverlay() {
  const [ts, setTs] = useState<PredicateTimeseries | null>(null);
  const [rrls, setRrls] = useState<RRLSStatement[]>([]);
  const [nts, setNts] = useState<NTSStatement[]>([]);
  const [eventPred, setEventPred] = useState('AIDS');
  const [chartMode, setChartMode] = useState<ChartMode>('bars_bubbles');
  const [showRRLS, setShowRRLS] = useState(true);
  const [showNTS, setShowNTS] = useState(true);

  useEffect(() => {
    load<PredicateTimeseries>('predicate_timeseries.json').then(setTs);
    load<RRLSStatement[]>('rrls_statements.json').then(setRrls);
    load<NTSStatement[]>('nts_statements.json').then(setNts);
  }, []);

  // Aggregate RRLS/NTS by month for bubble overlay
  const rrlsByMonth = useMemo(() => {
    const byM: Record<string, { count: number; totalConf: number }> = {};
    for (const s of rrls) {
      if (!s.date) continue;
      const m = s.date.slice(0, 7);
      if (!byM[m]) byM[m] = { count: 0, totalConf: 0 };
      byM[m].count++;
      byM[m].totalConf += s.overall_confidence || 0;
    }
    return Object.entries(byM).map(([month, v]) => ({
      month,
      count: v.count,
      avgConf: v.count > 0 ? v.totalConf / v.count : 0,
    })).sort((a, b) => a.month.localeCompare(b.month));
  }, [rrls]);

  const ntsByMonth = useMemo(() => {
    const byM: Record<string, { count: number; totalConf: number }> = {};
    for (const s of nts) {
      if (!s.date) continue;
      const m = s.date.slice(0, 7);
      if (!byM[m]) byM[m] = { count: 0, totalConf: 0 };
      byM[m].count++;
      byM[m].totalConf += s.overall_confidence || 0;
    }
    return Object.entries(byM).map(([month, v]) => ({
      month,
      count: v.count,
      avgConf: v.count > 0 ? v.totalConf / v.count : 0,
    })).sort((a, b) => a.month.localeCompare(b.month));
  }, [nts]);

  // Aggregate event predicate by month from weekly snapshots
  const eventByMonth = useMemo(() => {
    if (!ts) return [];
    const byM: Record<string, number> = {};
    for (let i = 0; i < ts.dates.length; i++) {
      const m = ts.dates[i].slice(0, 7);
      byM[m] = (byM[m] || 0) + (ts.predicates[eventPred]?.[i] || 0);
    }
    return Object.entries(byM)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [ts, eventPred]);

  const totalEvent = eventByMonth.reduce((s, r) => s + r.count, 0);
  const totalRRLS = rrlsByMonth.reduce((s, r) => s + r.count, 0);
  const totalNTS = ntsByMonth.reduce((s, r) => s + r.count, 0);

  const traces = useMemo(() => {
    const out: Plotly.Data[] = [];

    if (chartMode === 'bars_bubbles') {
      // Green bars for event predicate
      out.push({
        type: 'bar',
        name: `${eventPred} (${totalEvent.toLocaleString()} total)`,
        x: eventByMonth.map(r => r.month),
        y: eventByMonth.map(r => r.count),
        marker: { color: predColor(eventPred), opacity: 0.7 },
        yaxis: 'y',
      } as Plotly.Data);

      // RRLS bubbles
      if (showRRLS) {
        const maxCount = Math.max(...rrlsByMonth.map(r => r.count), 1);
        out.push({
          type: 'scatter', mode: 'markers+text',
          name: `RRLS (${totalRRLS})`,
          x: rrlsByMonth.map(r => r.month),
          y: rrlsByMonth.map(r => r.avgConf),
          marker: {
            size: rrlsByMonth.map(r => 8 + (r.count / maxCount) * 30),
            color: '#ff4444',
            opacity: rrlsByMonth.map(r => 0.4 + (r.avgConf / 10) * 0.6),
          },
          text: rrlsByMonth.map(r => r.avgConf > 0 ? r.avgConf.toFixed(1) : ''),
          textposition: 'middle center',
          textfont: { size: 9, color: '#fff' },
          yaxis: 'y2',
          hovertemplate: '%{x}<br>RRLS: %{marker.size:.0f} statements<br>Avg confidence: %{y:.1f}/10<extra></extra>',
        } as Plotly.Data);
      }

      // NTS bubbles
      if (showNTS) {
        const maxCount = Math.max(...ntsByMonth.map(r => r.count), 1);
        out.push({
          type: 'scatter', mode: 'markers+text',
          name: `NTS (${totalNTS})`,
          x: ntsByMonth.map(r => r.month),
          y: ntsByMonth.map(r => r.avgConf),
          marker: {
            size: ntsByMonth.map(r => 8 + (r.count / maxCount) * 25),
            color: '#ffd700',
            opacity: ntsByMonth.map(r => 0.4 + (r.avgConf / 10) * 0.6),
            symbol: 'diamond',
          },
          text: ntsByMonth.map(r => r.avgConf > 0 ? r.avgConf.toFixed(1) : ''),
          textposition: 'middle center',
          textfont: { size: 8, color: '#000' },
          yaxis: 'y2',
          hovertemplate: '%{x}<br>NTS: %{marker.size:.0f} statements<br>Avg confidence: %{y:.1f}/10<extra></extra>',
        } as Plotly.Data);
      }
    } else if (chartMode === 'dual_axis') {
      out.push({
        type: 'scatter', mode: 'lines+markers',
        name: eventPred,
        x: eventByMonth.map(r => r.month),
        y: eventByMonth.map(r => r.count),
        line: { color: predColor(eventPred), width: 2 },
        marker: { size: 4 },
      } as Plotly.Data);
      if (showRRLS) {
        out.push({
          type: 'scatter', mode: 'lines+markers',
          name: 'RED_LINES',
          x: rrlsByMonth.map(r => r.month),
          y: rrlsByMonth.map(r => r.count),
          line: { color: '#ff7b72', width: 2 },
          marker: { size: 4 },
          yaxis: 'y2',
        } as Plotly.Data);
      }
      if (showNTS) {
        out.push({
          type: 'scatter', mode: 'lines+markers',
          name: 'NUCLEAR_THREATS',
          x: ntsByMonth.map(r => r.month),
          y: ntsByMonth.map(r => r.count),
          line: { color: '#ffd700', width: 2 },
          marker: { size: 4 },
          yaxis: 'y2',
        } as Plotly.Data);
      }
    } else {
      // Normalized overlay
      const norm = (arr: number[]) => {
        const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
        const std = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length) || 1;
        return arr.map(v => (v - mean) / std);
      };
      out.push({
        type: 'scatter', mode: 'lines',
        name: eventPred,
        x: eventByMonth.map(r => r.month),
        y: norm(eventByMonth.map(r => r.count)),
        line: { color: predColor(eventPred), width: 2 },
      } as Plotly.Data);
      if (showRRLS) {
        out.push({
          type: 'scatter', mode: 'lines',
          name: 'RED_LINES',
          x: rrlsByMonth.map(r => r.month),
          y: norm(rrlsByMonth.map(r => r.count)),
          line: { color: '#ff7b72', width: 2 },
        } as Plotly.Data);
      }
      if (showNTS) {
        out.push({
          type: 'scatter', mode: 'lines',
          name: 'NUCLEAR_THREATS',
          x: ntsByMonth.map(r => r.month),
          y: norm(ntsByMonth.map(r => r.count)),
          line: { color: '#ffd700', width: 2 },
        } as Plotly.Data);
      }
    }
    return out;
  }, [eventByMonth, rrlsByMonth, ntsByMonth, eventPred, chartMode, showRRLS, showNTS, totalEvent, totalRRLS, totalNTS]);

  if (!ts) return <div className="loading">Loading...</div>;

  const title = chartMode === 'bars_bubbles'
    ? `Do ${eventPred.replace('_', ' ')} Trigger Russian Rhetoric?`
    : `${eventPred} vs. Russian Rhetoric Over Time`;

  return (
    <div className="tab-content">
      <h2>Cross-Domain Overlay</h2>
      <p className="subtitle">
        Overlay any event predicate with RRLS/NTS rhetoric data.
        Bubble size = statement count, opacity = confidence.
      </p>

      <div className="controls">
        <div className="toggle-row">
          <span className="label">Event type:</span>
          <select
            value={eventPred}
            onChange={e => setEventPred(e.target.value)}
            className="select-input"
          >
            {EVENT_PREDS.map(p => (
              <option key={p} value={p}>{p} ({ts.predicates[p]?.reduce((s: number, v: number) => s + v, 0).toLocaleString()})</option>
            ))}
          </select>

          <span className="label" style={{ marginLeft: 16 }}>Chart mode:</span>
          <button className={`btn-sm ${chartMode === 'bars_bubbles' ? 'active' : ''}`}
            onClick={() => setChartMode('bars_bubbles')}>Bars + Bubbles</button>
          <button className={`btn-sm ${chartMode === 'dual_axis' ? 'active' : ''}`}
            onClick={() => setChartMode('dual_axis')}>Dual Axis</button>
          <button className={`btn-sm ${chartMode === 'normalized' ? 'active' : ''}`}
            onClick={() => setChartMode('normalized')}>Normalized</button>
        </div>
        <div className="toggle-row">
          <label><input type="checkbox" checked={showRRLS} onChange={e => setShowRRLS(e.target.checked)} /> RRLS</label>
          <label><input type="checkbox" checked={showNTS} onChange={e => setShowNTS(e.target.checked)} /> NTS</label>
        </div>
      </div>

      <div className="chart-row">
        <div className="chart-box" style={{ minWidth: '100%' }}>
          <h4>{title}</h4>
          <Plot
            data={traces}
            layout={{
              paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
              font: { color: '#e0e0e0' },
              margin: { t: 20, b: 60, l: 70, r: 70 },
              height: 500,
              xaxis: { title: 'Month', gridcolor: '#21262d', tickangle: -45 },
              yaxis: {
                title: chartMode === 'normalized' ? 'Z-score' : `${eventPred} Count`,
                gridcolor: '#21262d',
              },
              ...(chartMode !== 'normalized' ? {
                yaxis2: {
                  title: chartMode === 'bars_bubbles' ? 'Avg Confidence (0-10)' : 'Rhetoric Count',
                  overlaying: 'y', side: 'right',
                  gridcolor: '#21262d33',
                  ...(chartMode === 'bars_bubbles' ? { range: [0, 10] } : {}),
                },
              } : {}),
              legend: { orientation: 'h', y: 1.12, font: { size: 11 } },
              hovermode: 'x unified',
              barmode: 'group',
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
          {(() => {
            // Peak event-month and peak RRLS/NTS month
            const eventPeak = eventByMonth.reduce((acc, r) => r.count > acc.count ? r : acc, { month: '', count: 0 });
            const rrlsPeak = rrlsByMonth.reduce((acc, r) => r.count > acc.count ? r : acc, { month: '', count: 0, avgConf: 0 });
            const ntsPeak = ntsByMonth.reduce((acc, r) => r.count > acc.count ? r : acc, { month: '', count: 0, avgConf: 0 });
            return (
              <Takeaway>
                <strong>{eventPred}</strong> totals {totalEvent.toLocaleString()} events (peak {eventPeak.month}: {eventPeak.count.toLocaleString()});
                RRLS: {totalRRLS} statements (peak {rrlsPeak.month}: {rrlsPeak.count}); NTS: {totalNTS} (peak {ntsPeak.month}: {ntsPeak.count}).
                Visual test: does the rhetoric bubble cluster align with the event-bar spike, or lag it? If bubbles sit on the <em>right shoulder</em> of an event peak, that's rhetoric <em>reacting</em> to the event — which is what the Granger tab tends to confirm.
              </Takeaway>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
