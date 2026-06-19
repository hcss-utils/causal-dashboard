import { useState } from 'react';
import Overview from './components/Overview';
import TimeSeries from './components/TimeSeries';
import GrangerExplorer from './components/GrangerExplorer';
import CausalNetwork from './components/CausalNetwork';
import CorrelationHeatmap from './components/CorrelationHeatmap';
import CrossDomainOverlay from './components/CrossDomainOverlay';
import EntityAnalysis from './components/EntityAnalysis';
import RelatedResources from './components/RelatedResources';
import RuBaseHeader, { DASH_LOGOS } from './RuBaseHeader';
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
      <RuBaseHeader
        title="Causal Analysis Dashboard"
        subtitle="War Events × Russian Rhetoric — Temporal Knowledge Graph"
        logos={DASH_LOGOS}
        assetPrefix={import.meta.env.BASE_URL}
      />

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
