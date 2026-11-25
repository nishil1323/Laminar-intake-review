import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractFromNote,
  extractPatientRef,
  extractRequestType,
  extractCallbackPref,
} from '../../lib/mock-agent';

describe('Mock Agent Extraction', () => {
  it('correctly extracts Sample 1 (complete note)', () => {
    const note = 'Patient DEMO-101 requests a callback. Best time is after 3 p.m.';
    const result = extractFromNote(note);

    assert.strictEqual(result.patientRef, 'DEMO-101');
    assert.strictEqual(result.requestType, 'callback');
    assert.strictEqual(result.callbackPreference, 'after 3 p.m.');
    assert.strictEqual(result.rawNote, note);
  });

  it('correctly extracts Sample 2 (missing patient reference, refill precedence)', () => {
    const note = 'Caller asks for a prescription refill for lisinopril. Prefers morning callback.';
    const result = extractFromNote(note);

    assert.strictEqual(result.patientRef, null);
    assert.strictEqual(result.requestType, 'refill');
    assert.strictEqual(result.callbackPreference, 'morning');
    assert.strictEqual(result.rawNote, note);
  });

  it('handles lowercase patterns and normalizes patientRef', () => {
    const note = 'patient demo-202 requests a transfer. best time is after 5 p.m.';
    const result = extractFromNote(note);

    assert.strictEqual(result.patientRef, 'DEMO-202');
    assert.strictEqual(result.requestType, 'transfer');
    assert.strictEqual(result.callbackPreference, 'after 5 p.m.');
  });

  it('handles empty, null, and non-string inputs safely', () => {
    // @ts-expect-error testing invalid input
    assert.strictEqual(extractPatientRef(null), null);
    // @ts-expect-error testing invalid input
    assert.strictEqual(extractRequestType(undefined), null);
    // @ts-expect-error testing invalid input
    assert.strictEqual(extractCallbackPref(123), null);
    assert.strictEqual(extractCallbackPref(''), null);

    const emptyResult = extractFromNote('');
    assert.deepStrictEqual(emptyResult, {
      patientRef: null,
      requestType: null,
      callbackPreference: null,
      rawNote: '',
    });
  });

  it('handles punctuation and formatting edge cases for callback preferences', () => {
    // Preserves periods in a.m.
    const note1 = 'Patient PT-1 requests callback. Best time is before 11:30 a.m.';
    assert.strictEqual(extractCallbackPref(note1), 'before 11:30 a.m.');

    // Strips trailing 'callback' word
    const note2 = 'Caller wants a refill. Prefers afternoon callback.';
    assert.strictEqual(extractCallbackPref(note2), 'afternoon');

    // Notes with colon delimiter
    const note3 = 'Patient PT-2. Preferred: evening.';
    assert.strictEqual(extractCallbackPref(note3), 'evening');

    // Note without callback preference
    const note4 = 'Patient PT-3 requests a refill immediately.';
    assert.strictEqual(extractCallbackPref(note4), null);
  });

  it('prioritizes refill and transfer over callback when both keywords appear', () => {
    const refillNote = 'Prescription refill needed. Patient requested a callback.';
    assert.strictEqual(extractRequestType(refillNote), 'refill');

    const transferNote = 'Prescription transfer request. Please callback.';
    assert.strictEqual(extractRequestType(transferNote), 'transfer');
  });

  it('correctly extracts "Preferred time:" without capturing "time:" label', () => {
    const note1 = 'Patient PT-4. Preferred time: morning.';
    assert.strictEqual(extractCallbackPref(note1), 'morning');

    const note2 = 'Preferred time: morning';
    assert.strictEqual(extractCallbackPref(note2), 'morning');

    const note3 = 'Caller requests callback. Preferred time is after 4 p.m.';
    assert.strictEqual(extractCallbackPref(note3), 'after 4 p.m.');

    const note4 = 'Patient PT-5. preferred time: afternoon callback.';
    assert.strictEqual(extractCallbackPref(note4), 'afternoon');
  });

  it('correctly handles casual receptionist notes and misspellings', () => {
    // Case 1: "Patnt bittu wants callback at 3 evening"
    const case1 = extractFromNote('Patnt bittu wants callback at 3 evening');
    assert.strictEqual(case1.patientRef, 'bittu');
    assert.strictEqual(case1.requestType, 'callback');
    assert.strictEqual(case1.callbackPreference, '3 PM');

    // Case 2: "I needs callback at 3" (first person pronoun has no patient name)
    const case2 = extractFromNote('I needs callback at 3');
    assert.strictEqual(case2.patientRef, null);
    assert.strictEqual(case2.requestType, 'callback');
    assert.strictEqual(case2.callbackPreference, '3');

    // Case 3: "Nishil needs callback at 3"
    const case3 = extractFromNote('Nishil needs callback at 3');
    assert.strictEqual(case3.patientRef, 'Nishil');
    assert.strictEqual(case3.requestType, 'callback');
    assert.strictEqual(case3.callbackPreference, '3');
  });
});
