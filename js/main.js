import { Board } from './Board.js';
import { SoundEngine } from './SoundEngine.js';
import { MessageRotator } from './MessageRotator.js';
import { KeyboardController } from './KeyboardController.js';
import { StatusBar } from './StatusBar.js';
import { configClient } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
  const boardContainer = document.getElementById('board-container');
  const soundEngine = new SoundEngine();
  const board = new Board(boardContainer, soundEngine);
  const rotator = new MessageRotator(board);
  const keyboard = new KeyboardController(rotator, soundEngine);
  const statusBar = new StatusBar(board);

  // Initialize audio on first user interaction (browser autoplay policy)
  let audioInitialized = false;
  const initAudio = async () => {
    if (audioInitialized) return;
    audioInitialized = true;
    await soundEngine.init();
    const activeSound = configClient.get().active_sound;
    if (activeSound && activeSound !== soundEngine._activeSound) {
      await soundEngine.setActiveSound(activeSound);
    } else {
      await soundEngine.ensureReady();
    }
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
  };
  document.addEventListener('click', initAudio);
  document.addEventListener('keydown', initAudio);

  const warmAudio = () => {
    if (!audioInitialized) return;
    soundEngine.ensureReady();
  };
  window.addEventListener('focus', warmAudio);
  window.addEventListener('pageshow', warmAudio);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) warmAudio();
  });

  // Apply config and react to live updates
  configClient.onChange((cfg) => {
    board.applyConfig(cfg);
    rotator.applyConfig(cfg);
    // Load active sound on first config (or if it changed via config replace)
    if (cfg.active_sound && cfg.active_sound !== soundEngine._activeSound) {
      soundEngine.setActiveSound(cfg.active_sound);
    }
  });

  // Temporary message: pause rotation and show immediately
  configClient.onTempMessage((message) => {
    rotator.pause();
    board.displayMessage(message, configClient.get().timing.scramble_rounds);
  });

  // Temp cleared: resume normal rotation
  configClient.onTempClear(() => {
    rotator.resume();
  });

  // Sound changed: reload audio in engine
  configClient.onSoundChanged((name) => {
    soundEngine.setActiveSound(name);
  });

  // Start rotation after first config arrives (WebSocket pushes on connect)
  let started = false;
  configClient.onChange(() => {
    console.log('[main] config received, started:', started);
    if (!started) {
      started = true;
      rotator.start();
      statusBar.start();
      console.log('[main] statusBar.start() called');
    }
  });

  // Fallback: start statusBar even if WS config never arrives
  setTimeout(() => {
    if (!started) {
      console.warn('[main] config never arrived, starting statusBar via fallback');
      statusBar.start();
    }
  }, 3000);
});
