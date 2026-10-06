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

/** Wires up the hero and only animates while it is on screen. */
function startYaga() {
  const hero = document.querySelector('.hero');
  const figure = document.querySelector('.yaga');
  const swayEl = document.querySelector('.yaga-sway');
  const updateBubble = createBubble(document.querySelector('.bubble'));
  let visible = false;
  let raf = 0;

  if (!reduceMotion) riseIn(figure);

  function frame(now) {
    raf = visible ? requestAnimationFrame(frame) : 0;
    const t = now / 1000;
    if (!reduceMotion) sway(swayEl, t);
    updateBubble(t);
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(frame);
  }, { rootMargin: '80px 0px' }).observe(hero);
}

startYaga();
