export default function AppHeader({ user, onLogout, onCVClick }) {
  const initial = user?.name?.[0]?.toUpperCase() ?? '?';

  return (
    <header className="bg-surface border-b border-border">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
        <span className="font-semibold text-slate-900 text-sm tracking-tight select-none">
          Interview Simulator
        </span>

        <nav className="flex items-center gap-5" aria-label="Navigation utilisateur">
          <button
            onClick={onCVClick}
            className="text-sm text-slate-500 hover:text-slate-900 transition-colors focus-visible:underline"
          >
            Mon CV
          </button>

          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-full bg-accent-light text-accent flex items-center justify-center text-xs font-bold select-none"
              aria-hidden="true"
            >
              {initial}
            </div>
            <span className="text-sm text-slate-600 hidden sm:block">{user?.name}</span>
          </div>

          <button
            onClick={onLogout}
            className="text-sm text-slate-400 hover:text-slate-700 transition-colors focus-visible:underline"
            aria-label="Se déconnecter"
          >
            Déconnexion
          </button>
        </nav>
      </div>
    </header>
  );
}
