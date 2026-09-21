import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ToastHost } from '@/components/ToastHost';
import { ConfirmHost } from '@/components/ConfirmHost';
import { AddPrinterScreen } from '@/features/settings/AddPrinterScreen';
import { usePrinterStore } from '@/store/printer';
import { usePrintersStore } from '@/store/printers';
import { useUiStore } from '@/store/ui';
import { useWakeLock } from '@/lib/hooks';
import { isPrinting } from '@/lib/derive';
import Dashboard from '@/pages/Dashboard';
import Control from '@/pages/Control';
import FilesPage from '@/pages/FilesPage';
import WebcamPage from '@/pages/WebcamPage';
import ConsolePage from '@/pages/ConsolePage';
import SettingsPage from '@/pages/SettingsPage';
import HistoryPage from '@/pages/HistoryPage';

export default function App() {
  const printers = usePrintersStore((s) => s.printers);
  const activeId = usePrintersStore((s) => s.activeId);
  const theme = useUiStore((s) => s.theme);
  const keepAwake = useUiStore((s) => s.keepScreenAwake);
  const printing = usePrinterStore((s) => isPrinting(s.status));

  // Only reconnect when the endpoint itself changes, not on every preference edit.
  const active = printers.find((p) => p.id === activeId);
  const endpointKey = active ? `${active.id}|${active.baseUrl}|${active.apiKey ?? ''}` : null;

  useEffect(() => {
    if (!active) return;
    usePrinterStore.getState().connect(active);
    return () => usePrinterStore.getState().disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointKey]);

  useEffect(() => {
    const root = document.documentElement;
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : theme;
    root.dataset.theme = resolved;
  }, [theme]);

  useWakeLock(keepAwake && printing);

  if (!printers.length) {
    return (
      <>
        <AddPrinterScreen />
        <ToastHost />
        <ConfirmHost />
      </>
    );
  }

  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/control" element={<Control />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/cam" element={<WebcamPage />} />
          <Route path="/console" element={<ConsolePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <ToastHost />
      <ConfirmHost />
    </>
  );
}
