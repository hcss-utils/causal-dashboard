import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js/lib/core';
import scatter from 'plotly.js/lib/scatter';
import bar from 'plotly.js/lib/bar';
import heatmap from 'plotly.js/lib/heatmap';
import pie from 'plotly.js/lib/pie';

Plotly.register([scatter, bar, heatmap, pie]);
const RawPlot = createPlotlyComponent(Plotly);

// House defaults injected into EVERY chart's layout (RuBase Deliverables style):
//   - Legible hover tooltips: navy card, gold border, light text (Plotly's default
//     transparent/dark hoverlabel is illegible on the navy theme).
//   - Legend single-click ISOLATES the clicked series (`itemclick: 'toggleothers'`),
//     double-click toggles just that one. Plotly's default does the opposite.
// Both are mandated by DASHBOARD_TEMPLATE_GUIDE.md §7 and must hold in every app.
const HOUSE_HOVER = {
  bgcolor: '#16304f',
  bordercolor: '#dbad50',
  font: { color: '#e8edf3', family: 'system-ui, -apple-system, Segoe UI, sans-serif', size: 13 },
};
const HOUSE_LEGEND = { itemclick: 'toggleothers', itemdoubleclick: 'toggle' };

export default function Plot({ layout = {}, ...rest }: { layout?: Record<string, any>;[k: string]: any }) {
  const merged = {
    ...layout,
    hoverlabel: { ...HOUSE_HOVER, ...(layout.hoverlabel || {}) },
    legend: { ...HOUSE_LEGEND, ...(layout.legend || {}) },
  };
  return <RawPlot layout={merged} {...rest} />;
}
