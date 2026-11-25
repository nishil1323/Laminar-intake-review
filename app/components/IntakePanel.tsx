'use client';

import React, { useRef, useState } from 'react';
import {
  FileEdit,
  Sparkles,
  Trash2,
  Loader2,
  Camera,
  Upload,
  Image as ImageIcon,
  X,
  Maximize2,
} from 'lucide-react';
import SampleNoteButtons from './SampleNoteButtons';
import CameraCaptureModal from './CameraCaptureModal';

export interface AttachedImage {
  data: string; // base64 without prefix or with prefix
  mimeType: string;
  previewUrl: string;
  fileName?: string;
  fileSize?: string;
}

export interface IntakePanelProps {
  noteText: string;
  onNoteChange: (text: string) => void;
  attachedImage?: AttachedImage | null;
  onImageChange?: (image: AttachedImage | null) => void;
  onSelectSamplePrescription?: () => void;
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
  attachedImage = null,
  onImageChange,
  onSelectSamplePrescription,
  onExtract,
  onClear,
  isExtracting = false,
  isLoading = false,
  disabled = false,
  className = '',
}) => {
  const loading = isExtracting || isLoading;
  const hasText = noteText.trim().length > 0;
  const hasImage = Boolean(attachedImage);
  const canExtract = hasText || hasImage;

  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [isEnlargedOpen, setIsEnlargedOpen] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Handle file chosen from disk
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mimeType = file.type || 'image/jpeg';
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const data = result.includes('base64,') ? result.split('base64,')[1] : result;
      const sizeKb = Math.round(file.size / 1024);

      if (onImageChange) {
        onImageChange({
          data,
          mimeType,
          previewUrl: result,
          fileName: file.name,
          fileSize: `${sizeKb} KB`,
        });
      }
      onNoteChange('');
    };
    reader.readAsDataURL(file);
    // Reset file input so re-selecting same file triggers change
    e.target.value = '';
  };

  // Open native camera or live webcam modal
  const handleOpenCamera = () => {
    if (typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices)) {
      setIsCameraOpen(true);
    } else if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  // Handle capture from live webcam modal
  const handleCameraCapture = (dataUrl: string) => {
    const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const data = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl;

    if (onImageChange) {
      onImageChange({
        data,
        mimeType,
        previewUrl: dataUrl,
        fileName: `Prescription_Capture_${new Date().toLocaleTimeString().replace(/:/g, '')}.jpg`,
        fileSize: 'Camera Snapshot',
      });
    }
    onNoteChange('');
  };

  const handleRemoveImage = () => {
    if (onImageChange) {
      onImageChange(null);
    }
  };

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
              1. Intake Note &amp; Prescription Photo
            </h2>
            <p className="text-xs text-slate-500">
              Enter clinical notes or snap/upload prescription photos for multimodal AI extraction
            </p>
          </div>
        </div>
      </div>

      {/* Preset buttons */}
      <SampleNoteButtons
        onSelectSample={onNoteChange}
        onSelectSamplePrescription={onSelectSamplePrescription}
        disabled={disabled || loading}
      />

      {/* Photo Actions Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs">
        <div className="flex items-center gap-1.5 text-slate-600 font-medium">
          <ImageIcon className="w-4 h-4 text-slate-500" />
          <span>Prescription Document / Photo:</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Hidden inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Open Camera Button */}
          <button
            type="button"
            data-testid="open-camera-btn"
            onClick={handleOpenCamera}
            disabled={disabled || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-slate-700 bg-white hover:bg-slate-100 hover:text-slate-900 border border-slate-300 rounded-md shadow-2xs transition-colors disabled:opacity-50"
            title="Open device camera to snap prescription"
          >
            <Camera className="w-3.5 h-3.5 text-blue-600" />
            <span>Take Photo (Camera)</span>
          </button>

          {/* Upload File Button */}
          <button
            type="button"
            data-testid="upload-photo-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-slate-700 bg-white hover:bg-slate-100 hover:text-slate-900 border border-slate-300 rounded-md shadow-2xs transition-colors disabled:opacity-50"
            title="Upload prescription image file from disk"
          >
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>Upload Photo</span>
          </button>
        </div>
      </div>

      {/* Attached Image Card (if present) */}
      {attachedImage && (
        <div
          data-testid="attached-image-card"
          className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center justify-between gap-3 animate-in fade-in duration-150"
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Clickable Thumbnail */}
            <div
              onClick={() => setIsEnlargedOpen(true)}
              className="relative w-16 h-16 rounded-md border border-blue-300 overflow-hidden bg-white cursor-pointer group flex-shrink-0 shadow-2xs"
              title="Click to view full photo"
            >
              <img
                src={attachedImage.previewUrl}
                alt="Prescription preview"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Maximize2 className="w-4 h-4 text-white" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1">
                  <span>📸 Prescription Photo Attached</span>
                </span>
                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-medium">
                  Multimodal AI Ready
                </span>
              </div>
              <p className="text-xs text-slate-600 truncate mt-0.5 font-medium">
                {attachedImage.fileName || 'Prescription Image'}
              </p>
              {attachedImage.fileSize && (
                <p className="text-[11px] text-slate-500 font-mono">
                  {attachedImage.fileSize}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            data-testid="remove-attached-image-btn"
            onClick={handleRemoveImage}
            disabled={disabled || loading}
            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
            title="Remove attached photo"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Textarea */}
      <div className="relative space-y-1.5">
        <textarea
          data-testid="intake-note-textarea"
          value={hasImage ? '' : noteText}
          onChange={(e) => onNoteChange(e.target.value)}
          disabled={disabled || loading || hasImage}
          rows={hasImage ? 2 : 4}
          placeholder={
            hasImage
              ? "🔒 Prescription photo attached. Text input is locked to prevent conflicting patient data. Remove photo above to enter a text note."
              : "Enter or paste a pharmacy intake note here, or snap/upload a prescription photo above...&#10;Example: Patient DEMO-101 requests a callback. Best time is after 3 p.m."
          }
          className={`w-full rounded-lg border p-3 text-sm transition-colors font-sans resize-y ${
            hasImage
              ? 'border-slate-200 bg-slate-100/80 text-slate-400 cursor-not-allowed min-h-[60px]'
              : 'border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-[90px] disabled:bg-slate-50'
          }`}
        />
        {hasImage && (
          <p className="text-[11px] text-blue-700 bg-blue-50/80 border border-blue-200/60 rounded px-2.5 py-1 flex items-center gap-1.5 font-medium">
            <span>ℹ️</span>
            <span>Single-source mode active: AI will extract fields exclusively from the prescription photo above.</span>
          </p>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          data-testid="clear-note-btn"
          onClick={onClear}
          disabled={!canExtract || loading || disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>

        <button
          type="button"
          data-testid="extract-draft-btn"
          onClick={onExtract}
          disabled={!canExtract || loading || disabled}
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              <span>
                {hasImage ? 'Analyzing Prescription Photo...' : 'Extracting Draft...'}
              </span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              <span>
                {hasImage ? 'Extract from Prescription' : 'Extract Draft'}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Live Camera Viewfinder Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
      />

      {/* Enlarged Image Preview Modal */}
      {isEnlargedOpen && attachedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
          onClick={() => setIsEnlargedOpen(false)}
        >
          <div
            className="bg-white rounded-xl overflow-hidden max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 text-white text-xs">
              <span className="font-semibold">Prescription Document Preview</span>
              <button
                type="button"
                onClick={() => setIsEnlargedOpen(false)}
                className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 bg-slate-100 flex items-center justify-center overflow-auto max-h-[75vh]">
              <img
                src={attachedImage.previewUrl}
                alt="Enlarged prescription"
                className="max-h-[70vh] w-auto object-contain rounded shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default IntakePanel;
