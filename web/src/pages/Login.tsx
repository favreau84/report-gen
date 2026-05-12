import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(email, password);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    if (mode === 'signup') {
      setInfo('Compte créé. Vérifiez votre email si la confirmation est activée, puis connectez-vous.');
      setMode('signin');
    }
  }

  return (
    <div className="min-h-full grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <FileText className="text-accent" size={22} />
          <span className="text-lg font-semibold">Report Generator</span>
        </div>
        <div className="card p-6">
          <h1 className="text-base font-semibold mb-1">
            {mode === 'signin' ? 'Connexion' : 'Créer un compte'}
          </h1>
          <p className="text-sm text-muted mb-5">
            {mode === 'signin'
              ? 'Connectez-vous pour gérer vos rapports.'
              : 'Créez un compte avec votre email.'}
          </p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <div className="text-sm text-danger">{error}</div>}
            {info && <div className="text-sm text-success">{info}</div>}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? '…' : mode === 'signin' ? 'Se connecter' : 'Créer le compte'}
            </button>
          </form>
          <div className="mt-4 text-center text-sm text-muted">
            {mode === 'signin' ? (
              <>
                Pas de compte ?{' '}
                <button
                  className="text-accent hover:text-accentHover"
                  onClick={() => setMode('signup')}
                >
                  Créer un compte
                </button>
              </>
            ) : (
              <>
                Déjà un compte ?{' '}
                <button
                  className="text-accent hover:text-accentHover"
                  onClick={() => setMode('signin')}
                >
                  Se connecter
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
