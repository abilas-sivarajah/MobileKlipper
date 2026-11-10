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
import { usePrinterNotifications } from '@/lib/useNotifications';
import { useAppUpdateChecks } from '@/lib/useAppUpdates';
import { AppUpdateDialog } from '@/components/AppUpdateDialog';
import { isPrinting } from '@/lib/derive';
import Dashboard from '@/pages/Dashboard';
import Control from '@/pages/Control';
import FilesPage from '@/pages/FilesPage';
import WebcamPage from '@/pages/WebcamPage';
import ConsolePage from '@/pages/ConsolePage';
import SettingsPage from '@/pages/SettingsPage';
import HistoryPage from '@/pages/HistoryPage';
import CalibratePage from '@/pages/CalibratePage';
import MorePage from '@/pages/MorePage';
import ConfigPage from '@/pages/ConfigPage';
import SystemPage from '@/pages/SystemPage';

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
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      root.dataset.theme = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme;
    };
    apply();
    if (theme !== 'system') return;
    // Follow the OS switching between light and dark while the app is open.
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useWakeLock(keepAwake && printing);
  usePrinterNotifications();
  useAppUpdateChecks();

  if (!printers.length) {
    return (
      <>
        <AddPrinterScreen />
        <ToastHost />
        <ConfirmHost />
        <AppUpdateDialog />
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
          <Route path="/calibrate" element={<CalibratePage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/system" element={<SystemPage />} />
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <ToastHost />
      <ConfirmHost />
      <AppUpdateDialog />
    </>
  );
}
