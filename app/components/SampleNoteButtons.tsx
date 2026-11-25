'use client';

import React from 'react';
import { FileText, AlertTriangle, FileImage } from 'lucide-react';

export interface SampleNoteButtonsProps {
  onSelectSample: (noteText: string) => void;
  onSelectSamplePrescription?: () => void;
  disabled?: boolean;
  className?: string;
}

export const SAMPLE_NOTE_1 =
  'Patient DEMO-101 requests a callback. Best time is after 3 p.m.';
export const SAMPLE_NOTE_2 =
  'Caller asks for a prescription refill for lisinopril. Prefers morning callback.';

export const SAMPLE_NOTES = {
  sample1: {
    title: 'Sample 1: Complete note',
    tag: 'DEMO-101 callback',
    text: SAMPLE_NOTE_1,
  },
  sample2: {
    title: 'Sample 2: Missing patient ref',
    tag: 'Missing DEMO ID',
    text: SAMPLE_NOTE_2,
  },
};

export const SampleNoteButtons: React.FC<SampleNoteButtonsProps> = ({
  onSelectSample,
  onSelectSamplePrescription,
  disabled = false,
  className = '',
}) => {
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${className}`}>
      <span className="text-slate-500 font-medium mr-1">Presets:</span>
      <button
        type="button"
        data-testid="sample-1-btn"
        disabled={disabled}
        onClick={() => onSelectSample(SAMPLE_NOTES.sample1.text)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        title="Loads a complete note with patient DEMO-101"
      >
        <FileText className="w-3.5 h-3.5 text-blue-600" />
        <span>{SAMPLE_NOTES.sample1.title}</span>
      </button>

      <button
        type="button"
        data-testid="sample-2-btn"
        disabled={disabled}
        onClick={() => onSelectSample(SAMPLE_NOTES.sample2.text)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-amber-900 bg-amber-50/90 border border-amber-300 hover:bg-amber-100 active:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        title="Loads an incomplete note without patient reference to test validation"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
        <span>{SAMPLE_NOTES.sample2.title}</span>
      </button>

      {onSelectSamplePrescription && (
        <button
          type="button"
          data-testid="sample-prescription-btn"
          disabled={disabled}
          onClick={onSelectSamplePrescription}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-purple-900 bg-purple-50 border border-purple-300 hover:bg-purple-100 active:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          title="Loads a sample prescription photo for instant AI visual extraction"
        >
          <FileImage className="w-3.5 h-3.5 text-purple-600" />
          <span>Sample 3: Prescription Photo</span>
        </button>
      )}
    </div>
  );
};

export default SampleNoteButtons;
