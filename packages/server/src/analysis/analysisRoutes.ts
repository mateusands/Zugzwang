import type { Express, Request, RequestHandler, Response } from 'express';
import {
  parseAnalysisJobRequest,
  type AnalysisJobRequest,
  type AnalysisJobSnapshot,
} from '@zugzwang/analysis';

export interface AnalysisJobs {
  readonly engine: string;
  submit(request: AnalysisJobRequest): Promise<AnalysisJobSnapshot>;
  get(id: string): Promise<AnalysisJobSnapshot | null>;
  cancel(id: string): Promise<AnalysisJobSnapshot | null>;
  subscribe(id: string, listener: (snapshot: AnalysisJobSnapshot) => void): () => void;
}

function sendEvent(res: Response, snapshot: AnalysisJobSnapshot): void {
  res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
}

function isTerminal(snapshot: AnalysisJobSnapshot): boolean {
  return ['completed', 'failed', 'cancelled'].includes(snapshot.status);
}

function safely(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res) => {
    void handler(req, res).catch(() => {
      if (res.headersSent) {
        res.end();
        return;
      }
      res.status(503).json({ error: 'analysis backend unavailable' });
    });
  };
}

export function registerAnalysisRoutes(app: Express, jobs: AnalysisJobs): void {
  app.post(
    '/analysis/jobs',
    safely(async (req: Request, res: Response) => {
      const parsed = parseAnalysisJobRequest(req.body);
      if (!parsed) {
        res.status(400).json({ error: 'invalid analysis job' });
        return;
      }
      const snapshot = await jobs.submit(parsed);
      res.status(202).json(snapshot);
    }),
  );

  app.get(
    '/analysis/jobs/:id',
    safely(async (req: Request, res: Response) => {
      const snapshot = req.params.id ? await jobs.get(req.params.id) : null;
      if (!snapshot) {
        res.status(404).json({ error: 'analysis job not found' });
        return;
      }
      res.json(snapshot);
    }),
  );

  app.delete(
    '/analysis/jobs/:id',
    safely(async (req: Request, res: Response) => {
      const snapshot = req.params.id ? await jobs.cancel(req.params.id) : null;
      if (!snapshot) {
        res.status(404).json({ error: 'analysis job not found' });
        return;
      }
      res.json(snapshot);
    }),
  );

  app.get(
    '/analysis/jobs/:id/events',
    safely(async (req: Request, res: Response) => {
      const id = req.params.id;
      const initial = id ? await jobs.get(id) : null;
      if (!id || !initial) {
        res.status(404).json({ error: 'analysis job not found' });
        return;
      }
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      sendEvent(res, initial);
      if (isTerminal(initial)) {
        res.end();
        return;
      }
      const unsubscribe = jobs.subscribe(id, (snapshot) => {
        sendEvent(res, snapshot);
        if (isTerminal(snapshot)) {
          unsubscribe();
          res.end();
        }
      });
      req.on('close', unsubscribe);
    }),
  );
}
