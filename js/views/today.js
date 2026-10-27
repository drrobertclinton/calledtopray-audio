// Today: verse, proverb and psalm of the day, a prayer prompt and "Pray now".
import { esc, icon, fmtLongDate, greeting, todayKey, dayOfYear, hashStr, seededShuffle } from '../util.js';
import { state, tr, kvGet, kvSet, pushProfile } from '../store.js';
import { topicsData, keyVerses, getPassage, getChapter, verseAudio, chapterAudio, displayRef, TR_NAMES } from '../bible.js';
import { playBtn, playTrack } from '../audio.js';
import { topicsForProfile, prayerPrompt, verseFitsProfile } from '../content.js';
import { installBanner, wireInstallBanner } from '../install.js';
import { openSpeakMode } from './pray.js';

// Pick today's verse once per day: verses tied to the person's callings and situations
// come first; nothing repeats until every key verse has been shown once.
export async function verseOfTheDay() {
  const today = todayKey();
  const saved = kvGet('vod');
  const all = (await keyVerses('BSB')).filter(r => verseFitsProfile(r, state.profile));
  if (saved && saved.date === today && all.includes(saved.ref)) return saved.ref;
  const td = await topicsData();
  const want = new Set(topicsForProfile(state.profile));
  let seen = new Set(kvGet('verseSeen', []).filter(r => all.includes(r)));
  if (seen.size >= all.length) seen = new Set();
  const seed = hashStr((state.user?.uid || 'guest') + today);
  const unseen = all.filter(r => !seen.has(r));
  const matching = unseen.filter(r => (td.verses[r] || []).some(t => want.has(t)));
  const pool = matching.length ? matching : unseen;
  const ref = seededShuffle(pool, seed)[0];
  seen.add(ref);
  kvSet('verseSeen', Array.from(seen));
  kvSet('vod', { date: today, ref });
  pushProfile();
  return ref;
}
export const proverbOfTheDay = (d = new Date()) => d.getDate();               // 1–31
export const psalmOfTheDay = (d = new Date()) => ((dayOfYear(d) - 1) % 150) + 1; // 1–150

export async function renderToday(app) {
  const p = state.profile, t = tr();
  const now = new Date();
  const name = p.name ? p.name.split(' ')[0] : '';
  const streak = p.streakCurrent || 0;
  app.innerHTML = `
    <header class="view-head">
      <div class="top-row"><p class="eyebrow">${esc(fmtLongDate(now))}</p>${streak > 1 ? `<span class="streak" title="Days in a row">${icon('flame')}${streak} days</span>` : ''}</div>
      <h1>${esc(greeting())}${name ? ', ' + esc(name) : ''}</h1>
      <p class="purpose">Today gives you a verse, a Proverb and a Psalm to read or hear, and a place to pray.</p>
    </header>

    ${installBanner()}
    <button class="pray-now" id="pray-now">
      <span class="mic-orb">${icon('mic')}</span>
      <span><strong>Pray now</strong><span>Tap and speak your prayer. We will keep it and sort it for you.</span></span>
    </button>

    <article class="card card-gold" id="vod">
      <div class="card-label">${icon('sun')}Verse of the Day</div>
      <p class="card-purpose">A promise from Scripture chosen for your work and what you are carrying.</p>
      <div class="skeleton"></div><div class="skeleton" style="width:70%"></div>
    </article>

    <article class="card" id="prompt">
      <div class="card-label">${icon('pray')}A prayer for today</div>
      <p class="card-purpose">A few words to help you begin praying for your calling.</p>
    </article>

    <article class="card" id="prov">
      <div class="card-label">${icon('leaf')}Proverb of the Day</div>
      <p class="card-purpose">One chapter of Proverbs for each day of the month. Today is chapter ${proverbOfTheDay(now)}.</p>
      <div class="skeleton"></div>
    </article>

    <article class="card" id="psalm">
      <div class="card-label">${icon('book')}Psalm of the Day</div>
      <p class="card-purpose">Read through all 150 Psalms, one each day.</p>
      <div class="skeleton"></div>
    </article>
    <p class="hint" style="text-align:center;margin-top:22px">Reading from the ${esc(TR_NAMES[t])}. Change this in Me.</p>
    <button class="btn btn-outline btn-block" id="feedback" style="margin-top:14px">${icon('note')}Send feedback</button>
  `;
  app.querySelector('#pray-now').onclick = () => openSpeakMode();
  wireInstallBanner(app);
  app.querySelector('#feedback').onclick = () => import('../feedback.js').then(m => m.openFeedback());

  // Prayer prompt
  const pr = prayerPrompt(p, dayOfYear(now));
  app.querySelector('#prompt').insertAdjacentHTML('beforeend', `
    ${pr.calling ? `<p class="hint" style="margin:0 0 6px">For your work as ${esc(/^[aeiou]/i.test(pr.calling) ? 'an' : 'a')} ${esc(pr.calling.toLowerCase().replace(/^retired$/, 'retiree'))}</p>` : ''}
    <p class="prayer-text">${esc(pr.text)}</p>
    <div class="card-actions"><button class="btn btn-outline btn-sm" id="pray-this">${icon('mic')}Pray in my own words</button></div>`);
  app.querySelector('#pray-this').onclick = () => openSpeakMode();

  // Verse of the Day
  const ref = await verseOfTheDay();
  const [vs, vAudio] = await Promise.all([getPassage(ref, t), verseAudio(ref, t)]);
  const text = vs.map(x => x.t).join(' ');
  const vid = `v:${t}:${ref}`;
  const vod = app.querySelector('#vod');
  if (!vod) return;
  vod.querySelector('.skeleton') && vod.querySelectorAll('.skeleton').forEach(s => s.remove());
  vod.insertAdjacentHTML('beforeend', `
    <p class="scripture ${text.length > 260 ? 'long' : ''}" data-testid="vod-text">${esc(text)}</p>
    <div class="ref" data-testid="vod-ref">${esc(displayRef(ref))}</div>
    <div class="card-actions">${vAudio ? playBtn(vid, 'Listen') : ''}
      <button class="btn btn-ghost btn-sm" id="vod-pray">${icon('pray')}Pray this verse</button></div>`);
  vod.querySelector('[data-play]')?.setAttribute('data-label', 'Listen');
  vod.querySelector('[data-play]')?.addEventListener('click', () => playTrack({ id: vid, title: displayRef(ref), subtitle: `Verse of the Day · ${t}`, parts: vAudio }));
  vod.querySelector('#vod-pray').onclick = () => openSpeakMode({ intro: `“${text}” (${displayRef(ref)})` });

  // Proverb + Psalm
  await Promise.all([
    fillChapter(app.querySelector('#prov'), 'Proverbs', proverbOfTheDay(now), t, 'Proverb of the Day'),
    fillChapter(app.querySelector('#psalm'), 'Psalms', psalmOfTheDay(now), t, 'Psalm of the Day'),
  ]);
}

async function fillChapter(el, book, ch, t, label) {
  if (!el) return;
  const [vs, parts] = await Promise.all([getChapter(book, ch, t), chapterAudio(book, ch, t)]);
  const title = `${book === 'Psalms' ? 'Psalm' : 'Proverbs'} ${ch}`;
  const id = `c:${t}:${book}:${ch}`;
  el.querySelectorAll('.skeleton').forEach(s => s.remove());
  el.insertAdjacentHTML('beforeend', `
    <h3 style="margin-top:2px">${esc(title)}</h3>
    <p class="excerpt" data-testid="${book === 'Psalms' ? 'psalm' : 'prov'}-text">${vs.slice(0, 3).map(v => esc(v.t)).join(' ')}</p>
    <div class="card-actions">${parts ? playBtn(id, 'Listen') : ''}
      <a class="btn btn-ghost btn-sm" href="#/read/${encodeURIComponent(book)}/${ch}">Read all ${vs.length} verses</a></div>`);
  el.querySelector('[data-play]')?.setAttribute('data-label', 'Listen');
  el.querySelector('[data-play]')?.addEventListener('click', () => playTrack({ id, title, subtitle: `${label} · ${t}`, parts }));
}
