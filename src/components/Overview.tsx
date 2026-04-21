import { useEffect, useState } from 'react';
import { load } from '../data';
import type { SummaryStats, GrangerResult } from '../types';
import { predColor, sigColor } from '../colors';
import Takeaway from './Takeaway';

export default function Overview() {
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [granger, setGranger] = useState<GrangerResult[]>([]);

  useEffect(() => {
    load<SummaryStats>('summary_stats.json').then(setStats);
    load<GrangerResult[]>('granger_results.json').then(setGranger);
  }, []);

  if (!stats) return <div className="loading">Loading...</div>;

  const sigGranger = granger.filter(g => g.sig && !g.target.includes('_severity'));
  const rhetoricTriggers = sigGranger.filter(g => g.target === 'RED_LINES' || g.target === 'NUCLEAR_THREATS');
  const rhetoricEffects = sigGranger.filter(g => g.source === 'RED_LINES' || g.source === 'NUCLEAR_THREATS');
  const feedbackLoops = sigGranger.filter(g => {
    return sigGranger.some(h => h.source === g.target && h.target === g.source);
  });

  const preds = Object.entries(stats.predicate_totals).sort((a, b) => b[1] - a[1]);

  return (
    <div className="tab-content">
      <h2>Causal Analysis Overview</h2>
      <p className="subtitle">
        Temporal Knowledge Graph: {stats.n_snapshots} weekly snapshots, {stats.date_start} to {stats.date_end}
      </p>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-value">{stats.total_triples.toLocaleString()}</div>
          <div className="stat-label">Total Edge Instances</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.n_predicates}</div>
          <div className="stat-label">Predicates</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.n_snapshots}</div>
          <div className="stat-label">Weekly Snapshots</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.n_significant_granger}</div>
          <div className="stat-label">Significant Causal Pairs</div>
        </div>
        <div className="stat-card" style={{ borderColor: '#ff7b72' }}>
          <div className="stat-value">{rhetoricTriggers.length}</div>
          <div className="stat-label">Rhetoric Triggers</div>
        </div>
        <div className="stat-card" style={{ borderColor: '#3fb950' }}>
          <div className="stat-value">{rhetoricEffects.length}</div>
          <div className="stat-label">Rhetoric Effects</div>
        </div>
        <div className="stat-card" style={{ borderColor: '#ffd700' }}>
          <div className="stat-value">{feedbackLoops.length / 2}</div>
          <div className="stat-label">Feedback Loops</div>
        </div>
      </div>

      <div className="chart-row">
        <div className="chart-box">
          <h4>Edge Instances by Predicate</h4>
          <div className="predicate-list">
            {preds.map(([p, count]) => (
              <div key={p} className="pred-row">
                <span className="pred-name" style={{ color: predColor(p) }}>{p}</span>
                <div className="pred-bar-wrap">
                  <div
                    className="pred-bar"
                    style={{
                      width: `${(count / preds[0][1]) * 100}%`,
                      backgroundColor: predColor(p),
                    }}
                  />
                </div>
                <span className="pred-count">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
          {(() => {
            const total = preds.reduce((s, [, c]) => s + c, 0);
            const [topName, topCount] = preds[0];
            const rl = stats.predicate_totals['RED_LINES'] || 0;
            const nt = stats.predicate_totals['NUCLEAR_THREATS'] || 0;
            const topShare = ((topCount / total) * 100).toFixed(1);
            const rlShare = ((rl / total) * 100).toFixed(2);
            return (
              <Takeaway>
                <strong>{topName}</strong> dominates volume-wise at {topCount.toLocaleString()} edges ({topShare}% of the {total.toLocaleString()} total).
                Rhetoric predicates — <strong>RED_LINES</strong> ({rl.toLocaleString()}, {rlShare}%) and <strong>NUCLEAR_THREATS</strong> ({nt.toLocaleString()}) — are
                a small fraction of the corpus. <em>Volume ≠ causal weight:</em> see the next panel for which predicates actually drive
                rhetoric, and the Granger tab for lag-corrected F-statistics.
              </Takeaway>
            );
          })()}
        </div>

        <div className="chart-box">
          <h4>Key Causal Findings</h4>
          <div className="findings">
            <div className="finding-section">
              <h5 style={{ color: '#ff7b72' }}>What Triggers Rhetoric?</h5>
              {rhetoricTriggers
                .sort((a, b) => a.p_value - b.p_value)
                .slice(0, 8)
                .map(g => (
                  <div key={`${g.source}-${g.target}`} className="finding-row">
                    <span style={{ color: predColor(g.source) }}>{g.source}</span>
                    <span className="arrow"> → </span>
                    <span style={{ color: predColor(g.target) }}>{g.target}</span>
                    <span className="f-stat" style={{ color: sigColor(g.p_value) }}>
                      F={g.f_stat.toFixed(1)} (lag={g.lag}w)
                    </span>
                  </div>
                ))}
            </div>
            <div className="finding-section">
              <h5 style={{ color: '#3fb950' }}>What Does Rhetoric Cause?</h5>
              {rhetoricEffects
                .sort((a, b) => a.p_value - b.p_value)
                .slice(0, 8)
                .map(g => (
                  <div key={`${g.source}-${g.target}`} className="finding-row">
                    <span style={{ color: predColor(g.source) }}>{g.source}</span>
                    <span className="arrow"> → </span>
                    <span style={{ color: predColor(g.target) }}>{g.target}</span>
                    <span className="f-stat" style={{ color: sigColor(g.p_value) }}>
                      F={g.f_stat.toFixed(1)} (lag={g.lag}w)
                    </span>
                  </div>
                ))}
            </div>
          </div>
          {(() => {
            const t = rhetoricTriggers.length;
            const e = rhetoricEffects.length;
            const loops = feedbackLoops.length / 2;
            const asym = e > 0 ? (t / e).toFixed(1) : '∞';
            const variant = t > e * 1.5 ? 'surprise' : 'default';
            return (
              <Takeaway variant={variant as 'surprise' | 'default'}>
                <strong>Rhetoric is more reactor than actor:</strong> {t} predicates Granger-cause rhetoric vs only {e} the reverse
                ({asym}× asymmetry). {loops > 0
                  ? <>There are <strong>{loops} bidirectional feedback loop(s)</strong> where rhetoric and events mutually reinforce — expand these in the Granger &amp; Network tabs.</>
                  : <>No clean bidirectional loops at this significance level — rhetoric appears mostly downstream of events.</>}
              </Takeaway>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
