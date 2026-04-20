import { z } from 'zod';

// IDs: 20-64 chars alfanuméricos/underscore/hífen. Firestore aceita até 1500 bytes, mas restringimos.
export const zId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const zEmail = z.string().email().max(254);

// Timestamp ISO 8601 (transportado como string; convertido para Firestore Timestamp no backend).
export const zTimestampISO = z.string().datetime({ offset: true });

// Moeda em cents? — evitar float. Usamos string decimal validada quando precisamos de precisão.
export const zUSD = z.number().finite().nonnegative();

export const zCor = z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);

export const zIdioma = z.enum(['pt-BR', 'en', 'es']);
