/* Transferred verbatim from shawq-ads-production-2289 production bundle (index-jHUXc5GO.js). */

let canvas = null;
let ctx = null;
const particles = [];
let frameId = 0;
let lastFrame = 0;
const maxParticles = 600;
const palette = ['#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#a855f7', '#f59e0b', '#ec4899'];

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resizeCanvas() {
  if (!canvas || !ctx) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function ensureCanvas() {
  if (typeof document === 'undefined') return false;
  if (canvas && ctx) return true;
  const next = document.createElement('canvas');
  next.setAttribute('aria-hidden', 'true');
  const style = next.style;
  style.position = 'fixed';
  style.left = '0';
  style.top = '0';
  style.width = '100%';
  style.height = '100%';
  style.pointerEvents = 'none';
  style.zIndex = '2147483646';
  const context = next.getContext('2d');
  if (!context) return false;
  canvas = next;
  ctx = context;
  document.body.appendChild(canvas);
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, { passive: true });
  return true;
}

function tick(now) {
  if (!ctx || !canvas) {
    frameId = 0;
    return;
  }
  const step = Math.min((now - lastFrame) / 16.6667, 2.5);
  lastFrame = now;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  const drag = 0.992;
  const height = window.innerHeight;
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.vy += step * 0.22;
    particle.vx *= drag;
    particle.vy *= drag;
    particle.x += particle.vx * step;
    particle.y += particle.vy * step;
    particle.rot += particle.vrot * step;
    particle.life += step;
    if (particle.life >= particle.maxLife || particle.y - particle.size > height) {
      particles.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = Math.max(0, 1 - particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rot);
    if (particle.shape === 0) {
      ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.6);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  frameId = particles.length > 0 ? requestAnimationFrame(tick) : 0;
}

export function burstKpiConfetti(origin) {
  if (prefersReducedMotion() || !ensureCanvas()) return;
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 3;
  for (let i = 0; i < 90; i += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
    const speed = 6 + Math.random() * 7;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      color: palette[Math.random() * palette.length | 0],
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.4,
      life: 0,
      maxLife: 90 + Math.random() * 50,
      shape: Math.random() < 0.5 ? 0 : 1,
    });
  }
  if (particles.length > maxParticles) {
    particles.splice(0, particles.length - maxParticles);
  }
  if (!frameId) {
    lastFrame = performance.now();
    frameId = requestAnimationFrame(tick);
  }
}
