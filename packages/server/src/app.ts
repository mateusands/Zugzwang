import express, { type Express, type Request, type Response } from 'express';

/**
 * Build the Express application.
 *
 * Kept separate from the server bootstrap (`index.ts`) so tests can exercise
 * the app in-process without binding to a port.
 */
export function createApp(): Express {
  const app = express();

  app.use(express.json());

  // Health check — confirms the service is up. No game logic yet.
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'zugzwang-server' });
  });

  return app;
}
