import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { setServiceWorkerUpdater } from './lib/sw';
import { useAppUpdateStore } from './store/appUpdate';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  setServiceWorkerUpdater(
    registerSW({
      // New files on the server (a Moonraker update, a manual copy): let the
      // user switch over instead of reloading under their feet.
      onNeedRefresh: () => useAppUpdateStore.getState().setSwUpdateReady(true),
    }),
  );
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
