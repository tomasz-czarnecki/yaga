/** Pani Yaga: rise-in on load, idle sway, and a speech bubble that types her lines. */

const LINES = [
  'Three hundred years I read tea leaves. Now they call it a confidence interval.',
  'Everyone talks to AI now. Nobody talks to their friends.',
  'Your model is 73% sure. I am 100% sure it’s wrong.',
];
const GLYPHS = '#$%&@*!?≈∑∆∫λθ∂±∞§';
const TYPE_DELAY = 0.45;
const CHARS_PER_SEC = 30;
const HOLD_SECONDS = 4;
const FIRST_LINE_AT = 1.2;
const GAP_SECONDS = 0.7;

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const randomGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

/** Ease-out with overshoot, for the bubble pop. */
function easeOutBack(x) {
  const c = 2.2;
  const d = clamp(x) - 1;
  return 1 + (c + 1) * d ** 3 + c * d ** 2;
}

/** Slides the figure up into place. */
function riseIn(el) {
  el.style.transform = 'translateY(56px)';
  el.style.opacity = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transition = 'transform 1.4s cubic-bezier(.16,.8,.24,1), opacity 1s ease';
    el.style.transform = 'none';
    el.style.opacity = '1';
  }));
}

/** Gently rocks the figure around its feet, one cycle every 7 s. */
function sway(el, t) {
  el.style.transform = `rotate(${Math.sin((t * Math.PI * 2) / 7).toFixed(3)}deg)`;
}

/** Drives the speech bubble: pops in, types a line with glitch glyphs, holds, fades out. */
function createBubble(root) {
  const cloud = root.querySelector('.bubble-cloud');
  const ghost = root.querySelector('.bubble-ghost');
  const typed = root.querySelector('.bubble-typed');
  const rest = root.querySelector('.bubble-rest');
  const [smallDot, largeDot] = root.querySelectorAll('.bubble-dot');
  const state = { line: -1, start: 0, next: null, showing: false };

  function hide(t) {
    state.showing = false;
    state.next = t + GAP_SECONDS;
    for (const el of [root, cloud, smallDot, largeDot]) el.style.opacity = '0';
  }

  function nextLine(t) {
    state.line = (state.line + 1) % LINES.length;
    state.start = t;
    state.showing = true;
    ghost.textContent = LINES[state.line];
    typed.textContent = '';
    rest.textContent = '';
  }

  function typeText(line, u) {
    const count = clamp(Math.floor((u - TYPE_DELAY) * CHARS_PER_SEC), 0, line.length);
    const glyph = count < line.length && u > TYPE_DELAY ? randomGlyph() : '';
    typed.textContent = line.slice(0, count) + glyph;
    rest.textContent = line.slice(count + glyph.length);
  }

  function draw(t) {
    const line = LINES[state.line];
    const u = t - state.start;
    const hold = TYPE_DELAY + line.length / CHARS_PER_SEC + HOLD_SECONDS;
    const wobble = reduceMotion ? 0 : Math.sin(t * 2.1) * 1.2;

    typeText(line, u);
    smallDot.style.opacity = String(clamp(u / 0.08));
    largeDot.style.opacity = String(clamp((u - 0.1) / 0.08));
    cloud.style.opacity = String(clamp((u - 0.2) / 0.06));
    cloud.style.transform = `scale(${(0.2 + 0.8 * easeOutBack((u - 0.2) / 0.32)).toFixed(3)}) rotate(${(-1.5 + wobble).toFixed(2)}deg)`;
    root.style.opacity = String(1 - clamp((u - hold) / 0.3));
    if (u > hold + 0.3) hide(t);
  }

  return function update(t) {
    if (state.next === null) state.next = t + FIRST_LINE_AT;
    if (!state.showing && t >= state.next) nextLine(t);
    if (state.showing) draw(t);
  };
}

/** Wires up one hero: rise-in, sway (image hero only) and speech bubble, animated only while on screen. */
function startHero(hero) {
  const figure = hero.querySelector('.yaga');
  const swayEl = hero.querySelector('.yaga-sway');
  const updateBubble = createBubble(hero.querySelector('.bubble'));
  let visible = false;
  let raf = 0;

  if (!reduceMotion) riseIn(figure);

  function frame(now) {
    raf = visible ? requestAnimationFrame(frame) : 0;
    const t = now / 1000;
    if (swayEl && !reduceMotion) sway(swayEl, t);
    updateBubble(t);
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(frame);
  }, { rootMargin: '80px 0px' }).observe(hero);
}

const WALK_UNITS_PER_SEC = 0.562; // ground covered by one walk cycle, in model units

/** Pixels per model unit, from the viewer's actual camera, so her feet don't slide. */
function pixelsPerUnit(viewer) {
  const visibleHeight = 2 * viewer.getCameraOrbit().radius * Math.tan((viewer.getFieldOfView() * Math.PI) / 360);
  return viewer.offsetHeight / visibleHeight;
}

const FACE_FRONT = '0deg 85deg 1.3m';
const HORIZON = 0.38; // horizon height, as a fraction of the stage from the top
const FAR_SCALE = 0.45; // her size at the horizon, relative to the front
const DEPTH_UNITS = 3; // how deep the floor is, in model units
const FLOOR_MARGIN = 12; // px between the nearest walkable line and the stage bottom

/** 3D hero: click the floor and she walks there, shrinking with distance; on arrival she faces us. */
function startStage(hero) {
  const stage = hero.querySelector('.stage');
  const stroll = hero.querySelector('.stroll');
  const model = hero.querySelector('.yaga-model');
  const anchor = hero.querySelector('.bubble-anchor');
  const marker = hero.querySelector('.marker');
  const hint = hero.querySelector('.stage-hint');
  const pos = { x: 0.35, z: 0.15 }; // x: model units from the stage centre; z: depth, 0 front .. 1 horizon
  let target = null;
  let last = 0;
  let raf = 0;
  let visible = false;

  const scaleAt = (z) => 1 + (FAR_SCALE - 1) * z;
  const nearY = () => stage.clientHeight - FLOOR_MARGIN;
  const floorY = (z) => nearY() - z * (nearY() - stage.clientHeight * HORIZON);

  function place() {
    const s = scaleAt(pos.z);
    const x = stage.clientWidth / 2 + pos.x * s * pixelsPerUnit(model);
    const y = floorY(pos.z);
    const w = stroll.offsetWidth;
    const h = stroll.offsetHeight;
    stroll.style.transform = `translate(${(x - w / 2).toFixed(1)}px, ${(y - h).toFixed(1)}px) scale(${s.toFixed(3)})`;
    const headRight = x + w * s * 0.24;
    const flip = headRight + anchor.firstElementChild.offsetWidth > stage.clientWidth - 16;
    anchor.classList.toggle('is-left', flip);
    const headX = flip ? x - w * s * 0.24 : headRight;
    anchor.style.transform = `translate(${headX.toFixed(1)}px, ${(y - h * s * 0.76).toFixed(1)}px)`;
    anchor.style.visibility = 'visible';
  }

  function stand() {
    target = null;
    model.animationName = 'idle.001';
    model.cameraOrbit = FACE_FRONT;
  }

  // She turns by swinging the camera around her (changing `orientation` throws in model-viewer 4.4).
  function walkTo(next) {
    target = next;
    const towardViewer = (pos.z - next.z) * DEPTH_UNITS;
    const heading = Math.atan2(next.x - pos.x, towardViewer) * (180 / Math.PI);
    model.cameraOrbit = `${(-heading).toFixed(1)}deg 85deg 1.3m`;
    model.animationName = 'walk.001';
  }

  function showMarker(x, y) {
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
    marker.classList.remove('is-on');
    void marker.offsetWidth;
    marker.classList.add('is-on');
  }

  function onClick(event) {
    const rect = stage.getBoundingClientRect();
    const z = clamp((nearY() - (event.clientY - rect.top)) / (nearY() - stage.clientHeight * HORIZON));
    const s = scaleAt(z);
    const half = (stroll.offsetWidth * s) / 2;
    const px = clamp(event.clientX - rect.left, half, stage.clientWidth - half);
    const next = { x: (px - stage.clientWidth / 2) / (s * pixelsPerUnit(model)), z };
    showMarker(px, floorY(z));
    hint.classList.add('is-hidden');
    if (reduceMotion) {
      Object.assign(pos, next);
      place();
      return;
    }
    walkTo(next);
  }

  function frame(now) {
    raf = visible ? requestAnimationFrame(frame) : 0;
    const t = now / 1000;
    const dt = last ? Math.min(t - last, 0.1) : 0;
    last = t;
    if (target) {
      const dx = target.x - pos.x;
      const dz = (target.z - pos.z) * DEPTH_UNITS;
      const dist = Math.hypot(dx, dz);
      const step = WALK_UNITS_PER_SEC * dt;
      if (dist <= step) {
        Object.assign(pos, target);
        stand();
      } else {
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step / DEPTH_UNITS;
      }
    }
    place();
  }

  model.addEventListener('load', () => {
    place();
    stage.addEventListener('click', onClick);
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      last = 0;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    }).observe(stage);
  }, { once: true });
}

document.querySelectorAll('.hero').forEach(startHero);
document.querySelectorAll('.hero-3d').forEach(startStage);
