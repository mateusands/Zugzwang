import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

/**
 * API de jogo: criar partida, consultar estado e jogar (o server aplica o
 * lance do humano e devolve a resposta do bot).
 */

async function createGame(app: ReturnType<typeof createApp>, difficulty?: string) {
  const response = await request(app)
    .post('/games')
    .send(difficulty ? { difficulty } : {});
  return response;
}

describe('POST /games', () => {
  it('cria uma partida na posição inicial', async () => {
    const app = createApp();

    const response = await createGame(app, 'easy');

    expect(response.status).toBe(201);
    expect(typeof response.body.id).toBe('string');
    expect(response.body.turn).toBe('white');
    expect(response.body.gameOver).toBe(false);
    expect(response.body.pieces).toHaveLength(32);
  });
});

describe('GET /games/:id', () => {
  it('devolve o estado de uma partida existente', async () => {
    const app = createApp();
    const created = await createGame(app);

    const response = await request(app).get(`/games/${created.body.id}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(created.body.id);
    expect(response.body.fen).toBe(created.body.fen);
  });

  it('responde 404 para uma partida inexistente', async () => {
    const app = createApp();

    const response = await request(app).get('/games/nao-existe');

    expect(response.status).toBe(404);
  });
});

describe('POST /games/:id/move', () => {
  it('aplica o lance do jogador e responde com o lance do bot', async () => {
    const app = createApp();
    const { body: game } = await createGame(app, 'easy');

    const response = await request(app).post(`/games/${game.id}/move`).send({ move: 'e4' });

    expect(response.status).toBe(200);
    expect(response.body.playerMove).toBe('e4');
    // O lance do bot vem com coordenadas, para o tabuleiro animar o movimento.
    expect(typeof response.body.botMove.san).toBe('string');
    expect(typeof response.body.botMove.from).toBe('string');
    expect(typeof response.body.botMove.to).toBe('string');
    // Após o lance do humano e a resposta do bot, é a vez das brancas de novo.
    expect(response.body.turn).toBe('white');
    expect(response.body.history).toHaveLength(2);
  });

  it('aceita lance em forma de coordenadas', async () => {
    const app = createApp();
    const { body: game } = await createGame(app, 'easy');

    const response = await request(app)
      .post(`/games/${game.id}/move`)
      .send({ move: { from: 'e2', to: 'e4' } });

    expect(response.status).toBe(200);
    expect(response.body.playerMove).toBe('e4');
  });

  it('rejeita um lance ilegal com 400', async () => {
    const app = createApp();
    const { body: game } = await createGame(app, 'easy');

    const response = await request(app).post(`/games/${game.id}/move`).send({ move: 'e5' });

    expect(response.status).toBe(400);
  });

  it('responde 404 ao jogar numa partida inexistente', async () => {
    const app = createApp();

    const response = await request(app).post('/games/nao-existe/move').send({ move: 'e4' });

    expect(response.status).toBe(404);
  });
});

describe('POST /games/:id/takeback', () => {
  it('recua o par de lances (jogador + bot), voltando à posição anterior', async () => {
    const app = createApp();
    const { body: game } = await createGame(app, 'easy');
    // Um lance do jogador + a resposta do bot → dois plies no histórico.
    await request(app).post(`/games/${game.id}/move`).send({ move: 'e4' });

    const response = await request(app).post(`/games/${game.id}/takeback`);

    // Desfaz o par: volta à posição inicial, vez das brancas.
    expect(response.status).toBe(200);
    expect(response.body.turn).toBe('white');
    expect(response.body.history).toEqual([]);
    expect(response.body.pieces).toHaveLength(32);
  });

  it('sem lances jogados, o takeback é um no-op', async () => {
    const app = createApp();
    const { body: game } = await createGame(app);

    const response = await request(app).post(`/games/${game.id}/takeback`);

    expect(response.status).toBe(200);
    expect(response.body.history).toEqual([]);
  });

  it('responde 404 em partida inexistente', async () => {
    const app = createApp();

    const response = await request(app).post('/games/nao-existe/takeback');

    expect(response.status).toBe(404);
  });
});
