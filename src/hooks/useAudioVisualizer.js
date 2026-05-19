import { useEffect, useRef, useState } from 'react';

const BARS = 48;
const EMPTY = new Array(BARS).fill(0);

export function useAudioVisualizer(stream) {
  const [amplitudes, setAmplitudes] = useState(EMPTY);
  const rafRef = useRef(null);
  const ctxRef = useRef(null);

  useEffect(() => {
    if (!stream) {
      setAmplitudes(EMPTY);
      return;
    }

    let audioCtx;
    try {
      audioCtx = new AudioContext();
    } catch {
      return;
    }
    ctxRef.current = audioCtx;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = BARS * 2;
    analyser.smoothingTimeConstant = 0.75;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      setAmplitudes(Array.from(data).slice(0, BARS));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      audioCtx.close().catch(() => {});
      ctxRef.current = null;
      setAmplitudes(EMPTY);
    };
  }, [stream]);

  return amplitudes;
}
