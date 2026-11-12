// Setup Canvas
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Game State: "START", "PLAYING", "PAUSED", "GAMEOVER"
let gameState = "START";

// Stage 4: Storage & State flags
const STORAGE_KEY = "oceanCatch_v1";
let hasSavedGame = false;

// ── Storage Helpers ──────────────────────────────────────────────────────────
function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bestScore: 0, isMuted: false, savedGame: null };

    const parsed = JSON.parse(raw);

    // Validate types — if anything is wrong, return a clean default
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Invalid storage format");
    }
    if (typeof parsed.bestScore !== "number" || parsed.bestScore < 0) {
      parsed.bestScore = 0;
    }
    if (typeof parsed.isMuted !== "boolean") {
      parsed.isMuted = false;
    }
    // Validate savedGame fields if present
    if (parsed.savedGame !== null && typeof parsed.savedGame === "object") {
      const sg = parsed.savedGame;
      if (typeof sg.score !== "number") sg.score = 0;
      if (typeof sg.lives !== "number" || sg.lives < 1) sg.lives = 3;
      if (typeof sg.fallSpeed !== "number") sg.fallSpeed = 3;
      if (typeof sg.spawnInterval !== "number") sg.spawnInterval = 80;
      if (typeof sg.speedTimer !== "number") sg.speedTimer = 0;
      if (typeof sg.spawnTimer !== "number") sg.spawnTimer = 0;
      if (typeof sg.nextMilestoneIndex !== "number") sg.nextMilestoneIndex = 0;
      if (typeof sg.comboStreak !== "number") sg.comboStreak = 0;
    } else {
      parsed.savedGame = null;
    }

    return parsed;
  } catch (e) {
    // If anything goes wrong, wipe and start fresh
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    return { bestScore: 0, isMuted: false, savedGame: null };
  }
}

function saveStorage(patch) {
  try {
    const current = loadStorage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch (e) {}
}

function clearSavedGame() {
  saveStorage({ savedGame: null });
  hasSavedGame = false;
}

function clearAllData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
  bestScore = 0;
  hasSavedGame = false;
  resetGame();
  gameState = "START";
}

function pauseGame() {
  if (gameState !== "PLAYING" || gameOverPending || lives <= 0) return;
  gameState = "PAUSED";
  hasSavedGame = true;
  saveStorage({
    savedGame: {
      score,
      lives,
      fallSpeed,
      spawnInterval,
      speedTimer,
      spawnTimer,
      nextMilestoneIndex,
      comboStreak
    }
  });
}

function resumeGame() {
  if (gameState !== "PAUSED") return;
  gameState = "PLAYING";
  hitPauseFrames = 0;
  clearSavedGame();
}

function continueGame() {
  const data = loadStorage();
  if (!data.savedGame) return;
  const s = data.savedGame;

  score = s.score ?? 0;
  lives = s.lives ?? 3;
  fallSpeed = s.fallSpeed ?? 3;
  spawnInterval = s.spawnInterval ?? 80;
  speedTimer = s.speedTimer ?? 0;
  spawnTimer = s.spawnTimer ?? 0;
  nextMilestoneIndex = s.nextMilestoneIndex ?? 0;
  comboStreak = s.comboStreak ?? 0;

  items = [];
  particles.length = 0;
  scorePopups.length = 0;

  gameState = "PLAYING";
  hasSavedGame = false;
  clearSavedGame();
}

// Player Basket / Net
const player = {
  x: 200,
  y: 560,
  width: 80,
  height: 15,
  speed: 6,
  color: "#007FFF"
};

// Falling Items
let items = [];

// Scoring and Lives
let score = 0;
let lives = 3;
let bestScore = 0;

// Timers and Speeds
let spawnTimer = 0;
let spawnInterval = 80;
let fallSpeed = 3;
let speedTimer = 0;

// Input handling
const keys = {};
let isMuted = false;
let buttonCooldown = false;

// Stage 5 Fix: Auto-pause when user switches browser tab or minimizes
document.addEventListener("visibilitychange", () => {
  if (document.hidden && gameState === "PLAYING") {
    pauseGame();
  }
});

document.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  // Press 'M' to toggle mute
  if (e.key === "m" || e.key === "M") {
    ensureAudio();
    isMuted = !isMuted;
    saveStorage({ isMuted });
  }
  // Stage 4: Press 'P' or 'Escape' to toggle pause
  if (e.key === "p" || e.key === "P") {
    if (gameState === "PLAYING") {
      pauseGame();
    } else if (gameState === "PAUSED") {
      resumeGame();
    }
  } else if (e.key === "Escape") {
    if (gameState === "PLAYING") {
      pauseGame();
    }
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

canvas.addEventListener("mousemove", (e) => {
  if (gameState !== "PLAYING") return;
  const rect = canvas.getBoundingClientRect();
  player.x = e.clientX - rect.left - player.width / 2;
  // Clamp within bounds
  player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
});

// Click handling for START / RESTART / PAUSE / RESUME / RESET & MUTE
canvas.addEventListener("click", (e) => {
  ensureAudio(); // Unlock audio context on user interaction

  // Stage 5 Fix: Debounce rapid button clicks to prevent state corruption
  if (buttonCooldown) return;
  buttonCooldown = true;
  setTimeout(() => {
    buttonCooldown = false;
  }, 400);

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Check click on Mute button in top-right corner (canvas.width - 46 to canvas.width - 6, y: 6 to 36)
  if (mx >= canvas.width - 46 && mx <= canvas.width - 6 && my >= 6 && my <= 36) {
    isMuted = !isMuted;
    saveStorage({ isMuted });
    return;
  }

  // In PLAYING state: Pause button in top bar (canvas.width - 86 to canvas.width - 52, y: 6 to 36)
  if (gameState === "PLAYING") {
    if (mx >= canvas.width - 86 && mx <= canvas.width - 52 && my >= 6 && my <= 36) {
      pauseGame();
      return;
    }
  }

  if (gameState === "START") {
    // "RESET DATA" button at top-left (x: 10 to 110, y: 10 to 36)
    if (mx >= 10 && mx <= 110 && my >= 10 && my <= 36) {
      clearAllData();
      return;
    }

    if (hasSavedGame) {
      // DIVE IN (New Game): y: 370 to 410
      if (mx > canvas.width / 2 - 65 && mx < canvas.width / 2 + 65 &&
          my > 370 && my < 410) {
        resetGame();
        gameState = "PLAYING";
        return;
      }
      // CONTINUE (Resume Saved Game): y: 420 to 460
      if (mx > canvas.width / 2 - 65 && mx < canvas.width / 2 + 65 &&
          my > 420 && my < 460) {
        continueGame();
        return;
      }
    } else {
      // START button: x: width/2 - 60 to +60, y: 390 to 430
      if (mx > canvas.width / 2 - 60 && mx < canvas.width / 2 + 60 &&
          my > 390 && my < 430) {
        resetGame();
        gameState = "PLAYING";
        return;
      }
    }
  } else if (gameState === "PAUSED") {
    // CONTINUE button: x: width/2 - 65 to +65, y: 325 to 365
    if (mx > canvas.width / 2 - 65 && mx < canvas.width / 2 + 65 &&
        my > 325 && my < 365) {
      resumeGame();
      return;
    }
    // RESTART button: x: width/2 - 65 to +65, y: 375 to 415
    if (mx > canvas.width / 2 - 65 && mx < canvas.width / 2 + 65 &&
        my > 375 && my < 415) {
      resetGame();
      gameState = "PLAYING";
      return;
    }
    // MAIN MENU button: x: width/2 - 65 to +65, y: 425 to 465
    if (mx > canvas.width / 2 - 65 && mx < canvas.width / 2 + 65 &&
        my > 425 && my < 465) {
      // Saved game remains so player can continue later if they want
      gameState = "START";
      return;
    }
  } else if (gameState === "GAMEOVER") {
    // RESTART button: x: width/2 - 65 to +65, y: 330 to 370
    if (mx > canvas.width / 2 - 65 && mx < canvas.width / 2 + 65 &&
        my > 330 && my < 370) {
      resetGame();
      gameState = "PLAYING";
      return;
    }
    // MAIN MENU button: x: width/2 - 65 to +65, y: 385 to 425
    if (mx > canvas.width / 2 - 65 && mx < canvas.width / 2 + 65 &&
        my > 385 && my < 425) {
      resetGame();
      gameState = "START";
      return;
    }
  }
});

// ==========================================
// PALETTE & VISUAL STATE
// ==========================================
const COLORS = {
  orchid:      "#DA70D6",
  hotPink:     "#FF0090",
  crimson:     "#E52B50",
  steelBlue:   "#2072AF",
  oceanBlue:   "#0095B6",
  skyBlue:     "#87CEEB",
  neonGreen:   "#66FF00",
  deepGreen:   "#00563B",
  hunterGreen: "#177245",
  shamrock:    "#03C03C",
  carrot:      "#ED9121",
  darkRed:     "#8B0000",
  salmon:      "#F88379",
  burgundy:    "#7F1734",
  amber:       "#FFBF00",
  azure:       "#007FFF"
};

let frame = 0;
let lightRayOffset = 0;
let playerGlowTimer = 0;
let playerGlowColor = COLORS.azure;
let dangerVignetteTimer = 0;

// Visual Particle and Decor Arrays
const bubbles = [];
const particles = [];
const scorePopups = [];
const seabedPlants = [];
const seabedDeco = [];

// ==========================================
// STAGE 3: SENSORY FEEDBACK STATE
// ==========================================
let audioCtx = null;

let shakeIntensity = 0;
const shakeDecay = 0.85;

let comboStreak = 0;
let comboDisplayTimer = 0;

let hitPauseFrames = 0;

let netSquash = 1.0;
let netSquashTimer = 0;

const MILESTONES = [50, 100, 150, 200, 300, 500, 750, 1000];
let nextMilestoneIndex = 0;
let milestoneBanner = null; // { text, life, maxLife }

let lastLifePulseTimer = 0;

let slowMotionFactor = 1.0;
let slowMotionTimer = 0;
let gameOverPending = false;

// ==========================================
// WEB AUDIO PROCEDURAL SYNTHESIZER
// ==========================================
function ensureAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playGoodCatch() {
  if (!audioCtx || isMuted) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(660, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch (e) {}
}

function playBadCatch() {
  if (!audioCtx || isMuted) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) {}
}

function playComboSound(streak) {
  if (!audioCtx || isMuted) return;
  try {
    const baseFreq = 440 + Math.min(streak - 2, 8) * 90;
    [1, 1.25, 1.5].forEach((mult, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "triangle";
      osc.frequency.value = baseFreq * mult;
      gain.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.07);
      gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + i * 0.07 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.07 + 0.25);
      osc.start(audioCtx.currentTime + i * 0.07);
      osc.stop(audioCtx.currentTime + i * 0.07 + 0.3);
    });
  } catch (e) {}
}

function playMilestoneFanfare() {
  if (!audioCtx || isMuted) return;
  try {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.09 + 0.35);
      osc.start(audioCtx.currentTime + i * 0.09);
      osc.stop(audioCtx.currentTime + i * 0.09 + 0.4);
    });
  } catch (e) {}
}

function playGameOver() {
  if (!audioCtx || isMuted) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 1.2);
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);
    osc.start();
    osc.stop(audioCtx.currentTime + 1.5);
  } catch (e) {}
}

function playLastLifeWarning() {
  if (!audioCtx || isMuted) return;
  try {
    [0, 0.18].forEach((delay) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.value = 85;
      gain.gain.setValueAtTime(0.35, audioCtx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + 0.15);
      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + 0.2);
    });
  } catch (e) {}
}

function comboColor(streak) {
  if (streak <= 2) return COLORS.amber;
  if (streak === 3) return COLORS.neonGreen;
  if (streak === 4) return COLORS.hotPink;
  return COLORS.orchid;
}

function spawnComboText(streak, x, y) {
  const labels = ["", "", "NICE! ×2", "GREAT! ×3", "AMAZING! ×4", "LEGENDARY! ×5"];
  const label = labels[Math.min(streak, 5)] || `UNSTOPPABLE! ×${streak}`;
  scorePopups.push({
    x: x,
    y: y - 20,
    text: label,
    life: 55,
    maxLife: 55,
    color: comboColor(streak)
  });
}

function createMilestoneFlash(value) {
  milestoneBanner = {
    text: `⭐ ${value} POINTS! ⭐`,
    life: 80,
    maxLife: 80
  };
  const burstCols = [COLORS.amber, COLORS.neonGreen, COLORS.orchid, COLORS.skyBlue];
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2 - 40,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 40,
      maxLife: 40,
      color: burstCols[Math.floor(Math.random() * burstCols.length)],
      size: 5 + Math.random() * 5
    });
  }
}

// Initialize bubbles (18 continuous bubbles)
for (let i = 0; i < 18; i++) {
  bubbles.push({
    x: Math.random() * 480,
    y: Math.random() * 600,
    r: 4 + Math.random() * 12,
    speed: 0.5 + Math.random() * 0.9,
    drift: 0.2 + Math.random() * 0.4,
    phase: Math.random() * Math.PI * 2
  });
}

// Initialize seabed plants (wavy kelp/seaweed)
const plantCount = 7;
for (let i = 0; i < plantCount; i++) {
  const stalkX = 30 + (i * (420 / (plantCount - 1))) + (Math.random() * 20 - 10);
  const stalkH = 50 + Math.random() * 55;
  const col = (i % 3 === 0) ? COLORS.deepGreen : (i % 3 === 1 ? COLORS.hunterGreen : COLORS.shamrock);
  seabedPlants.push({
    x: stalkX,
    h: stalkH,
    color: col,
    w: 7 + Math.random() * 3,
    phase: Math.random() * Math.PI * 2
  });
}

// Initialize seabed deco (starfish & coral clusters)
seabedDeco.push({ type: "coral", x: 15, y: 585, r: 24, color: COLORS.burgundy });
seabedDeco.push({ type: "coral", x: 38, y: 590, r: 18, color: COLORS.salmon });
seabedDeco.push({ type: "coral", x: 440, y: 586, r: 22, color: COLORS.carrot });
seabedDeco.push({ type: "starfish", x: 75, y: 582, r: 14, color: COLORS.carrot, rot: 0.2 });
seabedDeco.push({ type: "starfish", x: 410, y: 584, r: 15, color: COLORS.amber, rot: -0.4 });
seabedDeco.push({ type: "anemone", x: 230, y: 588, color: COLORS.hotPink });
seabedDeco.push({ type: "anemone", x: 350, y: 588, color: COLORS.orchid });

// Spawn item with visual creature type preserved within AABB rect
function spawnItem() {
  const isGood = Math.random() > 0.35; // ~65% good, 35% bad
  let visualType = 0;
  if (isGood) {
    visualType = Math.floor(Math.random() * 4); // 0: Fish, 1: Coin, 2: Pearl Shell, 3: Starfish
  } else {
    visualType = Math.floor(Math.random() * 3); // 0: Sea Urchin, 1: Toxic Jellyfish, 2: Dark Coral
  }

  items.push({
    x: Math.random() * (canvas.width - 30),
    y: -20,
    width: 30,
    height: 20,
    color: isGood ? "#6f6" : "#f44",
    isGood: isGood,
    visualType: visualType,
    speed: fallSpeed + Math.random() * 2
  });
}

// AABB Collision Detection (unchanged)
function checkCollision(item) {
  return (
    item.x < player.x + player.width &&
    item.x + item.width > player.x &&
    item.y < player.y + player.height &&
    item.y + item.height > player.y
  );
}

// Reset Game
function resetGame() {
  score = 0;
  lives = 3;
  items = [];
  particles.length = 0;
  scorePopups.length = 0;
  spawnTimer = 0;
  spawnInterval = 80;
  fallSpeed = 3;
  speedTimer = 0;
  player.x = (canvas.width - player.width) / 2;
  playerGlowTimer = 0;
  dangerVignetteTimer = 0;

  // Sensory feedback resets
  comboStreak = 0;
  comboDisplayTimer = 0;
  hitPauseFrames = 0;
  netSquash = 1.0;
  netSquashTimer = 0;
  nextMilestoneIndex = 0;
  milestoneBanner = null;
  lastLifePulseTimer = 0;
  slowMotionFactor = 1.0;
  slowMotionTimer = 0;
  gameOverPending = false;
  shakeIntensity = 0;

  // Stage 4: Clear in-progress snapshot
  clearSavedGame();
}

// Add sparkles
function createSparkles(x, y, isGood) {
  if (isGood) {
    const cols = [COLORS.neonGreen, "#7FFFD4", COLORS.amber, "#FFD700", COLORS.skyBlue];
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 20,
        maxLife: 20,
        color: cols[Math.floor(Math.random() * cols.length)],
        size: 3 + Math.random() * 4
      });
    }
  } else {
    const cols = [COLORS.crimson, COLORS.hotPink, COLORS.darkRed];
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 18,
        maxLife: 18,
        color: cols[Math.floor(Math.random() * cols.length)],
        size: 3 + Math.random() * 3
      });
    }
  }
}

// Update passive visual effects (runs even during hit pause)
function updatePassiveEffects() {
  lightRayOffset = (lightRayOffset + 0.25) % canvas.width;
  for (let b of bubbles) {
    b.y -= b.speed;
    b.x += Math.sin(frame * 0.03 + b.phase) * b.drift;
    if (b.y < -b.r - 5) {
      b.y = canvas.height + b.r + Math.random() * 20;
      b.x = Math.random() * canvas.width;
    }
  }

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }

  // Update floating score/combo popups
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    const sp = scorePopups[i];
    sp.y -= 0.75;
    sp.life--;
    if (sp.life <= 0) {
      scorePopups.splice(i, 1);
    }
  }

  // Update milestone banner
  if (milestoneBanner) {
    milestoneBanner.life--;
    if (milestoneBanner.life <= 0) {
      milestoneBanner = null;
    }
  }

  if (playerGlowTimer > 0) playerGlowTimer--;
  if (dangerVignetteTimer > 0) dangerVignetteTimer--;
  if (comboDisplayTimer > 0) comboDisplayTimer--;

  // Player net squash & stretch recovery
  if (netSquashTimer > 0) {
    netSquashTimer--;
    if (netSquash < 1.0) {
      // Recovery from squash (good catch)
      netSquash = 0.5 + 0.5 * (1 - netSquashTimer / 12);
    } else {
      // Recovery from stretch (bad catch)
      netSquash = 1.0 + 0.5 * (netSquashTimer / 10);
    }
  } else {
    netSquash = 1.0;
  }
}

// Update game physics & state
function update() {
  updatePassiveEffects();

  if (gameState !== "PLAYING") return;

  // Last-life heartbeat warning
  if (lives === 1 && !gameOverPending) {
    lastLifePulseTimer++;
    if (lastLifePulseTimer % 90 === 0) {
      playLastLifeWarning();
      shakeIntensity = Math.max(shakeIntensity, 4);
    }
  } else {
    lastLifePulseTimer = 0;
  }

  // Handle Game Over slow-motion ramp-down
  if (gameOverPending) {
    slowMotionTimer--;
    slowMotionFactor = Math.max(0, slowMotionTimer / 35);
    for (const item of items) {
      item.y += item.speed * slowMotionFactor;
    }
    if (slowMotionTimer <= 0) {
      gameState = "GAMEOVER";
      gameOverPending = false;
      slowMotionFactor = 1.0;
    }
    return;
  }

  // Keyboard controls
  if (keys["ArrowLeft"] || keys["a"] || keys["A"]) {
    player.x -= player.speed;
  }
  if (keys["ArrowRight"] || keys["d"] || keys["D"]) {
    player.x += player.speed;
  }
  // Clamp player to canvas
  player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));

  // Spawn timer
  spawnTimer++;
  if (spawnTimer >= spawnInterval) {
    spawnItem();
    spawnTimer = 0;
  }

  // Difficulty scaling over time
  speedTimer++;
  if (speedTimer >= 300) {
    fallSpeed += 0.5;
    spawnInterval = Math.max(30, spawnInterval - 5);
    speedTimer = 0;
  }

  // Update items
  for (let i = items.length - 1; i >= 0; i--) {
    items[i].y += items[i].speed;

    if (checkCollision(items[i])) {
      const centerX = items[i].x + items[i].width / 2;
      const centerY = items[i].y + items[i].height / 2;

      if (items[i].isGood) {
        score += 10;
        if (score > bestScore) {
          bestScore = score;
          saveStorage({ bestScore });
        }
        playerGlowColor = COLORS.neonGreen;
        playerGlowTimer = 12;
        createSparkles(centerX, centerY, true);
        scorePopups.push({ x: centerX, y: centerY - 10, text: "+10", life: 40, maxLife: 40, color: COLORS.neonGreen });

        // Stage 3 Sensory Feedback: Good Catch
        playGoodCatch();
        hitPauseFrames = 2;
        netSquash = 0.5;
        netSquashTimer = 12;

        comboStreak++;
        comboDisplayTimer = 90;
        if (comboStreak >= 2) {
          playComboSound(comboStreak);
          spawnComboText(comboStreak, centerX, centerY);
        }

        // Score Milestone Fanfare
        if (MILESTONES[nextMilestoneIndex] && score >= MILESTONES[nextMilestoneIndex]) {
          playMilestoneFanfare();
          createMilestoneFlash(MILESTONES[nextMilestoneIndex]);
          nextMilestoneIndex++;
        }
      } else {
        lives -= 1;
        playerGlowColor = COLORS.crimson;
        playerGlowTimer = 12;
        dangerVignetteTimer = 15;
        createSparkles(centerX, centerY, false);

        // Stage 3 Sensory Feedback: Bad Catch
        playBadCatch();
        hitPauseFrames = 4;
        shakeIntensity = 10;
        netSquash = 1.5;
        netSquashTimer = 10;
        comboStreak = 0;
        comboDisplayTimer = 0;
      }
      items.splice(i, 1);
      continue;
    }

    // Off-screen cleanup
    if (items[i].y > canvas.height) {
      items.splice(i, 1);
    }
  }

  // Check Game Over with Slow-Motion ramp-down
  if (lives <= 0 && !gameOverPending) {
    gameOverPending = true;
    slowMotionTimer = 35;
    shakeIntensity = 18;
    playGameOver();
  }
}

// ==========================================
// DRAWING PRIMITIVES & VISUAL FUNCTIONS
// ==========================================

// Draw 5-point star
function drawStar(ctx, cx, cy, spikes, outerR, innerR, fillColor, strokeColor) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += step;
  }
  ctx.closePath();
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

// 1. Layered Ocean Background
function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, COLORS.skyBlue);     // #87CEEB
  grad.addColorStop(0.25, COLORS.oceanBlue); // #0095B6
  grad.addColorStop(0.55, COLORS.steelBlue); // #2072AF
  grad.addColorStop(0.82, "#003366");       // Night ocean
  grad.addColorStop(1, "#001F3F");          // Deepest floor
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Animated light rays drifting across surface
  ctx.save();
  ctx.fillStyle = "rgba(135, 206, 235, 0.08)";
  for (let i = -1; i < 4; i++) {
    const rx = (i * 150 + lightRayOffset) % (canvas.width + 150) - 80;
    ctx.beginPath();
    ctx.moveTo(rx, 0);
    ctx.lineTo(rx + 45, 0);
    ctx.lineTo(rx - 30 + 130, canvas.height * 0.7);
    ctx.lineTo(rx - 70 + 130, canvas.height * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// 2. Rising Bubbles Layer
function drawBubbles() {
  ctx.save();
  for (const b of bubbles) {
    ctx.strokeStyle = "rgba(0, 149, 182, 0.65)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(224, 255, 255, 0.15)";
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.arc(b.x - b.r * 0.32, b.y - b.r * 0.32, Math.max(1, b.r * 0.22), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 3. Marine Plants & Seabed Layer
function drawSeabed() {
  ctx.save();

  // Seabed base sand mound
  ctx.fillStyle = "#0c2840";
  ctx.beginPath();
  ctx.ellipse(canvas.width / 2, 600, 270, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw coral mounds and static starfish
  for (const deco of seabedDeco) {
    if (deco.type === "coral") {
      ctx.fillStyle = deco.color;
      ctx.beginPath();
      ctx.arc(deco.x, deco.y, deco.r, Math.PI, 0, false);
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (deco.type === "starfish") {
      drawStar(ctx, deco.x, deco.y, 5, deco.r, deco.r * 0.45, deco.color, COLORS.amber);
    } else if (deco.type === "anemone") {
      ctx.fillStyle = COLORS.darkRed;
      ctx.fillRect(deco.x - 12, deco.y - 6, 24, 12);
      const sway = Math.sin(frame * 0.03 + deco.x) * 4;
      ctx.strokeStyle = deco.color;
      ctx.lineWidth = 2.5;
      for (let t = -3; t <= 3; t++) {
        ctx.beginPath();
        ctx.moveTo(deco.x + t * 3, deco.y - 6);
        ctx.quadraticCurveTo(deco.x + t * 4 + sway, deco.y - 18, deco.x + t * 2 + sway * 1.5, deco.y - 24);
        ctx.stroke();
        ctx.fillStyle = COLORS.orchid;
        ctx.beginPath();
        ctx.arc(deco.x + t * 2 + sway * 1.5, deco.y - 25, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Draw swaying kelp stalks
  for (const plant of seabedPlants) {
    const sway = Math.sin(frame * 0.025 + plant.phase) * 10;
    ctx.strokeStyle = plant.color;
    ctx.lineWidth = plant.w;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(plant.x, 600);
    ctx.bezierCurveTo(
      plant.x + sway * 0.5, 600 - plant.h * 0.4,
      plant.x - sway * 0.8, 600 - plant.h * 0.7,
      plant.x + sway, 600 - plant.h
    );
    ctx.stroke();

    // Fronds branching off stalk
    ctx.fillStyle = "rgba(102, 255, 0, 0.7)";
    const midY = 600 - plant.h * 0.5;
    ctx.beginPath();
    ctx.ellipse(plant.x + sway * 0.2 + 8, midY, 6, 3, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(plant.x + sway * 0.2 - 8, midY - 14, 6, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// 4. Creature Item Rendering (Preserves exact 30x20 bounding box for collision)
function drawItems() {
  ctx.save();
  for (const item of items) {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;

    if (item.isGood) {
      switch (item.visualType) {
        case 0: // Tropical Fish
          ctx.fillStyle = COLORS.amber;
          ctx.beginPath();
          ctx.ellipse(cx + 2, cy, 11, 7, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = COLORS.carrot;
          ctx.beginPath();
          ctx.moveTo(cx - 7, cy);
          ctx.lineTo(cx - 14, cy - 6);
          ctx.lineTo(cx - 14, cy + 6);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = COLORS.salmon;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx + 1, cy, 5, -Math.PI / 2, Math.PI / 2);
          ctx.stroke();
          ctx.fillStyle = "#000";
          ctx.beginPath();
          ctx.arc(cx + 8, cy - 2, 1.5, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 1: // Golden Treasure Coin
          ctx.fillStyle = COLORS.amber;
          ctx.beginPath();
          ctx.arc(cx, cy, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = COLORS.carrot;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = COLORS.darkRed;
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("$", cx, cy);
          break;

        case 2: // Pearl Shell
          ctx.fillStyle = COLORS.skyBlue;
          ctx.beginPath();
          ctx.arc(cx, cy + 5, 10, Math.PI, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "#E0FFFF";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = "#FFF8DC";
          ctx.beginPath();
          ctx.arc(cx, cy + 1, 4, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 3: // Starfish
        default:
          drawStar(ctx, cx, cy, 5, 11, 5, COLORS.carrot, COLORS.amber);
          break;
      }
    } else {
      switch (item.visualType) {
        case 0: // Sea Urchin
          ctx.strokeStyle = COLORS.darkRed;
          ctx.lineWidth = 1.5;
          for (let s = 0; s < 12; s++) {
            const angle = (s / 12) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * 11, cy + Math.sin(angle) * 11);
            ctx.stroke();
            ctx.fillStyle = COLORS.crimson;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(angle) * 11, cy + Math.sin(angle) * 11, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = COLORS.burgundy;
          ctx.beginPath();
          ctx.arc(cx, cy, 6, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 1: // Toxic Jellyfish
          ctx.fillStyle = "rgba(218, 112, 214, 0.75)";
          ctx.beginPath();
          ctx.arc(cx, cy - 2, 8, Math.PI, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = COLORS.hotPink;
          ctx.lineWidth = 1.5;
          const jWobble = Math.sin(frame * 0.1) * 2;
          for (let t = -2; t <= 2; t++) {
            ctx.beginPath();
            ctx.moveTo(cx + t * 3, cy - 2);
            ctx.quadraticCurveTo(cx + t * 4 + jWobble, cy + 4, cx + t * 2 - jWobble, cy + 9);
            ctx.stroke();
          }
          break;

        case 2: // Dark Coral
        default:
          ctx.fillStyle = COLORS.burgundy;
          ctx.fillRect(cx - 7, cy - 6, 14, 12);
          ctx.fillStyle = COLORS.crimson;
          ctx.fillRect(cx - 10, cy - 2, 6, 8);
          ctx.fillRect(cx + 4, cy - 7, 5, 9);
          break;
      }
    }
  }
  ctx.restore();
}

// 5. Player Glowing Net / Basket with Squash & Stretch
function drawPlayer() {
  ctx.save();

  // Squash & Stretch origin at center of player net
  const centerX = player.x + player.width / 2;
  const centerY = player.y + player.height / 2;
  ctx.translate(centerX, centerY);
  ctx.scale(1, netSquash);
  ctx.translate(-centerX, -centerY);

  // Basket Net Frame
  const netGrad = ctx.createLinearGradient(player.x, player.y, player.x + player.width, player.y + player.height);
  netGrad.addColorStop(0, COLORS.azure);
  netGrad.addColorStop(1, COLORS.oceanBlue);

  // Border & Glow
  if (playerGlowTimer > 0) {
    ctx.shadowColor = playerGlowColor;
    ctx.shadowBlur = 18;
  } else {
    ctx.shadowColor = COLORS.azure;
    ctx.shadowBlur = 10;
  }

  // Rounded Basket Shape
  ctx.fillStyle = netGrad;
  ctx.strokeStyle = COLORS.skyBlue;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(player.x, player.y, player.width, player.height, [4, 4, 10, 10]);
  } else {
    ctx.rect(player.x, player.y, player.width, player.height);
  }
  ctx.fill();
  ctx.stroke();

  // Net mesh grid pattern
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 1;
  const colStep = player.width / 5;
  for (let c = 1; c < 5; c++) {
    ctx.beginPath();
    ctx.moveTo(player.x + c * colStep, player.y + 2);
    ctx.lineTo(player.x + c * colStep, player.y + player.height - 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(player.x + 4, player.y + 7);
  ctx.lineTo(player.x + player.width - 4, player.y + 7);
  ctx.stroke();

  ctx.restore();
}

// 6. Particles & Score / Combo Popups
function drawParticles() {
  ctx.save();
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    drawStar(ctx, p.x, p.y, 4, p.size, p.size * 0.4, p.color);
  }
  ctx.restore();

  // Floating text popups "+10" and combo labels
  ctx.save();
  for (const sp of scorePopups) {
    const alpha = Math.max(0, sp.life / sp.maxLife);
    ctx.fillStyle = sp.color || COLORS.neonGreen;
    ctx.globalAlpha = alpha;
    ctx.font = "bold 16px 'Segoe UI', Tahoma, sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    ctx.fillText(sp.text, sp.x, sp.y);
  }
  ctx.restore();

  // Screen Danger Vignette Flash on bad catch
  if (dangerVignetteTimer > 0) {
    ctx.save();
    const alpha = (dangerVignetteTimer / 15) * 0.35;
    const vig = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 120,
      canvas.width / 2, canvas.height / 2, canvas.width / 1.1
    );
    vig.addColorStop(0, "rgba(229, 43, 80, 0)");
    vig.addColorStop(1, `rgba(229, 43, 80, ${alpha})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

// 7. HUD & Sensory Overlays
function drawHUD() {
  ctx.save();
  // Semi-transparent frosted glass top bar
  ctx.fillStyle = "rgba(0, 20, 45, 0.65)";
  ctx.fillRect(0, 0, canvas.width, 42);

  // Last-life pulse on top bar
  if (lives === 1) {
    const pulseAlpha = 0.35 + 0.25 * Math.sin(frame * 0.12);
    ctx.fillStyle = `rgba(229, 43, 80, ${pulseAlpha})`;
    ctx.fillRect(0, 0, canvas.width, 42);
  }

  ctx.strokeStyle = "rgba(32, 114, 175, 0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 42);
  ctx.lineTo(canvas.width, 42);
  ctx.stroke();

  // Score
  ctx.fillStyle = COLORS.amber;
  ctx.font = "bold 18px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("🐚 Score: " + score, 16, 27);

  // Pause button icon in top bar (x: width - 82, y: 12)
  ctx.fillStyle = "rgba(0, 127, 255, 0.25)";
  ctx.strokeStyle = COLORS.skyBlue;
  ctx.lineWidth = 1;
  ctx.fillRect(canvas.width - 86, 9, 32, 24);
  ctx.strokeRect(canvas.width - 86, 9, 32, 24);

  ctx.fillStyle = COLORS.skyBlue;
  ctx.font = "bold 13px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("⏸", canvas.width - 70, 26);

  // Mute button indicator (x: width - 46 to width - 6)
  ctx.fillStyle = isMuted ? "rgba(229, 43, 80, 0.3)" : "rgba(0, 127, 255, 0.25)";
  ctx.strokeStyle = isMuted ? COLORS.crimson : COLORS.skyBlue;
  ctx.lineWidth = 1;
  ctx.fillRect(canvas.width - 46, 9, 36, 24);
  ctx.strokeRect(canvas.width - 46, 9, 36, 24);

  ctx.fillStyle = isMuted ? COLORS.crimson : COLORS.skyBlue;
  ctx.font = "bold 12px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(isMuted ? "🔇" : "🔊", canvas.width - 28, 26);

  // Lives with red hearts
  ctx.fillStyle = COLORS.crimson;
  ctx.textAlign = "right";
  let heartsStr = "";
  for (let l = 0; l < lives; l++) heartsStr += "❤️ ";
  ctx.fillText(heartsStr || "💀", canvas.width - 100, 27);

  ctx.restore();
}

// 8. Combo Streak HUD Label
function drawComboHUD() {
  if (comboStreak >= 2 && comboDisplayTimer > 0) {
    ctx.save();
    const alpha = Math.min(1, comboDisplayTimer / 30);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = comboColor(comboStreak);
    ctx.shadowColor = COLORS.orchid;
    ctx.shadowBlur = 10;
    ctx.font = "bold 18px 'Segoe UI', Tahoma, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`🔥 ×${comboStreak} STREAK!`, canvas.width / 2, 30);
    ctx.restore();
  }
}

// 9. Milestone Celebration Banner
function drawMilestoneBanner() {
  if (milestoneBanner) {
    ctx.save();
    const alpha = Math.min(1, milestoneBanner.life / 25);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0, 20, 45, 0.75)";
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 2;
    const bw = 240;
    const bh = 44;
    const bx = (canvas.width - bw) / 2;
    const by = canvas.height / 2 - 60;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = COLORS.amber;
    ctx.shadowColor = COLORS.azure;
    ctx.shadowBlur = 12;
    ctx.font = "bold 18px 'Segoe UI', Tahoma, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(milestoneBanner.text, canvas.width / 2, by + bh / 2);
    ctx.restore();
  }
}

// 10. Last-Life Full-Screen Pulse Warning
function drawLastLifePulse() {
  if (lives === 1 && gameState === "PLAYING" && !gameOverPending) {
    ctx.save();
    const pulseAlpha = 0.08 + 0.08 * Math.sin(frame * 0.12);
    ctx.fillStyle = `rgba(229, 43, 80, ${pulseAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

// 11. Screens: START, PAUSED & GAMEOVER
function drawStartScreen() {
  drawBackground();
  drawBubbles();
  drawSeabed();

  ctx.save();

  // Reset Data button in top-left corner
  ctx.fillStyle = "rgba(127, 23, 52, 0.4)";
  ctx.strokeStyle = COLORS.crimson;
  ctx.lineWidth = 1;
  ctx.fillRect(10, 10, 100, 26);
  ctx.strokeRect(10, 10, 100, 26);
  ctx.fillStyle = COLORS.salmon;
  ctx.font = "bold 11px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🗑️ RESET DATA", 60, 23);

  // Mute button in top-right corner
  ctx.fillStyle = isMuted ? "rgba(229, 43, 80, 0.3)" : "rgba(0, 127, 255, 0.25)";
  ctx.strokeStyle = isMuted ? COLORS.crimson : COLORS.skyBlue;
  ctx.lineWidth = 1;
  ctx.fillRect(canvas.width - 46, 9, 36, 24);
  ctx.strokeRect(canvas.width - 46, 9, 36, 24);
  ctx.fillStyle = isMuted ? COLORS.crimson : COLORS.skyBlue;
  ctx.font = "bold 12px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(isMuted ? "🔇" : "🔊", canvas.width - 28, 21);

  // Title with ocean glow
  ctx.shadowColor = COLORS.oceanBlue;
  ctx.shadowBlur = 15;
  ctx.fillStyle = COLORS.skyBlue;
  ctx.font = "bold 32px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("🌊 OCEAN CATCH 🌊", canvas.width / 2, 175);

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#FFF8DC";
  ctx.font = "14px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("Dive in and catch the underwater treasures!", canvas.width / 2, 210);

  // Guide box
  ctx.fillStyle = "rgba(0, 31, 63, 0.75)";
  ctx.strokeStyle = COLORS.steelBlue;
  ctx.lineWidth = 1.5;
  ctx.fillRect(canvas.width / 2 - 160, 230, 320, 120);
  ctx.strokeRect(canvas.width / 2 - 160, 230, 320, 120);

  ctx.font = "bold 14px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillStyle = COLORS.shamrock;
  ctx.fillText("🐟 Catch SEA CREATURES   +10 pts", canvas.width / 2, 255);

  ctx.fillStyle = COLORS.crimson;
  ctx.fillText("🦔 Avoid URCHINS & JELLY   -1 ❤️", canvas.width / 2, 282);

  ctx.fillStyle = COLORS.skyBlue;
  ctx.font = "12px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("Press P or Esc to PAUSE | Press M to MUTE", canvas.width / 2, 310);
  ctx.fillText("Use Arrow Keys, A/D or Mouse to Move", canvas.width / 2, 332);

  // Best Score display
  if (bestScore > 0) {
    ctx.fillStyle = COLORS.amber;
    ctx.font = "bold 14px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText("⭐ Best Record: " + bestScore + " pts", canvas.width / 2, 362);
  }

  if (hasSavedGame) {
    // 1. DIVE IN (New Game) Button
    const btn1X = canvas.width / 2 - 65;
    const btn1Y = 370;
    const btn1W = 130;
    const btn1H = 38;

    ctx.shadowColor = COLORS.azure;
    ctx.shadowBlur = 10;
    ctx.fillStyle = COLORS.azure;
    ctx.fillRect(btn1X, btn1Y, btn1W, btn1H);
    ctx.strokeStyle = "#E0FFFF";
    ctx.lineWidth = 2;
    ctx.strokeRect(btn1X, btn1Y, btn1W, btn1H);

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFF8DC";
    ctx.font = "bold 15px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText("🌊 NEW GAME", canvas.width / 2, btn1Y + 24);

    // 2. CONTINUE (Resume Saved Game) Button
    const btn2X = canvas.width / 2 - 65;
    const btn2Y = 420;
    const btn2W = 130;
    const btn2H = 38;

    ctx.shadowColor = COLORS.shamrock;
    ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS.hunterGreen;
    ctx.fillRect(btn2X, btn2Y, btn2W, btn2H);
    ctx.strokeStyle = COLORS.neonGreen;
    ctx.lineWidth = 2;
    ctx.strokeRect(btn2X, btn2Y, btn2W, btn2H);

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFF8DC";
    ctx.font = "bold 15px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText("▶ CONTINUE", canvas.width / 2, btn2Y + 24);
  } else {
    // Single START Button
    const btnX = canvas.width / 2 - 60;
    const btnY = 390;
    const btnW = 120;
    const btnH = 40;

    ctx.shadowColor = COLORS.azure;
    ctx.shadowBlur = 14;
    ctx.fillStyle = COLORS.azure;
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = "#E0FFFF";
    ctx.lineWidth = 2;
    ctx.strokeRect(btnX, btnY, btnW, btnH);

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFF8DC";
    ctx.font = "bold 16px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText("🌊 DIVE IN", canvas.width / 2, 415);
  }

  ctx.restore();
}

function drawPauseScreen() {
  drawBackground();
  drawBubbles();
  drawSeabed();

  ctx.save();
  // Semi-transparent frosted overlay
  ctx.fillStyle = "rgba(0, 15, 35, 0.82)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Title
  ctx.shadowColor = COLORS.skyBlue;
  ctx.shadowBlur = 16;
  ctx.fillStyle = COLORS.skyBlue;
  ctx.font = "bold 32px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("⏸️ GAME PAUSED", canvas.width / 2, 190);

  ctx.shadowBlur = 0;
  // Progress status box
  ctx.fillStyle = "rgba(0, 31, 63, 0.75)";
  ctx.strokeStyle = COLORS.steelBlue;
  ctx.lineWidth = 1.5;
  ctx.fillRect(canvas.width / 2 - 130, 215, 260, 95);
  ctx.strokeRect(canvas.width / 2 - 130, 215, 260, 95);

  ctx.fillStyle = COLORS.amber;
  ctx.font = "bold 18px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("🐚 Score So Far: " + score, canvas.width / 2, 242);

  ctx.fillStyle = COLORS.skyBlue;
  ctx.font = "15px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("⭐ Best Score: " + bestScore, canvas.width / 2, 268);

  ctx.fillStyle = COLORS.crimson;
  let hearts = "";
  for (let l = 0; l < lives; l++) hearts += "❤️ ";
  ctx.fillText("Lives: " + (hearts || "💀"), canvas.width / 2, 294);

  // 1. CONTINUE Button
  const btn1X = canvas.width / 2 - 65;
  const btn1Y = 325;
  const btn1W = 130;
  const btn1H = 40;

  ctx.shadowColor = COLORS.azure;
  ctx.shadowBlur = 12;
  ctx.fillStyle = COLORS.azure;
  ctx.fillRect(btn1X, btn1Y, btn1W, btn1H);
  ctx.strokeStyle = "#E0FFFF";
  ctx.lineWidth = 2;
  ctx.strokeRect(btn1X, btn1Y, btn1W, btn1H);

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#FFF8DC";
  ctx.font = "bold 15px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("▶ CONTINUE", canvas.width / 2, btn1Y + 25);

  // 2. RESTART Button
  const btn2X = canvas.width / 2 - 65;
  const btn2Y = 375;
  const btn2W = 130;
  const btn2H = 40;

  ctx.fillStyle = "rgba(32, 114, 175, 0.85)";
  ctx.fillRect(btn2X, btn2Y, btn2W, btn2H);
  ctx.strokeStyle = COLORS.skyBlue;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(btn2X, btn2Y, btn2W, btn2H);

  ctx.fillStyle = "#FFF8DC";
  ctx.font = "bold 15px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("🔄 RESTART", canvas.width / 2, btn2Y + 25);

  // 3. MAIN MENU Button
  const btn3X = canvas.width / 2 - 65;
  const btn3Y = 425;
  const btn3W = 130;
  const btn3H = 40;

  ctx.fillStyle = "rgba(0, 31, 63, 0.9)";
  ctx.fillRect(btn3X, btn3Y, btn3W, btn3H);
  ctx.strokeStyle = COLORS.steelBlue;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(btn3X, btn3Y, btn3W, btn3H);

  ctx.fillStyle = COLORS.skyBlue;
  ctx.font = "bold 14px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("🏠 MAIN MENU", canvas.width / 2, btn3Y + 25);

  ctx.restore();
}

function drawGameOverScreen() {
  drawBackground();
  drawBubbles();
  drawSeabed();

  ctx.save();
  // Dark overlay
  ctx.fillStyle = "rgba(0, 15, 35, 0.75)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Title
  ctx.shadowColor = COLORS.crimson;
  ctx.shadowBlur = 18;
  ctx.fillStyle = COLORS.orchid;
  ctx.font = "bold 34px 'Segoe UI', Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GAME OVER", canvas.width / 2, 195);

  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.amber;
  ctx.font = "bold 22px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("Final Score: " + score, canvas.width / 2, 250);

  ctx.fillStyle = COLORS.skyBlue;
  ctx.font = "16px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("Best Score: " + bestScore, canvas.width / 2, 285);

  // RESTART Button (matches click box x: 175..305, y: 330..370)
  const btnX = canvas.width / 2 - 65;
  const btnY = 330;
  const btnW = 130;
  const btnH = 40;

  ctx.shadowColor = COLORS.azure;
  ctx.shadowBlur = 14;
  ctx.fillStyle = COLORS.azure;
  ctx.fillRect(btnX, btnY, btnW, btnH);
  ctx.strokeStyle = "#E0FFFF";
  ctx.lineWidth = 2;
  ctx.strokeRect(btnX, btnY, btnW, btnH);

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#FFF8DC";
  ctx.font = "bold 16px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("🔄 RESTART", canvas.width / 2, 355);

  // MAIN MENU Button
  const btn2X = canvas.width / 2 - 65;
  const btn2Y = 385;
  const btn2W = 130;
  const btn2H = 40;

  ctx.fillStyle = "rgba(0, 31, 63, 0.9)";
  ctx.fillRect(btn2X, btn2Y, btn2W, btn2H);
  ctx.strokeStyle = COLORS.steelBlue;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(btn2X, btn2Y, btn2W, btn2H);

  ctx.fillStyle = COLORS.skyBlue;
  ctx.font = "bold 14px 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText("🏠 MAIN MENU", canvas.width / 2, 410);

  ctx.restore();
}

function drawGame() {
  drawBackground();
  drawBubbles();
  drawSeabed();
  drawItems();
  drawPlayer();
  drawParticles();
  drawLastLifePulse();
  drawHUD();
  drawComboHUD();
  drawMilestoneBanner();
}

// Master Draw with Screen Shake Translation
function draw() {
  ctx.save();

  // Apply Screen Shake
  if (shakeIntensity > 0.5) {
    const sx = (Math.random() * 2 - 1) * shakeIntensity;
    const sy = (Math.random() * 2 - 1) * shakeIntensity;
    ctx.translate(sx, sy);
    shakeIntensity *= shakeDecay;
  } else {
    shakeIntensity = 0;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (gameState === "START") {
    drawStartScreen();
  } else if (gameState === "PLAYING") {
    drawGame();
  } else if (gameState === "PAUSED") {
    drawPauseScreen();
  } else if (gameState === "GAMEOVER") {
    drawGameOverScreen();
  }

  ctx.restore();
}

// Main Game Loop with Hit Pause
function gameLoop() {
  frame++;

  if (gameState === "PAUSED") {
    updatePassiveEffects();
    draw();
  } else if (hitPauseFrames > 0) {
    hitPauseFrames--;
    updatePassiveEffects();
    draw();
  } else {
    update();
    draw();
  }

  requestAnimationFrame(gameLoop);
}

// ── Stage 4: Startup Initialization ──────────────────────────────────────────
(function initStorage() {
  const data = loadStorage();
  bestScore = data.bestScore ?? 0;
  isMuted = data.isMuted ?? false;
  if (data.savedGame && data.savedGame.lives > 0) {
    hasSavedGame = true;
  } else {
    hasSavedGame = false;
  }
})();

gameLoop();
