type Link = { label: string; url: string; kind: 'dash' | 'app' | 'repo' };

const links: Link[] = [
  { label: 'Red Lines Dashboard',            url: 'https://sdspieg.github.io/redlines-dashboard/',                kind: 'dash' },
  { label: 'War Data Dashboard',             url: 'https://sdspieg.github.io/war-datasets-dashboard/',            kind: 'dash' },
  { label: 'RuBase Deliverables',            url: 'http://138.201.62.161:9081/#red-lines',                        kind: 'app'  },
  { label: 'GitHub — causal-dashboard',      url: 'https://github.com/hcss-utils/causal-dashboard',               kind: 'repo' },
];

const icon: Record<Link['kind'], string> = { dash: '📊', app: '🧭', repo: '💻' };

export default function RelatedResources() {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center',
      padding: '8px 12px', margin: '0 16px 12px',
      background: 'rgba(30, 42, 69, 0.6)', border: '1px solid #2a3a5a', borderRadius: 8,
      fontSize: 12,
    }}>
      <span style={{ color: '#a0a0b0', marginRight: 4 }}>Related Red Lines resources →</span>
      {links.map(l => (
        <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
          style={{
            color: '#4fc3f7', textDecoration: 'none', padding: '4px 10px',
            background: 'rgba(79, 195, 247, 0.08)', border: '1px solid rgba(79, 195, 247, 0.3)',
            borderRadius: 14, whiteSpace: 'nowrap',
          }}>
          {icon[l.kind]} {l.label}
        </a>
      ))}
    </div>
  );
}
