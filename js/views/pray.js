// Pray: new entries (spoken or typed), lists, answered prayers, Look Back and Private.
import { $, $$, esc, icon, fmtDate, toast, openSheet, confirmSheet, sha256, uid } from '../util.js';
import { state, saveEntry, deleteEntry, listEntries, allEntries, findEntry, onChange, kvGet, kvSet, pushProfile, reauthenticate } from '../store.js';
import { ENTRY_KINDS } from '../content.js';
import { wireDictation, listen, stopListening, speechSupported, NO_MIC_HINT, organize } from '../speech.js';

const PRESET_TOPICS = ['Work', 'Money', 'Health', 'Marriage', 'Children', 'Family', 'Church', 'Nation', 'Missions', 'Guidance', 'Salvation', 'Grief', 'Anxiety'];
let privateUnlockedAt = 0;
const UNLOCK_MS = 5 * 60 * 1000;
export const privateUnlocked = () => Date.now() - privateUnlockedAt < UNLOCK_MS;

let unsub;
export async function renderPray(app, parts) {
  unsub && unsub();
  const [sub, arg] = parts;
  const draw = () => {
    if (!sub) hub(app);
    else if (sub === 'list') kindList(app, arg);
    else if (sub === 'lookback') lookBack(app, false);
    else if (sub === 'answered') lookBack(app, true);
    else if (sub === 'private') privateArea(app);
    else if (sub === 'person' || sub === 'topic') linkedView(app, sub, arg);
    else hub(app);
  };
  draw();
  unsub = onChange(w => { if (w === 'entries' && location.hash.startsWith('#/pray')) draw(); });
}

function savedNote(remote) {
  if (state.user && !remote) toast('Saved on this device. It will sync to your account later.', 3400);
  else toast('Saved');
}

// ---------------- hub ----------------
function hub(app) {
  const c = k => listEntries(k).length;
  const open = listEntries('prayers').filter(e => !e.answered).length;
  const answered = listEntries('prayers').filter(e => e.answered).length;
  const recent = allEntries().slice(0, 5);
  app.innerHTML = `
    <header class="view-head">
      <p class="eyebrow">Your prayer life</p>
      <h1>Pray</h1>
      <p class="purpose">Keep your requests, praises and the people you pray for in one place, and look back on how God has answered.</p>
    </header>
    <div class="new-entry">
      <button class="big-speak" id="speak"><span class="orb">${icon('mic')}</span><span><strong>Speak a prayer</strong><small>Pray out loud. We will sort it into requests, praises and people.</small></span></button>
      <button class="big-type" id="type">${icon('edit')}<span><strong>Type an entry</strong><br><small class="muted">A request, praise, person, topic, journal or note</small></span></button>
    </div>

    <section class="section">
      <div class="section-head"><h2>Your lists</h2></div>
      <p class="purpose">Tap a list to see everything in it.</p>
      <div class="tiles">
        ${tile('prayers', `${open} open`)}${tile('praise', `${c('praise')} kept`)}
        ${tile('people', `${c('people')} people`)}${tile('topics', `${c('topics')} topics`)}
        ${tile('journal', `${c('journal')} entries`)}${tile('notes', `${c('notes')} notes`)}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Remember</h2></div>
      <p class="purpose">See what you have prayed and what God has done.</p>
      <div class="list">
        <a class="row" href="#/pray/lookback"><span class="row-ic">${icon('clock')}</span><span class="row-main"><span class="row-title">Look Back</span><span class="row-text">Everything you have prayed, newest first</span></span><span class="chev">${icon('chevR')}</span></a>
        <a class="row" href="#/pray/answered"><span class="row-ic">${icon('check')}</span><span class="row-main"><span class="row-title">Answered prayers</span><span class="row-text">${answered ? `${answered} answered so far` : 'When God answers, mark it here'}</span></span><span class="chev">${icon('chevR')}</span></a>
        <a class="row" href="#/pray/private" data-testid="private-link"><span class="row-ic">${icon('lock')}</span><span class="row-main"><span class="row-title">Private</span><span class="row-text">Entries only you can open, behind a passcode</span></span><span class="chev">${icon('chevR')}</span></a>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Recent</h2></div>
      ${recent.length ? `<div class="list">${recent.map(entryRow).join('')}</div>` : `<div class="empty"><strong>Nothing here yet</strong>Tap Speak or Type above to add your first prayer.</div>`}
    </section>`;
  app.querySelector('#speak').onclick = () => openSpeakMode();
  app.querySelector('#type').onclick = () => openEntryEditor('prayers');
  wireRows(app);
}
function tile(k, sub) {
  const m = ENTRY_KINDS[k];
  return `<a class="tile" href="#/pray/list/${k}">${icon(m.icon)}<strong>${m.pl}</strong><small>${esc(sub)}</small></a>`;
}

// ---------------- rows ----------------
export function entryRow(e) {
  const k = e.kind, m = ENTRY_KINDS[k] || ENTRY_KINDS.journal;
  const title = (k === 'people' || k === 'topics' || k === 'notes' || (k === 'journal' && e.title)) ? (e.title || e.text) : e.text;
  const sub = (k === 'people' || k === 'topics' || k === 'notes' || (k === 'journal' && e.title)) ? e.text : '';
  const meta = [];
  meta.push(`<span>${esc(m.n)}</span>`, `<span>${fmtDate(e.createdAt)}</span>`);
  if (e.answered) meta.push(`<span class="tag tag-ok">${icon('check')}Answered ${fmtDate(e.answeredAt)}</span>`);
  if (e.linkedId) meta.push(`<span class="tag tag-gold">Answer to a request</span>`);
  (e.people || []).slice(0, 3).forEach(p => meta.push(`<span class="tag">${esc(p)}</span>`));
  if (e.private) meta.push(`<span class="tag">${icon('lock')}Private</span>`);
  if (e._pending && state.user) meta.push(`<span class="sync-note">Saved on this device</span>`);
  return `<button class="row ${e.answered ? 'answered' : ''}" data-entry="${esc(e.id)}">
    <span class="row-ic">${icon(e.answered ? 'check' : m.icon)}</span>
    <span class="row-main"><span class="row-title">${esc(title || '(empty)')}</span>${sub ? `<span class="row-text">${esc(sub)}</span>` : ''}
    <span class="row-meta">${meta.join('')}</span></span></button>`;
}
function wireRows(root) {
  root.querySelectorAll('[data-entry]').forEach(b => b.onclick = () => openEntryDetail(b.dataset.entry));
}

// ---------------- list per kind ----------------
function kindList(app, kind) {
  const m = ENTRY_KINDS[kind]; if (!m) return hub(app);
  let items = listEntries(kind);
  let filter = 'open';
  const draw = () => {
    let shown = items;
    if (kind === 'prayers') shown = filter === 'open' ? items.filter(e => !e.answered) : filter === 'answered' ? items.filter(e => e.answered) : items;
    const derived = (kind === 'people' || kind === 'topics') ? derivedNames(kind) : [];
    app.innerHTML = `
      <header class="view-head">
        <a class="link-btn" href="#/pray">${icon('chevL')} Pray</a>
        <h1>${m.pl}</h1>
        <p class="purpose">${esc(m.desc)}</p>
      </header>
      <div class="btn-row" style="margin-top:6px">
        ${speechSupported && kind !== 'people' && kind !== 'topics' ? `<button class="btn btn-outline" id="speak">${icon('mic')}Speak</button>` : ''}
        <button class="btn btn-gold" id="add">${icon('plus')}Add ${m.n.toLowerCase()}</button>
      </div>
      ${kind === 'prayers' ? `<div class="seg" style="margin-top:16px"><button data-f="open" class="${filter === 'open' ? 'on' : ''}">Still praying</button><button data-f="answered" class="${filter === 'answered' ? 'on' : ''}">Answered</button><button data-f="all" class="${filter === 'all' ? 'on' : ''}">All</button></div>` : ''}
      ${shown.length ? `<div class="list">${kind === 'people' || kind === 'topics' ? shown.map(e => linkedRow(kind, e.title || e.text, e)).join('') : shown.map(entryRow).join('')}</div>` : (derived.length ? '' : `<div class="empty"><strong>No ${m.pl.toLowerCase()} yet</strong>${kind === 'praise' ? 'When you thank God or mark a prayer answered, it is kept here.' : 'Tap Add to begin.'}</div>`)}
      ${derived.length ? `<p class="hint" style="margin-top:18px">Also mentioned in your prayers:</p><div class="list">${derived.map(n => linkedRow(kind, n)).join('')}</div>` : ''}`;
    app.querySelector('#add').onclick = () => openEntryEditor(kind);
    app.querySelector('#speak') && (app.querySelector('#speak').onclick = () => openSpeakMode());
    $$('[data-f]', app).forEach(b => b.onclick = () => { filter = b.dataset.f; draw(); });
    wireRows(app);
    $$('[data-linked]', app).forEach(b => b.onclick = () => location.hash = `#/pray/${kind === 'people' ? 'person' : 'topic'}/${encodeURIComponent(b.dataset.linked)}`);
  };
  draw();
}
function derivedNames(kind) {
  const field = kind === 'people' ? 'people' : 'topics';
  const have = new Set(listEntries(kind).map(e => (e.title || e.text || '').toLowerCase()));
  const s = new Map();
  for (const e of allEntries()) for (const n of e[field] || []) if (!have.has(n.toLowerCase())) s.set(n.toLowerCase(), n);
  return Array.from(s.values()).sort();
}
function mentions(kind, name) {
  const field = kind === 'people' ? 'people' : 'topics';
  const n = name.toLowerCase();
  return allEntries().filter(e => (e[field] || []).some(x => x.toLowerCase() === n) || (e.kind !== kind && kind === 'people' && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(e.text || '')));
}
function linkedRow(kind, name, e) {
  const n = mentions(kind, name).length;
  return `<button class="row" data-linked="${esc(name)}"><span class="row-ic">${icon(kind === 'people' ? 'user' : 'tag')}</span>
    <span class="row-main"><span class="row-title">${esc(name)}</span>${e?.text && e.text !== name ? `<span class="row-text">${esc(e.text)}</span>` : ''}
    <span class="row-meta"><span>${n} prayer${n === 1 ? '' : 's'}</span>${e?.private ? `<span class="tag">${icon('lock')}Private</span>` : ''}</span></span><span class="chev">${icon('chevR')}</span></button>`;
}
function linkedView(app, sub, name) {
  const kind = sub === 'person' ? 'people' : 'topics';
  const entry = listEntries(kind).find(e => (e.title || e.text || '').toLowerCase() === name.toLowerCase());
  const items = mentions(kind, name);
  app.innerHTML = `
    <header class="view-head">
      <a class="link-btn" href="#/pray/list/${kind}">${icon('chevL')} ${ENTRY_KINDS[kind].pl}</a>
      <h1>${esc(name)}</h1>
      <p class="purpose">Every prayer that mentions ${kind === 'people' ? 'this person' : 'this topic'}.</p>
      ${entry?.text ? `<p class="lead">${esc(entry.text)}</p>` : ''}
    </header>
    <div class="btn-row"><button class="btn btn-gold" id="add">${icon('plus')}New request</button>${entry ? `<button class="btn btn-ghost" id="edit">${icon('edit')}Edit</button>` : `<button class="btn btn-ghost" id="keep">${icon('plus')}Save to ${ENTRY_KINDS[kind].pl}</button>`}</div>
    ${items.length ? `<div class="list">${items.map(entryRow).join('')}</div>` : `<div class="empty"><strong>No prayers yet</strong>Add a request to start praying.</div>`}`;
  app.querySelector('#add').onclick = () => openEntryEditor('prayers', { [kind]: [name] });
  app.querySelector('#edit') && (app.querySelector('#edit').onclick = () => openEntryEditor(kind, entry));
  app.querySelector('#keep') && (app.querySelector('#keep').onclick = async () => { const r = await saveEntry(kind, { title: name, text: '' }); savedNote(r.remote); });
  wireRows(app);
}

// ---------------- Look Back ----------------
function lookBack(app, answeredOnly) {
  let filter = 'all', q = '';
  const FILTERS = [['all', 'All'], ['prayers', 'Requests'], ['praise', 'Praises'], ['people', 'People'], ['topics', 'Topics'], ['journal', 'Journal'], ['notes', 'Notes']];
  app.innerHTML = `
    <header class="view-head">
      <a class="link-btn" href="#/pray">${icon('chevL')} Pray</a>
      <h1>${answeredOnly ? 'Answered prayers' : 'Look Back'}</h1>
      <p class="purpose">${answeredOnly ? 'Each answered prayer, with the day you started praying and the day God answered.' : 'A timeline of everything you have prayed, newest first. Private entries are not shown here.'}</p>
    </header>
    <div class="search">${icon('search')}<input type="search" id="q" placeholder="Search your prayers" aria-label="Search your prayers"></div>
    ${answeredOnly ? '' : `<div class="subtabs" role="tablist">${FILTERS.map(([k, n]) => `<button data-f="${k}" class="${k === filter ? 'on' : ''}">${n}</button>`).join('')}</div>`}
    <div id="tl"></div>`;
  const tl = app.querySelector('#tl');
  const draw = () => {
    let items = allEntries();
    if (answeredOnly) items = items.filter(e => e.kind === 'prayers' && e.answered).sort((a, b) => (b.answeredAt || 0) - (a.answeredAt || 0));
    else if (filter !== 'all') items = items.filter(e => e.kind === filter);
    if (q) { const s = q.toLowerCase(); items = items.filter(e => [e.text, e.title, e.answerNote, ...(e.people || []), ...(e.topics || [])].join(' ').toLowerCase().includes(s)); }
    if (!items.length) { tl.innerHTML = `<div class="empty"><strong>${answeredOnly ? 'No answered prayers yet' : 'Nothing found'}</strong>${answeredOnly ? 'Open a request and tap “Mark answered” when God answers.' : q ? 'Try a different word.' : 'Your prayers will appear here.'}</div>`; return; }
    if (answeredOnly) {
      tl.innerHTML = `<div class="list">${items.map(e => `<button class="row answered" data-entry="${esc(e.id)}"><span class="row-ic">${icon('check')}</span><span class="row-main">
        <span class="row-title">${esc(e.text)}</span>${e.answerNote ? `<span class="row-text">${esc(e.answerNote)}</span>` : ''}
        <dl class="kv"><dt>Prayed</dt><dd>${fmtDate(e.createdAt, { year: 'numeric' })}</dd><dt>Answered</dt><dd>${fmtDate(e.answeredAt, { year: 'numeric' })}</dd>${e.answeredAt ? `<dt>Waited</dt><dd>${waited(e.createdAt, e.answeredAt)}</dd>` : ''}</dl></span></button>`).join('')}</div>`;
    } else {
      let html = '', last = '';
      for (const e of items) {
        const d = new Date(e.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        if (d !== last) { html += `<div class="timeline-date">${esc(d)}</div>`; last = d; }
        html += entryRow(e);
      }
      tl.innerHTML = `<div class="list" style="gap:10px">${html}</div>`;
    }
    wireRows(tl);
  };
  app.querySelector('#q').addEventListener('input', e => { q = e.target.value.trim(); draw(); });
  $$('[data-f]', app).forEach(b => b.onclick = () => { filter = b.dataset.f; $$('[data-f]', app).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  draw();
}
function waited(a, b) {
  const d = Math.max(0, Math.round((b - a) / 86400000));
  if (d < 1) return 'the same day';
  if (d < 60) return `${d} day${d === 1 ? '' : 's'}`;
  if (d < 730) return `${Math.round(d / 30)} months`;
  return `${(d / 365).toFixed(1)} years`;
}

// ---------------- entry detail ----------------
export function openEntryDetail(id) {
  const e = findEntry(id); if (!e) return;
  if (e.private && !privateUnlocked()) return askPasscode(() => openEntryDetail(id));
  const m = ENTRY_KINDS[e.kind];
  const linked = e.linkedId ? findEntry(e.linkedId) : null;
  const answers = e.kind === 'prayers' ? allEntries({ includePrivate: privateUnlocked() }).filter(x => x.linkedId === e.id) : [];
  const s = openSheet(`
    <p class="eyebrow">${esc(m.n)} · ${fmtDate(e.createdAt, { year: 'numeric' })}</p>
    ${e.title && e.kind !== 'prayers' ? `<h2 class="sheet-title">${esc(e.title)}</h2>` : ''}
    <p class="prayer-text" style="margin-top:10px;white-space:pre-wrap">${esc(e.text || '')}</p>
    ${(e.people || []).length || (e.topics || []).length ? `<div class="chips">${(e.people || []).map(p => `<span class="tag">${icon('user')}${esc(p)}</span>`).join('')}${(e.topics || []).map(p => `<span class="tag">${icon('tag')}${esc(p)}</span>`).join('')}</div>` : ''}
    ${e.answered ? `<div class="card" style="border-color:rgba(127,191,151,.35)"><div class="card-label" style="color:var(--ok)">${icon('check')}Answered</div>
      <dl class="kv"><dt>Prayed</dt><dd>${fmtDate(e.createdAt, { year: 'numeric' })}</dd><dt>Answered</dt><dd>${fmtDate(e.answeredAt, { year: 'numeric' })}</dd></dl>
      ${e.answerNote ? `<p class="lead">${esc(e.answerNote)}</p>` : ''}</div>` : ''}
    ${linked ? `<button class="row" style="margin-top:14px" data-open="${esc(linked.id)}"><span class="row-ic">${icon('pray')}</span><span class="row-main"><span class="row-title">The original request</span><span class="row-text">${esc(linked.text)}</span><span class="row-meta">Prayed ${fmtDate(linked.createdAt, { year: 'numeric' })}</span></span></button>` : ''}
    ${answers.map(a => `<button class="row" style="margin-top:14px" data-open="${esc(a.id)}"><span class="row-ic">${icon('sparkle')}</span><span class="row-main"><span class="row-title">Praise for this answer</span><span class="row-text">${esc(a.text)}</span></span></button>`).join('')}
    ${e._pending && state.user ? `<p class="hint">${icon('info')} Saved on this device. It will sync to your account when it can.</p>` : ''}
    <div class="btn-row" style="flex-wrap:wrap">
      ${e.kind === 'prayers' && !e.answered ? `<button class="btn btn-gold" data-a="answer" style="flex-basis:100%">${icon('check')}Mark answered</button>` : ''}
      ${e.kind === 'prayers' && e.answered ? `<button class="btn btn-ghost" data-a="unanswer" style="flex-basis:100%">Still praying (undo answered)</button>` : ''}
      <button class="btn btn-ghost" data-a="edit">${icon('edit')}Edit</button>
      <button class="btn btn-danger" data-a="del">${icon('trash')}Delete</button>
    </div>`, { label: m.n });
  s.el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { s.close(); setTimeout(() => openEntryDetail(b.dataset.open), 230); });
  s.el.querySelector('[data-a=answer]')?.addEventListener('click', () => { s.close(); setTimeout(() => openAnswerSheet(e), 230); });
  s.el.querySelector('[data-a=unanswer]')?.addEventListener('click', async () => { await saveEntry('prayers', { id: e.id, answered: false, answeredAt: null, answerNote: '' }); s.close(); toast('Moved back to “Still praying”'); });
  s.el.querySelector('[data-a=edit]').onclick = () => { s.close(); setTimeout(() => openEntryEditor(e.kind, e), 230); };
  s.el.querySelector('[data-a=del]').onclick = async () => {
    if (await confirmSheet('Delete this entry?', 'This cannot be undone.', 'Delete', true)) { await deleteEntry(e.kind, e.id); s.close(); toast('Deleted'); }
  };
}

function openAnswerSheet(e) {
  const s = openSheet(`
    <h2 class="sheet-title">Praise God!</h2>
    <p class="lead">Mark this prayer answered. It stays in your Look Back with the date you began praying.</p>
    <div class="card" style="margin-top:14px"><p class="hint" style="margin:0">You prayed on ${fmtDate(e.createdAt, { year: 'numeric' })}</p><p style="margin:6px 0 0">${esc(e.text)}</p></div>
    <label class="field"><span>How did God answer? (optional)</span><textarea id="note" data-dictate placeholder="Write or speak what happened"></textarea></label>
    <div class="toggle-row"><div class="tr-text"><strong>Add to Praises & Answers</strong><small>Keeps a praise linked to this request</small></div><label class="switch"><input type="checkbox" id="praise" checked><span></span></label></div>
    <div class="btn-row"><button class="btn btn-gold" id="save">${icon('check')}Mark answered</button></div>`, { label: 'Mark answered' });
  wireDictation(s.el);
  s.el.querySelector('#save').onclick = async () => {
    stopListening();
    const note = s.el.querySelector('#note').value.trim();
    const now = Date.now();
    const r = await saveEntry('prayers', { id: e.id, answered: true, answeredAt: now, answerNote: note });
    if (s.el.querySelector('#praise').checked) {
      await saveEntry('praise', { text: note ? `${note}` : `God answered: ${e.text}`, title: 'Answered prayer', linkedId: e.id, people: e.people || [], topics: e.topics || [], private: !!e.private, source: 'typed' });
    }
    s.close();
    savedNote(r.remote);
  };
}

// ---------------- editor ----------------
export function openEntryEditor(kind = 'prayers', existing = null) {
  const isEdit = !!(existing && existing.id);
  const pre = existing || {};
  let k = kind;
  let people = [...(pre.people || [])], topics = [...(pre.topics || [])];
  const knownPeople = () => Array.from(new Set([...listEntries('people', { includePrivate: privateUnlocked() }).map(e => e.title || e.text), ...allEntries().flatMap(e => e.people || [])])).filter(Boolean).slice(0, 24);
  const knownTopics = () => Array.from(new Set([...PRESET_TOPICS, ...listEntries('topics').map(e => e.title || e.text), ...allEntries().flatMap(e => e.topics || [])])).filter(Boolean);
  const s = openSheet('', { label: 'New entry' });
  const draw = () => {
    const titled = k === 'people' || k === 'topics' || k === 'notes' || k === 'journal';
    const titleLabel = { people: 'Name', topics: 'Topic', notes: 'Title', journal: 'Title (optional)' }[k];
    const textLabel = { prayers: 'What are you asking God for?', praise: 'What are you thanking God for?', people: 'Notes about how to pray for them (optional)', topics: 'Notes (optional)', journal: 'Your prayer', notes: 'Your note' }[k];
    const curTitle = s.el.querySelector('#e-title')?.value ?? pre.title ?? '';
    const curText = s.el.querySelector('#e-text')?.value ?? pre.text ?? '';
    const curPriv = s.el.querySelector('#e-priv')?.checked ?? !!pre.private;
    s.set(`
      <h2 class="sheet-title">${isEdit ? 'Edit' : 'New'} ${ENTRY_KINDS[k].n.toLowerCase()}</h2>
      ${isEdit ? '' : `<div class="subtabs" style="margin-top:12px">${Object.entries(ENTRY_KINDS).map(([kk, m]) => `<button data-k="${kk}" class="${kk === k ? 'on' : ''}">${m.n}</button>`).join('')}</div>`}
      ${titled ? `<label class="field"><span>${titleLabel}</span><input type="text" id="e-title" data-dictate value="${esc(curTitle)}" autocomplete="off"></label>` : ''}
      <label class="field"><span>${textLabel}</span><textarea id="e-text" data-dictate placeholder="Type, or tap the microphone and speak">${esc(curText)}</textarea></label>
      ${k === 'prayers' || k === 'praise' || k === 'journal' ? `
        <div class="field" style="margin-top:18px"><span class="field-label">Who is this for? (optional)</span>
          <div class="chips" id="p-chips">${people.map(p => `<button class="chip chip-sm on" data-rm-p="${esc(p)}">${esc(p)} ${icon('x')}</button>`).join('')}</div>
          <div style="margin-top:10px"><input type="text" id="p-add" data-dictate placeholder="Add a name, then tap Add" autocomplete="off"></div>
          <button class="btn btn-ghost btn-sm" id="p-add-btn" style="margin-top:10px">${icon('plus')}Add name</button>
          ${knownPeople().filter(p => !people.includes(p)).length ? `<div class="chips">${knownPeople().filter(p => !people.includes(p)).map(p => `<button class="chip chip-sm" data-add-p="${esc(p)}">${icon('plus')}${esc(p)}</button>`).join('')}</div>` : ''}
        </div>
        <div class="field" style="margin-top:18px"><span class="field-label">Topics (optional)</span>
          <div class="chips">${knownTopics().map(t => `<button class="chip chip-sm ${topics.includes(t) ? 'on' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        </div>` : ''}
      <div class="card" style="padding:4px 16px">
        <div class="toggle-row"><div class="tr-text"><strong>${icon('lock')} Private</strong><small>Hidden from your lists and Look Back. Opens only with your passcode. Never shared in Groups.</small></div><label class="switch"><input type="checkbox" id="e-priv" ${curPriv ? 'checked' : ''}><span></span></label></div>
      </div>
      <div class="btn-row"><button class="btn btn-gold" id="e-save">${icon('check')}Save</button></div>`);
    wireDictation(s.el);
    s.el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { k = b.dataset.k; draw(); });
    s.el.querySelectorAll('[data-rm-p]').forEach(b => b.onclick = () => { people = people.filter(x => x !== b.dataset.rmP); draw(); });
    s.el.querySelectorAll('[data-add-p]').forEach(b => b.onclick = () => { people.push(b.dataset.addP); draw(); });
    s.el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { topics = topics.includes(b.dataset.t) ? topics.filter(x => x !== b.dataset.t) : [...topics, b.dataset.t]; b.classList.toggle('on'); });
    const addName = () => { const v = s.el.querySelector('#p-add').value.trim(); if (v && !people.includes(v)) { people.push(v); draw(); } };
    s.el.querySelector('#p-add-btn')?.addEventListener('click', addName);
    s.el.querySelector('#p-add')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addName(); } });
    s.el.querySelector('#e-save').onclick = save;
  };
  const save = async () => {
    stopListening();
    const title = s.el.querySelector('#e-title')?.value.trim() || '';
    const text = s.el.querySelector('#e-text').value.trim();
    const pend = s.el.querySelector('#p-add')?.value.trim(); if (pend && !people.includes(pend)) people.push(pend);
    if (!text && !title) { toast('Please write or speak something first.'); return; }
    const priv = s.el.querySelector('#e-priv').checked;
    if (priv && !kvGet('pin')) {
      s.close();
      return setupPasscode(() => doSave(title, text, priv));
    }
    await doSave(title, text, priv);
    s.close();
  };
  const doSave = async (title, text, priv) => {
    const data = { title, text, private: priv, source: pre.source || 'typed' };
    if (k === 'prayers' || k === 'praise' || k === 'journal') { data.people = people; data.topics = topics; }
    if (isEdit) data.id = pre.id;
    else if (pre.linkedId) data.linkedId = pre.linkedId;
    const r = await saveEntry(k, data);
    if (priv) privateUnlockedAt = Date.now();
    savedNote(r.remote);
  };
  draw();
  return s;
}

// ---------------- Speak your prayer ----------------
export function openSpeakMode({ intro } = {}) {
  let transcript = '';
  const s = openSheet('', { full: true, label: 'Speak your prayer' });
  s.onClose = () => stopListening();
  const idle = () => {
    s.set(`
      <div class="speak-stage">
        <p class="eyebrow">Speak your prayer</p>
        <h2 class="sheet-title" style="padding:0 50px">Talk to God in your own words</h2>
        ${intro ? `<p class="lead" style="font-family:var(--serif);font-size:calc(20px*var(--fs-scale))">${esc(intro)}</p>` : `<p class="lead">Tap the button and pray out loud. When you stop, we will sort what you said into requests, praises, people and topics for you to check.</p>`}
        ${speechSupported ? `
          <button class="speak-orb" id="orb" aria-label="Start speaking">${icon('mic')}</button>
          <div class="speak-status" id="status">Tap to begin</div>
          <div class="transcript" id="tx" hidden></div>
          <div class="btn-row" id="stop-row" hidden><button class="btn btn-gold btn-block" id="stop">Stop and review</button></div>
          <button class="link-btn" id="typeinstead" style="margin-top:14px">Type instead</button>`
        : `<div class="notice notice-gold" style="margin-top:18px">${icon('info')}${NO_MIC_HINT}</div>
           <textarea id="manual" style="margin-top:14px;min-height:200px" placeholder="Write or dictate your prayer here"></textarea>
           <div class="btn-row"><button class="btn btn-gold btn-block" id="manual-go">Review and save</button></div>`}
      </div>`);
    if (!speechSupported) {
      s.el.querySelector('#manual-go').onclick = () => { transcript = s.el.querySelector('#manual').value.trim(); if (!transcript) return toast('Please write your prayer first.'); review(); };
      return;
    }
    s.el.querySelector('#typeinstead').onclick = () => { stopListening(); typeMode(); };
    const orb = s.el.querySelector('#orb'), status = s.el.querySelector('#status'), tx = s.el.querySelector('#tx');
    const start = () => {
      orb.classList.add('on'); status.textContent = 'Listening…'; tx.hidden = false; s.el.querySelector('#stop-row').hidden = false;
      tx.innerHTML = '<span class="interim">Start speaking…</span>';
      listen({
        onText: (fin, interim) => { transcript = fin; tx.innerHTML = esc(fin) + (interim ? ` <span class="interim">${esc(interim)}</span>` : ''); },
        onEnd: fin => { transcript = fin || transcript; },
        onError: () => { orb.classList.remove('on'); status.textContent = 'Tap to try again'; },
      });
    };
    orb.onclick = () => orb.classList.contains('on') ? finish() : start();
    const finish = () => { stopListening(); setTimeout(() => { if (!transcript.trim()) { toast('We did not hear anything. Please try again.'); orb.classList.remove('on'); status.textContent = 'Tap to begin'; return; } review(); }, 350); };
    s.el.querySelector('#stop').onclick = finish;
  };
  const typeMode = () => {
    s.set(`<div class="speak-stage"><p class="eyebrow">Write your prayer</p><h2 class="sheet-title" style="padding:0 50px">Pray in your own words</h2>
      <textarea id="manual" data-dictate style="margin-top:18px;min-height:220px" placeholder="Write your prayer here">${esc(transcript)}</textarea>
      <div class="btn-row"><button class="btn btn-gold btn-block" id="manual-go">Review and save</button></div></div>`);
    wireDictation(s.el);
    s.el.querySelector('#manual-go').onclick = () => { stopListening(); transcript = s.el.querySelector('#manual').value.trim(); if (!transcript) return toast('Please write your prayer first.'); review(); };
  };
  const review = () => {
    const known = listEntries('people', { includePrivate: true }).map(e => e.title || e.text).filter(Boolean);
    const org = organize(transcript, known);
    const existingPeople = new Set(known.map(x => x.toLowerCase()));
    const existingTopics = new Set(listEntries('topics', { includePrivate: true }).map(e => (e.title || e.text || '').toLowerCase()));
    s.set(`
      <p class="eyebrow">Review</p>
      <h2 class="sheet-title">Here is what we heard</h2>
      <p class="lead">Check the items you want to keep. You can change the words or the list each one goes in.</p>
      <label class="field"><span>Your full prayer</span><textarea id="full" data-dictate>${esc(transcript)}</textarea></label>
      <button class="btn btn-ghost btn-sm" id="resort" style="margin-top:10px">${icon('refresh')}Sort again</button>
      <h3 style="margin-top:24px">Suggested entries</h3>
      <div id="sugg">${org.items.map((it, i) => `
        <div class="sugg" data-i="${i}">
          <div class="sugg-top"><label class="switch"><input type="checkbox" class="s-on" checked aria-label="Keep this item"><span></span></label>
            <select class="s-kind" aria-label="List"><option value="prayers" ${it.kind === 'prayers' ? 'selected' : ''}>Request</option><option value="praise" ${it.kind === 'praise' ? 'selected' : ''}>Praise / thanks</option><option value="journal">Journal</option></select></div>
          <textarea class="s-text" aria-label="Entry text">${esc(it.text)}</textarea>
          ${it.people.length || it.topics.length ? `<div class="chips">${it.people.map(p => `<span class="tag">${icon('user')}${esc(p)}</span>`).join('')}${it.topics.map(t => `<span class="tag">${icon('tag')}${esc(t)}</span>`).join('')}</div>` : ''}
        </div>`).join('') || '<p class="hint">No separate requests found. Your prayer will be kept in your Journal.</p>'}</div>
      ${org.people.length ? `<h3 style="margin-top:24px">People</h3><p class="hint">Tap to add or remove from your People list.</p><div class="chips">${org.people.map(p => `<button class="chip ${existingPeople.has(p.toLowerCase()) ? '' : 'on'}" data-person="${esc(p)}" ${existingPeople.has(p.toLowerCase()) ? 'disabled' : ''}>${icon(existingPeople.has(p.toLowerCase()) ? 'user' : 'check')}${esc(p)}${existingPeople.has(p.toLowerCase()) ? ' (already saved)' : ''}</button>`).join('')}</div>` : ''}
      ${org.topics.length ? `<h3 style="margin-top:24px">Topics</h3><div class="chips">${org.topics.map(t => `<button class="chip ${existingTopics.has(t.toLowerCase()) ? '' : 'on'}" data-topic="${esc(t)}" ${existingTopics.has(t.toLowerCase()) ? 'disabled' : ''}>${icon(existingTopics.has(t.toLowerCase()) ? 'tag' : 'check')}${esc(t)}</button>`).join('')}</div>` : ''}
      <div class="card" style="padding:4px 16px;margin-top:24px">
        <div class="toggle-row"><div class="tr-text"><strong>Keep my full prayer in my Journal</strong><small>Saves everything you said, word for word</small></div><label class="switch"><input type="checkbox" id="keep-j" checked><span></span></label></div>
        <div class="toggle-row"><div class="tr-text"><strong>${icon('lock')} Private</strong><small>Only you can open these, with your passcode</small></div><label class="switch"><input type="checkbox" id="priv"><span></span></label></div>
      </div>
      <div class="btn-row"><button class="btn btn-ghost" id="again">${icon('mic')}Start over</button><button class="btn btn-gold" id="save">${icon('check')}Save</button></div>`);
    wireDictation(s.el);
    s.el.querySelectorAll('.s-on').forEach(c => c.onchange = () => c.closest('.sugg').classList.toggle('off', !c.checked));
    s.el.querySelectorAll('[data-person],[data-topic]').forEach(b => b.onclick = () => { b.classList.toggle('on'); b.querySelector('.ic').outerHTML = icon(b.classList.contains('on') ? 'check' : 'plus'); });
    s.el.querySelector('#resort').onclick = () => { stopListening(); transcript = s.el.querySelector('#full').value.trim(); review(); };
    s.el.querySelector('#again').onclick = () => { transcript = ''; idle(); };
    s.el.querySelector('#save').onclick = async () => {
      stopListening();
      const full = s.el.querySelector('#full').value.trim();
      const priv = s.el.querySelector('#priv').checked;
      const go = async () => {
        let remoteAll = true, n = 0;
        for (const box of s.el.querySelectorAll('.sugg')) {
          if (!box.querySelector('.s-on').checked) continue;
          const it = org.items[+box.dataset.i];
          const text = box.querySelector('.s-text').value.trim(); if (!text) continue;
          const kind = box.querySelector('.s-kind').value;
          const r = await saveEntry(kind, { text, people: it.people, topics: it.topics, private: priv, source: 'voice' });
          remoteAll &&= r.remote; n++;
        }
        for (const b of s.el.querySelectorAll('[data-person].on')) { const r = await saveEntry('people', { title: b.dataset.person, text: '', private: priv, source: 'voice' }); remoteAll &&= r.remote; }
        for (const b of s.el.querySelectorAll('[data-topic].on')) { const r = await saveEntry('topics', { title: b.dataset.topic, text: '', private: priv, source: 'voice' }); remoteAll &&= r.remote; }
        if (s.el.querySelector('#keep-j').checked && full) {
          const r = await saveEntry('journal', { title: 'Prayer · ' + new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' }), text: full, people: org.people, topics: org.topics, private: priv, source: 'voice' });
          remoteAll &&= r.remote; n++;
        }
        if (priv) privateUnlockedAt = Date.now();
        s.close();
        if (!n) return toast('Nothing was selected to save.');
        savedNote(remoteAll);
      };
      if (priv && !kvGet('pin')) { s.close(); return setupPasscode(go); }
      await go();
    };
  };
  idle();
  return s;
}

// ---------------- Private ----------------
function privateArea(app) {
  if (!kvGet('pin')) {
    app.innerHTML = `<header class="view-head"><a class="link-btn" href="#/pray">${icon('chevL')} Pray</a><h1>Private</h1>
      <p class="purpose">A locked place for prayers you want no one else to see. Private entries never appear in your lists, Look Back or Groups.</p></header>
      <div class="card" style="text-align:center"><div style="color:var(--gold);margin:6px auto 8px;width:48px">${icon('lock')}</div>
      <h3>Set a passcode</h3><p class="lead">Choose a 4 to 6 digit passcode to open your private prayers.</p>
      <button class="btn btn-gold btn-block" id="setpin" style="margin-top:18px">Set passcode</button></div>`;
    app.querySelector('#setpin').onclick = () => setupPasscode(() => privateArea(app));
    return;
  }
  if (!privateUnlocked()) {
    app.innerHTML = `<header class="view-head"><a class="link-btn" href="#/pray">${icon('chevL')} Pray</a><h1>Private</h1>
      <p class="purpose">Your private prayers are locked.</p></header>
      <div class="card" style="text-align:center"><div style="color:var(--gold);margin:6px auto 8px;width:48px">${icon('lock')}</div>
      <h3>Locked</h3><p class="lead">Enter your passcode to see your private entries.</p>
      <button class="btn btn-gold btn-block" id="unlock" style="margin-top:18px" data-testid="unlock">${icon('unlock')}Unlock</button></div>`;
    app.querySelector('#unlock').onclick = () => askPasscode(() => privateArea(app));
    return;
  }
  const items = allEntries({ onlyPrivate: true });
  app.innerHTML = `<header class="view-head"><a class="link-btn" href="#/pray">${icon('chevL')} Pray</a><h1>Private</h1>
    <p class="purpose">Only you can see these. They lock again after a few minutes.</p></header>
    <div class="btn-row"><button class="btn btn-gold" id="add">${icon('plus')}New entry</button><button class="btn btn-ghost" id="lock">${icon('lock')}Lock now</button></div>
    ${items.length ? `<div class="list" data-testid="private-list">${items.map(entryRow).join('')}</div>` : `<div class="empty"><strong>No private entries</strong>Turn on “Private” when you save any entry.</div>`}
    <button class="link-btn" id="chg" style="margin-top:18px">Change passcode</button>`;
  app.querySelector('#add').onclick = () => openEntryEditor('prayers', { private: true });
  app.querySelector('#lock').onclick = () => { privateUnlockedAt = 0; privateArea(app); };
  app.querySelector('#chg').onclick = () => setupPasscode(() => { toast('Passcode changed'); privateArea(app); });
  wireRows(app);
}

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deviceUnlockAvailable() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; }
}

function pinPad(s, { title, sub, onDone, extra = '' }) {
  let pin = '';
  s.set(`<div style="text-align:center"><h2 class="sheet-title" style="padding:0 50px">${esc(title)}</h2><p class="lead">${esc(sub)}</p>
    <div class="pin-dots">${[0, 1, 2, 3, 4, 5].map(i => `<i class="${i >= 4 ? 'extra' : ''}"></i>`).join('')}</div>
    <p class="hint" id="pin-msg" style="min-height:1.6em"></p>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}<button class="k-sm" data-del>Delete</button><button data-n="0">0</button><button class="k-sm" data-ok>Done</button></div>
    <input type="tel" inputmode="numeric" id="pin-hidden" aria-label="Passcode" autocomplete="off" style="position:absolute;opacity:0;width:1px;height:1px;left:-9999px">
    ${extra}</div>`);
  const dots = s.el.querySelectorAll('.pin-dots i');
  const msg = s.el.querySelector('#pin-msg');
  const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
  s.el.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { if (pin.length < 6) { pin += b.dataset.n; paint(); msg.textContent = ''; } });
  s.el.querySelector('[data-del]').onclick = () => { pin = pin.slice(0, -1); paint(); };
  s.el.querySelector('[data-ok]').onclick = () => { if (pin.length < 4) { msg.textContent = 'Please use 4 to 6 digits.'; return; } const p = pin; pin = ''; paint(); onDone(p, m => { msg.textContent = m; }); };
  // physical keyboards
  s.el.closest('.sheet').addEventListener('keydown', e => { if (/^\d$/.test(e.key)) s.el.querySelector(`[data-n="${e.key}"]`)?.click(); else if (e.key === 'Backspace') s.el.querySelector('[data-del]').click(); else if (e.key === 'Enter') s.el.querySelector('[data-ok]').click(); });
}

export function setupPasscode(then) {
  const s = openSheet('', { label: 'Set passcode' });
  pinPad(s, {
    title: 'Choose a passcode', sub: 'Pick 4 to 6 digits, then tap Done.',
    onDone: first => pinPad(s, {
      title: 'Enter it again', sub: 'Type the same passcode to confirm.',
      onDone: async (second, fail) => {
        if (second !== first) { fail('Those did not match. Please start again.'); setTimeout(() => { s.close(); setupPasscode(then); }, 900); return; }
        const salt = uid(16);
        kvSet('pin', { salt, hash: await sha256(salt + ':' + first), cred: kvGet('pin')?.cred || null });
        pushProfile();
        privateUnlockedAt = Date.now();
        if (await deviceUnlockAvailable()) {
          s.set(`<h2 class="sheet-title">Use Face ID or fingerprint?</h2><p class="lead">You can also open Private with your phone’s screen lock. Your passcode always works too.</p>
            <div class="btn-row"><button class="btn btn-ghost" id="skip">Not now</button><button class="btn btn-gold" id="yes">${icon('fingerprint')}Turn on</button></div>`);
          s.el.querySelector('#skip').onclick = () => { s.close(); then && then(); };
          s.el.querySelector('#yes').onclick = async () => {
            try {
              const cred = await navigator.credentials.create({ publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'Called to Pray' },
                user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'private-prayers', displayName: 'Private prayers' },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000 } });
              kvSet('pin', { ...kvGet('pin'), cred: b64(cred.rawId) });
              toast('Device unlock is on');
            } catch { toast('Device unlock was not turned on. Your passcode still works.'); }
            s.close(); then && then();
          };
        } else { s.close(); then && then(); }
      }
    })
  });
}

export function askPasscode(then) {
  const pin = kvGet('pin');
  if (!pin) return setupPasscode(then);
  const s = openSheet('', { label: 'Enter passcode' });
  const extra = `${pin.cred ? `<button class="btn btn-outline btn-block" id="dev" style="margin-top:18px">${icon('fingerprint')}Use Face ID or fingerprint</button>` : ''}<button class="link-btn" id="forgot" style="margin-top:10px">Forgot passcode?</button>`;
  pinPad(s, {
    title: 'Enter passcode', sub: 'Your private prayers are locked.', extra,
    onDone: async (p, fail) => {
      if (await sha256(pin.salt + ':' + p) === pin.hash) { privateUnlockedAt = Date.now(); s.close(); then && then(); }
      else fail('That passcode is not right. Please try again.');
    }
  });
  s.el.querySelector('#dev')?.addEventListener('click', async () => {
    try {
      await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: unb64(pin.cred) }], userVerification: 'required', timeout: 60000 } });
      privateUnlockedAt = Date.now(); s.close(); then && then();
    } catch { toast('Please use your passcode.'); }
  });
  s.el.querySelector('#forgot').onclick = () => { s.close(); setTimeout(() => forgotPasscode(then), 230); };
}

function forgotPasscode(then) {
  if (state.user) {
    const s = openSheet(`<h2 class="sheet-title">Reset your passcode</h2><p class="lead">To keep your private prayers safe, please confirm it is you by signing in again.</p>
      <label class="field"><span>Account password</span><input type="password" id="pw" autocomplete="current-password" placeholder="Leave empty if you use Google"></label>
      <p class="hint" id="msg"></p><div class="btn-row"><button class="btn btn-gold" id="go">Confirm</button></div>`, { label: 'Reset passcode' });
    s.el.querySelector('#go').onclick = async () => {
      try { await reauthenticate(s.el.querySelector('#pw').value); kvSet('pin', null); s.close(); setupPasscode(then); }
      catch (e) { s.el.querySelector('#msg').textContent = 'We could not confirm it is you. Please check your password.'; }
    };
  } else {
    confirmSheet('Reset passcode?', 'Without an account we cannot confirm it is you, so resetting the passcode will permanently erase the private entries on this device. Your other entries are kept.', 'Erase and reset', true).then(async ok => {
      if (!ok) return;
      for (const e of allEntries({ onlyPrivate: true })) await deleteEntry(e.kind, e.id);
      kvSet('pin', null); setupPasscode(then);
    });
  }
}
