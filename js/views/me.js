// Me: profile, callings, translation, reminders, text size, account and About.
import { $$, esc, icon, toast, openSheet, confirmSheet } from '../util.js';
import { state, saveProfile, signUp, signIn, signInGoogle, resetPassword, signOutUser, authErrorMessage, setMode, pendingCount, syncPending, kvGet, kvSet } from '../store.js';
import { TR_NAMES } from '../bible.js';
import { wireDictation, stopListening } from '../speech.js';
import { callingsEditor } from './onboarding.js';
import { setupPasscode } from './pray.js';

export async function renderMe(app) {
  const p = state.profile;
  const pend = pendingCount();
  const sizes = [[0.9, 'Smaller'], [1, 'Normal'], [1.15, 'Large'], [1.3, 'Largest']];
  app.innerHTML = `
    <header class="view-head">
      <p class="eyebrow">Settings</p>
      <h1>Me</h1>
      <p class="purpose">Your name, your callings and how the app reads to you.</p>
    </header>

    <section class="card">
      <div class="card-label">${icon('user')}Account</div>
      ${state.user ? `<p class="lead" style="margin-top:8px">Signed in as <strong>${esc(state.user.email || state.user.displayName || '')}</strong>. Your prayers are kept with your account.</p>
        ${pend ? `<p class="hint">${pend} entr${pend === 1 ? 'y is' : 'ies are'} saved on this device and will sync when possible. <button class="link-btn" id="sync" style="padding:0;min-height:0">Sync now</button></p>` : ''}`
      : `<p class="lead" style="margin-top:8px">You are using the app without an account. Your prayers are saved only on this phone.</p>
        <p class="hint">Create a free account to keep your prayers safe if you change phones, and to pray with a group.</p>
        <div class="btn-row"><button class="btn btn-gold" id="signup">Create account</button><button class="btn btn-ghost" id="signin">Sign in</button></div>`}
    </section>

    <section class="card">
      <div class="card-label">${icon('note')}Help us test</div>
      <p class="card-purpose">Found a problem or have an idea? We read every note.</p>
      <button class="btn btn-gold btn-block" id="feedback">${icon('note')}Send feedback</button>
    </section>

    <section class="card">
      <div class="card-label">${icon('edit')}Your name</div>
      <p class="card-purpose">Used to greet you and shown to your groups.</p>
      <input type="text" id="name" data-dictate value="${esc(p.name)}" placeholder="Your first name" autocomplete="given-name">
    </section>

    <section class="card">
      <div class="card-label">${icon('star')}Your callings and life</div>
      <p class="card-purpose">We use these to choose your Verse of the Day and prayer prompts.</p>
      <div class="chips">${[...p.callings, ...p.family, ...p.carrying].map(c => `<span class="chip chip-sm on">${esc(c)}</span>`).join('') || '<span class="muted">None chosen yet</span>'}</div>
      <button class="btn btn-outline btn-block" id="callings" style="margin-top:14px">${icon('edit')}Change</button>
    </section>

    <section class="card">
      <div class="card-label">${icon('book')}Bible translation</div>
      <p class="card-purpose">All reading and listening follows this choice.</p>
      ${trChoice('BSB', p.translation)}${trChoice('KJV', p.translation)}
    </section>

    <section class="card">
      <div class="card-label">${icon('textsize')}Text size</div>
      <p class="card-purpose">Make the words in the whole app bigger or smaller.</p>
      <div class="seg">${sizes.map(([v, n]) => `<button data-size="${v}" class="${Math.abs((p.textSize || 1) - v) < 0.01 ? 'on' : ''}">${n}</button>`).join('')}</div>
    </section>

    <section class="card">
      <div class="card-label">${icon('bell')}Daily reminder</div>
      <p class="card-purpose">The time you would like to be reminded to pray.</p>
      <input type="time" id="rem" value="${esc(p.reminderTime || '07:30')}" aria-label="Reminder time">
      <p class="hint">Reminders work in the Called to Pray app from the App Store and Google Play. Here we save your time so it is ready.</p>
    </section>

    <section class="card">
      <div class="card-label">${icon('lock')}Private prayers</div>
      <p class="card-purpose">The passcode that opens your private entries.</p>
      <button class="btn btn-ghost btn-block" id="pin">${kvGet('pin') ? 'Change passcode' : 'Set a passcode'}</button>
    </section>

    ${p.streakBest ? `<section class="card"><div class="card-label">${icon('flame')}Your prayer days</div>
      <p class="lead">Current: <strong>${p.streakCurrent || 0}</strong> day${p.streakCurrent === 1 ? '' : 's'} in a row · Best: <strong>${p.streakBest}</strong></p></section>` : ''}

    <section class="card about">
      <div class="card-label">${icon('info')}About Called to Pray</div>
      <p>Called to Pray helps families, small groups, churches and ministries organize their prayers. Share prayer requests with your group, record the answers when they come, and keep a history you can look back on. Anything you want kept private stays behind your passcode.</p>
      <p>Read Scripture or have it read aloud.</p>
      <p>Scripture read by Robert Clinton, MD.</p>
      <p>The Holy Bible, Berean Standard Bible (BSB). The BSB text has been dedicated to the public domain. Free resources and databases are available at BereanBible.com.</p>
      <p>The King James Version (KJV) is in the public domain.</p>
      <p class="hint">Version 1.0</p>
    </section>

    ${state.user ? `<button class="btn btn-ghost btn-block" id="signout" style="margin-top:22px">${icon('signout')}Sign out</button>`
      : `<button class="btn btn-ghost btn-block" id="reset" style="margin-top:22px">Start over on this device</button>`}
  `;
  wireDictation(app);
  app.querySelector('#feedback').onclick = () => import('../feedback.js').then(m => m.openFeedback());
  const name = app.querySelector('#name');
  let nt; name.addEventListener('input', () => { clearTimeout(nt); nt = setTimeout(() => saveProfile({ name: name.value.trim() }), 500); });
  name.addEventListener('change', () => saveProfile({ name: name.value.trim() }));
  $$('[data-tr]', app).forEach(b => b.onclick = () => { saveProfile({ translation: b.dataset.tr }); toast(`Now reading the ${TR_NAMES[b.dataset.tr]}`); renderMe(app); });
  $$('[data-size]', app).forEach(b => b.onclick = () => { saveProfile({ textSize: +b.dataset.size }); renderMe(app); });
  app.querySelector('#rem').addEventListener('change', e => { saveProfile({ reminderTime: e.target.value }); toast('Reminder time saved'); });
  app.querySelector('#callings').onclick = () => {
    const s = openSheet('<div id="ce"></div>', { full: true, label: 'Your callings' });
    callingsEditor(s.el.querySelector('#ce'), { onDone: () => { s.close(); renderMe(app); }, doneLabel: 'Save' });
  };
  app.querySelector('#pin').onclick = () => setupPasscode(() => { toast('Passcode saved'); renderMe(app); });
  app.querySelector('#signup')?.addEventListener('click', () => openAuthSheet('signup'));
  app.querySelector('#signin')?.addEventListener('click', () => openAuthSheet('signin'));
  app.querySelector('#sync')?.addEventListener('click', async () => { await syncPending(); renderMe(app); toast(pendingCount() ? 'Some entries are still saved on this device.' : 'All synced'); });
  app.querySelector('#signout')?.addEventListener('click', async () => {
    if (!await confirmSheet('Sign out?', 'Your prayers stay safe in your account. Sign in again any time.', 'Sign out')) return;
    await signOutUser(); location.hash = '#/today'; window.ctpGo('#/today');
  });
  app.querySelector('#reset')?.addEventListener('click', async () => {
    if (!await confirmSheet('Start over?', 'This erases the prayers and settings saved on this phone.', 'Erase and start over', true)) return;
    try { Object.keys(localStorage).filter(k => k.startsWith('ctp:guest:') || k === 'ctp:mode').forEach(k => localStorage.removeItem(k)); } catch {}
    location.reload();
  });
}
function trChoice(k, cur) {
  const d = { BSB: 'Modern and easy to read.', KJV: 'The classic 1611 wording.' };
  return `<button class="choice ${cur === k ? 'on' : ''}" data-tr="${k}"><span class="radio"></span><span><strong>${TR_NAMES[k]} (${k})</strong><small>${d[k]}</small></span></button>`;
}

// ---------------- sign in / sign up ----------------
export function openAuthSheet(mode = 'signin', { onDone } = {}) {
  const s = openSheet('', { label: 'Account' });
  const draw = () => {
    const isUp = mode === 'signup', isReset = mode === 'reset';
    s.set(`
      <h2 class="sheet-title">${isReset ? 'Reset your password' : isUp ? 'Create your account' : 'Welcome back'}</h2>
      <p class="lead">${isReset ? 'We will email you a link to choose a new password.' : isUp ? 'Free. Keeps your prayers safe and lets you pray with a group.' : 'Sign in to see your prayers on this phone.'}</p>
      ${isReset ? '' : `<button class="btn btn-ghost btn-block" id="google" style="margin-top:18px;background:#fff;color:#1F1F1F;border-color:#fff">${icon('google')}Continue with Google</button>
        <p class="hint" style="text-align:center;margin:14px 0 0">or use your email</p>`}
      ${isUp ? `<label class="field"><span>First name</span><input type="text" id="a-name" autocomplete="given-name" value="${esc(state.profile.name || '')}"></label>` : ''}
      <label class="field"><span>Email</span><input type="email" id="a-email" autocomplete="email" inputmode="email" autocapitalize="off"></label>
      ${isReset ? '' : `<label class="field"><span>Password</span><input type="password" id="a-pw" autocomplete="${isUp ? 'new-password' : 'current-password'}" placeholder="${isUp ? 'At least 6 characters' : ''}"></label>`}
      <p class="hint" id="a-msg" role="alert" style="color:var(--danger);min-height:1.4em"></p>
      <button class="btn btn-gold btn-block" id="a-go">${isReset ? 'Send reset link' : isUp ? 'Create account' : 'Sign in'}</button>
      <div style="text-align:center;margin-top:14px">
        ${mode === 'signin' ? `<button class="link-btn" data-m="reset">Forgot password?</button><br><button class="link-btn" data-m="signup">New here? Create an account</button>` : ''}
        ${mode === 'signup' ? `<button class="link-btn" data-m="signin">Already have an account? Sign in</button>` : ''}
        ${mode === 'reset' ? `<button class="link-btn" data-m="signin">Back to sign in</button>` : ''}
      </div>`);
    $$('[data-m]', s.el).forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
    const msg = s.el.querySelector('#a-msg');
    const done = () => {
      s.close();
      toast(state.user ? `Signed in as ${state.user.email || state.user.displayName}` : 'Signed in');
      const pj = kvGet('pendingJoin');
      onDone ? onDone() : window.ctpGo(location.hash || '#/today');
      if (pj) { kvSet('pendingJoin', null); setTimeout(() => import('./groups.js').then(m => m.handleJoinLink(pj)), 500); }
    };
    s.el.querySelector('#google')?.addEventListener('click', async () => {
      msg.textContent = '';
      try { await signInGoogle(); done(); }
      catch (e) { console.info('Google sign-in', e.code); msg.textContent = authErrorMessage(e); }
    });
    s.el.querySelector('#a-go').onclick = async () => {
      const email = s.el.querySelector('#a-email').value.trim();
      const pw = s.el.querySelector('#a-pw')?.value || '';
      const btn = s.el.querySelector('#a-go');
      msg.textContent = '';
      if (!email) { msg.textContent = 'Please enter your email.'; return; }
      btn.disabled = true;
      try {
        if (mode === 'reset') { await resetPassword(email); msg.style.color = 'var(--ok)'; msg.textContent = 'Check your email for a link to reset your password.'; btn.disabled = false; return; }
        if (mode === 'signup') await signUp(email, pw, s.el.querySelector('#a-name').value.trim());
        else await signIn(email, pw);
        done();
      } catch (e) { msg.style.color = 'var(--danger)'; msg.textContent = authErrorMessage(e); btn.disabled = false; }
    };
  };
  draw();
  return s;
}
