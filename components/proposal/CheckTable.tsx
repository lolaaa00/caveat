import type { CheckOutcome } from '@/lib/types';
import { Empty } from '@/components/ui/primitives';

const OP_LABEL: Record<string, string> = {
  lte: '≤',
  lt: '<',
  gte: '≥',
  gt: '>',
  eq: '=',
  neq: '≠',
  in: 'in',
  not_in: 'not in',
  is_true: 'is true',
  is_false: 'is false',
  invariant: '',
};

const clean = (value: string) => value.replace(/^"|"$/g, '');

export const CheckTable = ({ checks }: { checks: CheckOutcome[] }) => {
  if (checks.length === 0) {
    return <Empty>No deterministic checks have been run for this proposal yet.</Empty>;
  }

  return (
    <div>
      {checks.map((check) => (
        <div
          key={check.label + check.field}
          className="flex items-baseline gap-3 border-b border-line py-2.5 last:border-b-0"
        >
          <span
            className={`datum w-4 text-[13px] ${check.passed ? 'text-execute' : 'text-block'}`}
            aria-hidden
          >
            {check.passed ? '✓' : '✗'}
          </span>
          <span className="datum min-w-[9rem] text-[12px] text-ink">{check.label}</span>
          <span className="datum flex-1 text-[12px] text-ink-faint">
            {check.op === 'invariant' ? (
              check.detail
            ) : (
              <>
                {check.field} {OP_LABEL[check.op] ?? check.op}{' '}
                {check.op === 'is_true' || check.op === 'is_false' ? '' : clean(check.expected)}
                {check.actual ? (
                  <span className="text-ink-dim"> · actual {clean(check.actual)}</span>
                ) : null}
              </>
            )}
          </span>
          <span
            className={`datum text-[10px] tracking-[0.12em] uppercase ${
              check.passed ? 'text-execute' : 'text-block'
            }`}
          >
            {check.passed ? 'pass' : 'fail'}
          </span>
        </div>
      ))}
    </div>
  );
};
