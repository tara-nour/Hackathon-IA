/**
 * Safe JSON helper — reads the body as text first, then parses.
 * Avoids the JSON.parse crash when the server returns an HTML error page.
 */
export async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Le serveur a renvoyé une réponse inattendue (HTTP ${res.status}). ` +
        'Vérifie que le serveur API est bien lancé sur le port 3001.'
    );
  }
}

/**
 * Wrapper around fetch that:
 *  - always parses JSON safely
 *  - dispatches a global `app:unauthorized` event on 401 (triggers auto-logout)
 *  - throws a readable Error on any non-2xx response
 */
export async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const data = await safeJson(res);

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('app:unauthorized'));
    throw new Error(data?.error || 'Session expirée. Reconnecte-toi.');
  }

  if (!res.ok) {
    throw new Error(data?.error || `Erreur ${res.status}`);
  }

  return data;
}
