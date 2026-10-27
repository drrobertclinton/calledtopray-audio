// Dictation with the Web Speech API, plus the "Speak your prayer" organizer.
import { $, esc, icon, toast } from './util.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const speechSupported = !!SR;
export const NO_MIC_HINT = 'Use your keyboard’s microphone key to dictate.';

let active = null; // { rec, stop }

// Start listening; onText(finalText, interimText) gets called as words arrive.
export function listen({ onText, onEnd, onError }) {
  if (!SR) { onError && onError('unsupported'); return null; }
  stopListening();
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = navigator.language || 'en-US';
  let finalText = '';
  let stopped = false;
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += (finalText && !/\s$/.test(finalText) ? ' ' : '') + r[0].transcript.trim();
      else interim += r[0].transcript;
    }
    onText(finalText, interim.trim());
  };
  rec.onerror = e => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    const msg = e.error === 'not-allowed' || e.error === 'service-not-allowed'
      ? 'Microphone permission is off. Please allow the microphone in your browser settings, or use your keyboard’s microphone key.'
      : 'Listening stopped. Please try again.';
    toast(msg, 4500);
    onError && onError(e.error);
  };
  // Safari and Chrome stop after silence; restart until the person taps Stop.
  rec.onend = () => {
    if (!stopped) { try { rec.start(); return; } catch {} }
    if (active && active.rec === rec) active = null;
    onEnd && onEnd(finalText);
  };
  try { rec.start(); } catch (e) { onError && onError('start'); return null; }
  active = { rec, stop() { stopped = true; try { rec.stop(); } catch {} } };
  return active;
}
export function stopListening() { if (active) { active.stop(); active = null; } }

// Add a mic button beside every [data-dictate] field inside root.
export function wireDictation(root) {
  root.querySelectorAll('[data-dictate]').forEach(field => {
    if (field._dictWired) return;
    field._dictWired = true;
    const wrap = document.createElement('div');
    wrap.className = 'dict-wrap' + (field.tagName === 'TEXTAREA' ? ' is-area' : '');
    field.parentNode.insertBefore(wrap, field);
    wrap.appendChild(field);
    if (!speechSupported) {
      const hint = document.createElement('p');
      hint.className = 'hint mic-hint';
      hint.textContent = NO_MIC_HINT;
      wrap.after(hint);
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mic-btn';
    btn.setAttribute('aria-label', 'Speak instead of typing');
    btn.innerHTML = icon('mic');
    wrap.appendChild(btn);
    const bar = document.createElement('div');
    bar.className = 'listening-bar';
    bar.hidden = true;
    bar.innerHTML = `<span class="pulse-dot"></span><span class="lb-text">Listening… speak now</span><button type="button" class="btn btn-sm btn-gold lb-stop">Stop</button>`;
    wrap.after(bar);
    let base = '';
    const stop = () => { stopListening(); };
    bar.querySelector('.lb-stop').onclick = stop;
    btn.onclick = () => {
      if (btn.classList.contains('on')) return stop();
      base = field.value ? field.value.replace(/\s*$/, ' ') : '';
      btn.classList.add('on'); bar.hidden = false;
      const l = listen({
        onText: (fin, interim) => {
          field.value = base + fin + (interim ? (fin ? ' ' : '') + interim : '');
          field.dispatchEvent(new Event('input', { bubbles: true }));
        },
        onEnd: fin => { field.value = (base + fin).trim(); field.dispatchEvent(new Event('input', { bubbles: true })); btn.classList.remove('on'); bar.hidden = true; },
        onError: () => { btn.classList.remove('on'); bar.hidden = true; },
      });
      if (!l) { btn.classList.remove('on'); bar.hidden = true; }
    };
  });
}

// ---------------- auto-organize a spoken prayer ----------------
const REQUEST_RE = /\b(please|help|pray(ing)? for|heal|healing|i need|we need|give (me|us|him|her|them)|lord,? give|grant|protect|provide|guide|show (me|us)|be with|strengthen|comfort|bless|let (him|her|them|me|us)|i ask|we ask|restore|open (a|the) door|deliver|keep (him|her|them|me|us)|watch over|touch)\b/i;
const PRAISE_RE = /\b(thank(s| you)|praise|grateful|thankful|bless(ed)? your name|you (have )?answered|glory to|hallelujah|i worship|we worship|you are good|you('| ha)ve been faithful)\b/i;
const TOPIC_MAP = [
  ['Work', /\b(work|job|boss|career|office|coworkers?|business|shift|employer|interview)\b/i],
  ['Money', /\b(money|finances?|bills?|debt|rent|mortgage|pay(check)?|afford|income|budget)\b/i],
  ['Health', /\b(health|sick|illness|cancer|surgery|doctor|hospital|pain|heal(ing)?|diagnosis|treatment|recovery|test results?)\b/i],
  ['Marriage', /\b(marriage|husband|wife|spouse|my marriage)\b/i],
  ['Children', /\b(kids?|children|son|daughter|my boy|my girl|grandchild(ren)?|grandkids?|teen(ager)?s?)\b/i],
  ['Family', /\b(family|mom|dad|my (mother|father)|parents?|brother|sister|relatives?)\b/i],
  ['Church', /\b(church|pastor|congregation|small group|bible study|ministry|youth group)\b/i],
  ['Nation', /\b(nation|country|president|government|leaders?|election|america|congress)\b/i],
  ['Missions', /\b(missions?|missionar(y|ies)|nepal|unreached|gospel to)\b/i],
  ['Grief', /\b(grief|grieving|loss|lost (my|our)|passed away|funeral|died)\b/i],
  ['Anxiety', /\b(anxi(ety|ous)|worr(y|ied)|fear(ful)?|afraid|panic|stress(ed)?)\b/i],
  ['Guidance', /\b(decision|direction|guidance|wisdom|which way|what to do|path)\b/i],
  ['Salvation', /\b(saved|salvation|come to (faith|know)|know jesus|accept christ|believe in (you|jesus))\b/i],
  ['Addiction', /\b(addiction|sober|sobriety|drinking|drugs|relapse)\b/i],
  ['Travel', /\b(travel|trip|flight|journey|safe travels?)\b/i],
];
const NOT_NAMES = new Set('Lord God Jesus Christ Father Holy Spirit Amen I Me My We Our Us You Your He She They It The A An And But Please Thank Thanks Help Today Tonight Tomorrow Monday Tuesday Wednesday Thursday Friday Saturday Sunday Heavenly Dear Almighty Savior King Mom Dad Mother Father Grandma Grandpa Pastor Doctor Dr Mr Mrs Ms Miss Bible Church America January February March April May June July August September October November December Christmas Easter Nepal Lord’s God’s Jesus’'.split(/\s+/));

const TITLES = new Set(['Pastor', 'Dr', 'Doctor', 'Mr', 'Mrs', 'Ms', 'Miss', 'Grandma', 'Grandpa', 'Aunt', 'Uncle', 'Brother', 'Sister']);

export function splitSentences(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return [];
  // Dictation often has no punctuation; also split on spoken joiners.
  let parts = t.split(/(?<=[.!?])\s+/);
  parts = parts.flatMap(p => p.split(/\s+(?=(?:and )?(?:lord|father|god|jesus),?\s)|\s+(?=(?:also |and )?(?:i pray for|i want to pray for|please (?:help|be with|heal)|thank you (?:lord|for|god)))/i));
  return parts.map(s => s.trim().replace(/^(and|also|so)\s+/i, '')).filter(s => s.split(' ').length >= 2);
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

export function findNames(sentence, knownPeople = []) {
  const found = new Set();
  const lower = sentence.toLowerCase();
  for (const p of knownPeople) if (p && new RegExp(`\\b${p.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) found.add(p);
  // Capitalized words after "for", "pray for", "with", "help", "heal", "bless", "be with", or possessive relations ("my friend Sam")
  const re = /\b(?:for|with|help|heal|bless|protect|touch|comfort|be with|friend|brother|sister|son|daughter|wife|husband|mom|dad|neighbor|coworker|boss|pastor|aunt|uncle|cousin|grandson|granddaughter)\s+((?:[A-Z][a-z’'\-]+)(?:\s+[A-Z][a-z’'\-]+)?)/g;
  let m;
  while ((m = re.exec(sentence))) {
    const raw = m[1].split(' ');
    const titled = raw.length === 2 && TITLES.has(raw[0]) && !NOT_NAMES.has(raw[1]);
    const words = titled ? raw : raw.filter(w => !NOT_NAMES.has(w.replace(/[’']s$/, '')));
    if (words.length) found.add(words.join(' ').replace(/[’']s$/, ''));
  }
  // relationship words people say instead of names
  const rel = /\b[Mm]y (mom|mother|dad|father|wife|husband|son|daughter|grandson|granddaughter|grandmother|grandfather|pastor|boss|neighbor|best friend)\b(?!\s+[A-Z])/g;
  while ((m = rel.exec(sentence))) found.add('My ' + m[1].toLowerCase());
  return Array.from(found);
}
export function findTopics(sentence) { return TOPIC_MAP.filter(([, re]) => re.test(sentence)).map(([n]) => n); }

// Returns suggestions: [{ kind: 'prayers'|'praise', text, people:[], topics:[] }], plus people/topics lists.
export function organize(transcript, knownPeople = []) {
  const sentences = splitSentences(transcript);
  const items = [];
  const people = new Set(), topics = new Set();
  for (const s of sentences) {
    const ps = findNames(s, knownPeople), ts = findTopics(s);
    ps.forEach(p => people.add(p)); ts.forEach(t => topics.add(t));
    const isPraise = PRAISE_RE.test(s), isReq = REQUEST_RE.test(s);
    if (isPraise && !(isReq && !/^\s*(thank|praise)/i.test(s))) items.push({ kind: 'praise', text: cap(s), people: ps, topics: ts });
    else if (isReq || ps.length) items.push({ kind: 'prayers', text: cap(s), people: ps, topics: ts });
  }
  if (!items.length && transcript.trim()) items.push({ kind: 'prayers', text: cap(transcript.trim()), people: Array.from(people), topics: Array.from(topics) });
  return { items, people: Array.from(people), topics: Array.from(topics) };
}
