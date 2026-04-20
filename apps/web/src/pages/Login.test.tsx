import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/firebase', () => ({
  auth: {},
  db: {},
  functions: {},
}));

import Login from './Login';

describe('<Login />', () => {
  it('renderiza título acessível e botão de Google', () => {
    render(<Login />);
    expect(screen.getByRole('heading', { level: 1, name: /entrar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar com google/i })).toBeInTheDocument();
  });
});
