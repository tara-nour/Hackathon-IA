import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, LightbulbIcon, AlertIcon, RefreshIcon } from '../components/Icons.jsx';

function ScoreGauge({ score }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 10) * circ;
  const strokeColor =
    score >= 7 ? '#16a34a' : score >= 5 ? '#d97706' : '#dc2626';
  const trackColor = '#f1f5f9';

  return (
    <div className="relative inline-flex items-center justify-center" aria-label={`Score global : ${score} sur 10`}>
      <svg width="132" height="132" className="-rotate-90" aria-hidden="true">
        <circle cx="66" cy="66" r={r} fill="none" stroke={trackColor} strokeWidth="10" />
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth="10"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="absolute text-center" aria-hidden="true">
        <span className="text-3xl font-bold text-slate-900">{score}</span>
        <span className="text-sm text-slate-500">/10</span>
      </div>
    </div>
  );
}

function ScoreBadge({ score }) {
  if (score >= 7) return <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-green-50 text-green-700 border border-green-200">{score}/10</span>;
  if (score >= 5) return <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">{score}/10</span>;
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-red-50 text-red-700 border border-red-200">{score}/10</span>;
}

function CompetencyCard({ nom, score, commentaire }) {
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">{nom}</span>
        <ScoreBadge score={score} />
      </div>
      <div
        className="w-full h-1.5 bg-surface-alt rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-label={`${nom} : ${score} sur 10`}
      >
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            score >= 7 ? 'bg-green-500' : score >= 5 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${score * 10}%` }}
        />
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">{commentaire}</p>
    </div>
  );
}

function Accordion({ title, children }) {
  const [open, setOpen] = useState(false);
  const id = `accordion-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface-alt transition-colors"
      >
        <span className="font-semibold text-slate-900 text-sm">{title}</span>
        {open ? (
          <ChevronUpIcon className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-slate-500" />
        )}
      </button>
      <div
        id={id}
        hidden={!open}
        className="border-t border-border px-5 py-4"
      >
        {children}
      </div>
    </div>
  );
}

function BulletList({ items, color }) {
  const dotClass = color === 'green' ? 'bg-green-500' : 'bg-amber-500';
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
          <span className={`w-1.5 h-1.5 rounded-full ${dotClass} mt-1.5 shrink-0`} aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function FeedbackScreen({ result, config, onRestart }) {
  const { feedback, history, fullTranscript } = result || {};

  if (!feedback) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-4 bg-base" role="alert">
        <div className="text-red-500">
          <AlertIcon className="w-10 h-10" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-slate-900 font-semibold text-lg">Feedback indisponible</p>
          <p className="text-slate-500 text-sm max-w-sm">
            La session s'est terminée mais le feedback n'a pas pu être généré.
          </p>
        </div>
        {fullTranscript && (
          <div className="w-full max-w-xl">
            <Accordion title="Transcription complète">
              <pre className="text-xs text-slate-500 whitespace-pre-wrap font-mono leading-relaxed">
                {fullTranscript}
              </pre>
            </Accordion>
          </div>
        )}
        <button onClick={onRestart} className="btn-primary flex items-center gap-2">
          <RefreshIcon className="w-4 h-4" />
          Recommencer
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base py-12 px-4 flex justify-center">
      <div className="w-full max-w-2xl space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">Résultats de l'entretien</h1>
          <p className="text-slate-500 text-sm">
            {config.role} &middot; {config.level} &middot; avec {config.personaName}
          </p>
        </div>

        {/* Score global */}
        <div className="card p-6 flex flex-col sm:flex-row items-center gap-6">
          <ScoreGauge score={feedback.score_global} />
          <div className="flex-1 space-y-2 text-center sm:text-left">
            <h2 className="font-semibold text-slate-900 text-lg">Score global</h2>
            <p className="text-slate-600 text-sm leading-relaxed">{feedback.resume}</p>
          </div>
        </div>

        {/* Points forts + Axes */}
        <div className="grid sm:grid-cols-2 gap-4">
          <section className="card p-5 space-y-3" aria-label="Points forts">
            <h3 className="text-sm font-semibold text-green-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
              Points forts
            </h3>
            <BulletList items={feedback.points_forts} color="green" />
          </section>

          <section className="card p-5 space-y-3" aria-label="Axes d'amélioration">
            <h3 className="text-sm font-semibold text-amber-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
              Axes d'amélioration
            </h3>
            <BulletList items={feedback.axes_amelioration} color="amber" />
          </section>
        </div>

        {/* Compétences */}
        <section aria-label="Analyse par compétence">
          <h2 className="label mb-3">Analyse par compétence</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {feedback.competences.map((c, i) => (
              <CompetencyCard key={i} {...c} />
            ))}
          </div>
        </section>

        {/* Conseil principal */}
        <div className="card p-5 flex items-start gap-4 border-accent-border bg-accent-light">
          <div className="text-accent mt-0.5 shrink-0">
            <LightbulbIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-accent mb-1">Conseil principal</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{feedback.conseil_principal}</p>
          </div>
        </div>

        {/* Transcription */}
        <Accordion title="Transcription complète de l'entretien">
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {history?.map((entry, i) => (
              <div
                key={i}
                className={`flex gap-2.5 ${entry.role === 'candidat' ? 'flex-row-reverse' : ''}`}
              >
                <span
                  className={`text-xs font-semibold shrink-0 mt-1 ${
                    entry.role === 'interviewer' ? 'text-accent' : 'text-slate-500'
                  }`}
                >
                  {entry.role === 'interviewer' ? config.personaName : 'Vous'}
                </span>
                <p
                  className={`text-sm leading-relaxed rounded-xl px-3 py-2 max-w-[78%] font-mono ${
                    entry.role === 'interviewer'
                      ? 'bg-accent-light text-slate-900'
                      : 'bg-surface-alt text-slate-900'
                  }`}
                >
                  {entry.text}
                </p>
              </div>
            ))}
          </div>
        </Accordion>

        {/* CTA */}
        <div className="pb-6 flex justify-center">
          <button onClick={onRestart} className="btn-primary flex items-center gap-2 px-10">
            <RefreshIcon className="w-4 h-4" />
            Recommencer
          </button>
        </div>

      </div>
    </div>
  );
}
