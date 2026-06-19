// Predicate color scheme — harmonised to the Standard RuBase Deliverables palette
// (navy/gold/lightblue family). Rhetoric predicates emphasised: RED_LINES = red,
// NUCLEAR_THREATS = gold (the house accent), so they stand out as the focus nodes.
export const PRED_COLORS: Record<string, string> = {
  ATTACKS: '#e06666',        // kinetic — red
  THREATENS: '#82a0bc',      // house lightblue
  SANCTIONS: '#e8a33d',      // amber
  AIDS: '#6ab04c',           // western support — green
  TRADES_FOSSIL: '#c98bb9',  // muted mauve
  CONTROLS: '#6fa8dc',       // territory — blue
  LAUNCHES: '#b59ad6',       // violet
  DISPLACES: '#9fc5e8',      // pale blue
  CYBER_ATTACKS: '#d99fc4',  // pink
  DISINFORMS: '#a48fd0',     // purple
  ARMS: '#76c893',           // teal-green
  RED_LINES: '#d35f5f',      // rhetoric — red (the "red line")
  NUCLEAR_THREATS: '#dbad50',// rhetoric — gold (house accent; the nuclear focus)
};

export function predColor(pred: string): string {
  return PRED_COLORS[pred] || '#a9abb8';
}

// Significance colors (house tones)
export function sigColor(p: number): string {
  if (p < 0.001) return '#dbad50'; // gold — most significant
  if (p < 0.01) return '#e8a33d';  // amber
  if (p < 0.05) return '#82a0bc';  // lightblue
  return '#a9abb8';                // muted
}
