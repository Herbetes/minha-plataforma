import { signOut } from 'firebase/auth';

import { auth } from '../lib/firebase';
import { useSessao } from '../lib/sessao';

export default function Dashboard(): JSX.Element {
  const { usuario, orgId, papel } = useSessao();

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-primary">Dashboard</h1>
        <button
          type="button"
          onClick={() => signOut(auth)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          Sair
        </button>
      </header>

      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-medium">Bem-vindo(a), {usuario?.displayName ?? usuario?.email}</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-slate-500">Organização</dt>
            <dd className="font-mono text-sm">{orgId ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Papel</dt>
            <dd className="text-sm">{papel ?? '—'}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
