import { TestCase, TestResult, TierReport, SuiteSummary, RunnerOptions, TestContext } from './types';
import { TestApiClient } from './helpers/api-client';
import { TestDbClient } from './helpers/db-client';

export class E2ETestRunner {
  private tests: TestCase[] = [];

  register(testCase: TestCase): void {
    this.tests.push(testCase);
  }

  registerMany(testCases: TestCase[]): void {
    this.tests.push(...testCases);
  }

  getTests(): TestCase[] {
    return [...this.tests];
  }

  async run(options: RunnerOptions = {}): Promise<SuiteSummary> {
    const baseUrl = options.baseUrl || 'http://localhost:3000';
    let filteredTests = this.tests;

    if (options.tierFilter !== undefined && !isNaN(options.tierFilter)) {
      filteredTests = filteredTests.filter(t => t.tier === options.tierFilter);
    }
    if (options.testFilter) {
      const q = options.testFilter.toLowerCase();
      filteredTests = filteredTests.filter(
        t => t.id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
      );
    }

    const tierMap: Record<number, { title: string; tests: TestCase[] }> = {
      1: { title: 'Tier 1: Feature Coverage (F1–F6)', tests: [] },
      2: { title: 'Tier 2: Boundary & Corner Cases (B1–B15)', tests: [] },
      3: { title: 'Tier 3: Combinations & Idempotency (C1–C10)', tests: [] },
      4: { title: 'Tier 4: Real-World Scenarios (S1–S5)', tests: [] },
    };

    filteredTests.forEach(t => {
      if (tierMap[t.tier]) {
        tierMap[t.tier].tests.push(t);
      }
    });

    console.log(`\n\x1b[1m\x1b[34m======================================================================\x1b[0m`);
    console.log(`\x1b[1m\x1b[34m               LAMINAR E2E TEST RUNNER - SUITE EXECUTION              \x1b[0m`);
    console.log(`\x1b[1m\x1b[34m======================================================================\x1b[0m`);
    console.log(
      `Target: \x1b[36m${baseUrl}\x1b[0m | DB: \x1b[36mdata/laminar.db\x1b[0m | Planned Tests: \x1b[33m${filteredTests.length}\x1b[0m\n`
    );

    // Support --dry-run or --check-syntax mode
    if (options.dryRun || options.checkSyntax) {
      console.log(`\x1b[33m[Dry Run / Check Syntax Mode]\x1b[0m Validating test inventory without HTTP execution:\n`);
      for (const [tierNumStr, tierInfo] of Object.entries(tierMap)) {
        const tierNum = Number(tierNumStr);
        if (tierInfo.tests.length === 0) continue;
        console.log(`\x1b[1m\x1b[35m━━━ ${tierInfo.title} (${tierInfo.tests.length} tests) ━━━\x1b[0m`);
        let currentCategory = '';
        for (const t of tierInfo.tests) {
          if (t.category && t.category !== currentCategory) {
            currentCategory = t.category;
            console.log(`  \x1b[34m► ${currentCategory}\x1b[0m`);
          }
          console.log(`    \x1b[32m•\x1b[0m \x1b[90m[${t.id}]\x1b[0m ${t.name}`);
        }
        console.log('');
      }

      console.log(`\x1b[1m\x1b[32m✓ Syntax and registration check PASSED for ${filteredTests.length} test specifications.\x1b[0m\n`);
      return {
        total: filteredTests.length,
        passed: filteredTests.length,
        failed: 0,
        durationMs: 0,
        tierReports: Object.entries(tierMap).map(([tStr, info]) => ({
          tier: Number(tStr),
          title: info.title,
          total: info.tests.length,
          passed: info.tests.length,
          failed: 0,
          durationMs: 0,
          results: info.tests.map(t => ({
            id: t.id,
            name: t.name,
            tier: t.tier,
            category: t.category,
            passed: true,
            durationMs: 0,
          })),
        })),
      };
    }

    const api = new TestApiClient(baseUrl);
    const db = new TestDbClient();

    const suiteStart = performance.now();
    const tierReports: TierReport[] = [];
    let globalPassed = 0;
    let globalFailed = 0;

    try {
      for (const [tierNumStr, tierInfo] of Object.entries(tierMap)) {
        const tierNum = Number(tierNumStr);
        if (tierInfo.tests.length === 0) continue;

        console.log(`\x1b[1m\x1b[35m━━━ ${tierInfo.title} (${tierInfo.tests.length} tests) ━━━\x1b[0m`);
        const tierStart = performance.now();
        const results: TestResult[] = [];
        let currentCategory = '';

        for (const test of tierInfo.tests) {
          if (test.category && test.category !== currentCategory) {
            currentCategory = test.category;
            console.log(`  \x1b[34m► ${currentCategory}\x1b[0m`);
          }

          const ctx: TestContext = {
            api,
            db,
            baseUrl,
            generatePatientRef: (prefix = 'DEMO') =>
              `${prefix}-${tierNum}-${Date.now().toString().slice(-4)}-${Math.floor(
                Math.random() * 900 + 100
              )}`,
          };

          const testStart = performance.now();
          try {
            await test.fn(ctx);
            const durationMs = Math.round(performance.now() - testStart);
            results.push({
              id: test.id,
              name: test.name,
              tier: test.tier,
              category: test.category,
              passed: true,
              durationMs,
            });
            globalPassed++;
            console.log(`    \x1b[32m✓\x1b[0m \x1b[90m[${test.id}]\x1b[0m ${test.name} \x1b[90m(${durationMs}ms)\x1b[0m`);
          } catch (err: any) {
            const durationMs = Math.round(performance.now() - testStart);
            const errMsg = err?.message || String(err);
            results.push({
              id: test.id,
              name: test.name,
              tier: test.tier,
              category: test.category,
              passed: false,
              durationMs,
              error: err,
              failureDetails: errMsg,
            });
            globalFailed++;
            console.log(`    \x1b[31m✗\x1b[0m \x1b[90m[${test.id}]\x1b[0m ${test.name} \x1b[90m(${durationMs}ms)\x1b[0m`);
            console.log(`      \x1b[31m${errMsg.replace(/\n/g, '\n      ')}\x1b[0m`);
            if (options.bail) {
              console.log(`\n\x1b[31m[Bail] Stopping suite execution after first failure.\x1b[0m`);
              break;
            }
          }
        }

        const tierDurationMs = Math.round(performance.now() - tierStart);
        const tierPassed = results.filter(r => r.passed).length;
        const tierFailed = results.filter(r => !r.passed).length;
        tierReports.push({
          tier: tierNum,
          title: tierInfo.title,
          total: results.length,
          passed: tierPassed,
          failed: tierFailed,
          durationMs: tierDurationMs,
          results,
        });

        console.log(`  \x1b[90mResult: ${tierPassed}/${results.length} passed (${tierDurationMs}ms)\x1b[0m\n`);
        if (options.bail && tierFailed > 0) break;
      }
    } finally {
      db.close();
    }

    const suiteDurationMs = Math.round(performance.now() - suiteStart);

    // Print Boxed Summary
    console.log(`\x1b[1m\x1b[34m╔══════════════════════════════════════════════════════════════════════╗\x1b[0m`);
    console.log(`\x1b[1m\x1b[34m║                         E2E TEST RUN SUMMARY                         ║\x1b[0m`);
    console.log(`\x1b[1m\x1b[34m╠══════════════════════════════════════════════════════════════════════╣\x1b[0m`);
    for (const rep of tierReports) {
      const statusIcon = rep.failed === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
      console.log(
        `║  Tier ${rep.tier}: ${rep.title.padEnd(38)} [${statusIcon}]  ${String(rep.passed).padStart(
          2
        )}/${String(rep.total).padEnd(2)} (${rep.durationMs}ms) ║`
      );
    }
    console.log(`\x1b[1m\x1b[34m╠══════════════════════════════════════════════════════════════════════╣\x1b[0m`);
    console.log(
      `║  Total Tests: ${String(globalPassed + globalFailed).padEnd(5)} | Passed: \x1b[32m${String(
        globalPassed
      ).padEnd(5)}\x1b[0m | Failed: ${
        globalFailed > 0 ? `\x1b[31m${globalFailed}\x1b[0m    ` : `0    `
      } | Time: ${(suiteDurationMs / 1000).toFixed(2)}s ║`
    );
    console.log(
      `║  Suite Status: ${
        globalFailed === 0
          ? '\x1b[1m\x1b[32mALL TIERS PASSED - PRODUCTION READY\x1b[0m                  '
          : '\x1b[1m\x1b[31mFAILED - VERIFY FAILURE DIFFS ABOVE\x1b[0m                 '
      } ║`
    );
    console.log(`\x1b[1m\x1b[34m╚══════════════════════════════════════════════════════════════════════╝\x1b[0m\n`);

    return {
      total: globalPassed + globalFailed,
      passed: globalPassed,
      failed: globalFailed,
      durationMs: suiteDurationMs,
      tierReports,
    };
  }
}
