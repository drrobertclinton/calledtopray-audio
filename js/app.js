// Called to Pray — app shell, router and boot.
import { $, icon, toast, closeAllSheets } from './util.js';
import { state, initAuth, onChange, syncPending, markActive } from './store.js';
import { mountPlayer } from './audio.js';
import { renderToday } from './views/today.js';
import { renderPray } from './views/pray.js';
import { renderGroups, handleJoinLink } from './views/groups.js';
import { renderListen, renderReader } from './views/listen.js';
import { renderMe } from './views/me.js';
import { renderOnboarding } from './views/onboarding.js';

const TABS = [
  { k: 'today', n: 'Today', icon: 'sun' },
  { k: 'pray', n: 'Pray', icon: 'pray' },
  { k: 'groups', n: 'Groups', icon: 'users' },
  { k: 'listen', n: 'Listen & Read', icon: 'book' },
  { k: 'me', n: 'Me', icon: 'user' },
];
const lastRoute = {};

function mountTabbar() {
  const bar = $('#tabbar');
  bar.innerHTML = `<nav class="tabs" aria-label="Main">${TABS.map(t => `<button data-tab="${t.k}" aria-label="${t.n}">${icon(t.icon)}<span>${t.n === 'Listen & Read' ? 'Listen' : t.n}</span></button>`).join('')}</nav>`;
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    const k = b.dataset.tab;
    const cur = currentTab();
    // Tapping the active tab returns to its top; otherwise restore where they were.
    go(k === cur ? '#/' + k : (lastRoute[k] || '#/' + k));
  });
}
function currentTab() {
  const p = location.hash.replace(/^#\/?/, '').split('/')[0] || 'today';
  return p === 'read' ? 'listen' : p;
}
export function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
window.ctpGo = go;

let renderSeq = 0;
export async function route() {
  const app = $('#app');
  const seq = ++renderSeq;
  if (needsOnboarding()) {
    $('#tabbar').hidden = true;
    document.body.classList.add('onboarding');
    await renderOnboarding(app, () => { document.body.classList.remove('onboarding'); go('#/today'); });
    return;
  }
  $('#tabbar').hidden = false;
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const tab = parts[0] || 'today';
  const t = tab === 'read' ? 'listen' : tab;
  lastRoute[t] = location.hash || '#/today';
  document.querySelectorAll('#tabbar [data-tab]').forEach(b => {
    const on = b.dataset.tab === t;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  closeAllSheets();
  const keepScroll = app.dataset.route === location.hash;
  app.dataset.route = location.hash;
  try {
    if (tab === 'today' || !tab) await renderToday(app, parts.slice(1));
    else if (tab === 'pray') await renderPray(app, parts.slice(1));
    else if (tab === 'groups') await renderGroups(app, parts.slice(1));
    else if (tab === 'listen') await renderListen(app, parts.slice(1));
    else if (tab === 'read') await renderReader(app, parts.slice(1));
    else if (tab === 'me') await renderMe(app, parts.slice(1));
    else return go('#/today');
  } catch (e) {
    console.error(e);
    if (seq === renderSeq) app.innerHTML = `<div class="view-head"><h1>Something went wrong</h1><p class="lead">Please check your connection and try again.</p><button class="btn btn-gold" onclick="location.reload()" style="margin-top:18px">Try again</button></div>`;
  }
  if (!keepScroll && seq === renderSeq) window.scrollTo(0, 0);
}
function needsOnboarding() {
  return !state.profile.onboarded;
}

async function boot() {
  mountTabbar();
  mountPlayer();
  window.addEventListener('hashchange', route);
  // Show the app right away from local data; account data refreshes it when ready.
  const params = new URLSearchParams(location.search);
  const joinCode = params.get('join');
  if (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#/today');
  await route();
  initAuth().then(u => {
    if (u) { syncPending(); if (state.profile.onboarded) route(); }
  });
  onChange(what => {
    if (what === 'auth') route();
  });
  if (joinCode) {
    history.replaceState(null, '', location.pathname + location.hash);
    setTimeout(() => handleJoinLink(joinCode.toUpperCase()), 400);
  }
  if (state.profile.onboarded) markActive();
  window.addEventListener('online', () => { syncPending(); toast('Back online. Syncing your entries.'); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
boot();
