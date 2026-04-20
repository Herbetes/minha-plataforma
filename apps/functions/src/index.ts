// Ponto de entrada das Cloud Functions v2.
// Cada função é importada explicitamente para permitir que o bundler
// (firebase deploy) faça tree-shaking e deploy somente do necessário.

import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { onUserCreate } from './auth/onUserCreate.js';
export { setUserRole } from './auth/setUserRole.js';
export { llmRoute } from './ai/llmRoute.js';
