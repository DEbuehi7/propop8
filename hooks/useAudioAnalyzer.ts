'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseAudioAnalyzerReturn {
  isRecording: boolean;
  spectrum: number[];
  frequency: number;
  volume: number;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

/**
 * Custom React hook for real-time audio analysis using Web Audio API
 * 
 * Provides:
 * - Live FFT spectrum visualization (60 frequency bands)
 * - Peak frequency detection
 * - Volume (RMS) measurement
 * 
 * Usage:
 * const { isRecording, spectrum, frequency, volume, startRecording, stopRecording } = useAudioAnalyzer();
 * 
 * Features:
 * - Handles microphone permissions
 * - Real-time updates via requestAnimationFrame
 * - Automatic cleanup on unmount
 * - Error handling for browser compatibility
 */
export function useAudioAnalyzer(): UseAudioAnalyzerReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [spectrum, setSpectrum] = useState<number[]>(Array(60).fill(0));
  const [frequency, setFrequency] = useState(0);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Persistent references across renders
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationIdRef = useRef<number | null>(null);

  // Frequency band mapping: 60 bands covering 20Hz to 20kHz
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  /**
   * Update spectrum visualization on each animation frame
   */
  const updateSpectrum = useCallback(function updateSpectrum() {
    if (!analyserRef.current || !dataArrayRef.current) return;

    analyserRef.current.getByteFrequencyData(dataArrayRef.current);

    // Map 256 FFT bins to 60 visual bands (log scale for perceptual spacing)
    const spectrum: number[] = [];
    for (let i = 0; i < 60; i++) {
      // Logarithmic mapping: lower frequencies get more resolution
      const binIndex = Math.floor((Math.pow(2, i / 10) - 1) * 256 / 254);
      const clampedIndex = Math.min(binIndex, 255);
      spectrum[i] = dataArrayRef.current[clampedIndex] / 255; // Normalize to 0-1
    }

    // Calculate peak frequency (dominant frequency)
    const peakBin = dataArrayRef.current.indexOf(Math.max(...dataArrayRef.current));
    const nyquist = (audioContextRef.current?.sampleRate || 48000) / 2;
    const peakFrequency = (peakBin / 256) * nyquist;

    // Calculate volume (RMS of frequency data)
    const sum = dataArrayRef.current.reduce((acc, val) => acc + val * val, 0);
    const rms = Math.sqrt(sum / dataArrayRef.current.length) / 255;

    setSpectrum(spectrum);
    setFrequency(peakFrequency);
    setVolume(rms);

    // Continue animation loop
    animationIdRef.current = requestAnimationFrame(updateSpectrum);
  }, []);

  /**
   * Start microphone recording and analysis
   */
  const startRecording = useCallback(async () => {
    try {
      // Clean up any existing resources
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false, // Disable AGC for consistent volume measurements
        },
      });

      streamRef.current = stream;

      // Initialize Web Audio API
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256; // 256-point FFT = 128 frequency bins
      analyser.smoothingTimeConstant = 0.8; // Smooth visualizations

      analyserRef.current = analyser;

      // Connect microphone to analyser
      const microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);

      // Initialize data array for FFT results
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

      setError(null);
      setIsRecording(true);

      // Start animation loop
      updateSpectrum();
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to access microphone. Please check browser permissions.';
      setError(errorMessage);
      setIsRecording(false);
    }
  }, [updateSpectrum]);

  /**
   * Stop recording and cleanup resources
   */
  const stopRecording = useCallback(() => {
    // Stop animation loop
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }

    // Stop microphone stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Disconnect audio nodes
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    // Close audio context (optional, keeps resources)
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Reset state
    setIsRecording(false);
    setSpectrum(Array(60).fill(0));
    setFrequency(0);
    setVolume(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording();
      }
    };
  }, [isRecording, stopRecording]);

  return {
    isRecording,
    spectrum,
    frequency,
    volume,
    error,
    startRecording,
    stopRecording,
  };
}
