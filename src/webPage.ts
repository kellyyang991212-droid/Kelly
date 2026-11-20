import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined';

export function onWebResume(callback: () => void) {
  if (!isWeb) return;
  const resume = () => { if (document.visibilityState === 'visible') callback(); };
  window.addEventListener('pageshow', resume);
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  return () => {
    window.removeEventListener('pageshow', resume);
    window.removeEventListener('focus', resume);
    document.removeEventListener('visibilitychange', resume);
  };
}

export function isStandaloneWeb() {
  if (!isWeb) return false;
  const navigator = window.navigator as Navigator & { standalone?: boolean };
  return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function reloadWebApp() {
  if (!isWeb) return;
  const url = new URL(window.location.href);
  url.searchParams.set('kelly-refresh', Date.now().toString());
  window.location.replace(url.toString());
}

export function watchWebRelease(onNewVersion: () => void) {
  if (!isWeb) return;
  const currentVersion = document.querySelector<HTMLMetaElement>('meta[name="kelly-version"]')?.content;
  const releaseUrl = document.querySelector<HTMLLinkElement>('link[rel="kelly-release"]')?.href;
  if (!currentVersion || !releaseUrl) return;
  let active = true;
  let checking = false;
  async function check() {
    if (!releaseUrl || checking) return;
    checking = true;
    try {
      const url = new URL(releaseUrl);
      url.searchParams.set('v', Date.now().toString());
      const response = await fetch(url, { cache: 'no-store' });
      if (!active || !response.ok) return;
      const { version } = await response.json();
      if (active && typeof version === 'string' && /^[a-f0-9]{32}$/.test(version) && version !== currentVersion) onNewVersion();
    } catch { /* Offline visits can still use the loaded version. */ }
    finally { checking = false; }
  }
  const unsubscribe = onWebResume(check);
  void check();
  return () => { active = false; unsubscribe?.(); };
}
