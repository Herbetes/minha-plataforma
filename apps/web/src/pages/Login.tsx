import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useState } from 'react';

import { auth } from '../lib/firebase';

export default function Login(): JSX.Element {
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrarComGoogle(): Promise<void> {
    setErro(null);
    setCarregando(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (e) {
      setErro('Não foi possível entrar. Tente novamente.');
      console.error(e);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <section
        aria-labelledby="titulo-login"
        className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg"
      >
        <h1 id="titulo-login" className="mb-2 text-2xl font-semibold text-primary">
          Entrar
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          Acesse sua organização para continuar.
        </p>

        <button
          type="button"
          onClick={entrarComGoogle}
          disabled={carregando}
          className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-contraste transition hover:opacity-90 disabled:opacity-50"
        >
          {carregando ? 'Conectando…' : 'Entrar com Google'}
        </button>

        {erro && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {erro}
          </p>
        )}
      </section>
    </main>
  );
}
