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

/** The fixed rules, evaluated before any model runs. Rendered exactly as the demo shows them. */
export const CheckTable = ({ checks }: { checks: CheckOutcome[] }) => {
  if (checks.length === 0) {
    return <Empty>No deterministic checks have been run for this proposal yet.</Empty>;
  }

  return (
    <div className="checks-row">
      {checks.map((check) => (
        <div key={check.label + check.field}>
          <div className="check-item">
            <span className={`check-mark ${check.passed ? 'cm-pass' : 'cm-fail'}`}>
              {check.passed ? '✓' : '✕'}
            </span>
            {check.label}
          </div>
          <div className="check-detail">
            {check.op === 'invariant' ? (
              check.detail
            ) : (
              <>
                {check.field} {OP_LABEL[check.op] ?? check.op}{' '}
                {check.op === 'is_true' || check.op === 'is_false' ? '' : clean(check.expected)}
                {check.actual ? <> · actual {clean(check.actual)}</> : null}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
