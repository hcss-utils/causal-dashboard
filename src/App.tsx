import { useState } from 'react';
import Overview from './components/Overview';
import TimeSeries from './components/TimeSeries';
import GrangerExplorer from './components/GrangerExplorer';
import CausalNetwork from './components/CausalNetwork';
import CorrelationHeatmap from './components/CorrelationHeatmap';
import CrossDomainOverlay from './components/CrossDomainOverlay';
import EntityAnalysis from './components/EntityAnalysis';
import RelatedResources from './components/RelatedResources';
import './index.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeseries', label: 'Time Series' },
  { id: 'overlay', label: 'Cross-Domain Overlay' },
  { id: 'granger', label: 'Granger Causality' },
  { id: 'network', label: 'Causal Network' },
  { id: 'heatmap', label: 'Correlation Heatmap' },
  { id: 'entities', label: 'Entity Analysis' },
];

function App() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-title">
          <h1>Causal Analysis Dashboard</h1>
          <p className="header-subtitle">
            War Events x Russian Rhetoric — Temporal Knowledge Graph Analysis
          </p>
        </div>
      </header>

      <RelatedResources />

      <nav className="tab-bar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {activeTab === 'overview' && <Overview />}
        {activeTab === 'timeseries' && <TimeSeries />}
        {activeTab === 'overlay' && <CrossDomainOverlay />}
        {activeTab === 'granger' && <GrangerExplorer />}
        {activeTab === 'network' && <CausalNetwork />}
        {activeTab === 'heatmap' && <CorrelationHeatmap />}
        {activeTab === 'entities' && <EntityAnalysis />}
      </main>
    </div>
  );
}

export default App;
