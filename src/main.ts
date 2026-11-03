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
    if (orientation.lock && window.innerHeight < window.innerWidth) {
      await orientation.lock('landscape');
    }
  } catch {
    // Orientation lock is best-effort on the web; Android manifest enforces it natively.
  }
}

window.addEventListener('pointerdown', () => {
  void tryLockLandscape();
}, { once: true });
