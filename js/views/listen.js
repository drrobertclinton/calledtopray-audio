// Listen & Read: Psalms, Proverbs, topical verses, reading plans, the reader and
// "Becoming a Christian".
import { $$, esc, icon, toast, todayKey, daysBetween, openSheet } from '../util.js';
import { state, tr, kvGet, kvSet, saveProfile } from '../store.js';
import { books, audioIndex, topicsData, getPassage, getChapter, verseAudio, chapterAudio, displayRef, TR_NAMES, parseRef, resolveRecordedRef } from '../bible.js';
import { playBtn, playTrack, player } from '../audio.js';
import { BELIEVE_STEPS, SALVATION_PRAYER } from '../content.js';
import { psalmOfTheDay, proverbOfTheDay } from './today.js';

const PLANS = [
  { k: 'y1', n: 'Through the Bible in 1 year', days: 365, sub: 'About 3 to 4 chapters a day' },
  { k: 'm6', n: 'Through the Bible in 6 months', days: 182, sub: 'About 6 to 7 chapters a day' },
  { k: 'm3', n: 'Through the Bible in 3 months', days: 91, sub: 'About 13 chapters a day' },
];

export async function renderListen(app, parts) {
  const [sub, arg] = parts;
  if (sub === 'psalms') return chapterGrid(app, 'Psalms');
  if (sub === 'proverbs') return chapterGrid(app, 'Proverbs');
  if (sub === 'topics') return topicList(app, arg);
  if (sub === 'plans') return plansView(app, arg);
  if (sub === 'believe') return believe(app);
  if (sub === 'bible') return bibleBooks(app, arg);
  return home(app);
}

function home(app) {
  const t = tr();
  const plan = kvGet('plan');
  app.innerHTML = `
    <header class="view-head">
      <p class="eyebrow">Scripture</p>
      <h1>Listen & Read</h1>
      <p class="purpose">Have Scripture read aloud, or read any chapter of the Bible in the ${esc(TR_NAMES[t])}.</p>
    </header>
    <div class="list">
      ${navRow('#/listen/psalms', 'volume', 'Psalms', 'All 150 Psalms, read aloud. Pray them back to God.')}
      ${navRow('#/listen/proverbs', 'leaf', 'Proverbs', 'All 31 chapters of wisdom for daily life, read aloud.')}
      ${navRow('#/listen/topics', 'tag', 'Verses by topic', 'Key verses for fear, grief, work, family and more, each read aloud.')}
      ${navRow('#/listen/plans', 'calendar', 'Read the Bible plans', plan ? `You are on: ${PLANS.find(p => p.k === plan.k)?.n || 'a plan'}` : 'Read the whole Bible in a year, 6 months or 3 months.')}
      ${navRow('#/listen/bible', 'book', 'The whole Bible', 'Open any book and chapter to read.')}
      ${navRow('#/listen/believe', 'cross', 'Becoming a Christian', 'Six short steps from the Bible about how to know Jesus.')}
    </div>`;
}
function navRow(href, ic, title, text) {
  return `<a class="row" href="${href}"><span class="row-ic">${icon(ic)}</span><span class="row-main"><span class="row-title">${esc(title)}</span><span class="row-text">${esc(text)}</span></span><span class="chev">${icon('chevR')}</span></a>`;
}
const back = (href = '#/listen', label = 'Listen & Read') => `<a class="link-btn" href="${href}">${icon('chevL')} ${esc(label)}</a>`;

// ---------------- Psalms / Proverbs grids ----------------
async function chapterGrid(app, book) {
  const t = tr();
  const idx = await audioIndex();
  const n = book === 'Psalms' ? 150 : 31;
  const today = book === 'Psalms' ? psalmOfTheDay() : proverbOfTheDay();
  const multi = Object.entries(idx[t][book]).filter(([, v]) => v.length > 1).length;
  app.innerHTML = `
    <header class="view-head">${back()}
      <h1>${book}</h1>
      <p class="purpose">${book === 'Psalms' ? 'Tap a number to read and listen to that Psalm. Longer Psalms play all their parts in order.' : 'Tap a chapter to read and listen. Many people read the chapter that matches today’s date.'}</p>
    </header>
    <div class="card card-gold" style="margin-top:6px">
      <div class="card-label">${icon('sun')}Today</div>
      <h3 style="margin-top:6px">${book === 'Psalms' ? 'Psalm' : 'Proverbs'} ${today}</h3>
      <div class="card-actions">${playBtn(`c:${t}:${book}:${today}`, 'Listen')}<a class="btn btn-ghost btn-sm" href="#/read/${book}/${today}">Read</a></div>
    </div>
    <div class="numgrid" aria-label="${book} chapters">${Array.from({ length: n }, (_, i) => i + 1).map(c => `<button data-c="${c}" class="${c === today ? 'today' : ''}" aria-label="${book === 'Psalms' ? 'Psalm' : 'Proverbs'} ${c}${(idx[t][book][c] || []).length > 1 ? ', ' + idx[t][book][c].length + ' parts' : ''}">${c}${(idx[t][book][c] || []).length > 1 ? '<span class="dot"></span>' : ''}</button>`).join('')}</div>
    ${multi ? `<p class="hint" style="margin-top:12px"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--gold);vertical-align:middle;margin-right:6px"></span>A small dot means a longer reading that plays in parts.</p>` : ''}`;
  app.querySelector('[data-play]').setAttribute('data-label', 'Listen');
  app.querySelector('[data-play]').onclick = async () => playTrack({ id: `c:${t}:${book}:${today}`, title: `${book === 'Psalms' ? 'Psalm' : 'Proverbs'} ${today}`, subtitle: `Read by Robert Clinton, MD · ${t}`, parts: await chapterAudio(book, today, t) });
  $$('[data-c]', app).forEach(b => b.onclick = () => location.hash = `#/read/${book}/${b.dataset.c}`);
}

// ---------------- Topical verses ----------------
async function topicList(app, key) {
  const t = tr();
  const td = await topicsData();
  if (!key) {
    const counts = {};
    for (const ts of Object.values(td.verses)) ts.forEach(x => counts[x] = (counts[x] || 0) + 1);
    app.innerHTML = `<header class="view-head">${back()}<h1>Verses by topic</h1>
      <p class="purpose">Find the promises of God for what you are facing. Every verse can be read aloud.</p></header>
      <div class="tiles">${td.topics.map(x => `<a class="tile" href="#/listen/topics/${x.k}" style="min-height:96px"><strong>${esc(x.n)}</strong><small>${counts[x.k] || 0} verses</small></a>`).join('')}</div>`;
    return;
  }
  const topic = td.topics.find(x => x.k === key);
  const refs = Object.entries(td.verses).filter(([, ts]) => ts.includes(key)).map(([r]) => r).sort(canonSort(await books()));
  app.innerHTML = `<header class="view-head">${back('#/listen/topics', 'Topics')}<h1>${esc(topic?.n || 'Verses')}</h1>
    <p class="purpose">${refs.length} verses, each read aloud. Tap Play all to hear them one after another.</p></header>
    <button class="btn btn-gold" id="playall">${icon('play')}Play all</button>
    <div id="vl" class="list"><div class="spinner"></div></div>`;
  const items = await Promise.all(refs.map(async r => ({ r, vs: await getPassage(r, t), a: await verseAudio(r, t) })));
  app.querySelector('#vl').innerHTML = items.map(({ r, vs, a }) => `
    <div class="card" style="margin-top:0"><p class="scripture ${vs.map(v => v.t).join(' ').length > 220 ? 'long' : ''}" style="font-size:calc(21px*var(--fs-scale))">${esc(vs.map(v => v.t).join(' '))}</p>
    <div class="top-row"><span class="ref">${esc(displayRef(r))}</span>${a ? playBtn(`v:${t}:${r}`, 'Play', 'btn-sm') : ''}</div></div>`).join('');
  app.querySelectorAll('[data-play]').forEach(b => {
    const r = b.dataset.play.slice(`v:${t}:`.length);
    const it = items.find(x => x.r === r);
    b.onclick = () => playTrack({ id: b.dataset.play, title: displayRef(r), subtitle: `${topic?.n} · ${t}`, parts: it.a });
  });
  app.querySelector('#playall').onclick = () => {
    const parts = items.filter(x => x.a).flatMap(x => x.a);
    playTrack({ id: `topic:${t}:${key}`, title: topic?.n || 'Verses', subtitle: `${parts.length} verses · ${t}`, parts });
  };
}
function canonSort(bs) {
  const order = Object.fromEntries(bs.map((b, i) => [b.n, i]));
  return (a, b) => { const pa = parseRef(a), pb = parseRef(b); return (order[pa.book] - order[pb.book]) || (pa.ch - pb.ch) || (pa.v1 - pb.v1); };
}

// ---------------- Whole Bible ----------------
async function bibleBooks(app, bookSlug) {
  const bs = await books();
  if (bookSlug) {
    const b = bs.find(x => x.s === bookSlug); if (!b) return bibleBooks(app);
    app.innerHTML = `<header class="view-head">${back('#/listen/bible', 'Books')}<h1>${esc(b.n)}</h1><p class="purpose">Choose a chapter to read.</p></header>
      <div class="numgrid">${Array.from({ length: b.c }, (_, i) => `<button data-c="${i + 1}">${i + 1}</button>`).join('')}</div>`;
    $$('[data-c]', app).forEach(x => x.onclick = () => location.hash = `#/read/${encodeURIComponent(b.n)}/${x.dataset.c}`);
    return;
  }
  const sec = (title, list) => `<h3 style="margin-top:24px">${title}</h3><div class="chips">${list.map(b => `<a class="chip" href="#/listen/bible/${b.s}">${esc(b.n)}</a>`).join('')}</div>`;
  app.innerHTML = `<header class="view-head">${back()}<h1>The whole Bible</h1><p class="purpose">Pick a book, then a chapter. Psalms and Proverbs can also be heard aloud.</p></header>
    ${sec('Old Testament', bs.filter(b => b.t === 'OT'))}${sec('New Testament', bs.filter(b => b.t === 'NT'))}`;
}

// ---------------- Plans ----------------
async function allChapters() {
  const bs = await books();
  return bs.flatMap(b => Array.from({ length: b.c }, (_, i) => ({ b: b.n, c: i + 1 })));
}
// Split all 1,189 chapters into `days` nearly equal days, in canonical order.
export async function planDays(days) {
  const ch = await allChapters();
  const out = [];
  for (let d = 0; d < days; d++) out.push(ch.slice(Math.round(d * ch.length / days), Math.round((d + 1) * ch.length / days)));
  return out;
}
function labelReading(list) {
  // "Genesis 1–3", "Genesis 50; Exodus 1–2"
  const groups = [];
  for (const x of list) {
    const g = groups[groups.length - 1];
    if (g && g.b === x.b && g.to === x.c - 1) g.to = x.c; else groups.push({ b: x.b, from: x.c, to: x.c });
  }
  return groups.map(g => `${g.b === 'Psalms' && g.from === g.to ? 'Psalm' : g.b} ${g.from}${g.to !== g.from ? '–' + g.to : ''}`).join('; ');
}
async function plansView(app, dayArg) {
  const plan = kvGet('plan');
  if (!plan) {
    app.innerHTML = `<header class="view-head">${back()}<h1>Read the Bible</h1>
      <p class="purpose">Pick a plan to read the whole Bible from Genesis to Revelation. Each day lists the chapters to read and you can check them off.</p></header>
      <div class="list">${PLANS.map(p => `<button class="row" data-plan="${p.k}"><span class="row-ic">${icon('calendar')}</span><span class="row-main"><span class="row-title">${p.n}</span><span class="row-text">${p.days} days · ${p.sub}</span></span><span class="chev">${icon('chevR')}</span></button>`).join('')}</div>`;
    $$('[data-plan]', app).forEach(b => b.onclick = () => { kvSet('plan', { k: b.dataset.plan, start: todayKey(), done: {} }); toast('Plan started. Day 1 is ready.'); plansView(app); });
    return;
  }
  const meta = PLANS.find(p => p.k === plan.k);
  const days = await planDays(meta.days);
  const total = days.reduce((a, d) => a + d.length, 0);
  const keyOf = x => `${x.b}|${x.c}`;
  const doneCount = days.flat().filter(x => plan.done[keyOf(x)]).length;
  const todayN = Math.min(meta.days, Math.max(1, daysBetween(plan.start, todayKey()) + 1));
  const firstOpen = days.findIndex(d => d.some(x => !plan.done[keyOf(x)])) + 1 || meta.days;
  const behind = Math.max(0, todayN - firstOpen);
  const n = Math.min(meta.days, Math.max(1, +dayArg || todayN));
  const day = days[n - 1];
  const pct = Math.round(doneCount / total * 100);
  app.innerHTML = `<header class="view-head">${back()}<h1>${esc(meta.n)}</h1>
      <p class="purpose">Read the chapters for each day and check them off. Tap a chapter to open it.</p></header>
    <div class="card">
      <div class="top-row"><strong>${pct}% complete</strong><span class="muted">${doneCount} of ${total} chapters</span></div>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <p class="hint">Today is day ${todayN} of ${meta.days}.</p>
      ${behind > 0 ? `<div class="notice notice-gold" style="margin-top:12px">${icon('info')}<span>You are ${behind} day${behind === 1 ? '' : 's'} behind. That is all right. Pick up where you left off, or move your plan so today starts at day ${firstOpen}.</span></div>
        <div class="btn-row" style="margin-top:12px"><a class="btn btn-ghost btn-sm" href="#/listen/plans/${firstOpen}">Go to day ${firstOpen}</a><button class="btn btn-outline btn-sm" id="catchup">Catch me up</button></div>` : ''}
    </div>
    <div class="card card-gold" data-testid="plan-day">
      <div class="top-row"><button class="icon-btn" id="prev" aria-label="Previous day" ${n <= 1 ? 'disabled' : ''}>${icon('chevL')}</button>
        <div style="text-align:center"><div class="card-label" style="justify-content:center">Day ${n}${n === todayN ? ' · Today' : ''}</div><div class="hint" style="margin:2px 0 0">${esc(labelReading(day))}</div></div>
        <button class="icon-btn" id="next" aria-label="Next day" ${n >= meta.days ? 'disabled' : ''}>${icon('chevR')}</button></div>
      <div style="margin-top:12px">${day.map(x => `<div class="reading ${plan.done[keyOf(x)] ? 'done' : ''}">
        <button class="check ${plan.done[keyOf(x)] ? 'on' : ''}" data-k="${esc(keyOf(x))}" aria-label="Mark ${esc(x.b)} ${x.c} read">${icon('check')}</button>
        <button class="open" data-read="${esc(x.b)}/${x.c}"><span>${esc(x.b === 'Psalms' ? 'Psalm' : x.b)} ${x.c}</span>${icon('chevR')}</button></div>`).join('')}</div>
    </div>
    <button class="link-btn" id="stop" style="margin-top:20px">Stop or change plan</button>`;
  $$('[data-k]', app).forEach(b => b.onclick = () => { const p = kvGet('plan'); p.done[b.dataset.k] = !p.done[b.dataset.k]; if (!p.done[b.dataset.k]) delete p.done[b.dataset.k]; kvSet('plan', p); plansView(app, n); });
  $$('[data-read]', app).forEach(b => b.onclick = () => { kvSet('readerFrom', `#/listen/plans/${n}`); location.hash = `#/read/${b.dataset.read.split('/').map(encodeURIComponent).join('/')}`; });
  app.querySelector('#prev').onclick = () => location.hash = `#/listen/plans/${n - 1}`;
  app.querySelector('#next').onclick = () => location.hash = `#/listen/plans/${n + 1}`;
  app.querySelector('#catchup')?.addEventListener('click', () => {
    const p = kvGet('plan'); const d = new Date(); d.setDate(d.getDate() - (firstOpen - 1)); p.start = todayKey(d); kvSet('plan', p);
    toast(`Your plan now continues at day ${firstOpen} today.`); location.hash = '#/listen/plans';
  });
  app.querySelector('#stop').onclick = () => {
    const s = openSheet(`<h2 class="sheet-title">Change plan</h2><p class="lead">Stopping clears your checkmarks for this plan.</p>
      <div class="btn-row"><button class="btn btn-ghost" data-close>Keep reading</button><button class="btn btn-danger" id="yes">Stop plan</button></div>`);
    s.el.querySelector('#yes').onclick = () => { kvSet('plan', null); s.close(); plansView(app); };
  };
}

// ---------------- Reader ----------------
export async function renderReader(app, parts) {
  const bs = await books();
  let [bookName, chS] = parts;
  const b = bs.find(x => x.n === bookName || x.s === bookName) || bs.find(x => x.n === 'Psalms');
  const ch = Math.min(b.c, Math.max(1, +chS || 1));
  const t = tr();
  const scale = kvGet('readerScale', 1);
  const [vs, aud] = await Promise.all([getChapter(b.n, ch, t), chapterAudio(b.n, ch, t)]);
  const title = `${b.n === 'Psalms' ? 'Psalm' : b.n} ${ch}`;
  const bi = bs.indexOf(b);
  const prev = ch > 1 ? [b.n, ch - 1] : bi > 0 ? [bs[bi - 1].n, bs[bi - 1].c] : null;
  const next = ch < b.c ? [b.n, ch + 1] : bi < bs.length - 1 ? [bs[bi + 1].n, 1] : null;
  const from = kvGet('readerFrom') || (b.n === 'Psalms' ? '#/listen/psalms' : b.n === 'Proverbs' ? '#/listen/proverbs' : `#/listen/bible/${b.s}`);
  const plan = kvGet('plan');
  const pk = `${b.n}|${ch}`;
  const id = `c:${t}:${b.n}:${ch}`;
  app.innerHTML = `
    <header class="view-head">
      <a class="link-btn" href="${esc(from)}">${icon('chevL')} Back</a>
      <p class="eyebrow">${esc(TR_NAMES[t])}</p>
      <h1 data-testid="reader-title">${esc(title)}</h1>
      <div class="reader-tools">
        ${aud ? playBtn(id, aud.length > 1 ? `Listen (${aud.length} parts)` : 'Listen') : `<div class="notice" style="flex:1">${icon('volume')}Audio for this book is coming.</div>`}
        <div class="seg" style="flex:none" aria-label="Text size"><button id="smaller" aria-label="Smaller text">A−</button><button id="bigger" aria-label="Larger text">A+</button></div>
      </div>
    </header>
    <div class="reader-text" style="--reader-scale:${scale}" data-testid="reader-text">${vs.map(v => `<p><sup>${v.v}</sup>${esc(v.t)}</p>`).join('')}</div>
    ${plan ? `<button class="btn ${plan.done[pk] ? 'btn-ghost' : 'btn-outline'} btn-block" id="markread" style="margin-top:18px">${icon('check')}${plan.done[pk] ? 'Marked as read' : 'Mark as read in my plan'}</button>` : ''}
    <div class="reader-nav">
      ${prev ? `<a class="btn btn-ghost" href="#/read/${encodeURIComponent(prev[0])}/${prev[1]}">${icon('chevL')}${esc(prev[0] === 'Psalms' ? 'Psalm' : prev[0])} ${prev[1]}</a>` : '<span></span>'}
      ${next ? `<a class="btn btn-ghost" href="#/read/${encodeURIComponent(next[0])}/${next[1]}">${esc(next[0] === 'Psalms' ? 'Psalm' : next[0])} ${next[1]}${icon('chevR')}</a>` : '<span></span>'}
    </div>
    <p class="hint" style="text-align:center;margin-top:20px">${t === 'BSB' ? 'Berean Standard Bible. Public domain.' : 'King James Version. Public domain.'}</p>`;
  const pb = app.querySelector('[data-play]');
  if (pb) { pb.dataset.label = aud.length > 1 ? `Listen (${aud.length} parts)` : 'Listen'; pb.onclick = () => playTrack({ id, title, subtitle: `Read by Robert Clinton, MD · ${t}`, parts: aud }); }
  const setScale = d => { const s = Math.min(1.6, Math.max(0.8, +(kvGet('readerScale', 1) + d).toFixed(2))); kvSet('readerScale', s); app.querySelector('.reader-text').style.setProperty('--reader-scale', s); };
  app.querySelector('#smaller').onclick = () => setScale(-0.1);
  app.querySelector('#bigger').onclick = () => setScale(0.1);
  app.querySelector('#markread')?.addEventListener('click', () => { const p = kvGet('plan'); if (p.done[pk]) delete p.done[pk]; else p.done[pk] = true; kvSet('plan', p); renderReader(app, parts); });
  // reader from-link should not stick forever
  if (!(kvGet('readerFrom') || '').startsWith('#/listen/plans')) kvSet('readerFrom', null);
}

// ---------------- Becoming a Christian ----------------
async function believe(app) {
  const t = tr();
  const items = await Promise.all(BELIEVE_STEPS.map(async s => {
    const ref = (await resolveRecordedRef(s.ref, t)) || s.ref;
    return { ...s, ref, vs: await getPassage(ref, t), a: await verseAudio(ref, t) };
  }));
  app.innerHTML = `<header class="view-head">${back()}<p class="eyebrow">Good news</p><h1>Becoming a Christian</h1>
    <p class="purpose">Six short steps from the Bible about how you can know Jesus and be forgiven.</p></header>
    ${items.map((s, i) => `<article class="card"><div style="display:flex;gap:14px;align-items:center"><span class="step-n">${i + 1}</span><h3>${esc(s.t)}</h3></div>
      <p class="scripture" style="font-size:calc(22px*var(--fs-scale));margin-top:14px">${esc(s.vs.map(v => v.t).join(' '))}</p>
      <div class="top-row"><span class="ref">${esc(displayRef(s.ref))}</span>${s.a ? playBtn(`v:${t}:${s.ref}`, 'Play', 'btn-sm') : ''}</div>
      <p class="lead" style="margin-top:12px">${esc(s.note)}</p></article>`).join('')}
    <article class="card card-gold"><div class="card-label">${icon('pray')}A prayer you can pray</div>
      <p class="card-purpose">There are no magic words. If this is what your heart wants to say, tell God.</p>
      <p class="prayer-text">${esc(SALVATION_PRAYER)}</p></article>
    <div class="card"><h3>If you prayed this</h3><p class="lead">Welcome to the family of God. Tell a Christian friend or a pastor, find a church that teaches the Bible, and start reading the Gospel of John.</p>
      <div class="card-actions"><a class="btn btn-gold" href="#/read/John/1">Start reading John</a></div></div>`;
  app.querySelectorAll('[data-play]').forEach(b => {
    const ref = b.dataset.play.slice(`v:${t}:`.length);
    const it = items.find(x => x.ref === ref);
    b.onclick = () => playTrack({ id: b.dataset.play, title: displayRef(ref), subtitle: `Becoming a Christian · ${t}`, parts: it.a });
  });
}
