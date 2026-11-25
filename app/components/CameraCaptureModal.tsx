'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, AlertCircle, Check } from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // Stop current video stream
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Start video stream with selected facing mode
  const startStream = async (mode: 'environment' | 'user') => {
    stopStream();
    setIsLoading(true);
    setError(null);
    setCapturedImage(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      setError('Camera access is not supported on this browser. Please use file upload.');
      setIsLoading(false);
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setIsLoading(false);
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      // Fallback: try without facingMode constraint
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play().catch(() => {});
        }
        setIsLoading(false);
      } catch (fallbackErr: any) {
        setError(
          fallbackErr.name === 'NotAllowedError' || fallbackErr.name === 'PermissionDeniedError'
            ? 'Camera permission denied. Please allow camera access in your browser or upload a file.'
            : 'Unable to access device camera. Please check your camera connection or use file upload.'
        );
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      startStream(facingMode);
    } else {
      stopStream();
      setCapturedImage(null);
      setError(null);
    }
    return () => {
      stopStream();
    };
  }, [isOpen, facingMode]);

  const handleCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(dataUrl);
    stopStream();
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      onClose();
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startStream(facingMode);
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-sm">Snap Prescription Photo</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder / Video Canvas Area */}
        <div className="relative bg-black min-h-[320px] max-h-[420px] flex items-center justify-center overflow-hidden">
          {error ? (
            <div className="p-6 text-center text-rose-300 max-w-sm space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-rose-400" />
              <p className="text-sm font-medium">{error}</p>
              <p className="text-xs text-slate-400">
                You can still attach photos directly using the <strong>Upload File</strong> button.
              </p>
            </div>
          ) : capturedImage ? (
            <img
              src={capturedImage}
              alt="Prescription preview"
              className="max-h-[400px] w-auto object-contain mx-auto"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full max-h-[400px] object-cover ${
                  facingMode === 'user' ? 'scale-x-[-1]' : ''
                }`}
              />
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-xs gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                  <span>Connecting to camera...</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          {capturedImage ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>Use This Photo</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleFacingMode}
                disabled={Boolean(error) || isLoading}
                title="Switch Camera (Front / Rear)"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Flip Camera</span>
              </button>

              <button
                type="button"
                onClick={handleCapture}
                disabled={Boolean(error) || isLoading}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Camera className="w-4 h-4" />
                <span>Snap Photo</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CameraCaptureModal;
