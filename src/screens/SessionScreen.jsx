import { useEffect, useRef, useState } from 'react';
import { useRealtimeSession } from '../hooks/useRealtimeSession.js';
import { useAudioVisualizer } from '../hooks/useAudioVisualizer.js';
import { PHASES } from '../utils/buildSystemPrompt.js';
import { parseFeedback } from '../utils/parseFeedback.js';
import { MicIcon, MicOffIcon, StopIcon, AlertIcon } from '../components/Icons.jsx';
import { safeJson } from '../utils/api.js';

const ACCENT = '#2563eb';
const SLATE = '#64748b';

function AudioWave({ amplitudes, color, active }) {
  const BARS = 48;
  const barW = 3;
  const gap = 3;
  const maxH = 40;
  const totalW = BARS * (barW + gap);

  return (
    <svg
      width={totalW}
      height={maxH * 2 + 4}
      className="mx-auto"
      role="img"
      aria-label="Visualiseur audio"
    >
      {amplitudes.slice(0, BARS).map((amp, i) => {
        const h = active ? Math.max(2, (amp / 255) * maxH) : 2;
        const x = i * (barW + gap);
        return (
          <rect
            key={i}
            x={x}
            y={maxH - h + 2}
            width={barW}
            height={h * 2}
            rx={barW / 2}
            fill={active ? color : '#e2e8f0'}
          />
        );
      })}
    </svg>
  );
}

function PhaseBar({ phases, currentIndex }) {
  return (
    <nav aria-label="Progression de l'entretien">
      <ol className="flex items-center justify-center gap-0">
        {phases.map((phase, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <li key={phase.id} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                    done
                      ? 'bg-accent text-white'
                      : current
                      ? 'bg-accent-light border-2 border-accent text-accent'
                      : 'bg-surface border-2 border-border text-slate-500'
                  }`}
                  aria-current={current ? 'step' : undefined}
                >
                  {done ? (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-xs font-medium ${
                    current ? 'text-accent' : done ? 'text-slate-500' : 'text-slate-500'
                  }`}
                >
                  {phase.label}
                </span>
              </div>
              {i < phases.length - 1 && (
                <div
                  className={`w-8 h-px mb-5 mx-1 transition-colors duration-300 ${
                    done ? 'bg-accent' : 'bg-border'
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SpeakerBadge({ isInterviewer, isCandidat, personaName }) {
  if (isInterviewer) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 bg-accent-light border border-accent-border text-accent text-sm px-4 py-1.5 rounded-full font-medium"
      >
        <span className="w-2 h-2 bg-accent rounded-full animate-pulse" aria-hidden="true" />
        {personaName} parle
      </div>
    );
  }
  if (isCandidat) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 bg-surface-alt border border-border text-slate-600 text-sm px-4 py-1.5 rounded-full font-medium"
      >
        <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" aria-hidden="true" />
        Vous parlez
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className="text-slate-500 text-sm"
    >
      En attente...
    </div>
  );
}

export default function SessionScreen({ config, onEnd }) {
  const {
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
  } = useRealtimeSession();

  const [ending, setEnding] = useState(false);
  const historyBottomRef = useRef(null);

  const isInterviewer = interviewerSpeaking;
  const isCandidat = candidateSpeaking && !interviewerSpeaking;
  const activeColor = isInterviewer ? ACCENT : SLATE;

  const micAmplitudes = useAudioVisualizer(isCandidat ? localStream : null);
  const aiAmplitudes = useAudioVisualizer(isInterviewer ? remoteStream : null);
  const activeAmplitudes = isInterviewer ? aiAmplitudes : micAmplitudes;

  useEffect(() => {
    startSession(config);
  }, []); // eslint-disable-line

  useEffect(() => {
    historyBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, liveTranscript]);

  const handleEnd = async () => {
    if (ending) return;
    setEnding(true);
    const { history: h, fullTranscript } = await endSession();

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, fullTranscript }),
      });
      const raw = await safeJson(res);
      if (!res.ok) throw new Error(raw?.error || 'Feedback generation failed');
      onEnd({ feedback: parseFeedback(raw), history: h, fullTranscript });
    } catch (err) {
      console.error(err);
      onEnd({ feedback: null, history: h, fullTranscript });
    }
  };

  if (status === 'idle' || status === 'connecting') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-base" role="status" aria-label="Connexion en cours">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <p className="text-slate-500 text-sm">Connexion à l'interviewer...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 bg-base" role="alert">
        <div className="text-red-500">
          <AlertIcon className="w-10 h-10" />
        </div>
        <p className="text-slate-900 font-semibold text-lg">Erreur de connexion</p>
        <p className="text-slate-500 text-sm text-center max-w-sm">
          {error || 'Impossible de démarrer la session. Vérifie ta clé API et ta connexion.'}
        </p>
        <button onClick={() => window.location.reload()} className="btn-secondary mt-2">
          Réessayer
        </button>
      </div>
    );
  }

  if (ending) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-base" role="status" aria-label="Génération du feedback">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <p className="text-slate-500 text-sm">Génération du feedback...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-base select-none">

      {/* Phase transition overlay */}
      {phaseTransition && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          role="status"
          aria-live="assertive"
          aria-label={`Nouvelle phase : ${phaseTransition}`}
        >
          <div className="bg-white border border-accent-border shadow-card-hover text-accent font-semibold text-base px-8 py-4 rounded-2xl">
            {phaseTransition}
          </div>
        </div>
      )}

      {/* Header — phase bar */}
      <header className="bg-surface border-b border-border px-6 pt-5 pb-5">
        <PhaseBar phases={PHASES} currentIndex={currentPhaseIndex} />
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 gap-6 py-8">

        {/* Speaker badge */}
        <div className="h-8 flex items-center justify-center">
          <SpeakerBadge
            isInterviewer={isInterviewer}
            isCandidat={isCandidat}
            personaName={config.personaName}
          />
        </div>

        {/* Visualizer card */}
        <div
          className={`w-full max-w-md card px-8 py-8 transition-shadow duration-300 ${
            (isInterviewer || isCandidat) ? 'shadow-card-hover' : ''
          }`}
        >
          <AudioWave
            amplitudes={activeAmplitudes}
            color={activeColor}
            active={isInterviewer || isCandidat}
          />
        </div>

        {/* Live subtitle */}
        <div
          className="min-h-[3.5rem] w-full max-w-lg text-center flex items-center justify-center px-4"
          aria-live="polite"
          aria-atomic="false"
          aria-label="Sous-titres en direct"
        >
          {liveTranscript ? (
            <p className="font-mono text-sm text-slate-600 leading-relaxed">
              {liveTranscript.replace('[PHASE_COMPLETE]', '').trim()}
              <span
                className="inline-block w-0.5 h-4 bg-accent ml-1 animate-pulse align-middle"
                aria-hidden="true"
              />
            </p>
          ) : null}
        </div>
      </main>

      {/* Conversation history */}
      <section
        className="mx-6 mb-4 card overflow-hidden"
        aria-label="Historique de la conversation"
      >
        <div className="overflow-y-auto p-4 space-y-3" style={{ maxHeight: '200px' }}>
          {history.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-3">
              La conversation s'affichera ici au fil de l'entretien.
            </p>
          ) : (
            history.map((entry, i) => (
              <div
                key={i}
                className={`flex gap-2.5 ${entry.role === 'candidat' ? 'flex-row-reverse' : ''}`}
              >
                <span
                  className={`text-xs font-semibold shrink-0 mt-1 ${
                    entry.role === 'interviewer' ? 'text-accent' : 'text-slate-500'
                  }`}
                  aria-label={entry.role === 'interviewer' ? config.personaName : 'Vous'}
                >
                  {entry.role === 'interviewer' ? config.personaName : 'Vous'}
                </span>
                <p
                  className={`text-sm leading-relaxed rounded-xl px-3 py-2 max-w-[78%] ${
                    entry.role === 'interviewer'
                      ? 'bg-accent-light text-slate-900'
                      : 'bg-surface-alt text-slate-900'
                  }`}
                >
                  {entry.text}
                </p>
              </div>
            ))
          )}
          <div ref={historyBottomRef} />
        </div>
      </section>

      {/* Controls */}
      <footer className="px-6 pb-8 flex items-center justify-center gap-3">
        <button
          onClick={toggleMute}
          aria-pressed={isMuted}
          aria-label={isMuted ? 'Réactiver le microphone' : 'Couper le microphone'}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-colors border-2 focus-visible:ring-2 focus-visible:ring-offset-2 ${
            isMuted
              ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100 focus-visible:ring-red-500'
              : 'bg-surface border-border text-slate-600 hover:bg-surface-alt focus-visible:ring-accent'
          }`}
        >
          {isMuted ? <MicOffIcon className="w-4 h-4" /> : <MicIcon className="w-4 h-4" />}
          <span>{isMuted ? 'Micro coupé' : 'Micro actif'}</span>
        </button>

        <button
          onClick={handleEnd}
          aria-label="Terminer l'entretien et générer le feedback"
          className="flex items-center gap-2 btn-danger"
        >
          <StopIcon className="w-4 h-4" />
          <span>Terminer</span>
        </button>
      </footer>
    </div>
  );
}
