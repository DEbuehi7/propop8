import { useEffect, useRef, useCallback, useState } from 'react';

interface AudioAnalyzerState {
  isRecording: boolean;
  spectrum: number[];
  frequency: number;
  volume: number;
  error: string | null;
}

export function useAudioAnalyzer() {
  const [state, setState] = useState<AudioAnalyzerState>({
    isRecording: false,
    spectrum: new Array(60).fill(0),
    frequency: 0,
    volume: 0,
    error: null,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const startRecording = useCallback(async () => {
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        }
      });
      microStreamRef.current = stream;

      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      // Create analyser
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      // Connect microphone to analyser
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyser);

      setState((prev) => ({ ...prev, isRecording: true, error: null }));

      // Start animation loop for spectrum analysis
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const spectrum = new Array(60).fill(0);

      const updateSpectrum = () => {
        analyser.getByteFrequencyData(dataArray);

        // Map 128 frequency bins to 60 bands (log scale for better visualization)
        for (let i = 0; i < 60; i++) {
          const start = Math.floor((i / 60) * bufferLength);
          const end = Math.floor(((i + 1) / 60) * bufferLength);
          let sum = 0;
          for (let j = start; j < end; j++) {
            sum += dataArray[j];
          }
          spectrum[i] = (sum / (end - start)) / 255;
        }

        // Calculate dominant frequency
        const maxIndex = dataArray.indexOf(Math.max(...dataArray));
        const dominantFreq = (maxIndex * audioContext.sampleRate) / (2 * bufferLength);

        // Calculate volume (RMS)
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += (dataArray[i] / 255) ** 2;
        }
        const rms = Math.sqrt(sum / bufferLength);

        setState((prev) => ({
          ...prev,
          spectrum,
          frequency: dominantFreq,
          volume: rms,
        }));

        animationFrameRef.current = requestAnimationFrame(updateSpectrum);
      };

      updateSpectrum();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to access microphone';
      setState((prev) => ({ ...prev, error: message }));
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (microStreamRef.current) {
      microStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }

    setState((prev) => ({
      ...prev,
      isRecording: false,
      spectrum: new Array(60).fill(0),
      frequency: 0,
      volume: 0,
    }));
  }, []);

  useEffect(() => {
    return () => {
      if (state.isRecording) {
        stopRecording();
      }
    };
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
  };
}
