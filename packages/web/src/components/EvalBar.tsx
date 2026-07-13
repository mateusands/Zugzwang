import type { CSSProperties } from 'react';
import { formatScore, winPercent } from '../winprob.js';
import type { Evaluation } from '../stockfishClient.js';

interface EvalBarProps {
  evaluation: Evaluation | null;
  thinking: boolean;
  error: boolean;
  /** Espaço sempre reservado; escondido via visibility para não mover o tabuleiro. */
  hidden: boolean;
}

/** Barra de avaliação vertical: brancas preenchem de baixo, estilo lichess. */
export function EvalBar({ evaluation, thinking, error, hidden }: EvalBarProps) {
  const percent = evaluation ? winPercent(evaluation.score) : 50;
  const label = evaluation ? formatScore(evaluation.score) : '';
  const className = [
    'evalbar',
    hidden && 'evalbar--hidden',
    thinking && 'evalbar--thinking',
    error && 'evalbar--error',
  ]
    .filter(Boolean)
    .join(' ');
  // CSSProperties não aceita custom properties; cast é o padrão do projeto.
  const style = { '--win': `${percent}%` } as CSSProperties;

  return (
    <div
      className={className}
      style={style}
      title={error ? 'Não foi possível carregar o Stockfish' : undefined}
      aria-hidden="true"
    >
      <div className="evalbar__white" />
      {label ? (
        <span className={`evalbar__label evalbar__label--${percent >= 50 ? 'bottom' : 'top'}`}>
          {label}
        </span>
      ) : null}
    </div>
  );
}
