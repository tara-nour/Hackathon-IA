import { useState, useEffect, useCallback } from 'react';
import AuthScreen from './screens/AuthScreen.jsx';
import CVScreen from './screens/CVScreen.jsx';
import SetupScreen from './screens/SetupScreen.jsx';
import SessionScreen from './screens/SessionScreen.jsx';
import FeedbackScreen from './screens/FeedbackScreen.jsx';
import AppHeader from './components/AppHeader.jsx';

function loadStored(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export default function App() {
  const [user, setUser] = useState(() => loadStored('user'));
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [cv, setCv] = useState(null);
  const [screen, setScreen] = useState(() => (loadStored('user') ? 'setup' : 'auth'));
  const [config, setConfig] = useState(null);
  const [result, setResult] = useState(null);

  // Logout helper — stable reference so useEffect deps stay clean
  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setToken(null);
    setCv(null);
    setConfig(null);
    setResult(null);
    setScreen('auth');
  }, []);

  // 401 auto-logout — fired by apiFetch when any request gets a 401
  useEffect(() => {
    const onUnauthorized = () => handleLogout();
    window.addEventListener('app:unauthorized', onUnauthorized);
    return () => window.removeEventListener('app:unauthorized', onUnauthorized);
  }, [handleLogout]);

  // Restore CV state on page reload when the user is already logged in
  useEffect(() => {
    if (!token) return;
    fetch('/api/cv', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.cv) setCv(data.cv); })
      .catch(() => {});
  }, [token]);

  const handleAuth = (newToken, newUser) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setScreen(newUser.hasCV ? 'setup' : 'cv');
  };

  const handleCVComplete = (cvText) => {
    setCv(cvText);
    setScreen('setup');
  };

  const handleStart = (cfg) => {
    // Merge CV into background only when no explicit background was provided
    const background = cfg.background
      ? cfg.background
      : cv || '';
    setConfig({ ...cfg, background });
    setScreen('session');
  };

  const handleEnd = (sessionResult) => {
    setResult(sessionResult);
    setScreen('feedback');
  };

  const handleRestart = () => {
    setConfig(null);
    setResult(null);
    setScreen('setup');
  };

  if (!user) return <AuthScreen onAuth={handleAuth} />;

  const showHeader = screen !== 'session';

  return (
    <div className="min-h-screen bg-base">
      {showHeader && (
        <AppHeader
          user={user}
          onLogout={handleLogout}
          onCVClick={() => setScreen('cv')}
        />
      )}

      {screen === 'cv' && (
        <CVScreen
          token={token}
          onComplete={handleCVComplete}
          onSkip={() => setScreen('setup')}
        />
      )}
      {screen === 'setup' && (
        <SetupScreen onStart={handleStart} hasCV={!!cv} />
      )}
      {screen === 'session' && (
        <SessionScreen config={config} onEnd={handleEnd} />
      )}
      {screen === 'feedback' && (
        <FeedbackScreen result={result} config={config} onRestart={handleRestart} />
      )}
    </div>
  );
}
