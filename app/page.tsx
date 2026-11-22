'use client';

import React, { useState, useMemo } from 'react';
import {
  Draft,
  ExtractedData,
  LaminarProfileEntry,
  LaminarProfileResponse,
} from '@/lib/types';
import { validateDraftApproval } from '@/lib/validation';
import IntakePanel from './components/IntakePanel';
import ReviewPanel, { EditableFields } from './components/ReviewPanel';
import LaminarProfile from './components/LaminarProfile';
import {
  Activity,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Info,
  XCircle,
  X,
  Sparkles,
} from 'lucide-react';

interface AlertState {
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  details?: string[];
}

export default function HomePage() {
  // State slices
  const [noteText, setNoteText] = useState<string>('');
  const [currentDraft, setCurrentDraft] = useState<Draft | null>(null);
  const [editableFields, setEditableFields] = useState<EditableFields>({
    patientRef: '',
    requestType: '',
    callbackPreference: '',
  });
  const [simulateTimeout, setSimulateTimeout] = useState<boolean>(false);
  const [activePatientRef, setActivePatientRef] = useState<string | null>(null);
  const [laminarEntries, setLaminarEntries] = useState<LaminarProfileEntry[]>([]);
  const [extractorUsed, setExtractorUsed] = useState<'gemini' | 'mock' | undefined>(undefined);

  // Loading states
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isProfileLoading, setIsProfileLoading] = useState<boolean>(false);

  // User notification / alert banner
  const [alert, setAlert] = useState<AlertState | null>(null);

  // Derived validation
  const validationResult = useMemo(() => {
    return validateDraftApproval({
      patientRef: editableFields.patientRef,
      requestType: editableFields.requestType,
    });
  }, [editableFields.patientRef, editableFields.requestType]);

  // Fetch Laminar Profile for a patient reference
  const fetchLaminarProfile = async (patientRef: string) => {
    const trimmed = patientRef?.trim();
    if (!trimmed) {
      setLaminarEntries([]);
      return;
    }

    setIsProfileLoading(true);
    try {
      const res = await fetch(`/api/laminar/${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data: LaminarProfileResponse = await res.json();
        setLaminarEntries(data.entries || []);
      } else {
        setLaminarEntries([]);
      }
    } catch (err) {
      console.error('Failed to fetch laminar profile:', err);
    } finally {
      setIsProfileLoading(false);
    }
  };

  // Handler: Extract Draft (Step 1: Extract, Step 2: Create Draft)
  const handleExtractDraft = async () => {
    const trimmedNote = noteText.trim();
    if (!trimmedNote) {
      setAlert({
        type: 'warning',
        message: 'Please enter an intake note or select a sample preset first.',
      });
      return;
    }

    setIsExtracting(true);
    setAlert(null);

    try {
      // 1. Call POST /api/extract
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: trimmedNote }),
      });

      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({ error: 'Failed to extract note' }));
        setAlert({
          type: 'error',
          message: err.error || 'Failed to extract note fields.',
        });
        return;
      }

      const extractedData: ExtractedData & { extractorUsed?: 'gemini' | 'mock' } = await extractRes.json();
      setExtractorUsed(extractedData.extractorUsed || 'mock');

      // 2. Call POST /api/drafts
      const draftRes = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extractedData),
      });

      if (!draftRes.ok) {
        const err = await draftRes.json().catch(() => ({ error: 'Failed to save draft' }));
        setAlert({
          type: 'error',
          message: err.error || 'Failed to persist extracted draft.',
        });
        return;
      }

      const createdDraft: Draft = await draftRes.json();
      setCurrentDraft(createdDraft);
      setEditableFields({
        patientRef: createdDraft.patientRef ?? '',
        requestType: createdDraft.requestType ?? '',
        callbackPreference: createdDraft.callbackPreference ?? '',
      });

      const targetPatient = createdDraft.patientRef?.trim() || null;
      setActivePatientRef(targetPatient);
      if (targetPatient) {
        await fetchLaminarProfile(targetPatient);
      } else {
        setLaminarEntries([]);
      }

      setAlert({
        type: 'info',
        message: 'Draft extracted successfully. Review and edit fields before approving.',
      });
    } catch (err) {
      console.error('Extraction error:', err);
      setAlert({
        type: 'error',
        message: 'An unexpected error occurred during extraction.',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  // Handler: Field change in Review Panel
  const handleFieldChange = (field: keyof EditableFields, value: string) => {
    setEditableFields((prev) => ({ ...prev, [field]: value }));

    if (field === 'patientRef') {
      const trimmed = value.trim();
      if (trimmed) {
        setActivePatientRef(trimmed);
        fetchLaminarProfile(trimmed);
      } else {
        setActivePatientRef(null);
        setLaminarEntries([]);
      }
    }
  };

  // Handler: Approve and Submit to PMS
  const handleApprove = async () => {
    if (!currentDraft || isApproving) return;

    if (!validationResult.valid) {
      setAlert({
        type: 'error',
        message: 'Please resolve required field validation errors before approval.',
        details: validationResult.errors,
      });
      return;
    }

    setIsApproving(true);
    setAlert(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (simulateTimeout) {
        headers['X-Simulate-Timeout'] = 'true';
      }

      const payload = {
        patientRef: editableFields.patientRef.trim(),
        requestType: editableFields.requestType.trim(),
        callbackPreference: editableFields.callbackPreference.trim() || null,
        simulateTimeout,
      };

      const res = await fetch(`/api/drafts/${currentDraft.id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.status === 200) {
        const data = await res.json();
        const updatedDraft: Draft = data.draft;
        setCurrentDraft(updatedDraft);

        if (updatedDraft.patientRef) {
          setActivePatientRef(updatedDraft.patientRef);
          await fetchLaminarProfile(updatedDraft.patientRef);
        }

        setAlert({
          type: 'success',
          message: `Approved and confirmed by PMS! Reference: ${updatedDraft.pmsReference}`,
        });
      } else if (res.status === 202) {
        const data = await res.json();
        const updatedDraft: Draft = data.draft;
        setCurrentDraft(updatedDraft);

        if (updatedDraft.patientRef) {
          setActivePatientRef(updatedDraft.patientRef);
          await fetchLaminarProfile(updatedDraft.patientRef);
        }

        setAlert({
          type: 'warning',
          message:
            'PMS submission timed out (simulated). Saved in PMS but unconfirmed on client. Click "Verify PMS Status" to reconcile.',
        });
      } else if (res.status === 400) {
        const errData = await res.json().catch(() => ({ errors: ['Validation failed'] }));
        setAlert({
          type: 'error',
          message: 'Approval rejected by server validation.',
          details: errData.errors || [errData.error],
        });
      } else {
        const errData = await res.json().catch(() => ({ error: 'Approval failed' }));
        setAlert({
          type: 'error',
          message: errData.error || 'Failed to approve draft.',
        });
      }
    } catch (err) {
      console.error('Approval error:', err);
      setAlert({
        type: 'error',
        message: 'An unexpected error occurred during draft approval.',
      });
    } finally {
      setIsApproving(false);
    }
  };

  // Handler: Verify PMS Status
  const handleVerify = async () => {
    if (!currentDraft || isVerifying) return;

    setIsVerifying(true);
    setAlert(null);

    try {
      const res = await fetch(`/api/drafts/${currentDraft.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.verified && data.draft) {
          const confirmedDraft: Draft = data.draft;
          setCurrentDraft(confirmedDraft);

          if (confirmedDraft.patientRef) {
            setActivePatientRef(confirmedDraft.patientRef);
            await fetchLaminarProfile(confirmedDraft.patientRef);
          }

          setAlert({
            type: 'success',
            message: `PMS status reconciled successfully! Confirmed Reference: ${confirmedDraft.pmsReference}`,
          });
        } else {
          setAlert({
            type: 'warning',
            message: 'No PMS record found yet for this submission ID.',
          });
        }
      } else {
        const err = await res.json().catch(() => ({ error: 'Verification failed' }));
        setAlert({
          type: 'error',
          message: err.error || 'Failed to verify PMS status.',
        });
      }
    } catch (err) {
      console.error('Verify error:', err);
      setAlert({
        type: 'error',
        message: 'An unexpected error occurred during PMS verification.',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Handler: Reset Demo
  const handleResetDemo = () => {
    setNoteText('');
    setCurrentDraft(null);
    setEditableFields({
      patientRef: '',
      requestType: '',
      callbackPreference: '',
    });
    setSimulateTimeout(false);
    setActivePatientRef(null);
    setLaminarEntries([]);
    setExtractorUsed(undefined);
    setAlert(null);
    setIsExtracting(false);
    setIsApproving(false);
    setIsVerifying(false);
    setIsProfileLoading(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-lg shadow-sm">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  Laminar Intake Review
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  Zeenovo Health Practical Demo
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Clinical Note Intake • Deterministic Extraction • Side-by-Side Review • PMS Idempotency
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="reset-demo-btn"
              onClick={handleResetDemo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg border border-slate-200 transition-colors shadow-xs"
              title="Reset all fields, draft, and profile state"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset Demo</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* User Alert / Notification Banner */}
        {alert && (
          <div
            data-testid="alert-banner"
            role="alert"
            className={`p-4 rounded-xl border flex items-start justify-between shadow-xs transition-all ${
              alert.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : alert.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : alert.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0">
                {alert.type === 'success' && (
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                )}
                {alert.type === 'warning' && (
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                )}
                {alert.type === 'error' && (
                  <XCircle className="w-5 h-5 text-rose-600" />
                )}
                {alert.type === 'info' && (
                  <Info className="w-5 h-5 text-blue-600" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">{alert.message}</p>
                {alert.details && alert.details.length > 0 && (
                  <ul className="list-disc list-inside text-xs space-y-0.5 opacity-90">
                    {alert.details.map((detail, idx) => (
                      <li key={idx}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAlert(null)}
              className="p-1 rounded-md hover:bg-black/5 text-slate-500 hover:text-slate-800 transition-colors"
              aria-label="Dismiss alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Two-Column Responsive Dashboard Layout (60% Left, 40% Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Intake and Review Panels (approx 60%) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Panel 1: Intake Panel */}
            <IntakePanel
              noteText={noteText}
              onNoteChange={setNoteText}
              onExtract={handleExtractDraft}
              onClear={() => {
                setNoteText('');
                setAlert(null);
              }}
              isExtracting={isExtracting}
            />

            {/* Panel 2: Review and Approve Panel */}
            <ReviewPanel
              draft={currentDraft}
              fields={editableFields}
              onFieldChange={handleFieldChange}
              simulateTimeout={simulateTimeout}
              onSimulateTimeoutChange={setSimulateTimeout}
              onApprove={handleApprove}
              onVerify={handleVerify}
              isSubmitting={isApproving}
              isVerifying={isVerifying}
              validationErrors={validationResult.errors}
              extractorUsed={extractorUsed}
            />
          </div>

          {/* Right Column: Laminar Patient Profile (approx 40%) */}
          <div className="lg:col-span-5">
            <div className="sticky top-22">
              <LaminarProfile
                patientRef={activePatientRef}
                entries={laminarEntries}
                isLoading={isProfileLoading}
                onRefresh={() => {
                  if (activePatientRef) {
                    fetchLaminarProfile(activePatientRef);
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
