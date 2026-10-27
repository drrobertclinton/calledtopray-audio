// "Add to Home Screen" help. Shows steps that match the person's phone and browser.
import { esc, icon, toast, openSheet } from './util.js';

let deferred = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; document.dispatchEvent(new Event('ctp-installable')); });
window.addEventListener('appinstalled', () => { deferred = null; toast('Called to Pray is on your home screen.'); });

export const isInstalled = () => !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone);

function env() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|GSA\/|Snapchat|TikTok|LinkedInApp|Twitter|wv\)/.test(ua);
  let browser = 'other';
  if (ios) browser = /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : 'safari';
  else if (android) browser = /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox/.test(ua) ? 'firefox' : /EdgA/.test(ua) ? 'edge' : 'chrome';
  return { ios, android, inApp, browser };
}

function steps() {
  const e = env();
  const link = location.origin + location.pathname;
  if (e.inApp) return {
    title: 'First, open this in your phone’s browser',
    body: `You opened the link inside another app, which can’t add it to your home screen.`,
    list: e.ios
      ? ['Tap the <strong>•••</strong> or <strong>Share</strong> button in the corner of this screen.', 'Choose <strong>Open in Safari</strong> (or Open in browser).', 'Then tap <strong>Add to Home Screen</strong> in the app again for the last steps.']
      : ['Tap the <strong>⋮</strong> button in the corner of this screen.', 'Choose <strong>Open in Chrome</strong> (or Open in browser).', 'Then tap <strong>Add to Home Screen</strong> in the app again for the last steps.'],
    copy: link,
  };
  if (e.ios && e.browser === 'safari') return {
    title: 'Add Called to Pray to your iPhone',
    list: ['Tap the <strong>Share</strong> button ' + icon('share') + ' at the bottom of Safari. If you don’t see the bottom bar, tap the address at the bottom or scroll up a little and it appears. On iPad it is at the top right.',
      'Scroll down the list and tap <strong>Add to Home Screen</strong> ' + icon('plus') + '. If it isn’t there, tap <strong>Edit Actions</strong> at the very bottom and add it.',
      'Tap <strong>Add</strong> in the top right corner.',
      'Open Called to Pray from your home screen from now on.'],
  };
  if (e.ios) return {
    title: 'Add Called to Pray to your iPhone',
    list: ['Tap the <strong>Share</strong> button ' + icon('share') + ' next to the address bar (at the top in Chrome).',
      'Tap <strong>Add to Home Screen</strong>. If you don’t see it, tap <strong>More</strong> first.',
      'Tap <strong>Add</strong>.',
      'If none of this appears, open the link in <strong>Safari</strong> instead. It works best there.'],
    copy: link,
  };
  if (e.android && e.browser === 'samsung') return {
    title: 'Add Called to Pray to your phone',
    list: ['Tap the <strong>≡</strong> menu at the bottom right.', 'Tap <strong>Add page to</strong>, then <strong>Home screen</strong>.', 'Tap <strong>Add</strong>.'],
  };
  if (e.android) return {
    title: 'Add Called to Pray to your phone',
    list: ['Tap the <strong>⋮</strong> menu at the top right of Chrome.', 'Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.', 'Tap <strong>Install</strong> (or Add).'],
  };
  return {
    title: 'Put Called to Pray on your phone',
    list: ['Open this link on your phone:', `<strong>${esc(link)}</strong>`, 'iPhone: open it in Safari, tap Share, then Add to Home Screen. Android: open it in Chrome, tap ⋮, then Add to Home screen.'],
    copy: link,
  };
}

export function openInstallHelp() {
  const s = steps();
  const sheet = openSheet(`
    <h2 class="sheet-title">${esc(s.title)}</h2>
    ${s.body ? `<p class="lead">${s.body}</p>` : `<p class="lead">It will sit on your home screen with its own icon and open like any other app.</p>`}
    ${deferred ? `<button class="btn btn-gold btn-block" id="inst-now" style="margin-top:16px">${icon('plus')}Install now</button><p class="hint" style="text-align:center">Or do it yourself:</p>` : ''}
    <ol class="install-steps">${s.list.map(x => `<li>${x}</li>`).join('')}</ol>
    ${s.copy ? `<button class="btn btn-ghost btn-block" id="inst-copy">Copy the link</button>` : ''}
  `, { label: 'Add to Home Screen' });
  sheet.el.querySelector('#inst-now')?.addEventListener('click', async () => {
    const d = deferred; if (!d) return; d.prompt();
    try { const r = await d.userChoice; if (r.outcome === 'accepted') sheet.close(); } catch {}
    deferred = null;
  });
  sheet.el.querySelector('#inst-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(s.copy); toast('Link copied. Paste it into Safari or Chrome.'); } catch { toast(s.copy, 5000); }
  });
}

export function installBanner() {
  if (isInstalled()) return '';
  try { if (localStorage.getItem('ctp:installHide') === new Date().toDateString()) return ''; } catch {}
  return `<button class="install-banner" id="install-banner">${icon('home')}<span><strong>Add to your home screen</strong><span>Keep Called to Pray on your phone like any other app. Tap for steps.</span></span></button>`;
}
export function wireInstallBanner(root) {
  root.querySelector('#install-banner')?.addEventListener('click', openInstallHelp);
}
