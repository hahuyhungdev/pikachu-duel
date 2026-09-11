/**
 * The beat between two stages.
 *
 * The ladder changes one rule at a time, which only reads as variety if the
 * player is told before the clock starts. This card states the stage number, the
 * shape and twists of the board, the score being chased, and — loudly — any
 * twist appearing here for the very first time, so nobody loses a life to a rule
 * they were never shown. It derives nothing: it renders exactly what it is given.
 */

interface StageIntroProps {
  isOpen: boolean;
  stage: number;
  /** e.g. "9×16 · Fall · 4 gold · 2 iced" */
  note: string;
  objective: string | null;
  /** Twists appearing on this exact stage for the first time, to call out loudly. */
  fresh: string[];
  onStart: () => void;
}

export function StageIntro({ isOpen, stage, note, objective, fresh, onStart }: StageIntroProps) {
  return (
    <div className="overlay" data-overlay="stage-intro" hidden={!isOpen}>
      <div className="panel panel--stage-intro">
        <div className="panel__eyebrow">Stage</div>
        <p className="stage-number" data-stage={stage}>
          {stage}
        </p>

        <p className="stage-note">{note}</p>

        {objective && <p className="stage-objective">{objective}</p>}

        {fresh.length > 0 && (
          <ul className="stage-new-list" aria-label="New this stage">
            {fresh.map((twist) => (
              <li className="stage-new" key={twist}>
                <span className="stage-new__flag" data-flag="new">
                  NEW
                </span>
                <span className="stage-new__text">{twist}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="panel__actions">
          {/* autoFocus is deliberate: the card exists to be dismissed, so Enter starts the stage. */}
          <button
            className="btn btn--retry"
            type="button"
            data-action="stage-go"
            autoFocus
            onClick={onStart}
          >
            Start stage {stage}
          </button>
        </div>
      </div>
    </div>
  );
}
