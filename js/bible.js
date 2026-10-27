// Bible text, audio index and topical verse data (all loaded lazily).
import { tr } from './store.js';

let booksP, audioP, topicsP;
const cache = new Map();

export const books = () => (booksP ||= fetch('./data/books.json').then(r => r.json()));
export const audioIndex = () => (audioP ||= fetch('./data/audio_index.json').then(r => r.json()));
export const topicsData = () => (topicsP ||= fetch('./data/topics.json').then(r => r.json()));

export const TR_NAMES = { BSB: 'Berean Standard Bible', KJV: 'King James Version' };

// Key verses in the index say "Psalms 23:4"; people say "Psalm 23:4".
export function displayRef(ref) { return ref.replace(/^Psalms (\d+:)/, 'Psalm $1'); }

export async function bookByName(name) {
  const bs = await books();
  const n = name === 'Psalm' ? 'Psalms' : name;
  return bs.find(b => b.n === n);
}

export async function loadBook(slug, t = tr()) {
  const k = t.toLowerCase() + '/' + slug;
  if (!cache.has(k)) cache.set(k, fetch(`./data/bible/${k}.json`).then(r => { if (!r.ok) throw new Error('missing ' + k); return r.json(); }));
  return cache.get(k);
}

export function parseRef(ref) {
  const m = /^(.+?) (\d+):(\d+)(?:-(\d+))?$/.exec(ref.trim());
  if (!m) return null;
  return { book: m[1] === 'Psalm' ? 'Psalms' : m[1], ch: +m[2], v1: +m[3], v2: +(m[4] || m[3]) };
}

// Returns [{v, t}] for a reference in the current translation.
export async function getPassage(ref, t = tr()) {
  const p = parseRef(ref); if (!p) return [];
  const b = await bookByName(p.book); if (!b) return [];
  const data = await loadBook(b.s, t);
  const ch = data.c[p.ch - 1] || [];
  const out = [];
  for (let v = p.v1; v <= p.v2; v++) if (ch[v - 1]) out.push({ v, t: ch[v - 1] });
  return out;
}
export async function getChapter(bookName, ch, t = tr()) {
  const b = await bookByName(bookName);
  const data = await loadBook(b.s, t);
  return (data.c[ch - 1] || []).map((text, i) => ({ v: i + 1, t: text })).filter(x => x.t);
}

// Audio URLs are relative to the site root so the app works on GitHub Pages and calledtopray.app.
const rel = p => './' + p.split('/').map(encodeURIComponent).join('/');
export async function verseAudio(ref, t = tr()) {
  const idx = await audioIndex();
  const r = ref.replace(/^Psalm (\d)/, 'Psalms $1');
  const p = idx[t]?.verses?.[r];
  return p ? [rel(p)] : null;
}
export async function chapterAudio(bookName, ch, t = tr()) {
  const idx = await audioIndex();
  const key = bookName === 'Psalm' ? 'Psalms' : bookName;
  const parts = (key === 'Psalms' || key === 'Proverbs') ? idx[t]?.[key]?.[String(ch)] : null;
  return parts && parts.length ? parts.map(rel) : null;
}
export async function keyVerses(t = tr()) {
  const idx = await audioIndex();
  return Object.keys(idx[t].verses);
}
export function passageText(vs) { return vs.map(x => x.t).join(' '); }

// If a reference isn't recorded on its own, use a recorded passage that contains it
// (e.g. "John 3:16" -> "John 3:16-17") so the text shown matches what is heard.
export async function resolveRecordedRef(ref, t = tr()) {
  const idx = await audioIndex();
  const keys = Object.keys(idx[t].verses);
  const norm = ref.replace(/^Psalm (\d)/, 'Psalms $1');
  if (keys.includes(norm)) return norm;
  const p = parseRef(norm); if (!p) return null;
  const hit = keys.map(k => [k, parseRef(k)]).filter(([, q]) => q && q.book === p.book && q.ch === p.ch && q.v1 <= p.v1 && q.v2 >= p.v2)
    .sort((a, b) => (a[1].v2 - a[1].v1) - (b[1].v2 - b[1].v1))[0];
  return hit ? hit[0] : null;
}
