import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import './tokens.css';

// Let the splash wordmark finish writing itself before React replaces it.
// The timeout cap means a missing/stalled video can never block startup.
const splashDone = new Promise((resolve) => {
  const video = document.querySelector('.splash-card video');
  if (!video || video.ended) return resolve();
  video.addEventListener('ended', resolve, { once: true });
  setTimeout(resolve, 2400);
});

splashDone.then(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
