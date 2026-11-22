'use client';

import React from 'react';
import { FileEdit, Sparkles, Trash2, Loader2 } from 'lucide-react';
import SampleNoteButtons from './SampleNoteButtons';

export interface IntakePanelProps {
  noteText: string;
  onNoteChange: (text: string) => void;
  onExtract: () => void;
  onClear: () => void;
  isExtracting?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

export const IntakePanel: React.FC<IntakePanelProps> = ({
  noteText,
  onNoteChange,
  onExtract,
  onClear,
  isExtracting = false,
  isLoading = false,
  disabled = false,
  className = '',
}) => {
  const loading = isExtracting || isLoading;
  const hasText = noteText.trim().length > 0;

  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
            <FileEdit className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">
              1. Intake Note
            </h2>
            <p className="text-xs text-slate-500">
              Capture raw clinical or phone notes for deterministic extraction
            </p>
          </div>
        </div>
      </div>

      {/* Preset buttons */}
      <SampleNoteButtons
        onSelectSample={onNoteChange}
        disabled={disabled || loading}
      />

      {/* Textarea */}
      <div className="relative">
        <textarea
          data-testid="intake-note-textarea"
          value={noteText}
          onChange={(e) => onNoteChange(e.target.value)}
          disabled={disabled || loading}
          rows={4}
          placeholder="Enter or paste a pharmacy intake note here (or use one of the presets above)...&#10;Example: Patient DEMO-101 requests a callback. Best time is after 3 p.m."
          className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors font-sans resize-y min-h-[110px] disabled:bg-slate-50"
        />
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          data-testid="clear-note-btn"
          onClick={onClear}
          disabled={!hasText || loading || disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>

        <button
          type="button"
          data-testid="extract-draft-btn"
          onClick={onExtract}
          disabled={!hasText || loading || disabled}
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              <span>Extracting Draft...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              <span>Extract Draft</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
};

export default IntakePanel;
