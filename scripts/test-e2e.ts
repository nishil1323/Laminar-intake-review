#!/usr/bin/env tsx
import { ServerManager } from '../tests/e2e/helpers/server-manager';
import { E2ETestRunner } from '../tests/e2e/runner';
import { tier1Tests } from '../tests/e2e/tier1-features';
import { tier2Tests } from '../tests/e2e/tier2-boundaries';
import { tier3Tests } from '../tests/e2e/tier3-combinations';
import { tier4Tests } from '../tests/e2e/tier4-scenarios';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npx tsx scripts/test-e2e.ts [options]

Options:
  --tier <1|2|3|4>    Run tests exclusively for specified tier
  --filter <str>      Filter tests matching ID or title substring
  --bail              Stop execution immediately upon first failure
  --url <url>         Base URL of Next.js app (default: http://localhost:3000)
  --dry-run           Validate and print test specifications without HTTP calls
  --check-syntax      Validate TypeScript compilation and test registrations
  --help, -h          Show this help message
`);
    process.exit(0);
  }

  const tierArgIndex = args.indexOf('--tier');
  const tierFilter = tierArgIndex !== -1 ? parseInt(args[tierArgIndex + 1], 10) : undefined;
  const filterArgIndex = args.indexOf('--filter');
  const testFilter = filterArgIndex !== -1 ? args[filterArgIndex + 1] : undefined;
  const bail = args.includes('--bail');
  const dryRun = args.includes('--dry-run');
  const checkSyntax = args.includes('--check-syntax');
  const urlArgIndex = args.indexOf('--url');
  const baseUrl =
    (urlArgIndex !== -1 ? args[urlArgIndex + 1] : process.env.TEST_BASE_URL) || 'http://localhost:3000';

  const runner = new E2ETestRunner();
  runner.registerMany(tier1Tests);
  runner.registerMany(tier2Tests);
  runner.registerMany(tier3Tests);
  runner.registerMany(tier4Tests);

  if (dryRun || checkSyntax) {
    const summary = await runner.run({
      baseUrl,
      tierFilter,
      testFilter,
      dryRun: true,
      checkSyntax: true,
    });
    process.exit(summary.failed > 0 ? 1 : 0);
  }

  const serverManager = new ServerManager(baseUrl);
  let serverHandle: { shutdown: () => Promise<void> } | null = null;

  try {
    serverHandle = await serverManager.ensureServer();

    const summary = await runner.run({
      baseUrl,
      tierFilter,
      testFilter,
      bail,
    });

    process.exit(summary.failed > 0 ? 1 : 0);
  } catch (err: any) {
    console.error(`\x1b[31m[Harness Fatal Error]\x1b[0m`, err?.message || err);
    process.exit(1);
  } finally {
    if (serverHandle) {
      await serverHandle.shutdown();
    }
  }
}

main();
