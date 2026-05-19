import { useState } from 'react';
import { apiFetch } from '../utils/api.js';

function Field({ id, label, type = 'text', value, onChange, autoComplete, placeholder, hint }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className="w-full border-2 border-border rounded-xl px-4 py-2.5 text-sm text-slate-900
                   placeholder-slate-400 focus:outline-none focus:border-accent transition-colors bg-surface"
      />
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (next) => {
    setMode(next);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login' ? { email, password } : { name, email, password };

      const data = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      onAuth(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8">

        {/* Brand */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Interview Simulator
          </h1>
          <p className="text-sm text-slate-500">
            Prépare tes entretiens techniques à l'oral
          </p>
        </div>

        {/* Card */}
        <div className="card p-8 space-y-6">

          {/* Mode toggle */}
          <div
            className="flex rounded-xl bg-surface-alt p-1"
            role="tablist"
            aria-label="Choisir entre connexion et inscription"
          >
            {(['login', 'register']).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
                  mode === m
                    ? 'bg-white shadow-sm text-slate-900'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {m === 'login' ? 'Connexion' : 'Inscription'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === 'register' && (
              <Field
                id="name"
                label="Prénom"
                value={name}
                onChange={setName}
                autoComplete="given-name"
                placeholder="Marie"
              />
            )}

            <Field
              id="email"
              label="Adresse email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="marie@example.com"
            />

            <Field
              id="password"
              label="Mot de passe"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              hint={mode === 'register' ? 'Minimum 8 caractères.' : undefined}
            />

            {error && (
              <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 text-sm"
            >
              {loading
                ? 'Chargement...'
                : mode === 'login'
                ? 'Se connecter'
                : 'Créer un compte'}
            </button>
          </form>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400">
          {mode === 'login' ? (
            <>
              Pas encore de compte ?{' '}
              <button
                onClick={() => switchMode('register')}
                className="text-accent hover:underline font-medium"
              >
                S'inscrire
              </button>
            </>
          ) : (
            <>
              Déjà un compte ?{' '}
              <button
                onClick={() => switchMode('login')}
                className="text-accent hover:underline font-medium"
              >
                Se connecter
              </button>
            </>
          )}
        </p>

      </div>
    </div>
  );
}
