import type { ReactNode } from 'react';

type Variant = 'default' | 'warning' | 'surprise' | 'success';

const COLORS: Record<Variant, string> = {
  default: '#82a0bc',
  warning: '#dbad50',
  surprise: '#ff7b72',
  success: '#3fb950',
};

export default function Takeaway({ children, variant = 'default' }: { children: ReactNode; variant?: Variant }) {
  const c = COLORS[variant];
  return (
    <div style={{
      background: `${c}11`,
      borderLeft: `3px solid ${c}`,
      padding: '10px 14px',
      marginTop: 12,
      fontSize: 13,
      lineHeight: 1.45,
      color: '#e8edf3',
      borderRadius: 4,
    }}>
      <strong style={{ color: c, marginRight: 6 }}>💡 So what?</strong>
      {children}
    </div>
  );
}
