import assert from 'node:assert/strict';
import { ApiResponse } from '../types';

export class Assertions {
  static assert(condition: boolean, message?: string): void {
    if (!condition) {
      throw new Error(message || 'Assertion failed: condition is false');
    }
  }

  static assertEq<T>(actual: T, expected: T, label?: string): void {
    try {
      assert.deepStrictEqual(actual, expected);
    } catch (e: any) {
      const msg = [
        `\x1b[31mAssertion Failed${label ? ` [${label}]` : ''}\x1b[0m:`,
        `  Expected: ${JSON.stringify(expected)}`,
        `  Actual:   ${JSON.stringify(actual)}`,
      ].join('\n');
      throw new Error(msg);
    }
  }

  static assertEqual<T>(actual: T, expected: T, label?: string): void {
    this.assertEq(actual, expected, label);
  }

  static assertDefined<T>(val: T | null | undefined, message?: string): asserts val is NonNullable<T> {
    if (val === null || val === undefined) {
      throw new Error(message || `Expected value to be defined and not null, but got: ${val}`);
    }
  }

  static assertNull(val: any, message?: string): void {
    if (val !== null && val !== undefined) {
      throw new Error(message || `Expected null or undefined, but got: ${JSON.stringify(val)}`);
    }
  }

  static assertStatus(res: ApiResponse<any>, expectedStatus: number | number[], context?: string): void {
    const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    if (!expected.includes(res.status)) {
      const msg = [
        `\x1b[31mHTTP Status Mismatch${context ? ` in [${context}]` : ''}\x1b[0m:`,
        `  Expected: ${expected.join(' or ')}`,
        `  Received: ${res.status}`,
        `  Body:     ${typeof res.body === 'object' ? JSON.stringify(res.body, null, 2) : res.rawText}`,
      ].join('\n');
      throw new Error(msg);
    }
  }

  static assertMatches(actual: string | null | undefined, pattern: RegExp, label?: string): void {
    if (actual === null || actual === undefined || !pattern.test(actual)) {
      throw new Error(`\x1b[31mRegex Mismatch${label ? ` [${label}]` : ''}\x1b[0m: "${actual}" does not match pattern ${pattern}`);
    }
  }

  static assertIncludes(actual: string | any[] | undefined | null, search: any, label?: string): void {
    if (actual === null || actual === undefined) {
      throw new Error(`\x1b[31mIncludes Check Failed${label ? ` [${label}]` : ''}\x1b[0m: Target is null/undefined`);
    }
    if (typeof actual === 'string') {
      if (!actual.includes(String(search))) {
        throw new Error(`\x1b[31mString Substring Missing${label ? ` [${label}]` : ''}\x1b[0m: "${actual}" does not include "${search}"`);
      }
    } else if (Array.isArray(actual)) {
      if (!actual.includes(search)) {
        throw new Error(`\x1b[31mArray Element Missing${label ? ` [${label}]` : ''}\x1b[0m: Array does not include ${JSON.stringify(search)}`);
      }
    }
  }

  static assertDbCount(actual: number, expected: number, context?: string): void {
    if (actual !== expected) {
      throw new Error(`\x1b[31mDatabase Row Count Mismatch${context ? ` [${context}]` : ''}\x1b[0m: Expected ${expected} rows, found ${actual}`);
    }
  }

  static async assertThrows(
    fn: () => any | Promise<any>,
    expectedError?: RegExp | string,
    message?: string
  ): Promise<void> {
    let threw = false;
    let thrownError: any = null;
    try {
      await fn();
    } catch (e: any) {
      threw = true;
      thrownError = e;
    }

    if (!threw) {
      throw new Error(message || 'Expected function to throw, but it succeeded without error');
    }

    if (expectedError) {
      const errStr = thrownError?.message || String(thrownError);
      if (typeof expectedError === 'string') {
        if (!errStr.includes(expectedError)) {
          throw new Error(`Expected error message to include "${expectedError}", but got: "${errStr}"`);
        }
      } else if (!expectedError.test(errStr)) {
        throw new Error(`Expected error message to match ${expectedError}, but got: "${errStr}"`);
      }
    }
  }
}

// Standalone functions with explicit assertion signatures for TypeScript narrowing
export function assertDefined<T>(val: T | null | undefined, message?: string): asserts val is NonNullable<T> {
  Assertions.assertDefined(val, message);
}

export function assertEq<T>(actual: T, expected: T, label?: string): void {
  Assertions.assertEq(actual, expected, label);
}

export function assertEqual<T>(actual: T, expected: T, label?: string): void {
  Assertions.assertEqual(actual, expected, label);
}

export function assertNull(val: any, message?: string): void {
  Assertions.assertNull(val, message);
}

export function assertStatus(res: ApiResponse<any>, expectedStatus: number | number[], context?: string): void {
  Assertions.assertStatus(res, expectedStatus, context);
}

export function assertMatches(actual: string | null | undefined, pattern: RegExp, label?: string): void {
  Assertions.assertMatches(actual, pattern, label);
}

export function assertIncludes(actual: string | any[] | undefined | null, search: any, label?: string): void {
  Assertions.assertIncludes(actual, search, label);
}

export function assertDbCount(actual: number, expected: number, context?: string): void {
  Assertions.assertDbCount(actual, expected, context);
}

export function assertThrows(
  fn: () => any | Promise<any>,
  expectedError?: RegExp | string,
  message?: string
): Promise<void> {
  return Assertions.assertThrows(fn, expectedError, message);
}
