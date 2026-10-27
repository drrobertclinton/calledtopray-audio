// First run: welcome, translation, callings (own words first, then A–Z, family, burdens).
import { $, $$, esc, icon, toast } from '../util.js';
import { state, saveProfile, setMode, markActive } from '../store.js';
import { TR_NAMES } from '../bible.js';
import { OCCUPATIONS, FAMILY, CARRYING } from '../content.js';
import { wireDictation, stopListening } from '../speech.js';
import { openAuthSheet } from './me.js';

const MARK = `<svg class="ob-mark" viewBox="0 0 96 96" fill="none" aria-hidden="true">
  <circle cx="48" cy="48" r="46" stroke="#C9A45C" stroke-opacity=".35" stroke-width="1.5"/>
  <circle cx="48" cy="48" r="38" fill="#C9A45C" fill-opacity=".08"/>
  <path d="M48 18v60M33 36h30" stroke="#DDBE7E" stroke-width="3" stroke-linecap="round"/>
  <path d="M30 70c5-4 11-6 18-6s13 2 18 6" stroke="#C9A45C" stroke-width="2" stroke-linecap="round" stroke-opacity=".6"/></svg>`;

export async function renderOnboarding(app, finish) {
  let step = state.mode ? 1 : 0;
  const draft = { translation: state.profile.translation || 'BSB', name: state.profile.name || '' };
  const progress = n => `<div class="ob-progress" aria-hidden="true">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;
  const draw = () => {
    if (step === 0) {
      app.innerHTML = `<div class="ob">
        <div class="ob-hero">${MARK}
          <h1>Called to Pray</h1>
          <p class="lead">A daily place to pray for your work, your family and the people you love.</p>
          <p class="lead" style="margin-top:10px">Scripture is read aloud to you by Robert Clinton, MD, so you can listen as well as read.</p>
        </div>
        <div class="ob-actions">
          <button class="btn btn-gold btn-block" id="guest">Get started</button>
          <button class="btn btn-ghost btn-block" id="signin">I have an account</button>
          <p class="hint" style="text-align:center">You can use the app without an account. Your prayers stay on this phone until you sign up.</p>
        </div></div>`;
      app.querySelector('#guest').onclick = () => { setMode('guest'); step = 1; draw(); };
      app.querySelector('#signin').onclick = () => openAuthSheet('signin', { onDone: () => { if (state.profile.onboarded) finish(); else { step = 1; draw(); } } });
      return;
    }
    if (step === 1) {
      app.innerHTML = `<div class="ob" style="padding-top:18px">
        ${progress(1)}<p class="ob-step">Step 1 of 3</p>
        <h1 style="margin-top:10px">Which Bible would you like?</h1>
        <p class="purpose">Everything you read and hear in the app will use this translation. You can change it later.</p>
        ${choice('BSB', 'Modern, easy to read English.')}${choice('KJV', 'The classic 1611 wording many of us grew up with.')}
        <label class="field" style="margin-top:26px"><span>What should we call you? (optional)</span><input type="text" id="name" data-dictate value="${esc(draft.name)}" placeholder="Your first name" autocomplete="given-name"></label>
        <div class="ob-actions"><button class="btn btn-gold btn-block" id="next">Continue</button><button class="link-btn" id="back">Back</button></div></div>`;
      wireDictation(app);
      $$('[data-tr]', app).forEach(b => b.onclick = () => { draft.translation = b.dataset.tr; $$('[data-tr]', app).forEach(x => x.classList.toggle('on', x === b)); });
      app.querySelector('#next').onclick = () => { stopListening(); draft.name = app.querySelector('#name').value.trim(); saveProfile({ translation: draft.translation, name: draft.name }); step = 2; draw(); window.scrollTo(0, 0); };
      app.querySelector('#back').onclick = () => { step = 0; draw(); };
      return;
    }
    if (step === 2) {
      app.innerHTML = `<div style="padding-top:18px">${progress(2)}<p class="ob-step">Step 2 of 3</p><div id="ce"></div></div>`;
      callingsEditor(app.querySelector('#ce'), { onDone: () => { step = 3; draw(); window.scrollTo(0, 0); }, doneLabel: 'Continue', onBack: () => { step = 1; draw(); } });
      return;
    }
    const p = state.profile;
    app.innerHTML = `<div class="ob" style="padding-top:18px">
      ${progress(3)}<p class="ob-step">Step 3 of 3</p>
      <div class="ob-hero" style="padding-top:20px">${MARK}<h1 style="font-size:calc(40px*var(--fs-scale))">You are ready${p.name ? ', ' + esc(p.name) : ''}</h1>
      <p class="lead">Each day you will find a verse chosen for you, a Proverb, a Psalm, and a place to pray out loud.</p></div>
      <div class="card"><p class="hint" style="margin:0">Reading from</p><p style="margin:2px 0 0;font-weight:600">${esc(TR_NAMES[p.translation])}</p>
        ${[...p.callings, ...p.family, ...p.carrying].length ? `<p class="hint" style="margin:12px 0 0">Praying for</p><div class="chips" style="margin-top:6px">${[...p.callings, ...p.family, ...p.carrying].slice(0, 12).map(c => `<span class="chip chip-sm on">${esc(c)}</span>`).join('')}</div>` : ''}</div>
      <div class="ob-actions">
        <button class="btn btn-gold btn-block" id="done">Go to Today</button>
        ${state.user ? '' : `<button class="btn btn-ghost btn-block" id="acct">Create a free account</button><p class="hint" style="text-align:center">An account keeps your prayers safe if you change phones, and lets you pray with a group.</p>`}
      </div></div>`;
    const complete = () => { saveProfile({ onboarded: true }); markActive(); finish(); };
    app.querySelector('#done').onclick = complete;
    app.querySelector('#acct')?.addEventListener('click', () => openAuthSheet('signup', { onDone: complete }));
  };
  draw();
}
function choice(k, d) {
  const on = (state.profile.translation || 'BSB') === k;
  return `<button class="choice ${on ? 'on' : ''}" data-tr="${k}" data-testid="tr-${k}"><span class="radio"></span><span><strong>${TR_NAMES[k]} (${k})</strong><small>${esc(d)}</small></span></button>`;
}

// Shared by onboarding and Me.
export function callingsEditor(root, { onDone, doneLabel = 'Save', onBack } = {}) {
  const sel = { callings: new Set(state.profile.callings || []), family: new Set(state.profile.family || []), carrying: new Set(state.profile.carrying || []) };
  let q = '';
  const occList = () => Array.from(new Set([...OCCUPATIONS, ...[...sel.callings].filter(c => !OCCUPATIONS.includes(c))])).sort((a, b) => a.localeCompare(b));
  root.innerHTML = `
    <h1 style="margin-top:10px">Your callings</h1>
    <p class="purpose">Tell us about your work and your life so we can choose verses and prayers for you. Pick as many as you like.</p>

    <section class="card" style="margin-top:8px">
      <label class="field" style="margin-top:0"><span>Write your own calling</span>
      <input type="text" id="own" data-dictate placeholder="For example: Hospital chaplain, Grandmother of five" autocomplete="off"></label>
      <button class="btn btn-gold btn-sm" id="own-add" style="margin-top:10px">${icon('plus')}Add</button>
    </section>

    <section class="section" style="margin-top:26px">
      <h2>Or choose your work (A–Z)</h2>
      <div class="search">${icon('search')}<input type="search" id="occ-q" placeholder="Search, for example nurse or teacher" aria-label="Search occupations"></div>
      <div class="az-jump" id="jump"></div>
      <div class="az"><div class="az-scroll" id="occ"></div></div>
    </section>

    <section class="section">
      <h2>Your family & life</h2>
      <p class="purpose">The roles God has given you at home and at church.</p>
      <div class="chips" id="fam">${FAMILY.map(x => chip('family', x)).join('')}</div>
    </section>

    <section class="section">
      <h2>What you are carrying right now</h2>
      <p class="purpose">Only you see these. We use them to choose encouraging verses.</p>
      <div class="chips" id="car">${CARRYING.map(x => chip('carrying', x)).join('')}</div>
    </section>

    <div class="summary-bar">
      <div class="top-row"><strong id="sum-n"></strong>${onBack ? '<button class="link-btn" id="back" style="min-height:0;padding:0">Back</button>' : ''}</div>
      <div class="chips" id="sum"></div>
      <button class="btn btn-gold btn-block" id="done" style="margin-top:10px">${esc(doneLabel)}</button>
    </div>`;
  function chip(group, x) { return `<button class="chip ${sel[group].has(x) ? 'on' : ''}" data-g="${group}" data-v="${esc(x)}">${sel[group].has(x) ? icon('check') : ''}${esc(x)}</button>`; }
  const drawOcc = () => {
    const list = occList().filter(o => !q || o.toLowerCase().includes(q));
    let html = '', last = '';
    for (const o of list) {
      const L = o[0].toUpperCase();
      if (L !== last && !q) { html += `<div class="az-letter" id="L-${L}">${L}</div>`; last = L; }
      const on = sel.callings.has(o);
      html += `<button class="az-item ${on ? 'on' : ''}" data-occ="${esc(o)}" aria-pressed="${on}"><span>${esc(o)}</span><span class="tick">${icon('check')}</span></button>`;
    }
    root.querySelector('#occ').innerHTML = html || `<p class="hint" style="padding:16px">No match. Use “Write your own calling” above.</p>`;
    const letters = Array.from(new Set(occList().map(o => o[0].toUpperCase())));
    root.querySelector('#jump').innerHTML = q ? '' : letters.map(L => `<button data-L="${L}" aria-label="Jump to ${L}">${L}</button>`).join('');
  };
  const drawSum = () => {
    const all = [...sel.callings, ...sel.family, ...sel.carrying];
    root.querySelector('#sum-n').textContent = all.length ? `${all.length} selected` : 'Nothing selected yet';
    root.querySelector('#sum').innerHTML = [...[...sel.callings].map(x => ['callings', x]), ...[...sel.family].map(x => ['family', x]), ...[...sel.carrying].map(x => ['carrying', x])]
      .map(([g, x]) => `<button class="chip chip-sm on" data-rm="${g}" data-v="${esc(x)}" aria-label="Remove ${esc(x)}">${esc(x)} ${icon('x')}</button>`).join('');
  };
  drawOcc(); drawSum(); wireDictation(root);
  const addOwn = () => {
    const inp = root.querySelector('#own'); stopListening();
    inp.value.split(/[,;]+/).map(s => s.trim()).filter(Boolean).forEach(v => sel.callings.add(v[0].toUpperCase() + v.slice(1)));
    if (!inp.value.trim()) return toast('Type or speak your calling first.');
    inp.value = ''; drawOcc(); drawSum(); toast('Added');
  };
  root.querySelector('#own-add').onclick = addOwn;
  root.querySelector('#own').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addOwn(); } });
  root.querySelector('#occ-q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); drawOcc(); });
  root.addEventListener('click', e => {
    const o = e.target.closest('[data-occ]');
    if (o) { const v = o.dataset.occ; sel.callings.has(v) ? sel.callings.delete(v) : sel.callings.add(v); o.classList.toggle('on'); o.setAttribute('aria-pressed', sel.callings.has(v)); drawSum(); return; }
    const c = e.target.closest('[data-g]');
    if (c) { const s = sel[c.dataset.g], v = c.dataset.v; s.has(v) ? s.delete(v) : s.add(v); c.outerHTML = chip(c.dataset.g, v); drawSum(); return; }
    const r = e.target.closest('[data-rm]');
    if (r) { sel[r.dataset.rm].delete(r.dataset.v); drawOcc(); root.querySelector('#fam').innerHTML = FAMILY.map(x => chip('family', x)).join(''); root.querySelector('#car').innerHTML = CARRYING.map(x => chip('carrying', x)).join(''); drawSum(); return; }
    const L = e.target.closest('[data-L]');
    if (L) { const el = root.querySelector('#L-' + L.dataset.L); const sc = root.querySelector('#occ'); if (el) sc.scrollTop = el.offsetTop - sc.offsetTop; }
  });
  root.querySelector('#done').onclick = () => {
    stopListening();
    saveProfile({ callings: [...sel.callings], family: [...sel.family], carrying: [...sel.carrying] });
    onDone && onDone();
  };
  root.querySelector('#back')?.addEventListener('click', () => onBack());
}
