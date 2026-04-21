import { useEffect, useState, useMemo } from 'react';
import Plot from './Plot';
import { load } from '../data';
import type { CausalEdge } from '../types';
import { predColor } from '../colors';
import Takeaway from './Takeaway';

// Fixed positions for network layout
const NODE_POS: Record<string, [number, number]> = {
  THREATENS: [1.5, 8],
  ATTACKS: [8.5, 8],
  LAUNCHES: [5, 9.5],
  RED_LINES: [2, 5],
  NUCLEAR_THREATS: [8, 5],
  AIDS: [0.5, 2],
  SANCTIONS: [3.5, 1],
  CYBER_ATTACKS: [6.5, 1],
  DISINFORMS: [2, 0],
  CONTROLS: [8, 2],
  DISPLACES: [5, 0],
  TRADES_FOSSIL: [10, 3],
  ARMS: [0, 4],
};

export default function CausalNetwork() {
  const [edges, setEdges] = useState<CausalEdge[]>([]);
  const [pThreshold, setPThreshold] = useState(0.05);
  const [highlightRhetoric, setHighlightRhetoric] = useState(true);

  useEffect(() => {
    load<CausalEdge[]>('causal_network.json').then(setEdges);
  }, []);

  const filteredEdges = useMemo(() => {
    return edges.filter(e => e.p_value < pThreshold);
  }, [edges, pThreshold]);

  // Build traces
  const traces = useMemo(() => {
    const out: Plotly.Data[] = [];

    // Edge traces
    for (const edge of filteredEdges) {
      const sp = NODE_POS[edge.source];
      const tp = NODE_POS[edge.target];
      if (!sp || !tp) continue;

      const isRhetoricTarget = edge.target === 'RED_LINES' || edge.target === 'NUCLEAR_THREATS';
      const isRhetoricSource = edge.source === 'RED_LINES' || edge.source === 'NUCLEAR_THREATS';
      const color = highlightRhetoric
        ? (isRhetoricTarget ? '#ff4444' : isRhetoricSource ? '#3fb950' : '#484f58')
        : '#484f58';
      const width = Math.min(1 + edge.f_stat / 10, 4);

      // Offset slightly for bidirectional edges
      const dx = tp[0] - sp[0];
      const dy = tp[1] - sp[1];
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ox = -dy / len * 0.15;
      const oy = dx / len * 0.15;

      out.push({
        type: 'scatter', mode: 'lines',
        x: [sp[0] + ox, tp[0] + ox, null],
        y: [sp[1] + oy, tp[1] + oy, null],
        line: { color, width },
        opacity: 0.6 + Math.min(edge.f_stat / 40, 0.4),
        hoverinfo: 'text',
        text: `${edge.source} → ${edge.target}\nF=${edge.f_stat.toFixed(1)}, p=${edge.p_value.toFixed(4)}, lag=${edge.lag}w`,
        showlegend: false,
      } as Plotly.Data);

      // Arrowhead
      const arrowLen = 0.3;
      const angle = Math.atan2(dy, dx);
      const ax1 = tp[0] + ox - arrowLen * Math.cos(angle - 0.3);
      const ay1 = tp[1] + oy - arrowLen * Math.sin(angle - 0.3);
      const ax2 = tp[0] + ox - arrowLen * Math.cos(angle + 0.3);
      const ay2 = tp[1] + oy - arrowLen * Math.sin(angle + 0.3);

      out.push({
        type: 'scatter', mode: 'lines',
        x: [ax1, tp[0] + ox, ax2],
        y: [ay1, tp[1] + oy, ay2],
        line: { color, width: width * 0.8 },
        opacity: 0.6,
        hoverinfo: 'skip',
        showlegend: false,
      } as Plotly.Data);
    }

    // Node traces
    const nodes = Object.entries(NODE_POS);
    const isRhetoric = (n: string) => n === 'RED_LINES' || n === 'NUCLEAR_THREATS';
    out.push({
      type: 'scatter', mode: 'markers+text',
      x: nodes.map(([, p]) => p[0]),
      y: nodes.map(([, p]) => p[1]),
      marker: {
        size: nodes.map(([n]) => isRhetoric(n) ? 30 : 20),
        color: nodes.map(([n]) => predColor(n)),
        opacity: 0.9,
        line: { color: '#0d1117', width: 2 },
      },
      text: nodes.map(([n]) => n.replace('_', '\n')),
      textposition: 'bottom center',
      textfont: { size: 9, color: '#e0e0e0' },
      hoverinfo: 'text',
      hovertext: nodes.map(([n]) => {
        const incoming = filteredEdges.filter(e => e.target === n).length;
        const outgoing = filteredEdges.filter(e => e.source === n).length;
        return `${n}\nIncoming: ${incoming}\nOutgoing: ${outgoing}`;
      }),
      showlegend: false,
    } as Plotly.Data);

    return out;
  }, [filteredEdges, highlightRhetoric]);

  return (
    <div className="tab-content">
      <h2>Causal Network</h2>
      <p className="subtitle">
        Directed graph of significant Granger-causal relationships. Red arrows = triggers rhetoric,
        green arrows = rhetoric causes. Arrow width proportional to F-statistic.
      </p>

      <div className="controls">
        <div className="toggle-row">
          <span className="label">p-value threshold:</span>
          <input
            type="range" min={0.001} max={0.05} step={0.001}
            value={pThreshold}
            onChange={e => setPThreshold(Number(e.target.value))}
          />
          <span className="label">p &lt; {pThreshold.toFixed(3)}</span>
          <label style={{ marginLeft: 20 }}>
            <input type="checkbox" checked={highlightRhetoric} onChange={e => setHighlightRhetoric(e.target.checked)} />
            Highlight rhetoric edges
          </label>
        </div>
        <div className="legend-row">
          <span style={{ color: '#ff4444' }}>■ Triggers rhetoric</span>
          <span style={{ color: '#3fb950' }}>■ Rhetoric causes</span>
          <span style={{ color: '#484f58' }}>■ Other causal links</span>
          <span className="muted">({filteredEdges.length} edges at p &lt; {pThreshold.toFixed(3)})</span>
        </div>
      </div>

      <div className="chart-row">
        <div className="chart-box" style={{ minWidth: '100%' }}>
          <Plot
            data={traces}
            layout={{
              paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
              font: { color: '#e0e0e0' },
              margin: { t: 10, b: 10, l: 10, r: 10 },
              height: 600,
              xaxis: { visible: false, range: [-1, 11] },
              yaxis: { visible: false, range: [-1.5, 10.5], scaleanchor: 'x' },
              hovermode: 'closest',
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
          {(() => {
            const rhetoric = ['RED_LINES', 'NUCLEAR_THREATS'];
            const incoming = filteredEdges.filter(e => rhetoric.includes(e.target)).length;
            const outgoing = filteredEdges.filter(e => rhetoric.includes(e.source)).length;
            const asym = outgoing > 0 ? (incoming / outgoing).toFixed(1) : '∞';
            // Node with highest incoming rhetoric edges
            const inByNode: Record<string, number> = {};
            filteredEdges.filter(e => rhetoric.includes(e.target)).forEach(e => {
              inByNode[e.source] = (inByNode[e.source] || 0) + 1;
            });
            const topIn = Object.entries(inByNode).sort((a, b) => b[1] - a[1])[0];
            return (
              <Takeaway variant={incoming > outgoing * 1.5 ? 'surprise' : 'default'}>
                At p &lt; {pThreshold.toFixed(3)}: <strong>{filteredEdges.length} significant edges</strong>.
                <strong> {incoming} edges into</strong> rhetoric nodes (red), <strong>{outgoing} out</strong> (green) — a {asym}× asymmetry
                confirms rhetoric is more a response than a driver.
                {topIn && <> The single predicate sending the most edges <em>into</em> rhetoric is <strong>{topIn[0]}</strong> ({topIn[1]} of {incoming}).</>}
                {' '}Slide the p-threshold down to 0.001 to see only the most robust causal claims; toggle the checkbox off to greyscale the rhetoric focus.
              </Takeaway>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
