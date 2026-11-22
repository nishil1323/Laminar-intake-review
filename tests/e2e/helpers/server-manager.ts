import { spawn, ChildProcess } from 'child_process';

export class ServerManager {
  private childProcess: ChildProcess | null = null;
  private spawnedByHarness = false;
  private cleanupRegistered = false;

  constructor(private baseUrl: string = 'http://localhost:3000') {}

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** Probes if server is already running and responsive */
  async isServerRunning(): Promise<boolean> {
    try {
      const probeUrl = new URL('/api/extract', this.baseUrl).toString();
      const res = await fetch(probeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'health-probe' }),
        signal: AbortSignal.timeout(1500),
      });
      // 200, 400, or 404 indicates an active HTTP server on the port
      return res.status >= 200 && res.status < 500;
    } catch {
      // Also try GET root in case /api/extract is not ready yet
      try {
        const rootUrl = new URL('/', this.baseUrl).toString();
        const res = await fetch(rootUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(1500),
        });
        return res.status >= 200 && res.status < 500;
      } catch {
        return false;
      }
    }
  }

  /** Ensures server is up: reuses existing or spawns new dev server */
  async ensureServer(maxWaitMs = 30000): Promise<{ baseUrl: string; shutdown: () => Promise<void> }> {
    const alreadyRunning = await this.isServerRunning();
    if (alreadyRunning) {
      console.log(`\x1b[36m[ServerManager]\x1b[0m Connected to existing server at ${this.baseUrl}`);
      return {
        baseUrl: this.baseUrl,
        shutdown: async () => {},
      };
    }

    console.log(`\x1b[33m[ServerManager]\x1b[0m No running server detected at ${this.baseUrl}. Spawning Next.js dev server...`);
    this.spawnedByHarness = true;

    // Extract port from baseUrl if specified
    let port = '3000';
    try {
      const parsed = new URL(this.baseUrl);
      if (parsed.port) {
        port = parsed.port;
      }
    } catch {}

    this.childProcess = spawn('npm', ['run', 'dev', '--', '-p', port], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: { ...process.env, PORT: port },
    });

    if (process.env.DEBUG_SERVER) {
      this.childProcess.stdout?.pipe(process.stdout);
      this.childProcess.stderr?.pipe(process.stderr);
    }

    if (!this.cleanupRegistered) {
      this.registerCleanupHooks();
      this.cleanupRegistered = true;
    }

    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(r => setTimeout(r, 600));
      if (await this.isServerRunning()) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\x1b[32m[ServerManager]\x1b[0m Next.js dev server is ready at ${this.baseUrl}! (${elapsed}s)`);
        return {
          baseUrl: this.baseUrl,
          shutdown: async () => this.terminateChild(),
        };
      }
    }

    await this.terminateChild();
    throw new Error(`[ServerManager] Timed out waiting for server to start after ${maxWaitMs / 1000}s`);
  }

  private registerCleanupHooks(): void {
    const cleanup = () => {
      this.terminateChild();
    };

    process.on('SIGINT', () => {
      cleanup();
      process.exit(130);
    });

    process.on('SIGTERM', () => {
      cleanup();
      process.exit(143);
    });

    process.on('exit', () => {
      cleanup();
    });

    process.on('uncaughtException', (err) => {
      console.error('\x1b[31m[Uncaught Exception]\x1b[0m', err);
      cleanup();
      process.exit(1);
    });
  }

  async terminateChild(): Promise<void> {
    if (this.childProcess && this.spawnedByHarness && this.childProcess.pid) {
      const pid = this.childProcess.pid;
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try {
          this.childProcess.kill('SIGTERM');
        } catch {}
      }
      this.childProcess = null;
      this.spawnedByHarness = false;
      // Brief pause to allow OS socket cleanup
      await new Promise(r => setTimeout(r, 200));
    }
  }
}
