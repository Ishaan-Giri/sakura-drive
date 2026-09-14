import './ui/styles.css';
import { Game } from './core/Game';

const container = document.getElementById('app');
const ui = document.getElementById('ui');

if (!container || !ui) {
  throw new Error('Sakura Drive: missing #app / #ui containers');
}

function showFatal(message: string): void {
  ui!.innerHTML = `
    <div class="overlay">
      <div class="start-card">
        <h1 class="start-title" style="font-size:34px">Can't start</h1>
        <p class="start-sub">${message}</p>
      </div>
    </div>`;
}

try {
  const game = new Game(container, ui);
  // Handy for poking at the world from the devtools console.
  (window as unknown as { game: Game }).game = game;
} catch (err) {
  console.error(err);
  showFatal(
    'This game needs WebGL 2. Try a recent Chrome, Edge or Firefox, and make sure hardware acceleration is enabled.',
  );
}
