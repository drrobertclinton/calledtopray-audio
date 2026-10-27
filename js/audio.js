// Persistent mini-player: one HTML5 Audio element shared by the whole app.
// A "track" can have several parts (long Psalms are split); parts play back-to-back
// and the scrubber treats them as one continuous recording.
import { $, icon, esc, fmtTime, toast } from './util.js';

const audio = new Audio();
audio.preload = 'metadata';
audio.id = 'ctp-audio';
let track = null;     // { id, title, subtitle, parts: [url], durations: [] }
let part = 0;
// Recordings were made at speed 0.9, so "0.9" plays them as recorded.
// Other choices are relative to that (1.0 plays about 11% faster, etc.). Pitch is kept natural.
const BASE = 0.9;
const speeds = [0.9, 1, 1.25, 1.5, 2, 0.75];
let speedIdx = 0;
try { const s = +localStorage.getItem('ctp:speed'); const i = speeds.indexOf(s); if (i >= 0) speedIdx = i; } catch {}
const rateFor = i => speeds[i] / BASE;
function applySpeed() {
  audio.preservesPitch = true; audio.mozPreservesPitch = true; audio.webkitPreservesPitch = true;
  audio.defaultPlaybackRate = rateFor(speedIdx); audio.playbackRate = rateFor(speedIdx);
}
const subs = new Set();

export const player = {
  get track() { return track; },
  get playing() { return !audio.paused; },
  audio,
  onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
};
function notify() { subs.forEach(f => f()); render(); }

export async function playTrack(t) {
  if (!t?.parts?.length) return;
  if (track && track.id === t.id) { togglePlay(); return; }
  track = { ...t, durations: t.parts.map(() => 0) };
  part = 0;
  // Pre-read part durations for a smooth scrubber across multi-part tracks.
  track.parts.forEach((u, i) => {
    if (track.parts.length === 1) return;
    const a = new Audio(); a.preload = 'metadata'; a.src = u;
    a.addEventListener('loadedmetadata', () => { if (track && track.parts[i] === u) { track.durations[i] = a.duration; render(); } }, { once: true });
  });
  loadPart(0, true);
  showBar(true);
  setMediaSession();
}
function loadPart(i, autoplay) {
  part = i;
  audio.src = track.parts[i];
  applySpeed();
  if (autoplay) audio.play().catch(err => { if (err.name !== 'AbortError') toast('Tap play to listen.'); notify(); });
  notify();
}
export function togglePlay() {
  if (!track) return;
  if (audio.paused) audio.play().catch(() => toast('This recording could not be played right now.'));
  else audio.pause();
}
export function stop() { audio.pause(); track = null; showBar(false); notify(); }

function totalDur() {
  if (!track) return 0;
  if (track.parts.length === 1) return audio.duration || 0;
  const d = track.durations.slice(); if (audio.duration) d[part] = audio.duration;
  return d.every(x => x > 0) ? d.reduce((a, b) => a + b, 0) : 0;
}
function elapsed() {
  if (!track) return 0;
  let s = 0; for (let i = 0; i < part; i++) s += track.durations[i] || 0;
  return s + (audio.currentTime || 0);
}
function seekTo(sec) {
  if (!track) return;
  if (track.parts.length === 1) { audio.currentTime = Math.max(0, Math.min(sec, audio.duration || sec)); return; }
  let acc = 0;
  for (let i = 0; i < track.parts.length; i++) {
    const d = i === part ? (audio.duration || track.durations[i]) : track.durations[i];
    if (!d) break;
    if (sec < acc + d || i === track.parts.length - 1) {
      const off = Math.max(0, sec - acc);
      if (i === part) audio.currentTime = off;
      else { const wasPlaying = !audio.paused; loadPart(i, wasPlaying); audio.addEventListener('loadedmetadata', () => { audio.currentTime = off; }, { once: true }); }
      return;
    }
    acc += d;
  }
}
function skip(delta) {
  if (!track) return;
  const total = totalDur();
  if (total) return seekTo(Math.max(0, Math.min(total - 0.5, elapsed() + delta)));
  // durations unknown yet: skip within part
  const t = audio.currentTime + delta;
  if (t < 0 && part > 0) loadPart(part - 1, !audio.paused);
  else audio.currentTime = Math.max(0, Math.min(t, (audio.duration || t)));
}
function cycleSpeed() {
  speedIdx = (speedIdx + 1) % speeds.length; applySpeed();
  try { localStorage.setItem('ctp:speed', String(speeds[speedIdx])); } catch {}
  render();
}

audio.addEventListener('ended', () => {
  if (track && part < track.parts.length - 1) loadPart(part + 1, true);
  else { notify(); }
});
['play', 'pause', 'loadedmetadata'].forEach(ev => audio.addEventListener(ev, notify));
audio.addEventListener('timeupdate', renderTime);
audio.addEventListener('error', () => { if (track) toast('This recording could not be loaded. Please check your connection.'); });

function setMediaSession() {
  if (!('mediaSession' in navigator) || !track) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title, artist: 'Read by Robert Clinton, MD', album: 'Called to Pray',
      artwork: [{ src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => skip(-15));
    navigator.mediaSession.setActionHandler('seekforward', () => skip(15));
  } catch {}
}

// ---------- UI ----------
let bar;
function showBar(on) {
  bar ||= $('#mini-player');
  bar.hidden = !on;
  document.body.classList.toggle('has-player', on);
}
export function mountPlayer() {
  bar = $('#mini-player');
  bar.innerHTML = `
    <div class="mp-top">
      <div class="mp-meta"><div class="mp-title"></div><div class="mp-sub"></div></div>
      <button class="mp-close" aria-label="Close player">${icon('x')}</button>
    </div>
    <div class="mp-scrub"><span class="mp-cur">0:00</span><input type="range" min="0" max="1000" value="0" aria-label="Position"><span class="mp-dur">0:00</span></div>
    <div class="mp-ctrls">
      <button class="mp-speed" aria-label="Reading speed">0.9x</button>
      <button class="mp-back" aria-label="Back 15 seconds">${icon('back15')}</button>
      <button class="mp-play" aria-label="Play">${icon('play')}</button>
      <button class="mp-fwd" aria-label="Forward 15 seconds">${icon('fwd15')}</button>
      <span class="mp-part"></span>
    </div>`;
  bar.querySelector('.mp-play').onclick = togglePlay;
  bar.querySelector('.mp-back').onclick = () => skip(-15);
  bar.querySelector('.mp-fwd').onclick = () => skip(15);
  bar.querySelector('.mp-speed').onclick = cycleSpeed;
  bar.querySelector('.mp-close').onclick = stop;
  const r = bar.querySelector('input[type=range]');
  let dragging = false;
  r.addEventListener('input', () => { dragging = true; const tot = totalDur() || audio.duration || 0; bar.querySelector('.mp-cur').textContent = fmtTime(r.value / 1000 * tot); });
  r.addEventListener('change', () => { const tot = totalDur() || audio.duration || 0; seekTo(r.value / 1000 * tot); dragging = false; });
  bar._isDragging = () => dragging;
  showBar(false);
}
function render() {
  if (!bar || !track) return;
  bar.querySelector('.mp-title').textContent = track.title;
  bar.querySelector('.mp-sub').textContent = track.subtitle || 'Read by Robert Clinton, MD';
  const pb = bar.querySelector('.mp-play');
  pb.innerHTML = icon(audio.paused ? 'play' : 'pause');
  pb.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  bar.querySelector('.mp-speed').textContent = speeds[speedIdx].toFixed(speeds[speedIdx] % 1 ? (speeds[speedIdx] * 10 % 1 ? 2 : 1) : 1) + 'x';
  bar.querySelector('.mp-part').textContent = track.parts.length > 1 ? `Part ${part + 1} of ${track.parts.length}` : '';
  renderTime();
}
function renderTime() {
  if (!bar || !track || bar._isDragging?.()) return;
  const tot = totalDur(), el = elapsed();
  bar.querySelector('.mp-cur').textContent = fmtTime(el);
  bar.querySelector('.mp-dur').textContent = tot ? fmtTime(tot) : '--:--';
  bar.querySelector('input[type=range]').value = tot ? Math.round(el / tot * 1000) : 0;
}

// Convenience: a Play button HTML that views wire up with data attributes.
export function playBtn(id, label = 'Play', cls = '') {
  const active = track && track.id === id && !audio.paused;
  return `<button class="btn btn-play ${cls}" data-play="${esc(id)}">${icon(active ? 'pause' : 'play')}<span>${active ? 'Pause' : esc(label)}</span></button>`;
}
// Keep any visible play buttons in sync with the player.
player.onChange(() => {
  document.querySelectorAll('[data-play]').forEach(b => {
    const active = track && track.id === b.dataset.play && !audio.paused;
    const lbl = b.dataset.label || 'Play';
    b.innerHTML = `${icon(active ? 'pause' : 'play')}<span>${active ? 'Pause' : esc(lbl)}</span>`;
  });
});
