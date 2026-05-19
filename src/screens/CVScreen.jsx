import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/api.js';

function UploadZone({ onFile, file, dragging, onDragOver, onDragLeave, onDrop }) {
  const inputRef = useRef(null);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Zone de dépôt de fichier. Clique ou glisse un fichier PDF ou TXT."
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current.click()}
      className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors select-none ${
        dragging
          ? 'border-accent bg-accent-light'
          : 'border-border hover:border-accent/60 hover:bg-surface-alt'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt"
        className="sr-only"
        aria-hidden="true"
        onChange={(e) => onFile(e.target.files[0])}
      />

      {file ? (
        <div className="space-y-1">
          <p className="font-medium text-slate-900 text-sm">{file.name}</p>
          <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} Ko</p>
          <p className="text-xs text-accent mt-2">Cliquer pour changer de fichier</p>
        </div>
      ) : (
        <div className="space-y-2">
          <svg
            className="w-8 h-8 text-slate-300 mx-auto"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          <p className="text-sm font-medium text-slate-600">
            Glisse ton fichier ici, ou clique pour sélectionner
          </p>
          <p className="text-xs text-slate-400">PDF ou TXT · max 5 Mo</p>
        </div>
      )}
    </div>
  );
}

export default function CVScreen({ token, onComplete, onSkip }) {
  const [tab, setTab] = useState('upload');
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [error, setError] = useState('');

  // Load existing CV on mount
  useEffect(() => {
    apiFetch('/api/cv', { headers: { Authorization: `Bearer ${token}` } })
      .then((data) => {
        if (data?.cv) {
          setText(data.cv);
          setTab('paste');
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
  }, [token]);

  const handleFile = (f) => {
    if (!f) return;
    setError('');
    setFile(f);
    if (f.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result.slice(0, 600));
      reader.readAsText(f);
    } else {
      setPreview('');
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      let cv;

      if (tab === 'paste') {
        if (!text.trim()) { setError('Le texte est vide.'); return; }
        const data = await apiFetch('/api/cv/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text }),
        });
        cv = data.cv;
      } else {
        if (!file) { setError('Aucun fichier sélectionné.'); return; }
        const formData = new FormData();
        formData.append('cv', file);
        const data = await apiFetch('/api/cv/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        cv = data.cv;
      }

      onComplete(cv);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loadingExisting) {
    return (
      <div className="flex items-center justify-center py-24" role="status" aria-label="Chargement">
        <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="py-12 px-4 flex justify-center">
      <div className="w-full max-w-xl space-y-7">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">Mon CV</h1>
          <p className="text-sm text-slate-500">
            Importe ton CV pour que l'interviewer adapte ses questions à ton profil.
            Cette étape est facultative.
          </p>
        </div>

        {/* Tab switcher */}
        <div
          className="flex rounded-xl bg-surface-alt p-1 w-fit"
          role="tablist"
          aria-label="Mode d'import du CV"
        >
          {[
            { id: 'upload', label: 'Importer un fichier' },
            { id: 'paste', label: 'Coller le texte' },
          ].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => { setTab(t.id); setError(''); }}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === t.id
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'upload' ? (
          <div className="space-y-4">
            <UploadZone
              file={file}
              dragging={dragging}
              onFile={handleFile}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            />
            {preview && (
              <div className="card p-4 space-y-2 max-h-44 overflow-y-auto">
                <p className="label">Aperçu</p>
                <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono leading-relaxed">
                  {preview}
                  {preview.length >= 600 && '…'}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="cv-text" className="label block">
              Contenu du CV
            </label>
            <textarea
              id="cv-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Colle ici le contenu de ton CV — expériences, compétences, formations..."
              rows={12}
              className="w-full bg-surface border-2 border-border rounded-xl px-4 py-3 text-sm
                         text-slate-900 placeholder-slate-400 focus:outline-none focus:border-accent
                         resize-none transition-colors font-mono"
            />
            <p className="text-xs text-slate-400 text-right">{text.length} caractères</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pb-4">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary flex-1 py-3 text-sm"
          >
            {loading ? 'Traitement...' : 'Enregistrer le CV'}
          </button>
          <button
            onClick={onSkip}
            className="btn-secondary px-6 py-3 text-sm"
            aria-label="Ignorer cette étape et aller à la configuration de l'entretien"
          >
            Ignorer
          </button>
        </div>

      </div>
    </div>
  );
}
