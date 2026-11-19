import './style.css';
import { Game } from './game/Game';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const params = new URLSearchParams(window.location.search);

const game = new Game(canvas, {
  speed: document.getElementById('speed'),
  hint: document.getElementById('hint'),
  diag: params.has('diag') ? document.getElementById('diag') : null,
  minimap: document.getElementById('minimap') as HTMLCanvasElement | null
});

if (params.has('diag')) {
  const diag = document.getElementById('diag');
  if (diag) diag.style.display = 'block';
} else {
  const diag = document.getElementById('diag');
  if (diag) diag.style.display = 'none';
}

game.start();

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

// The first tap is a user gesture, which lets browsers hide their address bar
// and lock the phone to landscape. Retry on later taps if the browser refused.
window.addEventListener('pointerdown', requestGameFullscreen, { capture: true });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is optional; ignore registration failures.
    });
  });
}
