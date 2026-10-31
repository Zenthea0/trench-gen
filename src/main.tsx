import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './app/App.js';
import './app/styles.css';

// Service worker : permet d'utiliser l'application hors ligne après la première visite.
registerSW({ immediate: true });

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
