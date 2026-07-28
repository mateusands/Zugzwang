// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlayerRow } from '../src/components/PlayerRow.js';

/**
 * Spec: cada lado do tabuleiro ganha uma linha de identificação — como no
 * chess.com —, com o nome, as peças que ele capturou e a vantagem material.
 * A linha também marca de quem é a vez, para o jogador saber sem ler o status.
 *
 * É componente de apresentação puro: tudo vem por prop, nada é calculado aqui.
 */

afterEach(cleanup);

describe('PlayerRow', () => {
  it('deve mostrar o nome do jogador', () => {
    render(<PlayerRow name="Bot — medium" captured={[]} capturedColor="white" lead={0} />);

    expect(screen.getByText('Bot — medium')).toBeDefined();
  });

  it('deve mostrar a vantagem material quando ela é positiva', () => {
    render(<PlayerRow name="Você" captured={['p', 'n']} capturedColor="black" lead={4} />);

    expect(screen.getByText('+4')).toBeDefined();
  });

  it('não deve mostrar vantagem quando o material está igual', () => {
    render(<PlayerRow name="Você" captured={['p']} capturedColor="black" lead={0} />);

    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('deve anunciar de quem é a vez', () => {
    render(<PlayerRow name="Você" captured={[]} capturedColor="black" lead={0} toMove />);

    expect(screen.getByRole('listitem', { name: /vez de Você/i })).toBeDefined();
  });
});
