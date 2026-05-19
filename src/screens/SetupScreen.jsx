import { useState } from 'react';
import { CheckIcon } from '../components/Icons.jsx';

const ROLES = [
  'Frontend Developer',
  'Backend Developer',
  'Full Stack',
  'Data Engineer',
  'ML Engineer',
  'DevOps / SRE',
];

const COMPANY_TYPES = [
  { value: 'Startup', sub: 'Petite structure, forte vélocité' },
  { value: 'Grande tech (FAANG-style)', sub: 'Processus structuré, haut niveau' },
  { value: 'Scale-up', sub: 'Croissance rapide, hybride' },
  { value: 'Cabinet de conseil', sub: 'Multi-clients, soft skills clés' },
];

const PERSONAS = [
  {
    name: 'Alex',
    title: 'Senior Engineer',
    style: 'Bienveillant',
    description: "Pédagogue, encourage à approfondir les réponses. Rythme posé.",
    voice: 'alloy',
    initial: 'A',
    color: 'bg-blue-100 text-blue-700',
  },
  {
    name: 'Jordan',
    title: 'Tech Lead',
    style: 'Exigeant',
    description: "Direct et précis, creuse les réponses avec des sous-questions pointues.",
    voice: 'echo',
    initial: 'J',
    color: 'bg-violet-100 text-violet-700',
  },
  {
    name: 'Sam',
    title: 'CTO',
    style: 'Direct',
    description: "Va à l'essentiel, n'aime pas les réponses vagues. Rythme soutenu.",
    voice: 'shimmer',
    initial: 'S',
    color: 'bg-amber-100 text-amber-700',
  },
];

const LEVELS = [
  { value: 'Junior (0-2 ans)', label: 'Junior', sub: '0–2 ans' },
  { value: 'Intermédiaire (2-5 ans)', label: 'Intermédiaire', sub: '2–5 ans' },
  { value: 'Senior (5+)', label: 'Senior', sub: '5 ans et plus' },
];

function ChoiceButton({ selected, onClick, children, ariaLabel }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`w-full text-left p-3.5 rounded-xl border-2 transition-all duration-150 relative focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
        selected
          ? 'border-accent bg-accent-light text-slate-900'
          : 'border-border bg-surface hover:border-border-strong text-slate-900'
      }`}
    >
      {selected && (
        <span className="absolute top-2.5 right-2.5 text-accent">
          <CheckIcon className="w-3.5 h-3.5" />
        </span>
      )}
      {children}
    </button>
  );
}

export default function SetupScreen({ onStart, hasCV = false }) {
  const [role, setRole] = useState('');
  const [companyType, setCompanyType] = useState('');
  const [persona, setPersona] = useState(null);
  const [level, setLevel] = useState('');
  const [background, setBackground] = useState('');

  const ready = role && companyType && persona && level;

  const handleStart = () => {
    if (!ready) return;
    onStart({
      role,
      companyType,
      voice: persona.voice,
      personaName: persona.name,
      personaTitle: `${persona.title} ${persona.style}`,
      level,
      background: background.trim(),
    });
  };

  return (
    <div className="min-h-screen bg-base flex items-start justify-center py-14 px-4">
      <div className="w-full max-w-xl space-y-10">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Interview Simulator
          </h1>
          <p className="text-slate-500 text-sm">
            Configure ton entretien technique vocal en quelques secondes.
          </p>
        </div>

        {/* Poste visé */}
        <fieldset>
          <legend className="label mb-3">Poste visé</legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="listbox" aria-label="Choisir un poste">
            {ROLES.map((r) => (
              <ChoiceButton
                key={r}
                selected={role === r}
                onClick={() => setRole(r)}
                ariaLabel={r}
              >
                <span className="text-sm font-medium leading-snug">{r}</span>
              </ChoiceButton>
            ))}
          </div>
        </fieldset>

        {/* Type d'entreprise */}
        <fieldset>
          <legend className="label mb-3">Type d'entreprise</legend>
          <div className="grid grid-cols-2 gap-2" role="listbox" aria-label="Choisir un type d'entreprise">
            {COMPANY_TYPES.map((c) => (
              <ChoiceButton
                key={c.value}
                selected={companyType === c.value}
                onClick={() => setCompanyType(c.value)}
                ariaLabel={c.value}
              >
                <div className="font-medium text-sm pr-4">{c.value}</div>
                <div className="text-xs text-slate-500 mt-0.5 leading-snug">{c.sub}</div>
              </ChoiceButton>
            ))}
          </div>
        </fieldset>

        {/* Persona */}
        <fieldset>
          <legend className="label mb-3">Interviewer</legend>
          <div className="space-y-2" role="listbox" aria-label="Choisir un interviewer">
            {PERSONAS.map((p) => (
              <ChoiceButton
                key={p.name}
                selected={persona?.name === p.name}
                onClick={() => setPersona(p)}
                ariaLabel={`${p.name}, ${p.title} — ${p.style}`}
              >
                <div className="flex items-center gap-3 pr-6">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${p.color}`}
                    aria-hidden="true"
                  >
                    {p.initial}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{p.name}</span>
                      <span className="text-xs text-slate-500">{p.title}</span>
                      <span
                        className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-surface-alt text-slate-600"
                      >
                        {p.style}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-snug">{p.description}</div>
                  </div>
                </div>
              </ChoiceButton>
            ))}
          </div>
        </fieldset>

        {/* Niveau */}
        <fieldset>
          <legend className="label mb-3">Ton niveau</legend>
          <div className="grid grid-cols-3 gap-2" role="listbox" aria-label="Choisir ton niveau">
            {LEVELS.map((l) => (
              <ChoiceButton
                key={l.value}
                selected={level === l.value}
                onClick={() => setLevel(l.value)}
                ariaLabel={`${l.label}, ${l.sub}`}
              >
                <div className="font-semibold text-sm">{l.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{l.sub}</div>
              </ChoiceButton>
            ))}
          </div>
        </fieldset>

        {/* Background / CV */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label htmlFor="background" className="label">
              {hasCV ? 'Notes additionnelles' : 'Ton parcours'}{' '}
              <span className="font-normal normal-case text-slate-400 tracking-normal">— optionnel</span>
            </label>
            {hasCV && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true" />
                CV importé
              </span>
            )}
          </div>
          {hasCV && (
            <p className="text-xs text-slate-500 mb-2">
              Ton CV sera utilisé par l'interviewer. Tu peux ajouter des précisions ci-dessous.
            </p>
          )}
          <textarea
            id="background"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            placeholder={
              hasCV
                ? 'Précisions supplémentaires, projet récent, focus particulier...'
                : 'Décris ton parcours ou colle quelques lignes de ton CV...'
            }
            rows={3}
            className="w-full bg-surface border-2 border-border rounded-xl px-4 py-3 text-sm text-slate-900
                       placeholder-slate-400 focus:outline-none focus:border-accent resize-none transition-colors"
          />
        </div>

        {/* CTA */}
        <div className="pb-6">
          <button
            onClick={handleStart}
            disabled={!ready}
            className="w-full btn-primary py-4 text-base"
            aria-disabled={!ready}
          >
            Démarrer l'entretien
          </button>
          {!ready && (
            <p className="text-xs text-slate-500 text-center mt-3" role="status">
              Remplis tous les champs pour continuer.
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
