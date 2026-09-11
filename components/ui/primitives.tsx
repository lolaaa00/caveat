import Link from 'next/link';
import type { ReactNode } from 'react';

/** A panel with a lift-on-hover glint. The default surface everywhere except dense lists. */
export const Panel = ({
  title,
  aside,
  children,
  flat = false,
  className = '',
  style,
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  flat?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) => (
  <div className={`${flat ? 'panel-flat' : 'panel'} ${className}`} style={style}>
    {title ? (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="panel-head" style={{ marginBottom: 0 }}>
          {title}
        </div>
        {aside}
      </div>
    ) : null}
    {children}
  </div>
);

export const Field = ({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={className}>
    <div className="field-k">{label}</div>
    <div className="field-v" style={{ fontWeight: 400, fontSize: '13px', lineHeight: 1.6 }}>
      {children}
    </div>
  </div>
);

/** A label/value row inside a panel, divided from its neighbours. */
export const KV = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="kv-item">
    <span className="kv-k">{label}</span>
    <span className="kv-v">{children}</span>
  </div>
);

export const Mono = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`hash ${className}`}>{children}</span>
);

export const AddressChip = ({ value }: { value: string }) => (
  <span className="hash" title={value}>
    {value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—'}
  </span>
);

export type Tone = 'neutral' | 'lime' | 'amber' | 'crimson' | 'verdict';

const toneClass: Record<Tone, string> = {
  neutral: 'tag-neutral',
  lime: 'tag-lime',
  amber: 'tag-amber',
  crimson: 'tag-crimson',
  verdict: 'tag-verdict',
};

export const Tag = ({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) => (
  <span className={`tag ${toneClass[tone]}`}>{children}</span>
);

export type BtnTone = 'crimson' | 'lime' | 'amber' | 'ghost';

const btnClass: Record<BtnTone, string> = {
  crimson: 'btn-crimson',
  lime: 'btn-lime',
  amber: 'btn-amber',
  ghost: 'btn-ghost',
};

export const Button = ({
  children,
  onClick,
  disabled,
  tone = 'ghost',
  type = 'button',
  small = false,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: BtnTone;
  type?: 'button' | 'submit';
  small?: boolean;
  className?: string;
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`btn ${btnClass[tone]} ${small ? 'btn-sm' : ''} ${className}`}
  >
    {children}
  </button>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="empty">{children}</p>
);

export const RowLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="row-card">
    {children}
  </Link>
);

export const Metric = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'lime' | 'amber';
}) => (
  <div className="metric">
    <div className="metric-k">{label}</div>
    <div
      className="metric-v"
      style={{ color: tone === 'lime' ? 'var(--color-lime)' : tone === 'amber' ? 'var(--color-amber)' : 'var(--color-text)' }}
    >
      {value}
    </div>
  </div>
);
