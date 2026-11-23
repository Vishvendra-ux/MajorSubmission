import { createApp, initializeBackendRuntime } from './app.js';
import { settings } from './config/index.js';

async function startServer() {
  await initializeBackendRuntime(true);
  const app = createApp();
  const host = process.env.HOST || '127.0.0.1';
  const port = settings.PORT;

  app.listen(port, host, () => {
    console.log(
      `[SUMIND-IQ] Node.js + Express.js backend running on http://${host}:${port} (env=${settings.APP_ENV})`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start SUMIND-IQ Node.js backend:', err);
  process.exit(1);
});
