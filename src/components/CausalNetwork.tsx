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
  const [sigMode, setSigMode] = useState<'fdr' | 'bonf' | 'raw'>('fdr');
  const [highlightRhetoric, setHighlightRhetoric] = useState(true);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    load<CausalEdge[]>('causal_network.json').then(setEdges);
  }, []);

  // 110 directed pairs were tested → raw p<0.05 over-claims (~6 expected false positives).
  // Default to Benjamini-Hochberg FDR (q=0.05); Bonferroni = the bulletproof family-wise set.
  const filteredEdges = useMemo(() => {
    return edges.filter(e =>
      sigMode === 'bonf' ? e.bonf_sig : sigMode === 'fdr' ? e.fdr_sig : e.p_value < 0.05
    );
  }, [edges, sigMode]);

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
        ? (isRhetoricTarget ? '#d35f5f' : isRhetoricSource ? '#6ab04c' : '#5a6f8e')
        : '#5a6f8e';
      // Bonferroni-robust edges are drawn bolder (the bulletproof claims)
      const width = (edge.bonf_sig ? 2.2 : 0.6) + Math.min(edge.f_stat / 14, 3);

      // Unit vector + perpendicular offset (so opposing bidirectional edges don't overlap)
      const dx = tp[0] - sp[0];
      const dy = tp[1] - sp[1];
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len, uy = dy / len;
      const ox = -uy * 0.15;
      const oy = ux * 0.15;
      // Stop the arrow JUST OUTSIDE the target node so the head is visible (not buried under the marker)
      const nodeR = (edge.target === 'RED_LINES' || edge.target === 'NUCLEAR_THREATS') ? 0.72 : 0.55;
      const srcR = (edge.source === 'RED_LINES' || edge.source === 'NUCLEAR_THREATS') ? 0.72 : 0.55;
      const tipX = tp[0] + ox - ux * nodeR;
      const tipY = tp[1] + oy - uy * nodeR;

      // Edge shaft (from source-node edge to the arrow tip)
      out.push({
        type: 'scatter', mode: 'lines',
        x: [sp[0] + ox + ux * srcR, tipX, null],
        y: [sp[1] + oy + uy * srcR, tipY, null],
        line: { color, width },
        opacity: 0.55 + Math.min(edge.f_stat / 40, 0.4),
        hoverinfo: 'text',
        text: `${edge.source} → ${edge.target}\nF=${edge.f_stat.toFixed(1)}, p=${edge.p_value.toFixed(4)}, lag=${edge.lag}w`,
        showlegend: false,
      } as Plotly.Data);

      // Filled triangular arrowhead at the tip — clearly directional
      const aLen = 0.55, aWid = 0.26;
      const bx = tipX - ux * aLen, by = tipY - uy * aLen; // base of the head
      const px = -uy, py = ux;                            // perpendicular
      out.push({
        type: 'scatter', mode: 'lines', fill: 'toself', fillcolor: color,
        x: [tipX, bx + px * aWid, bx - px * aWid, tipX],
        y: [tipY, by + py * aWid, by - py * aWid, tipY],
        line: { color, width: 1 },
        opacity: 0.95,
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
        line: { color: '#0d1f3c', width: 2 },
      },
      text: nodes.map(([n]) => n.replace('_', '\n')),
      textposition: 'bottom center',
      textfont: { size: 9, color: '#e8edf3' },
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
        Directed Granger-causal graph — the arrow points from <strong>cause → effect</strong>.
        <strong> Red = something drives the rhetoric</strong>; <strong>green = the rhetoric drives something</strong>.
        Bolder arrows survive the strictest (Bonferroni) significance test.
        <button className="info-btn" onClick={() => setShowInfo(true)}>ⓘ How sure are we?</button>
      </p>

      <div className="controls">
        <div className="toggle-row">
          <span className="label">Show links that are:</span>
          <div className="seg">
            <button className={sigMode === 'bonf' ? 'seg-btn active' : 'seg-btn'} onClick={() => setSigMode('bonf')}>Bulletproof ({edges.filter(e => e.bonf_sig).length})</button>
            <button className={sigMode === 'fdr' ? 'seg-btn active' : 'seg-btn'} onClick={() => setSigMode('fdr')}>Robust · FDR ({edges.filter(e => e.fdr_sig).length})</button>
            <button className={sigMode === 'raw' ? 'seg-btn active' : 'seg-btn'} onClick={() => setSigMode('raw')}>All p&lt;0.05 ({edges.filter(e => e.sig).length})</button>
          </div>
          <label style={{ marginLeft: 16 }}>
            <input type="checkbox" checked={highlightRhetoric} onChange={e => setHighlightRhetoric(e.target.checked)} />
            Highlight rhetoric
          </label>
        </div>
        <div className="legend-row">
          <span style={{ color: '#d35f5f' }}>■ Triggers rhetoric</span>
          <span style={{ color: '#6ab04c' }}>■ Rhetoric causes</span>
          <span style={{ color: '#5a6f8e' }}>■ Other causal links</span>
          <span className="muted">({filteredEdges.length} links shown · {sigMode === 'bonf' ? 'Bonferroni-robust' : sigMode === 'fdr' ? 'FDR-corrected' : 'uncorrected p<0.05'})</span>
        </div>
      </div>

      {showInfo && (
        <div className="modal-overlay" onClick={() => setShowInfo(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowInfo(false)}>×</button>
            <h3>How sure are we these links are real?</h3>
            <p>We checked <strong>110</strong> possible "this drives that" links between battlefield/economic events and Russian rhetoric. Some links can look real just by chance, so we don't trust every one equally. Use the buttons to choose how strict to be:</p>
            <ul className="modal-list">
              <li><strong>Bulletproof</strong> — survives the toughest test (Bonferroni). Even weighing all 110 links at once, there's under a 5% chance that <em>any</em> shown link is a fluke. Stake an argument on these. <em>(Drawn as bold arrows.)</em></li>
              <li><strong>Robust · FDR</strong> — the standard filter for a wide search like this (Benjamini–Hochberg). Of the links shown, at most ~1 in 20 is expected to be a false alarm. <em>This is the default.</em></li>
              <li><strong>All p&lt;0.05</strong> — the loose textbook bar. Because we ran 110 checks, ~6 of these are expected to be chance. Treat the extras as "worth a look," not proven.</li>
            </ul>
            <p className="modal-note"><strong>What "causes" means here:</strong> one trend reliably helps predict another a week or two ahead — statistical precedence ("Granger causality"). It is strong evidence of a lead–lag relationship, not proof of a direct mechanism.</p>
          </div>
        </div>
      )}

      <div className="chart-row">
        <div className="chart-box" style={{ minWidth: '100%' }}>
          <Plot
            data={traces}
            layout={{
              paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
              font: { color: '#e8edf3' },
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
            const modeLabel = sigMode === 'bonf' ? 'Bonferroni-robust' : sigMode === 'fdr' ? 'FDR-corrected (q=0.05)' : 'uncorrected (p<0.05)';
            return (
              <Takeaway variant={incoming > outgoing * 1.5 ? 'surprise' : 'default'}>
                Showing <strong>{filteredEdges.length} {modeLabel} links</strong>.
                <strong> {incoming} point into</strong> the rhetoric nodes (red), <strong>{outgoing} point out</strong> (green) — a {asym}× asymmetry
                confirms the rhetoric is far more a <em>response</em> than a driver.
                {topIn && <> The single biggest driver of rhetoric is <strong>{topIn[0]}</strong> ({topIn[1]} of {incoming} incoming links).</>}
                {' '}Switch to <strong>Bulletproof</strong> to see only the claims that survive the strictest correction — or tap “How sure are we?” for what that means.
              </Takeaway>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
