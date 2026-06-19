// Canonical RuBase 5-logo header (ported from rubase-react-template/src/RuBaseHeader.jsx).
// Required by RUBASE_WEB_STANDARD.md H1b for every dashboard surface:
//   HCSS beeldmerk · Georgia Tech | title | Carnegie · Koninklijke Landmacht · RuBase,
//   all hyperlinked, none dead.
import './RuBaseHeader.css';

type Logo = { href: string; src: string; alt?: string; className?: string };
type Logos = { left?: Logo[]; right?: Logo[] };

function assetPath(src: string, assetPrefix = '') {
  if (!src) return '';
  if (/^(https?:)?\/\//.test(src) || src.startsWith('/')) return src;
  return `${assetPrefix}${src}`;
}

function LogoGroup({ logos = [], side, assetPrefix = '' }: { logos?: Logo[]; side: string; assetPrefix?: string }) {
  return (
    <div className={`rb-logo-group rb-logo-${side}`}>
      {logos.map((logo, i) => (
        <a key={`${side}-${logo.src}-${i}`} href={logo.href} target="_blank" rel="noopener">
          <img src={assetPath(logo.src, assetPrefix)} alt={logo.alt || ''} className={`rb-logo ${logo.className || ''}`.trim()} />
        </a>
      ))}
    </div>
  );
}

export default function RuBaseHeader({
  title, subtitle, logos, assetPrefix = '', homeHref = 'https://rubase.org/',
}: { title: string; subtitle?: string; logos: Logos; assetPrefix?: string; homeHref?: string }) {
  return (
    <div className="rb-header" role="banner">
      <div className="rb-leftwrap">
        <LogoGroup logos={logos.left || []} side="left" assetPrefix={assetPrefix} />
        <div className="rb-nav">
          <a href={homeHref} className="rb-nav-btn rb-home" title="Home (rubase.org)">⌂ Home</a>
        </div>
      </div>

      <span className="rb-title">
        <span className="rb-title-main">{title}</span>
        {subtitle && <span className="rb-subtitle">{subtitle}</span>}
      </span>

      <LogoGroup logos={logos.right || []} side="right" assetPrefix={assetPrefix} />
    </div>
  );
}

// Fixed 5-logo dash header per RUBASE_WEB_STANDARD H1b + sunburst_chart_guide §7.
export const DASH_LOGOS: Logos = {
  left: [
    { href: 'https://hcss.nl', src: 'hcss_logo.svg', alt: 'HCSS', className: 'logo-hcss' },
    { href: 'https://gatech.edu', src: 'gt.svg', alt: 'Georgia Tech', className: 'logo-gt' },
  ],
  right: [
    { href: 'https://www.carnegie.org', src: 'ccny_logo.svg', alt: 'Carnegie Corporation of New York', className: 'logo-ccny' },
    { href: 'https://www.defensie.nl/organisatie/landmacht', src: 'kl_logo.svg', alt: 'Koninklijke Landmacht (Royal Netherlands Army)', className: 'logo-kl' },
    { href: 'https://hcss.nl/rubase/', src: 'rubase_logo.svg', alt: 'RuBase' },
  ],
};
