'use client';

import React from 'react';
import { Draft } from '@/lib/types';
import StatusBadge from './StatusBadge';
import {
  ClipboardCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  Check,
  Loader2,
  FileQuestion,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export interface EditableFields {
  patientRef: string;
  requestType: string;
  callbackPreference: string;
}

export type EditableDraftFields = EditableFields;

export interface ReviewPanelProps {
  draft: Draft | null;
  fields: EditableFields;
  onFieldChange: (field: keyof EditableFields, value: string) => void;
  simulateTimeout: boolean;
  onSimulateTimeoutChange?: (enabled: boolean) => void;
  onToggleTimeout?: (enabled: boolean) => void;
  onApprove: () => void;
  onVerify: () => void;
  isSubmitting?: boolean;
  isLoading?: boolean;
  isVerifying?: boolean;
  validationErrors?: string[];
  serverErrors?: string[];
  extractorUsed?: 'gemini' | 'mock';
  className?: string;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  draft,
  fields,
  onFieldChange,
  simulateTimeout,
  onSimulateTimeoutChange,
  onToggleTimeout,
  onApprove,
  onVerify,
  isSubmitting = false,
  isLoading = false,
  isVerifying = false,
  validationErrors = [],
  serverErrors = [],
  extractorUsed,
  className = '',
}) => {
  const submitting = isSubmitting || isLoading;
  const handleTimeoutToggle = (checked: boolean) => {
    if (onSimulateTimeoutChange) {
      onSimulateTimeoutChange(checked);
    }
    if (onToggleTimeout) {
      onToggleTimeout(checked);
    }
  };

  const isPatientRefMissing = !fields.patientRef || fields.patientRef.trim() === '';
  const isRequestTypeMissing = !fields.requestType || fields.requestType.trim() === '';
  const isFormValid = !isPatientRefMissing && !isRequestTypeMissing;
  const isConfirmed = draft?.status === 'confirmed';
  const isAwaiting = draft?.status === 'awaiting_confirmation';

  if (!draft) {
    return (
      <section className={`bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center space-y-3 ${className}`}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-left">
            <div className="p-1.5 bg-slate-100 text-slate-500 rounded-lg">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                2. Review & Approve
              </h2>
              <p className="text-xs text-slate-500">
                Inspect extracted fields against original note before approval
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-400 font-medium">No Draft</span>
        </div>

        <div data-testid="review-empty-state" className="py-10 text-slate-400 space-y-2">
          <FileQuestion className="w-10 h-10 mx-auto text-slate-300" />
          <p className="text-sm font-medium text-slate-600">
            No draft extracted yet
          </p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Select or enter an intake note above and click <strong>Extract Draft</strong> to review fields side-by-side.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">
              2. Review & Approve
            </h2>
            <p className="text-xs text-slate-500">
              Stable submission ID: <span className="font-mono text-slate-700 font-medium">{draft.submissionId}</span>
            </p>
          </div>
        </div>
        <StatusBadge status={draft.status} size="md" />
      </div>

      {/* Side-by-Side Review Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Original Note */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Original Note (Verbatim)
            </span>
            <span className="text-[11px] text-slate-400 font-mono">read-only</span>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed min-h-[175px]">
            {draft.rawNote || '(Empty Note)'}
          </div>
        </div>

        {/* Right Column: Editable Extracted Fields */}
        <div className="space-y-3">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block">
            Extracted Fields (Editable)
          </span>

          {/* Field 1: Patient Ref */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="input-patient-ref"
                className="text-xs font-medium text-slate-700 flex items-center gap-1"
              >
                <span>Patient Reference</span>
                <span className="text-rose-500 font-bold">*</span>
              </label>
              {!isPatientRefMissing && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              )}
            </div>
            <input
              id="input-patient-ref"
              data-testid="input-patient-ref"
              type="text"
              value={fields.patientRef}
              onChange={(e) => onFieldChange('patientRef', e.target.value)}
              disabled={isConfirmed}
              placeholder="e.g. DEMO-101"
              className={`w-full rounded-md px-3 py-1.5 text-sm font-sans transition-colors ${
                isPatientRefMissing
                  ? 'border border-rose-300 bg-rose-50/40 text-rose-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-200'
                  : 'border border-slate-300 text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100'
              } disabled:bg-slate-50 disabled:text-slate-500`}
            />
            {isPatientRefMissing && (
              <p
                data-testid="warning-patient-ref"
                className="text-xs font-medium text-rose-600 flex items-center gap-1 pt-0.5"
              >
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>⚠️ Missing: Patient reference is required</span>
              </p>
            )}
          </div>

          {/* Field 2: Request Type */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="input-request-type"
                className="text-xs font-medium text-slate-700 flex items-center gap-1"
              >
                <span>Request Type</span>
                <span className="text-rose-500 font-bold">*</span>
              </label>
              {!isRequestTypeMissing && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              )}
            </div>
            <input
              id="input-request-type"
              data-testid="input-request-type"
              type="text"
              value={fields.requestType}
              onChange={(e) => onFieldChange('requestType', e.target.value)}
              disabled={isConfirmed}
              placeholder="e.g. callback, refill, transfer"
              className={`w-full rounded-md px-3 py-1.5 text-sm font-sans transition-colors ${
                isRequestTypeMissing
                  ? 'border border-rose-300 bg-rose-50/40 text-rose-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-200'
                  : 'border border-slate-300 text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100'
              } disabled:bg-slate-50 disabled:text-slate-500`}
            />
            {/* Quick request type pills */}
            {!isConfirmed && (
              <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-slate-500">
                <span>Quick:</span>
                {['callback', 'refill', 'transfer'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onFieldChange('requestType', type)}
                    className={`px-1.5 py-0.5 rounded border transition-colors ${
                      fields.requestType.toLowerCase() === type
                        ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
            {isRequestTypeMissing && (
              <p
                data-testid="warning-request-type"
                className="text-xs font-medium text-rose-600 flex items-center gap-1 pt-0.5"
              >
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>⚠️ Missing: Request type is required</span>
              </p>
            )}
          </div>

          {/* Field 3: Callback Preference */}
          <div className="space-y-1">
            <label
              htmlFor="input-callback-pref"
              className="text-xs font-medium text-slate-700 block"
            >
              Callback Preference <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              id="input-callback-pref"
              data-testid="input-callback-pref"
              type="text"
              value={fields.callbackPreference}
              onChange={(e) => onFieldChange('callbackPreference', e.target.value)}
              disabled={isConfirmed}
              placeholder="e.g. morning, after 3 p.m."
              className="w-full rounded-md px-3 py-1.5 text-sm font-sans border border-slate-300 text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Status Notice Banners */}
      {isAwaiting && (
        <div
          data-testid="awaiting-confirmation-alert"
          className="p-3.5 bg-orange-50/90 border border-orange-200 rounded-lg text-orange-900 space-y-1"
        >
          <div className="flex items-center gap-2 font-semibold text-sm text-orange-800">
            <Clock className="w-4 h-4 text-orange-600" />
            <span>🟠 Submission Awaiting Confirmation</span>
          </div>
          <p className="text-xs text-orange-700 leading-relaxed">
            The PMS received and saved this record, but the client response timed out. Click <strong>Verify PMS Status</strong> below to query the PMS and reconcile.
          </p>
        </div>
      )}

      {isConfirmed && (
        <div
          data-testid="confirmed-alert"
          className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 space-y-1"
        >
          <div className="flex items-center gap-2 font-semibold text-sm text-emerald-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>🟢 Submission Confirmed in PMS</span>
          </div>
          <p className="text-xs text-emerald-700">
            PMS Reference:{' '}
            <span
              data-testid="pms-reference-display"
              className="font-mono font-bold bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded text-emerald-800 text-xs"
            >
              {draft.pmsReference}
            </span>
          </p>
        </div>
      )}

      {/* Controls & Actions */}
      <div className="pt-3 border-t border-slate-100 space-y-3">
        {/* Simulate PMS Timeout Toggle */}
        <label
          htmlFor="simulate-timeout-toggle"
          className="inline-flex items-center gap-2.5 cursor-pointer text-xs select-none text-slate-700"
        >
          <input
            id="simulate-timeout-toggle"
            data-testid="simulate-timeout-checkbox"
            type="checkbox"
            checked={simulateTimeout}
            onChange={(e) => handleTimeoutToggle(e.target.checked)}
            disabled={isConfirmed || submitting || isVerifying}
            className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
          />
          <span className="font-medium text-slate-800">
            Simulate PMS timeout
          </span>
          <span className="text-slate-400">
            (saves in PMS but returns HTTP 202 awaiting_confirmation)
          </span>
        </label>

        {/* Buttons Row */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="approve-submit-btn"
            onClick={onApprove}
            disabled={!isFormValid || submitting || isConfirmed}
            className={`inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors ${
              !isFormValid || isConfirmed
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white'
            }`}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <span>Submitting to PMS...</span>
              </>
            ) : isConfirmed ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                <span>Approved & Confirmed</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                <span>Approve and Submit</span>
              </>
            )}
          </button>

          {/* Conditional Verify PMS Status Button */}
          {isAwaiting && (
            <button
              type="button"
              data-testid="verify-pms-btn"
              onClick={onVerify}
              disabled={isVerifying}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 shadow-sm transition-colors"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <span>Verifying with PMS...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  <span>Verify PMS Status</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default ReviewPanel;
