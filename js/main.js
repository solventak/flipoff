import { Board } from './Board.js';
import { SoundEngine } from './SoundEngine.js';
import { MessageRotator } from './MessageRotator.js';
import { KeyboardController } from './KeyboardController.js';
import { configClient } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
  const boardContainer = document.getElementById('board-container');
  const soundEngine = new SoundEngine();
  const board = new Board(boardContainer, soundEngine);
  const rotator = new MessageRotator(board);
  const keyboard = new KeyboardController(rotator, soundEngine);

  // Initialize audio on first user interaction (browser autoplay policy)
  let audioInitialized = false;
  const initAudio = async () => {
    if (audioInitialized) return;
    audioInitialized = true;
    await soundEngine.init();
    soundEngine.resume();
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
  };
  document.addEventListener('click', initAudio);
  document.addEventListener('keydown', initAudio);

  // Apply config and react to live updates
  configClient.onChange((cfg) => {
    board.applyConfig(cfg);
    rotator.applyConfig(cfg);
  });

  // Temporary message: pause rotation and show immediately
  configClient.onTempMessage((message) => {
    rotator.pause();
    board.displayMessage(message);
  });

  // Temp cleared: resume normal rotation
  configClient.onTempClear(() => {
    rotator.resume();
  });

  // Start rotation after first config arrives (WebSocket pushes on connect)
  let started = false;
  configClient.onChange(() => {
    if (!started) {
      started = true;
      rotator.start();
    }
  });
});
