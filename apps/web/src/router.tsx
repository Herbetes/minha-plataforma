import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';

import { useSessao } from './lib/sessao';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

function RotaProtegida(): JSX.Element {
  const { carregando, usuario } = useSessao();
  if (carregando) return <div className="p-8 text-slate-500">Carregando…</div>;
  if (!usuario) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RotaPublica(): JSX.Element {
  const { carregando, usuario } = useSessao();
  if (carregando) return <div className="p-8 text-slate-500">Carregando…</div>;
  if (usuario) return <Navigate to="/" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <RotaPublica />,
    children: [{ path: '/login', element: <Login /> }],
  },
  {
    element: <RotaProtegida />,
    children: [
      { path: '/', element: <Dashboard /> },
      // Futuras rotas por papel: /admin, /coordenador, /professor, /aluno, /responsavel
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
