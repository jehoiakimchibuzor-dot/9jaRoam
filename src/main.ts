import './style.css';
import { Game } from './game/Game';
import { IntroFlow } from './game/ui/IntroFlow';
import { SettingsPanel } from './game/ui/SettingsPanel';
import { getCharacterCreator } from './game/ui/CharacterCreator';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const params = new URLSearchParams(window.location.search);

const game = new Game(canvas, {
  speed: document.getElementById('speed'),
  hint: document.getElementById('hint'),
  diag: params.has('diag') ? document.getElementById('diag') : null,
  minimap: document.getElementById('minimap') as HTMLCanvasElement | null
});

// The sign-in / onboarding flow stays usable in portrait. The rotate prompt
// only appears once the player is about to enter the actual landscape game.
let gameStarted = false;
const rotateEl = document.getElementById('rotate');
const rotateContinue = document.getElementById('rotate-continue');
const characterCreator = getCharacterCreator();

// While the account screens are open the page must allow vertical scrolling;
// gameplay itself keeps touch-action disabled for the joystick controls.
document.body.classList.add('intro-active');

function isPortrait(): boolean {
  return window.matchMedia('(orientation: portrait)').matches || window.innerHeight > window.innerWidth;
}

function updateRotatePrompt(): void {
  const portrait = isPortrait();
  if (window.__roam) window.__roam.portrait = portrait;
  if (!rotateEl) return;
  const show = gameStarted && portrait && !characterCreator.isOpen;
  rotateEl.classList.toggle('is-hidden', !show);
  rotateEl.setAttribute('aria-hidden', show ? 'false' : 'true');
  document.body.classList.toggle('rotate-prompted', show);
}

window.addEventListener('resize', updateRotatePrompt);
window.addEventListener('orientationchange', updateRotatePrompt);
document.addEventListener('creator-statechange', updateRotatePrompt);
rotateContinue?.addEventListener('click', () => requestGameFullscreen());
updateRotatePrompt();

if (params.has('diag')) {
  const diag = document.getElementById('diag');
  if (diag) diag.style.display = 'block';
} else {
  const diag = document.getElementById('diag');
  if (diag) diag.style.display = 'none';
}

// ── Start with auth / onboarding flow, then launch game ──
const intro = new IntroFlow((user) => {
  console.log('9ja Roam · authenticated as:', user.username, user.isGuest ? '(guest)' : '');
  game.setUser(user);
  game.start();
  gameStarted = true;
  document.body.classList.remove('intro-active', 'splash-active');
  document.body.classList.add('game-active');
  updateRotatePrompt();
  // In portrait, wait for the rotate prompt's tap before locking landscape.
  if (!isPortrait()) requestGameFullscreen();
});

intro.start();

interface RoamDebug {
  game: Game;
  portrait: boolean;
}

declare global {
  interface Window {
    __roam?: RoamDebug;
  }
}

window.__roam = {
  game,
  portrait: window.innerHeight > window.innerWidth
};

const settingsPanel = new SettingsPanel({
  onUserChanged: (user) => game.setUser(user),
  isPaused: () => game.isPaused,
  setPaused: (paused) => game.setMenuPaused(paused)
});
settingsPanel.attach();
game.setSettingsHandler(() => settingsPanel.open());

async function tryLockLandscape(): Promise<void> {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    if (orientation.lock) {
      await orientation.lock('landscape');
    }
  } catch {
    // Orientation lock is best-effort on the web; Android manifest enforces it natively.
  }
}

function isFullscreen(): boolean {
  return Boolean(
    document.fullscreenElement ||
      (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement
  );
}

async function enterFullscreen(): Promise<void> {
  if (isFullscreen()) return;

  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };

  try {
    if (root.requestFullscreen) {
      await root.requestFullscreen({ navigationUI: 'hide' });
    } else if (root.webkitRequestFullscreen) {
      await root.webkitRequestFullscreen();
    }
  } catch {
    // iOS Safari has no element fullscreen; the manifest handles home-screen launch.
  }
}

async function exitFullscreen(): Promise<void> {
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else {
      const doc = document as Document & { webkitExitFullscreen?: () => void };
      doc.webkitExitFullscreen?.();
    }
  } catch {
    // Ignore: already out of fullscreen.
  }
}

const fullscreenButton = document.getElementById('fullscreen-toggle');

function updateFullscreenButton(): void {
  if (!fullscreenButton) return;
  const active = isFullscreen();
  fullscreenButton.classList.toggle('is-fullscreen', active);
  fullscreenButton.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  fullscreenButton.setAttribute('title', active ? 'Exit fullscreen' : 'Fullscreen');
}

fullscreenButton?.addEventListener('click', () => {
  if (isFullscreen()) {
    void exitFullscreen();
  } else {
    void enterFullscreen().then(() => tryLockLandscape());
  }
});

document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
updateFullscreenButton();

let autoFullscreenSettled = false;

function requestGameFullscreen(): void {
  if (autoFullscreenSettled) return;

  const touchDevice = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
  if (!touchDevice) {
    autoFullscreenSettled = true;
    return;
  }

  void enterFullscreen().then(() => {
    if (isFullscreen()) autoFullscreenSettled = true;
    void tryLockLandscape();
  });
}

// Only ask for fullscreen / landscape once the game has actually started.
// Taps on the portrait sign-in screens must not rotate the phone away.
// Retry on later taps if the browser refused the first request.
window.addEventListener('pointerdown', () => {
  if (gameStarted && !settingsPanel.isOpen() && !characterCreator.isOpen) requestGameFullscreen();
}, { capture: true });

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const INSTALL_DISMISS_KEY = '9ja_roam_install_prompt_dismissed';
const installBanner = document.getElementById('install-banner');
const installBannerText = document.getElementById('install-banner-text');
const installAccept = document.getElementById('install-banner-accept');
const installClose = document.getElementById('install-banner-close');
const installHudButton = document.getElementById('install-app');

const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

let installPrompt: BeforeInstallPromptEvent | null = null;

function showInstallUi(): void {
  if (isStandalone || sessionStorage.getItem(INSTALL_DISMISS_KEY)) return;
  installHudButton?.removeAttribute('hidden');
  installBanner?.removeAttribute('hidden');
}

function hideInstallUi(): void {
  installHudButton?.setAttribute('hidden', '');
  installBanner?.setAttribute('hidden', '');
}

async function promptInstall(): Promise<void> {
  if (!installPrompt) return;

  const prompt = installPrompt;
  installPrompt = null;

  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'dismissed') {
      sessionStorage.setItem(INSTALL_DISMISS_KEY, 'true');
    }
  } finally {
    hideInstallUi();
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event as BeforeInstallPromptEvent;
  showInstallUi();
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  hideInstallUi();
});

installAccept?.addEventListener('click', () => {
  void promptInstall();
});

installHudButton?.addEventListener('click', () => {
  void promptInstall();
});

installClose?.addEventListener('click', () => {
  hideInstallUi();
  sessionStorage.setItem(INSTALL_DISMISS_KEY, 'true');
});

// iOS Safari has no install prompt event, so show the Share-sheet instruction.
const isIosBrowser = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
if (isIosBrowser && !isStandalone && !sessionStorage.getItem(INSTALL_DISMISS_KEY) && installBanner) {
  if (installBannerText) {
    installBannerText.textContent = 'Tap Share, then “Add to Home Screen”';
  }
  installAccept?.setAttribute('hidden', '');
  installBanner.removeAttribute('hidden');
}

// ── PWA auto-update ──────────────────────────────────────────
// A new deploy should reach an already-open game without the player
// having to clear their browser cache or reinstall the app.
const UPDATE_RELOAD_KEY = '9ja_roam_update_reload';
const hadServiceWorkerController =
  'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller);

try {
  sessionStorage.removeItem(UPDATE_RELOAD_KEY);
} catch {
  // Storage can be unavailable in private modes; updating still works.
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  let reloading = false;

  const showUpdateToast = (): void => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = 'NEW UPDATE · REFRESHING…';
    toast.classList.add('show');
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Skip the very first install (there was no previous controller) and
    // guard against the reload itself causing another reload.
    if (!hadServiceWorkerController || reloading) return;
    if (sessionStorage.getItem(UPDATE_RELOAD_KEY)) return;

    reloading = true;
    sessionStorage.setItem(UPDATE_RELOAD_KEY, '1');
    showUpdateToast();
    window.setTimeout(() => location.reload(), 700);
  });

  void navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      const checkForUpdate = (): void => {
        void registration.update().catch(() => undefined);
      };

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            installing.postMessage('SKIP_WAITING');
          }
        });
      });

      checkForUpdate();
      window.addEventListener('focus', checkForUpdate);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkForUpdate();
      });
      window.setInterval(checkForUpdate, 60_000);
    })
    .catch(() => {
      // Offline support is optional; ignore registration failures.
    });
}
