'use client';

import React from 'react';
import { DraftStatus } from '@/lib/types';
import { Clock, CheckCircle2, FileEdit } from 'lucide-react';

export interface StatusBadgeProps {
  status: DraftStatus;
  size?: 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<
  DraftStatus,
  {
    label: string;
    containerClass: string;
    dotClass: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  draft: {
    label: 'Draft',
    containerClass: 'bg-amber-50 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-400',
    icon: FileEdit,
  },
  awaiting_confirmation: {
    label: 'Awaiting Confirmation',
    containerClass: 'bg-orange-50 text-orange-800 border-orange-200',
    dotClass: 'bg-orange-500 animate-pulse',
    icon: Clock,
  },
  confirmed: {
    label: 'Confirmed',
    containerClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-500',
    icon: CheckCircle2,
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showDot = true,
  className = '',
}) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const IconComponent = config.icon;

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs'
      : 'px-2.5 py-1 text-xs font-semibold';

  return (
    <span
      role="status"
      data-testid="status-badge"
      data-status={status}
      aria-label={`Status: ${config.label}`}
      className={`inline-flex items-center rounded-full border font-medium ${config.containerClass} ${sizeClasses} ${className}`}
    >
      {showDot && (
        <span className="relative flex h-2 w-2 mr-1.5 flex-shrink-0">
          {status === 'awaiting_confirmation' && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${config.dotClass}`}
          />
        </span>
      )}
      <IconComponent className="w-3.5 h-3.5 mr-1 flex-shrink-0 opacity-80" />
      <span>{config.label}</span>
    </span>
  );
};

export default StatusBadge;
