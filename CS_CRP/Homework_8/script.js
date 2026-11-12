// State variables for map navigation
let camX = 0;
let camY = 0;

// Step distance per click / key press
const STEP = 200;

// Map boundary limits
const mapWorld = document.getElementById('map-world');
const compassNeedle = document.getElementById('compass-indicator');

function getMaxBounds() {
  const vpWidth = window.innerWidth;
  const vpHeight = window.innerHeight;
  // World width is 2600, height is 1800
  const minX = Math.min(0, vpWidth - 2600);
  const minY = Math.min(0, vpHeight - 1800);
  return { minX, minY, maxX: 0, maxY: 0 };
}

function updateCamera(dx, dy) {
  const { minX, minY, maxX, maxY } = getMaxBounds();
  
  camX = Math.max(minX, Math.min(maxX, camX + dx));
  camY = Math.max(minY, Math.min(maxY, camY + dy));

  mapWorld.style.transform = `translate(${camX}px, ${camY}px)`;

  // Subtle compass tilt effect based on navigation
  if (dx > 0) compassNeedle.style.transform = 'rotate(45deg)';
  else if (dx < 0) compassNeedle.style.transform = 'rotate(-45deg)';
  else if (dy > 0) compassNeedle.style.transform = 'rotate(0deg)';
  else if (dy < 0) compassNeedle.style.transform = 'rotate(180deg)';
  
  setTimeout(() => {
    compassNeedle.style.transform = 'rotate(0deg)';
  }, 350);
}

// Button click handlers
document.getElementById('btn-up').addEventListener('click', () => updateCamera(0, STEP));
document.getElementById('btn-down').addEventListener('click', () => updateCamera(0, -STEP));
document.getElementById('btn-left').addEventListener('click', () => updateCamera(STEP, 0));
document.getElementById('btn-right').addEventListener('click', () => updateCamera(-STEP, 0));

// Keyboard arrow key navigation
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    updateCamera(0, STEP);
  } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
    updateCamera(0, -STEP);
  } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    updateCamera(STEP, 0);
  } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    updateCamera(-STEP, 0);
  }
});

// Clickable Treasure Chest
const chest = document.getElementById('chest');
const coinsArena = document.getElementById('coins-arena');
let isChestOpen = false;

chest.addEventListener('click', () => {
  isChestOpen = !isChestOpen;
  
  if (isChestOpen) {
    chest.classList.add('open');
    coinsArena.classList.add('popped');
  } else {
    chest.classList.remove('open');
    coinsArena.classList.remove('popped');
  }
});

// Also allow opening via Enter or Space key for accessibility
chest.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    chest.click();
  }
});
