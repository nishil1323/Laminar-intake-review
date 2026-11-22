'use client';

import React from 'react';
import { LaminarProfileEntry } from '@/lib/types';
import StatusBadge from './StatusBadge';
import {
  Building2,
  RotateCcw,
  Inbox,
  User,
  Calendar,
} from 'lucide-react';

export interface LaminarProfileProps {
  patientRef: string | null;
  entries: LaminarProfileEntry[];
  isLoading: boolean;
  onRefresh?: () => void;
  className?: string;
}

export const LaminarProfile: React.FC<LaminarProfileProps> = ({
  patientRef,
  entries,
  isLoading,
  onRefresh,
  className = '',
}) => {
  const displayPatient = patientRef && patientRef.trim() ? patientRef.trim() : null;

  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-teal-50 text-teal-600 rounded-lg">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
              <span>🏥 Patient Profile:</span>
              <span className="font-mono text-teal-700 font-extrabold">
                {displayPatient ? displayPatient : '(No Patient Selected)'}
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Parallel Laminar Clinical Record Store
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            type="button"
            data-testid="refresh-profile-btn"
            onClick={onRefresh}
            disabled={!displayPatient || isLoading}
            title="Refresh clinical profile"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Content Area */}
      {!displayPatient ? (
        <div
          data-testid="laminar-no-patient"
          className="py-12 text-center text-slate-400 space-y-2 border-2 border-dashed border-slate-200 rounded-lg"
        >
          <User className="w-8 h-8 mx-auto text-slate-300" />
          <p className="text-sm font-medium text-slate-600">
            No patient selected
          </p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Extract an intake note or enter a patient reference to view existing clinical submissions.
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div
          data-testid="laminar-empty-state"
          className="py-12 text-center text-slate-400 space-y-2 border-2 border-dashed border-slate-200 rounded-lg"
        >
          <Inbox className="w-8 h-8 mx-auto text-slate-300" />
          <p className="text-sm font-medium text-slate-600">
            No entries yet
          </p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            No entries yet. Extract and approve a note for <strong>{displayPatient}</strong> to populate this profile.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              Total records: <strong>{entries.length}</strong>
            </span>
            <span>Sorted newest first</span>
          </div>

          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.draftId || entry.submissionId}
                data-testid="profile-entry-card"
                className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/60 hover:bg-slate-50 transition-colors shadow-xs space-y-2"
              >
                {/* Card Top: Submission ID & Status Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">
                      Submission ID
                    </span>
                    <span className="font-mono text-xs text-slate-700 truncate block">
                      {entry.submissionId}
                    </span>
                  </div>
                  <StatusBadge status={entry.status} size="sm" />
                </div>

                {/* Card Body: Request Type & Callback */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60">
                  <div>
                    <span className="text-slate-500 block">Request Type:</span>
                    <span className="font-semibold text-slate-800 capitalize">
                      {entry.requestType || 'None'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Callback Pref:</span>
                    <span className="text-slate-700">
                      {entry.callbackPreference || 'None'}
                    </span>
                  </div>
                </div>

                {/* Card Footer: PMS Ref & Timestamp */}
                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                  <div>
                    {entry.pmsReference ? (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500 text-[11px]">PMS Ref:</span>
                        <span
                          data-testid="pms-reference-badge"
                          className="font-mono font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded text-[11px]"
                        >
                          {entry.pmsReference}
                        </span>
                      </div>
                    ) : (
                      <span className="text-orange-600 italic text-[11px]">
                        Pending verification...
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{entry.updatedAt ? new Date(entry.updatedAt).toLocaleTimeString() : 'Just now'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default LaminarProfile;
