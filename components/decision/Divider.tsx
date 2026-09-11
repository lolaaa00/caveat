import type { Proposal } from '@/lib/types';
import { skinFor, skinVars } from '@/lib/ui/verdict';

/** The turn in the story: "but the world changed." Text and colour both come from the verdict. */
export const Divider = ({ proposal }: { proposal: Proposal }) => {
  const skin = skinFor(proposal.verdict);
  return (
    <div className="divider" style={skinVars(skin)}>
      <div className="divider-text">{proposal.verdict ? skin.divider : 'AWAITING EVALUATION.'}</div>
    </div>
  );
};
