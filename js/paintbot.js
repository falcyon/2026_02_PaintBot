// ─── Simplex Noise (fast 2D) ──────────────────────────────────────────────
var SimplexNoise = (() => {
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const grad3 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];

  function create(seed) {
    const perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    let s = seed | 0;
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807 + 0) % 2147483647;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

    return function noise2D(x, y) {
      const s = (x + y) * F2;
      const i = Math.floor(x + s);
      const j = Math.floor(y + s);
      const t = (i + j) * G2;
      const X0 = i - t, Y0 = j - t;
      const x0 = x - X0, y0 = y - Y0;
      let i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let n0 = 0, n1 = 0, n2 = 0;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) { t0 *= t0; const g = grad3[perm[ii + perm[jj]] % 8]; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) { t1 *= t1; const g = grad3[perm[ii + i1 + perm[jj + j1]] % 8]; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) { t2 *= t2; const g = grad3[perm[ii + 1 + perm[jj + 1]] % 8]; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
      return 70 * (n0 + n1 + n2);
    };
  }
  return { create };
})();

// ─── World Constants (inches) ──────────────────────────────────────────────
var WORLD_W = 66;
var WORLD_H = 37;
var CONE_HALF_DEG = 15;
var CONE_RANGE = 1.5; // inches
var CONE_HALF = CONE_HALF_DEG * (Math.PI / 180);
var scale = 1; // pixels per inch

// ─── Scenario Registry ────────────────────────────────────────────────────
// Each scenario registers itself here.
// Interface:
//   name:       string
//   init(bot):  set up scenario-specific state on the bot
//   steer(bot): return turn angle in radians
//   avoidEdges(bot): return correction angle in radians
//   drawOverlay(bot, ctx, noseX, noseY): draw scenario visuals
//   spawn(spawnFn, opts): (optional) custom spawn logic — if absent, spawns 1 bot
var Scenarios = {};

// ─── Color Palette ─────────────────────────────────────────────────────────
function randomColor() {
  if (Math.random() < 0.5) return { str: '#d64550' };
  return { str: '#00a6a6' };
}

// ─── Bot Class (all units in inches) ───────────────────────────────────────
class Bot {
  static nextId = 0;

  constructor(opts = {}) {
    this.id = Bot.nextId++;

    this.x = opts.x ?? (1 + Math.random() * (WORLD_W - 2));
    this.y = opts.y ?? (1 + Math.random() * (WORLD_H - 2));
    this.heading = Math.random() * Math.PI * 2;

    this.speed = opts.speed ?? 0.04;       // inches per tick
    this.ink = opts.ink ?? 500;             // inches of travel
    this.maxInk = this.ink;
    this.lineWidth = opts.lineWidth ?? 0.15; // inches
    this.wiggle = opts.wiggle ?? 0.02;      // noise time step
    this.maxTurnDeg = opts.maxTurnDeg ?? 10;

    this.color = opts.color ?? randomColor();
    // cache rgb components for gradient use
    var hex = this.color.str;
    this.color.rgb = parseInt(hex.slice(1,3),16) + ',' +
                     parseInt(hex.slice(3,5),16) + ',' +
                     parseInt(hex.slice(5,7),16);
    this.alive = true;
    this.prevX = this.x;
    this.prevY = this.y;

    // scenario (strategy pattern)
    this.scenario = opts.scenario ?? Scenarios['aimless'];
    if (this.scenario && this.scenario.init) this.scenario.init(this);
  }

  update() {
    if (!this.alive) return;

    this.prevX = this.x;
    this.prevY = this.y;

    // slow down as ink runs low (fade out over last 10%)
    var inkRatio = Math.min(1, this.ink / (this.maxInk * 0.1));

    // delegate steering to scenario
    let turn = this.scenario.steer(this);
    turn += this.scenario.avoidEdges(this);

    this.heading += turn * inkRatio;

    var curSpeed = this.speed * inkRatio;

    this.x += Math.cos(this.heading) * curSpeed;
    this.y += Math.sin(this.heading) * curSpeed;

    // safety clamp (should rarely trigger)
    this.x = Math.max(0, Math.min(WORLD_W, this.x));
    this.y = Math.max(0, Math.min(WORLD_H, this.y));

    this.ink -= curSpeed;
    if (this.ink <= 0) { this.ink = 0; this.alive = false; }
  }

  drawTrail(trailCtx) {
    trailCtx.globalAlpha = Math.max(0.15, this.ink / this.maxInk);
    trailCtx.strokeStyle = this.color.str;
    trailCtx.lineWidth = this.lineWidth * scale;
    trailCtx.lineCap = 'round';
    trailCtx.beginPath();
    trailCtx.moveTo(this.prevX * scale, this.prevY * scale);
    trailCtx.lineTo(this.x * scale, this.y * scale);
    trailCtx.stroke();
    trailCtx.globalAlpha = 1;
  }

  drawSprite(overlayCtx) {
    const sz = (this.lineWidth + 0.6) * scale;
    const h = this.heading;
    const px = this.x * scale, py = this.y * scale;

    const noseX = px + Math.cos(h) * sz;
    const noseY = py + Math.sin(h) * sz;
    const rearLX = px + Math.cos(h + Math.PI + 0.45) * sz * 0.7;
    const rearLY = py + Math.sin(h + Math.PI + 0.45) * sz * 0.7;
    const rearRX = px + Math.cos(h + Math.PI - 0.45) * sz * 0.7;
    const rearRY = py + Math.sin(h + Math.PI - 0.45) * sz * 0.7;

    if (!this.alive) overlayCtx.globalAlpha = 0.3;

    overlayCtx.fillStyle = '#000';
    overlayCtx.beginPath();
    overlayCtx.moveTo(noseX, noseY);
    overlayCtx.lineTo(rearLX, rearLY);
    overlayCtx.lineTo(rearRX, rearRY);
    overlayCtx.closePath();
    overlayCtx.fill();

    // eyes
    const perpX = -Math.sin(h), perpY = Math.cos(h);
    const backX = -Math.cos(h), backY = -Math.sin(h);
    const fwdX = Math.cos(h), fwdY = Math.sin(h);
    const baseX = noseX + backX * sz * 0.35;
    const baseY = noseY + backY * sz * 0.35;
    const side = sz * 0.18;
    const eyeR = Math.max(2, scale * 0.18);
    const pupilR = eyeR * 0.5;
    const pupilOff = eyeR * 0.3;
    const lx = baseX + perpX * side, ly = baseY + perpY * side;
    const rx = baseX - perpX * side, ry = baseY - perpY * side;

    overlayCtx.fillStyle = '#000';
    overlayCtx.beginPath();
    overlayCtx.arc(lx, ly, eyeR, 0, Math.PI * 2);
    overlayCtx.fill();
    overlayCtx.beginPath();
    overlayCtx.arc(rx, ry, eyeR, 0, Math.PI * 2);
    overlayCtx.fill();

    overlayCtx.fillStyle = '#fff';
    overlayCtx.beginPath();
    overlayCtx.arc(lx + fwdX * pupilOff, ly + fwdY * pupilOff, pupilR, 0, Math.PI * 2);
    overlayCtx.fill();
    overlayCtx.beginPath();
    overlayCtx.arc(rx + fwdX * pupilOff, ry + fwdY * pupilOff, pupilR, 0, Math.PI * 2);
    overlayCtx.fill();

    if (!this.alive) { overlayCtx.globalAlpha = 1; return; }

    // scenario-specific overlay (e.g. visibility cone)
    if (this.scenario.drawOverlay) {
      this.scenario.drawOverlay(this, overlayCtx, noseX, noseY);
    }
  }
}

// ─── App ───────────────────────────────────────────────────────────────────
var trailCanvas, trailCtx, overlay, oCtx, botListEl, statsEl;
var bots = [];
var paused = false;
var frame = 0;

function initApp() {
  trailCanvas = document.getElementById('canvas');
  trailCtx = trailCanvas.getContext('2d');
  overlay = document.getElementById('overlay');
  oCtx = overlay.getContext('2d');
  botListEl = document.getElementById('bot-list');
  statsEl = document.getElementById('stats');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  populateScenarioDropdown();
  wireUI();

  addBots();
  tick();
}

function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const availW = wrap.clientWidth - 24;
  const availH = wrap.clientHeight - 24;
  scale = Math.min(availW / WORLD_W, availH / WORLD_H);
  const pw = Math.floor(WORLD_W * scale);
  const ph = Math.floor(WORLD_H * scale);

  trailCanvas.width = pw;
  trailCanvas.height = ph;
  overlay.width = pw;
  overlay.height = ph;

  requestAnimationFrame(() => {
    overlay.style.left = trailCanvas.offsetLeft + 'px';
    overlay.style.top = trailCanvas.offsetTop + 'px';
  });

  trailCtx.fillStyle = '#ffffff';
  trailCtx.fillRect(0, 0, pw, ph);
}

function populateScenarioDropdown() {
  const sel = document.getElementById('opt-scenario');
  sel.innerHTML = '';
  for (const key in Scenarios) {
    if (!Scenarios.hasOwnProperty(key)) continue;
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = Scenarios[key].name;
    sel.appendChild(opt);
  }
  if (Scenarios['love']) sel.value = 'love';
}

function getSelectedScenario() {
  const key = document.getElementById('opt-scenario').value;
  return Scenarios[key];
}

function readOpts() {
  return {
    speed: parseFloat(document.getElementById('opt-speed').value),
    ink: parseFloat(document.getElementById('opt-ink').value),
    lineWidth: parseFloat(document.getElementById('opt-width').value),
    wiggle: parseFloat(document.getElementById('opt-noise').value),
    maxTurnDeg: parseInt(document.getElementById('opt-turn').value),
    scenario: getSelectedScenario(),
  };
}

function spawnBot(opts) {
  const merged = { ...readOpts(), ...opts };
  const bot = new Bot(merged);
  bots.push(bot);
  return bot;
}

function addBots() {
  const scenario = getSelectedScenario();
  if (scenario && scenario.spawn) {
    scenario.spawn(spawnBot, readOpts());
  } else {
    spawnBot();
  }
}

function wireUI() {
  // slider value display
  document.querySelectorAll('#sidebar input[type="range"]').forEach(el => {
    const valSpan = document.getElementById('val-' + el.id.replace('opt-', ''));
    if (valSpan) el.addEventListener('input', () => { valSpan.textContent = el.value; });
  });

  document.getElementById('btn-add').addEventListener('click', () => addBots());
  document.getElementById('btn-add5').addEventListener('click', () => {
    for (let i = 0; i < 5; i++) addBots();
  });

  document.getElementById('btn-pause').addEventListener('click', () => {
    paused = !paused;
    document.getElementById('btn-pause').textContent = paused ? 'Resume' : 'Pause';
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    bots = [];
    trailCtx.fillStyle = '#ffffff';
    trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
  });
}

// ─── Render Loop ───────────────────────────────────────────────────────────
function tick() {
  requestAnimationFrame(tick);
  if (paused) return;
  frame++;

  oCtx.clearRect(0, 0, overlay.width, overlay.height);
  for (const bot of bots) {
    bot.update();
    bot.drawTrail(trailCtx);
    bot.drawSprite(oCtx);
  }

  if (frame % 15 === 0) updateBotList();
}

function updateBotList() {
  const alive = bots.filter(b => b.alive).length;
  statsEl.textContent = `${alive} active / ${bots.length} total`;

  botListEl.innerHTML = '';
  for (const bot of bots) {
    const pct = Math.max(0, (bot.ink / bot.maxInk) * 100);
    const entry = document.createElement('div');
    entry.className = 'bot-entry';
    entry.innerHTML = `
      <div class="bot-swatch" style="background:${bot.color.str};opacity:${bot.alive ? 1 : 0.3}"></div>
      <span style="min-width:18px;font-size:0.7em;">#${bot.id}</span>
      <div class="bot-ink-bar">
        <div class="bot-ink-fill" style="width:${pct}%;background:${bot.color.str};opacity:${bot.alive ? 0.9 : 0.3}"></div>
      </div>
      <span class="bot-status">${bot.alive ? Math.round(pct) + '%' : 'done'}</span>
    `;
    botListEl.appendChild(entry);
  }
}
