import { useRef, useState } from 'react';
import { PHASES } from '../utils/buildSystemPrompt.js';

// In dev, connect directly to the Express WS server.
// In production, use the same host as the page.
function getWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.DEV ? 'localhost:3001' : window.location.host;
  return `${proto}//${host}/ws/session`;
}

// ── VAD constants ─────────────────────────────────────────────────────────────
const VAD_THRESHOLD = 0.018;   // RMS level considered "speech"
const VAD_SILENCE_MS = 1200;   // ms of silence before end-of-turn

export function useRealtimeSession() {
  const [status, setStatus]                   = useState('idle');
  const [error, setError]                     = useState(null);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [history, setHistory]                 = useState([]);
  const [liveTranscript, setLiveTranscript]   = useState('');
  const [interviewerSpeaking, setInterviewerSpeaking] = useState(false);
  const [candidateSpeaking, setCandidateSpeaking]     = useState(false);
  const [isMuted, setIsMuted]                 = useState(false);
  const [phaseTransition, setPhaseTransition] = useState(null);
  // Expose MediaStreams for the existing AudioWave visualiser
  const [localStream, setLocalStream]         = useState(null);
  const [remoteStream, setRemoteStream]       = useState(null);

  // Refs — never trigger re-renders but survive across async callbacks
  const wsRef            = useRef(null);
  const audioCtxRef      = useRef(null);
  const micStreamRef     = useRef(null);
  const analyserRef      = useRef(null);
  const recorderRef      = useRef(null);
  const recordedRef      = useRef([]);   // MediaRecorder chunks

  const isMutedRef       = useRef(false);
  const isListeningRef   = useRef(false); // server says "your turn"
  const isAISpeakingRef  = useRef(false);
  const vadStateRef      = useRef('idle'); // idle | detecting | speaking
  const silenceTimerRef  = useRef(null);
  const rafRef           = useRef(null);

  // TTS audio scheduling
  const ttsDestRef       = useRef(null);  // MediaStreamDestinationNode → remoteStream
  const nextStartRef     = useRef(0);     // next scheduled playback time

  // For endSession()
  const historyRef       = useRef([]);
  const transcriptRef    = useRef('');

  // ── WebSocket send helper ─────────────────────────────────────────────────

  function sendJSON(obj) {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(obj));
  }

  // ── TTS PCM playback ──────────────────────────────────────────────────────

  /**
   * Schedule a PCM chunk (16-bit signed, mono, 22050 Hz) for gapless playback.
   * Each chunk is wired to both the real speaker destination and a
   * MediaStreamDestinationNode so the AudioWave visualiser can see the signal.
   */
  function schedulePCM(arrayBuffer, sampleRate) {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const samples = new Int16Array(arrayBuffer);
    const floats  = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768;

    const buf = ctx.createBuffer(1, floats.length, sampleRate);
    buf.getChannelData(0).set(floats);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    if (ttsDestRef.current) src.connect(ttsDestRef.current);

    const now = ctx.currentTime;
    const t   = Math.max(now + 0.05, nextStartRef.current);
    src.start(t);
    nextStartRef.current = t + buf.duration;
  }

  // ── VAD loop ──────────────────────────────────────────────────────────────

  function startVAD() {
    const analyser = analyserRef.current;
    if (!analyser || vadStateRef.current !== 'idle') return;
    vadStateRef.current = 'detecting';
    const data = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      if (vadStateRef.current === 'idle') return;

      analyser.getByteTimeDomainData(data);
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / data.length);

      if (!isMutedRef.current && rms > VAD_THRESHOLD) {
        if (vadStateRef.current === 'detecting') {
          vadStateRef.current = 'speaking';
          setCandidateSpeaking(true);
          beginRecording();
        }
        // Reset silence countdown
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (vadStateRef.current === 'speaking') finishRecording();
        }, VAD_SILENCE_MS);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  function stopVAD() {
    vadStateRef.current = 'idle';
    cancelAnimationFrame(rafRef.current);
    clearTimeout(silenceTimerRef.current);
    setCandidateSpeaking(false);
  }

  // ── Recording ─────────────────────────────────────────────────────────────

  function beginRecording() {
    const stream = micStreamRef.current;
    if (!stream) return;
    recordedRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedRef.current.push(e.data);
    };
    recorder.start(100);
    recorderRef.current = recorder;
  }

  function finishRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    vadStateRef.current = 'idle';
    setCandidateSpeaking(false);
    cancelAnimationFrame(rafRef.current);
    clearTimeout(silenceTimerRef.current);

    recorder.onstop = async () => {
      const blob        = new Blob(recordedRef.current, { type: 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();

      // Only send if there's meaningful audio (> ~0.5 s at 8 kbps)
      if (wsRef.current?.readyState === WebSocket.OPEN && arrayBuffer.byteLength > 500) {
        wsRef.current.send(arrayBuffer);
      } else {
        // Too short / silent — restart listening without bothering the server
        if (isListeningRef.current) {
          vadStateRef.current = 'idle';
          startVAD();
        }
      }
    };
    recorder.stop();
  }

  // ── Server message handler ────────────────────────────────────────────────

  function handleMessage(msg) {
    switch (msg.type) {

      case 'ai_speaking_start':
        isAISpeakingRef.current = true;
        setInterviewerSpeaking(true);
        stopVAD();
        nextStartRef.current = 0;
        break;

      case 'ai_speaking_end':
        isAISpeakingRef.current = false;
        setInterviewerSpeaking(false);
        break;

      case 'ai_transcript_delta':
        setLiveTranscript(prev => prev + msg.text);
        break;

      case 'transcript_final':
        setLiveTranscript(msg.text || '');
        break;

      case 'transcript_processing':
        setLiveTranscript('Transcription…');
        break;

      case 'transcript_clear':
        setLiveTranscript('');
        break;

      case 'history_add': {
        const entry = msg.entry;
        historyRef.current = [...historyRef.current, entry];
        setHistory(h => [...h, entry]);
        break;
      }

      case 'phase_change':
        setCurrentPhaseIndex(msg.index);
        setPhaseTransition(PHASES[msg.index]?.label || '');
        setTimeout(() => setPhaseTransition(null), 2500);
        break;

      case 'tts_start':
        nextStartRef.current = 0;
        break;

      case 'tts_done':
        break;

      case 'listening_start':
        isListeningRef.current = true;
        vadStateRef.current = 'idle';
        startVAD();
        break;

      case 'session_complete':
        isListeningRef.current = false;
        stopVAD();
        break;

      case 'error':
        setError(msg.message);
        setStatus('error');
        break;

      default:
        break;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async function startSession(config) {
    setStatus('connecting');
    setError(null);
    historyRef.current    = [];
    transcriptRef.current = '';

    try {
      // 1. Microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;
      setLocalStream(stream);

      // 2. AudioContext — VAD analysis + TTS playback scheduling
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;

      // 3. MediaStreamDestination for the AI wave visualiser
      const ttsDest = ctx.createMediaStreamDestination();
      ttsDestRef.current = ttsDest;
      setRemoteStream(ttsDest.stream);

      // 4. WebSocket
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('active');
        ws.send(JSON.stringify({ type: 'config', data: config }));
      };

      ws.onmessage = (event) => {
        if (event.data instanceof Blob) {
          // Binary = PCM chunk from Voxtral TTS
          event.data.arrayBuffer().then(buf => schedulePCM(buf, 22050));
        } else {
          try { handleMessage(JSON.parse(event.data)); }
          catch { /* ignore malformed */ }
        }
      };

      ws.onerror = () => {
        setStatus('error');
        setError('Connexion WebSocket échouée. Vérifie que le serveur tourne sur le port 3001.');
      };

      ws.onclose = () => {};

    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  }

  function toggleMute() {
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    setIsMuted(next);
    micStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
    if (next && vadStateRef.current === 'speaking') finishRecording();
  }

  function endSession() {
    sendJSON({ type: 'end_session' });
    stopVAD();
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    wsRef.current?.close();
    audioCtxRef.current?.close();

    return {
      history:        historyRef.current,
      fullTranscript: transcriptRef.current,
    };
  }

  return {
    status,
    error,
    currentPhaseIndex,
    history,
    liveTranscript,
    interviewerSpeaking,
    candidateSpeaking,
    isMuted,
    phaseTransition,
    localStream,
    remoteStream,
    startSession,
    toggleMute,
    endSession,
  };
}
