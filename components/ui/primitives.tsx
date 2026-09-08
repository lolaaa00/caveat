import Link from 'next/link';
import type { ReactNode } from 'react';

export const Panel = ({
  title,
  aside,
  children,
  className = '',
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={`border border-line bg-panel ${className}`}>
    {title ? (
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5">
        <h2 className="label">{title}</h2>
        {aside}
      </header>
    ) : null}
    <div className="p-4">{children}</div>
  </section>
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
    <div className="label mb-1.5">{label}</div>
    <div className="text-[13px] leading-relaxed text-ink">{children}</div>
  </div>
);

export const Mono = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`datum text-[12px] text-ink-dim ${className}`}>{children}</span>
);

export const Address = ({ value }: { value: string }) => (
  <span className="datum text-[12px] text-ink-dim" title={value}>
    {value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—'}
  </span>
);

type Tone = 'neutral' | 'execute' | 'reconfirm' | 'block' | 'signal';

const toneClass: Record<Tone, string> = {
  neutral: 'border-line-strong text-ink-dim',
  execute: 'border-execute/50 bg-execute-dim text-execute',
  reconfirm: 'border-reconfirm/50 bg-reconfirm-dim text-reconfirm',
  block: 'border-block/50 bg-block-dim text-block',
  signal: 'border-signal/50 text-signal',
};

export const Badge = ({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) => (
  <span
    className={`datum inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] tracking-[0.12em] uppercase ${toneClass[tone]}`}
  >
    {children}
  </span>
);

export const Button = ({
  children,
  onClick,
  disabled,
  tone = 'neutral',
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'primary' | 'execute' | 'reconfirm' | 'block';
  type?: 'button' | 'submit';
  className?: string;
}) => {
  const tones: Record<string, string> = {
    neutral: 'border-line-strong bg-raised text-ink hover:border-ink-faint',
    primary: 'border-signal bg-signal/15 text-signal hover:bg-signal/25',
    execute: 'border-execute bg-execute/15 text-execute hover:bg-execute/25',
    reconfirm: 'border-reconfirm bg-reconfirm/15 text-reconfirm hover:bg-reconfirm/25',
    block: 'border-block bg-block/15 text-block hover:bg-block/25',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`datum border px-3.5 py-2 text-[11px] tracking-[0.1em] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
};

export const Row = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
    {children}
  </div>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="py-6 text-center text-[13px] text-ink-faint">{children}</p>
);

export const CardLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link
    href={href}
    className="block border border-line bg-panel p-4 transition-colors hover:border-line-strong hover:bg-raised"
  >
    {children}
  </Link>
);
