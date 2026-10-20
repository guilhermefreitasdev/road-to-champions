import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/install';
import { registerServiceWorker } from './ui/sw-register';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The display font, preloaded by index.html, applied here so it never blocks the first paint.
const font = document.getElementById('display-font') as HTMLLinkElement | null;
if (font) {
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.crossOrigin = 'anonymous';
  sheet.href = font.href;
  document.head.appendChild(sheet);
}

registerServiceWorker();
