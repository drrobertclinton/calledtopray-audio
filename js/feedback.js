// Send feedback: testers write a note (or speak it) and send it by email.
import { $$, esc, icon, toast, openSheet } from './util.js';
import { wireDictation } from './speech.js';

const TO = 'robert@drrobertclinton.com';
const APP_VERSION = '1.0 (test)';
const KINDS = [
  ['broken', 'Something isn’t working'],
  ['confusing', 'Something is confusing'],
  ['idea', 'I have an idea'],
  ['like', 'I like this'],
];

function deviceLine() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Other';
  const installed = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone ? 'home screen app' : 'browser';
  return `${os}, ${installed}, screen ${window.innerWidth}x${window.innerHeight}`;
}

export function openFeedback() {
  const where = (location.hash.replace(/^#\/?/, '').split('/')[0] || 'today');
  const s = openSheet(`
    <h2 class="sheet-title">Send feedback</h2>
    <p class="lead">You are helping us test Called to Pray. Tell us what works, what doesn’t, and what you wish it did. Every note is read.</p>
    <p class="hint" style="margin-top:16px">What is this about?</p>
    <div class="chips" id="fb-kinds">${KINDS.map(([k, n], i) => `<button class="chip chip-sm ${i === 0 ? 'on' : ''}" data-k="${k}">${esc(n)}</button>`).join('')}</div>
    <label class="field"><span>Your note</span><textarea id="fb-text" data-dictate placeholder="What happened, or what would make this better?"></textarea></label>
    <label class="field"><span>Your name (optional)</span><input type="text" id="fb-name" autocomplete="name"></label>
    <button class="btn btn-gold btn-block" id="fb-send" style="margin-top:8px">${icon('share')}Send</button>
    <p class="hint" style="text-align:center">This opens your email with your note ready to send to ${esc(TO)}.</p>
    <div style="text-align:center"><button class="link-btn" id="fb-copy">Copy my note instead</button></div>
  `, { label: 'Send feedback' });
  wireDictation(s.el);
  let kind = KINDS[0];
  $$('[data-k]', s.el).forEach(b => b.onclick = () => {
    $$('[data-k]', s.el).forEach(x => x.classList.toggle('on', x === b));
    kind = KINDS.find(x => x[0] === b.dataset.k);
  });
  const compose = () => {
    const text = s.el.querySelector('#fb-text').value.trim();
    const name = s.el.querySelector('#fb-name').value.trim();
    const body = `${text}\n\n---\n${name ? 'From: ' + name + '\n' : ''}About: ${kind[1]}\nScreen: ${where}\nDevice: ${deviceLine()}\nApp: Called to Pray ${APP_VERSION}`;
    return { text, subject: `Called to Pray feedback: ${kind[1]}`, body };
  };
  s.el.querySelector('#fb-send').onclick = () => {
    const m = compose();
    if (!m.text) { toast('Please write a short note first.'); s.el.querySelector('#fb-text').focus(); return; }
    location.href = `mailto:${TO}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
    setTimeout(() => { s.close(); toast('Thank you for your feedback!'); }, 800);
  };
  s.el.querySelector('#fb-copy').onclick = async () => {
    const m = compose();
    if (!m.text) { toast('Please write a short note first.'); return; }
    try { await navigator.clipboard.writeText(`${m.subject}\n\n${m.body}`); toast(`Copied. Paste it in a text or email to ${TO}.`, 4200); }
    catch { toast('Could not copy on this phone. Please use Send.'); }
  };
}
