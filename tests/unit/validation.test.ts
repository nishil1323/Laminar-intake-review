import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateDraftApproval } from '../../lib/validation';

describe('Draft Approval Validation', () => {
  it('passes validation when both patientRef and requestType are provided', () => {
    const validData = {
      patientRef: 'DEMO-101',
      requestType: 'callback',
    };
    const result = validateDraftApproval(validData);

    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('passes validation when optional callbackPreference is present or null', () => {
    const validWithCallback = {
      patientRef: 'DEMO-101',
      requestType: 'refill',
      callbackPreference: 'after 3 p.m.',
    };
    const result1 = validateDraftApproval(validWithCallback);
    assert.strictEqual(result1.valid, true);
    assert.deepStrictEqual(result1.errors, []);

    const validWithoutCallback = {
      patientRef: 'DEMO-101',
      requestType: 'transfer',
      callbackPreference: null,
    };
    const result2 = validateDraftApproval(validWithoutCallback);
    assert.strictEqual(result2.valid, true);
    assert.deepStrictEqual(result2.errors, []);
  });

  it('fails validation when patientRef is missing or null', () => {
    const data = {
      patientRef: null,
      requestType: 'refill',
    };
    const result = validateDraftApproval(data);

    assert.strictEqual(result.valid, false);
    assert.deepStrictEqual(result.errors, ['Patient reference is required']);
  });

  it('fails validation when requestType is missing or null', () => {
    const data = {
      patientRef: 'DEMO-102',
      requestType: null,
    };
    const result = validateDraftApproval(data);

    assert.strictEqual(result.valid, false);
    assert.deepStrictEqual(result.errors, ['Request type is required']);
  });

  it('rejects whitespace-only strings for required fields', () => {
    const whitespaceData = {
      patientRef: '   ',
      requestType: '\t \n',
    };
    const result = validateDraftApproval(whitespaceData);

    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length, 2);
    assert.ok(result.errors.includes('Patient reference is required'));
    assert.ok(result.errors.includes('Request type is required'));
  });

  it('rejects empty input object', () => {
    const result = validateDraftApproval({});

    assert.strictEqual(result.valid, false);
    assert.deepStrictEqual(result.errors, [
      'Patient reference is required',
      'Request type is required',
    ]);
  });

  it('safely handles null, undefined, and non-object inputs without throwing', () => {
    const nullResult = validateDraftApproval(null);
    assert.strictEqual(nullResult.valid, false);
    assert.deepStrictEqual(nullResult.errors, [
      'Patient reference is required',
      'Request type is required',
    ]);

    const undefinedResult = validateDraftApproval(undefined);
    assert.strictEqual(undefinedResult.valid, false);
    assert.deepStrictEqual(undefinedResult.errors, [
      'Patient reference is required',
      'Request type is required',
    ]);

    const omittedResult = validateDraftApproval();
    assert.strictEqual(omittedResult.valid, false);
    assert.deepStrictEqual(omittedResult.errors, [
      'Patient reference is required',
      'Request type is required',
    ]);

    // @ts-expect-error testing primitive input
    const numberResult = validateDraftApproval(12345);
    assert.strictEqual(numberResult.valid, false);
    assert.deepStrictEqual(numberResult.errors, [
      'Patient reference is required',
      'Request type is required',
    ]);
  });

  it('safely handles non-string inputs for patientRef and requestType without throwing', () => {
    // @ts-expect-error testing number input
    const numResult = validateDraftApproval({ patientRef: 123, requestType: 456 });
    assert.strictEqual(numResult.valid, false);
    assert.deepStrictEqual(numResult.errors, [
      'Patient reference is required',
      'Request type is required',
    ]);

    // @ts-expect-error testing boolean and array input
    const objResult = validateDraftApproval({ patientRef: true, requestType: ['refill'] });
    assert.strictEqual(objResult.valid, false);
    assert.strictEqual(objResult.errors.length, 2);
    assert.ok(objResult.errors.includes('Patient reference is required'));
    assert.ok(objResult.errors.includes('Request type is required'));

    // Partial non-string input
    // @ts-expect-error testing mixed input
    const mixedResult = validateDraftApproval({ patientRef: 'DEMO-101', requestType: 999 });
    assert.strictEqual(mixedResult.valid, false);
    assert.deepStrictEqual(mixedResult.errors, ['Request type is required']);
  });
});
