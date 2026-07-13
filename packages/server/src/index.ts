import { createApp } from './app.js';
import { createAnalysisRuntime } from './analysis/runtime.js';

const PORT = Number(process.env.PORT ?? 3000);

async function start(): Promise<void> {
  const analysisJobs = await createAnalysisRuntime().catch((error: unknown) => {
    console.error('Stockfish analysis backend unavailable:', error);
    return null;
  });
  const app = createApp(analysisJobs ? { analysisJobs } : {});
  const server = app.listen(PORT, () => {
    console.log(`Zugzwang server listening on http://localhost:${PORT}`);
    console.log(
      analysisJobs
        ? `Analysis backend ready: ${analysisJobs.engine}`
        : 'Analysis backend disabled; web will use the lite engine fallback.',
    );
  });

  const shutdown = () => {
    const disposed = analysisJobs ? analysisJobs.dispose() : Promise.resolve();
    void disposed.finally(() => server.close());
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void start();
