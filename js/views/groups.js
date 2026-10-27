// Groups: pray together with a church, Bible study, youth group, family or ministry.
//
// Firestore layout (see /firestore.rules in the project root for the matching rules):
//   codes/{CODE}                      { groupId, name, church, type, typeName, approval }  -> lets someone find a group by code
//   groups/{groupId}                  { name, type, typeName, church, code, approval, leaderUid, createdAt, schedule:{text,days[],time} }
//   groups/{groupId}/members/{uid}    { uid, name, role:'leader'|'member', status:'active'|'pending', joinedAt }
//   groups/{groupId}/posts/{postId}   { kind:'request'|'praise', text, authorUid, authorName, createdAt, prayedBy[], prayedCount, linkedId, answered, answeredAt }
//   users/{uid}/groups/{groupId}      { groupId, name, type, typeName, church, role, status, joinedAt }  -> the person's own list of groups
// Private prayer entries are never read here; group posts are written only from this screen.
import { $$, esc, icon, toast, openSheet, confirmSheet, fmtDate, groupCode, uid as newId } from '../util.js';
import { state, fs, withTimeout, toMs, kvGet as kv, kvSet, listEntries } from '../store.js';
import { GROUP_TYPES } from '../content.js';
import { wireDictation, stopListening } from '../speech.js';
import { qrSvg } from '../qr.js';
import { openAuthSheet } from './me.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SWITCHING_ON = 'Groups are being switched on — your group will appear here shortly.';
const typeOf = k => GROUP_TYPES.find(t => t.k === k) || GROUP_TYPES[GROUP_TYPES.length - 1];
const typeName = g => g.type === 'other' && g.typeName ? g.typeName : typeOf(g.type).n;
const siteBase = () => location.origin + location.pathname.replace(/index\.html$/, '');
const joinUrl = code => `${siteBase()}?join=${code}`;
const denied = e => /permission|PERMISSION_DENIED|insufficient|unauthenticated|timeout|unavailable|failed-precondition/i.test(String(e?.code || e?.message || e));

const drafts = () => kv('groupDrafts', []);
const saveDrafts = d => kvSet('groupDrafts', d);

export async function renderGroups(app, parts) {
  const [sub, id, tab] = parts;
  if (sub === 'g' && id) return groupView(app, id, tab || 'requests');
  return groupsHome(app);
}

async function loadMyGroups() {
  const out = { groups: [], deniedFlag: false };
  if (!state.user) return out;
  const f = await fs(); if (!f) { out.deniedFlag = true; return out; }
  const { collection, getDocs, doc, getDoc, query, where, Timestamp } = f.f;
  try {
    const qs = await withTimeout(getDocs(collection(f.db, 'users', state.user.uid, 'groups')));
    const mine = qs.docs.map(d => ({ id: d.id, ...d.data() }));
    out.groups = await Promise.all(mine.map(async m => {
      const g = { ...m, id: m.groupId || m.id, memberCount: null, newCount: 0 };
      try {
        const gs = await withTimeout(getDoc(doc(f.db, 'groups', g.id)));
        if (gs.exists()) Object.assign(g, gs.data(), { id: g.id });
        const ms = await withTimeout(getDocs(collection(f.db, 'groups', g.id, 'members')));
        g.memberCount = ms.docs.filter(d => d.data().status !== 'pending').length;
        g.pendingCount = ms.docs.filter(d => d.data().status === 'pending').length;
        const seen = kv('groupSeen:' + g.id, 0);
        const ps = await withTimeout(getDocs(query(collection(f.db, 'groups', g.id, 'posts'), where('createdAt', '>', Timestamp.fromMillis(seen || 0)))));
        g.newCount = ps.docs.filter(d => d.data().authorUid !== state.user.uid).length;
      } catch (e) { g.limited = true; }
      return g;
    }));
  } catch (e) {
    console.info('Groups not available yet', e.code || e.message);
    out.deniedFlag = true;
  }
  return out;
}

async function groupsHome(app) {
  app.innerHTML = `
    <header class="view-head">
      <p class="eyebrow">Together</p>
      <h1>Groups</h1>
      <p class="purpose">Pray together with your church, Bible study, youth group, family or ministry.</p>
    </header>
    <div style="display:grid;gap:12px;margin-top:6px"><button class="btn btn-gold btn-block" id="join">${icon('plus')}Join a group with a code</button><button class="btn btn-ghost btn-block" id="create">${icon('users')}Create a group</button></div>
    ${!state.user ? `<div class="notice notice-gold" style="margin-top:16px">${icon('info')}<span>To pray with others, you need a free account so your group can see your requests. <button class="link-btn" id="signin" style="padding:0;min-height:0">Sign in or create one</button></span></div>` : ''}
    <section class="section"><div class="section-head"><h2>Your groups</h2></div><div id="gl"><div class="spinner"></div></div></section>
    <section class="section"><div class="section-head"><h2>Kinds of groups</h2></div>
      <p class="purpose">Any of these can be a Called to Pray group.</p>
      <div class="type-grid">${GROUP_TYPES.map(t => `<div class="tile" style="min-height:0;align-items:center;text-align:center;padding:14px 8px">${icon(t.icon)}<small style="color:var(--text-2);font-weight:600">${esc(t.n)}</small></div>`).join('')}</div>
    </section>`;
  app.querySelector('#join').onclick = () => openJoin();
  app.querySelector('#create').onclick = () => openCreate();
  app.querySelector('#signin')?.addEventListener('click', () => openAuthSheet('signup'));
  const { groups, deniedFlag } = await loadMyGroups();
  const gl = app.querySelector('#gl'); if (!gl) return;
  const local = drafts();
  const all = [...groups, ...local.filter(d => !groups.some(g => g.id === d.id)).map(d => ({ ...d, isDraft: true }))];
  state.groupsDenied = deniedFlag;
  if (!all.length) {
    gl.innerHTML = `${deniedFlag && state.user ? `<div class="notice" style="margin-top:12px">${icon('info')}${SWITCHING_ON}</div>` : ''}
      <div class="empty"><strong>No groups yet</strong>Ask your group leader for a 6-letter code, or create a group and invite others.</div>`;
    return;
  }
  const order = Object.fromEntries(GROUP_TYPES.map((t, i) => [t.k, i]));
  all.sort((a, b) => (order[a.type] ?? 99) - (order[b.type] ?? 99) || String(a.name).localeCompare(String(b.name)));
  let html = '', lastType = '';
  for (const g of all) {
    const tn = typeName(g);
    if (tn !== lastType) { html += `<div class="group-type-head">${icon(typeOf(g.type).icon)}${esc(tn)}</div>`; lastType = tn; }
    const meta = [];
    if (g.church) meta.push(`<span>${esc(g.church)}</span>`);
    if (g.memberCount != null) meta.push(`<span>${g.memberCount} member${g.memberCount === 1 ? '' : 's'}</span>`);
    if (g.newCount) meta.push(`<span class="tag tag-gold">${g.newCount} new request${g.newCount === 1 ? '' : 's'}</span>`);
    if (g.status === 'pending') meta.push(`<span class="tag">Waiting for leader approval</span>`);
    if (g.isDraft) meta.push(`<span class="tag">Saved on this device</span>`);
    html += `<a class="row" href="#/groups/g/${encodeURIComponent(g.id)}" style="margin-top:10px"><span class="row-ic">${icon(typeOf(g.type).icon)}</span><span class="row-main"><span class="row-title">${esc(g.name)}</span><span class="row-meta">${meta.join('')}</span></span><span class="chev">${icon('chevR')}</span></a>`;
  }
  gl.innerHTML = (local.length && (deniedFlag || !state.user) ? `<div class="notice" style="margin-top:12px">${icon('info')}${state.user ? SWITCHING_ON : 'Sign in to share your group with others.'}</div>` : '') + html;
}

// ---------------- create ----------------
function openCreate() {
  let type = 'church';
  let approval = true;
  const s = openSheet('', { label: 'Create a group' });
  const draw = () => {
    const name = s.el.querySelector('#g-name')?.value || '';
    const church = s.el.querySelector('#g-church')?.value || '';
    const custom = s.el.querySelector('#g-custom')?.value || '';
    s.set(`
      <h2 class="sheet-title">Create a group</h2>
      <p class="lead">Start a prayer group and invite people with a code.</p>
      <div class="field" style="margin-top:18px"><span class="field-label">What kind of group?</span>
        <div class="type-grid">${GROUP_TYPES.map(t => `<button data-type="${t.k}" class="${t.k === type ? 'on' : ''}">${icon(t.icon)}${esc(t.n)}</button>`).join('')}</div></div>
      ${type === 'other' ? `<label class="field"><span>Name this kind of group</span><input type="text" id="g-custom" data-dictate value="${esc(custom)}" placeholder="For example: Prayer Team"></label>` : ''}
      <label class="field"><span>Group name</span><input type="text" id="g-name" data-dictate value="${esc(name)}" placeholder="For example: Tuesday Morning Prayer"></label>
      <label class="field"><span>Church or ministry (optional)</span><input type="text" id="g-church" data-dictate value="${esc(church)}" placeholder="For example: Grace Community Church"></label>
      <div class="card" style="padding:4px 16px">
        <div class="toggle-row"><div class="tr-text"><strong>Leader approves new members</strong><small>Recommended. You choose who joins.</small></div><label class="switch"><input type="checkbox" id="g-appr" ${approval ? 'checked' : ''}><span></span></label></div>
      </div>
      <div class="btn-row"><button class="btn btn-gold" id="g-go">Create group</button></div>`);
    wireDictation(s.el);
    $$('[data-type]', s.el).forEach(b => b.onclick = () => { approval = s.el.querySelector('#g-appr').checked; type = b.dataset.type; draw(); });
    s.el.querySelector('#g-go').onclick = create;
  };
  const create = async () => {
    stopListening();
    const name = s.el.querySelector('#g-name').value.trim();
    if (!name) return toast('Please give your group a name.');
    const g = {
      id: newId(), name, type, typeName: type === 'other' ? (s.el.querySelector('#g-custom')?.value.trim() || 'Other') : '',
      church: s.el.querySelector('#g-church').value.trim(), approval: s.el.querySelector('#g-appr').checked,
      code: groupCode(), createdAt: Date.now(), schedule: { text: '', days: [], time: '' },
    };
    const btn = s.el.querySelector('#g-go'); btn.disabled = true; btn.textContent = 'Creating…';
    const ok = await createRemote(g);
    if (!ok) { saveDrafts([...drafts(), { ...g, role: 'leader', status: 'active', leaderUid: state.user?.uid || 'me' }]); }
    showCode(s, g, ok);
  };
  draw();
}
async function createRemote(g) {
  if (!state.user) return false;
  const f = await fs(); if (!f) return false;
  const { doc, writeBatch, Timestamp } = f.f;
  try {
    const me = state.user.uid, name = state.profile.name || state.user.displayName || 'Leader';
    const b = writeBatch(f.db);
    b.set(doc(f.db, 'groups', g.id), { name: g.name, type: g.type, typeName: g.typeName, church: g.church, code: g.code, approval: g.approval, leaderUid: me, createdAt: Timestamp.fromMillis(g.createdAt), schedule: g.schedule });
    b.set(doc(f.db, 'groups', g.id, 'members', me), { uid: me, name, role: 'leader', status: 'active', joinedAt: Timestamp.now() });
    b.set(doc(f.db, 'codes', g.code), { groupId: g.id, name: g.name, church: g.church, type: g.type, typeName: g.typeName, approval: g.approval });
    b.set(doc(f.db, 'users', me, 'groups', g.id), { groupId: g.id, name: g.name, type: g.type, typeName: g.typeName, church: g.church, role: 'leader', status: 'active', joinedAt: Timestamp.now() });
    await withTimeout(b.commit());
    return true;
  } catch (e) { console.info('Group not created online yet', e.code || e.message); return false; }
}
function showCode(s, g, online) {
  s.set(`
    <h2 class="sheet-title">${esc(g.name)}</h2>
    <p class="lead">${online ? 'Your group is ready. Share this code so others can join.' : (state.user ? SWITCHING_ON : 'Your group is saved on this device. Sign in so others can join with this code.')}</p>
    <div class="code-box" data-testid="group-code">${esc(g.code)}</div>
    <div class="qr-box">${qrSvg(joinUrl(g.code), { px: 200 })}</div>
    <p class="hint" style="text-align:center">People can scan this with their phone camera to join.</p>
    <div class="btn-row"><button class="btn btn-ghost" id="share">${icon('share')}Share invite</button><a class="btn btn-gold" href="#/groups/g/${encodeURIComponent(g.id)}" id="open">Open group</a></div>`);
  s.el.querySelector('#share').onclick = () => shareInvite(g);
  s.el.querySelector('#open').onclick = () => s.close();
}
async function shareInvite(g) {
  const text = `Join our prayer group “${g.name}” on Called to Pray. Use code ${g.code} or open: ${joinUrl(g.code)}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Called to Pray', text });
    else { await navigator.clipboard.writeText(text); toast('Invite copied. Paste it into a text or email.'); }
  } catch {}
}

// ---------------- join ----------------
export function handleJoinLink(code) { location.hash = '#/groups'; setTimeout(() => openJoin(code), 200); }
function openJoin(pre = '') {
  const s = openSheet(`
    <h2 class="sheet-title">Join a group</h2>
    <p class="lead">Enter the 6-character code from your group leader.</p>
    <label class="field"><span>Group code</span><input type="text" id="code" class="code-input" maxlength="6" autocomplete="off" autocapitalize="characters" value="${esc(pre)}" placeholder="ABC123" data-dictate></label>
    <p class="hint" id="msg"></p>
    <div class="btn-row"><button class="btn btn-gold" id="find">Find group</button></div>`, { label: 'Join a group' });
  wireDictation(s.el);
  const input = s.el.querySelector('#code');
  input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  s.el.querySelector('#find').onclick = async () => {
    stopListening();
    const code = input.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const msg = s.el.querySelector('#msg');
    if (code.length !== 6) { msg.textContent = 'Codes have 6 letters and numbers.'; return; }
    if (!state.user) { s.close(); kvSet('pendingJoin', code); toast('Please sign in first, then join your group.'); return openAuthSheet('signup'); }
    msg.textContent = 'Looking for your group…';
    const f = await fs();
    try {
      const snap = await withTimeout(f.f.getDoc(f.f.doc(f.db, 'codes', code)));
      if (!snap.exists()) { msg.textContent = 'We could not find a group with that code. Please check it and try again.'; return; }
      const c = snap.data();
      s.set(`<h2 class="sheet-title">${esc(c.name)}</h2>
        <p class="lead">${esc(typeName(c))}${c.church ? ' · ' + esc(c.church) : ''}</p>
        <p class="lead">${c.approval ? 'The leader will approve your request to join.' : 'You can join right away.'}</p>
        <div class="btn-row"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-gold" id="yes">Join group</button></div>`);
      s.el.querySelector('#yes').onclick = async () => {
        const me = state.user.uid, status = c.approval ? 'pending' : 'active';
        const { doc, writeBatch, Timestamp } = f.f;
        try {
          const b = writeBatch(f.db);
          b.set(doc(f.db, 'groups', c.groupId, 'members', me), { uid: me, name: state.profile.name || state.user.displayName || 'Member', role: 'member', status, joinedAt: Timestamp.now(), code });
          b.set(doc(f.db, 'users', me, 'groups', c.groupId), { groupId: c.groupId, name: c.name, type: c.type, typeName: c.typeName || '', church: c.church || '', role: 'member', status, joinedAt: Timestamp.now() });
          await withTimeout(b.commit());
          s.close(); toast(c.approval ? 'Request sent. The leader will approve you soon.' : 'You joined the group.');
          location.hash = `#/groups/g/${encodeURIComponent(c.groupId)}`;
        } catch (e) { s.close(); toast(SWITCHING_ON, 4200); }
      };
    } catch (e) { msg.textContent = denied(e) ? SWITCHING_ON : 'Something went wrong. Please try again.'; }
  };
  if (pre.length === 6) setTimeout(() => s.el.querySelector('#find').click(), 50);
}

// ---------------- inside a group ----------------
async function loadGroup(id) {
  const d = drafts().find(x => x.id === id);
  const res = { g: d ? { ...d, isDraft: true } : null, members: d ? [{ uid: state.user?.uid || 'me', name: state.profile.name || 'You', role: 'leader', status: 'active' }] : [], posts: [], offline: !!d };
  if (!state.user) return res;
  const f = await fs(); if (!f) return res;
  const { doc, getDoc, collection, getDocs, query, orderBy, limit } = f.f;
  try {
    const gs = await withTimeout(getDoc(doc(f.db, 'groups', id)));
    if (gs.exists()) { res.g = { id, ...gs.data() }; res.offline = false; if (d) saveDrafts(drafts().filter(x => x.id !== id)); }
    const ms = await withTimeout(getDocs(collection(f.db, 'groups', id, 'members')));
    res.members = ms.docs.map(x => ({ uid: x.id, ...x.data() }));
    const ps = await withTimeout(getDocs(query(collection(f.db, 'groups', id, 'posts'), orderBy('createdAt', 'desc'), limit(200))));
    res.posts = ps.docs.map(x => ({ id: x.id, ...x.data(), createdAt: toMs(x.data().createdAt), answeredAt: toMs(x.data().answeredAt) }));
  } catch (e) {
    console.info('Group read limited', e.code || e.message);
    if (!res.g) {
      try { const mine = await withTimeout(getDoc(doc(f.db, 'users', state.user.uid, 'groups', id))); if (mine.exists()) res.g = { id, ...mine.data(), limited: true }; } catch {}
    }
    res.offline = true;
  }
  return res;
}

async function groupView(app, id, tab) {
  app.innerHTML = `<header class="view-head"><a class="link-btn" href="#/groups">${icon('chevL')} Groups</a><div class="spinner"></div></header>`;
  const data = await loadGroup(id);
  const { g, members } = data;
  if (!g) { app.innerHTML = `<header class="view-head"><a class="link-btn" href="#/groups">${icon('chevL')} Groups</a><h1>Group not found</h1><p class="purpose">${state.user ? SWITCHING_ON : 'Please sign in to see this group.'}</p></header>`; return; }
  const me = state.user?.uid || 'me';
  const myMember = members.find(m => m.uid === me);
  const isLeader = g.isDraft || g.leaderUid === me || myMember?.role === 'leader';
  const pending = myMember?.status === 'pending' || g.status === 'pending';
  const localPosts = kv('groupPosts:' + id, []);
  const posts = [...localPosts.map(p => ({ ...p, isDraft: true })), ...data.posts];
  kvSet('groupSeen:' + id, Date.now());
  const TABS = [['requests', 'Requests'], ['praises', 'Praises & Answers'], ['members', 'Members'], ['schedule', 'Schedule']];
  app.innerHTML = `
    <header class="view-head">
      <a class="link-btn" href="#/groups">${icon('chevL')} Groups</a>
      <p class="eyebrow">${esc(typeName(g))}${g.church ? ' · ' + esc(g.church) : ''}</p>
      <h1>${esc(g.name)}</h1>
      <p class="purpose">Share requests, pray for one another and celebrate answers together.</p>
      ${data.offline ? `<div class="notice" style="margin-top:8px">${icon('info')}${state.user ? SWITCHING_ON : 'Saved on this device. Sign in to share it.'}</div>` : ''}
      ${pending ? `<div class="notice notice-gold" style="margin-top:8px">${icon('clock')}Waiting for the leader to approve you.</div>` : ''}
      <div class="btn-row" style="margin-top:14px">${g.code ? `<button class="btn btn-ghost btn-sm" id="invite">${icon('qr')}Invite (code ${esc(g.code)})</button>` : ''}</div>
    </header>
    <div class="subtabs" role="tablist">${TABS.map(([k, n]) => `<button role="tab" data-gtab="${k}" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}">${n}</button>`).join('')}</div>
    <div id="gbody"></div>`;
  app.querySelector('#invite')?.addEventListener('click', () => { const s = openSheet('', { label: 'Invite' }); showCode(s, g, !data.offline); });
  $$('[data-gtab]', app).forEach(b => b.onclick = () => { location.hash = `#/groups/g/${encodeURIComponent(id)}/${b.dataset.gtab}`; });
  const body = app.querySelector('#gbody');
  const rerender = () => groupView(app, id, tab);
  if (tab === 'requests') requestsTab(body, g, posts.filter(p => p.kind !== 'praise'), posts, { me, isLeader, pending, offline: data.offline, rerender });
  else if (tab === 'praises') praisesTab(body, g, posts.filter(p => p.kind === 'praise'), posts, { me, pending, offline: data.offline, rerender });
  else if (tab === 'members') membersTab(body, g, members, { me, isLeader, rerender });
  else scheduleTab(body, g, { isLeader, offline: data.offline, rerender });
}

async function addPost(g, post, offline) {
  const f = state.user && !offline ? await fs() : null;
  if (f) {
    try {
      const { doc, setDoc, Timestamp } = f.f;
      await withTimeout(setDoc(doc(f.db, 'groups', g.id, 'posts', post.id), { ...post, createdAt: Timestamp.fromMillis(post.createdAt), answeredAt: null }));
      return true;
    } catch (e) { console.info('Post saved locally', e.code || e.message); }
  }
  kvSet('groupPosts:' + g.id, [post, ...kv('groupPosts:' + g.id, [])]);
  return false;
}
function postComposer(kind, g, ctx, linkTo = null) {
  const myOpen = listEntries('prayers').filter(e => !e.answered); // never includes private entries
  const s = openSheet(`
    <h2 class="sheet-title">${kind === 'praise' ? 'Share a praise' : 'Share a prayer request'}</h2>
    <p class="lead">Everyone in ${esc(g.name)} will see this.</p>
    ${linkTo ? `<div class="card"><p class="hint" style="margin:0">Answer to:</p><p style="margin:4px 0 0">${esc(linkTo.text)}</p></div>` : ''}
    <label class="field"><span>${kind === 'praise' ? 'What has God done?' : 'What can the group pray for?'}</span><textarea id="p-text" data-dictate placeholder="Type, or tap the microphone and speak"></textarea></label>
    ${kind !== 'praise' && myOpen.length ? `<p class="hint" style="margin-top:14px">Or share one of your requests (private ones are never listed):</p><div class="chips">${myOpen.slice(0, 6).map(e => `<button class="chip chip-sm" data-fill="${esc(e.text)}">${esc(e.text.length > 40 ? e.text.slice(0, 40) + '…' : e.text)}</button>`).join('')}</div>` : ''}
    <div class="btn-row"><button class="btn btn-gold" id="p-go">Share</button></div>`, { label: 'Share' });
  wireDictation(s.el);
  $$('[data-fill]', s.el).forEach(b => b.onclick = () => { s.el.querySelector('#p-text').value = b.dataset.fill; });
  s.el.querySelector('#p-go').onclick = async () => {
    stopListening();
    const text = s.el.querySelector('#p-text').value.trim();
    if (!text) return toast('Please write or speak something first.');
    const post = { id: newId(), kind: kind === 'praise' ? 'praise' : 'request', text, authorUid: ctx.me, authorName: state.profile.name || state.user?.displayName || 'Member', createdAt: Date.now(), prayedBy: [], prayedCount: 0, linkedId: linkTo?.id || null, answered: false };
    const ok = await addPost(g, post, ctx.offline);
    if (linkTo && ok) {
      try { const f = await fs(); await withTimeout(f.f.updateDoc(f.f.doc(f.db, 'groups', g.id, 'posts', linkTo.id), { answered: true, answeredAt: f.f.Timestamp.now() })); } catch {}
    }
    s.close();
    toast(ok ? 'Shared with your group' : 'Saved on this device. It will be shared when groups are switched on.', 3600);
    ctx.rerender();
  };
}
function postCard(p, ctx, all) {
  const prayed = (p.prayedBy || []).includes(ctx.me);
  const linked = p.linkedId ? all.find(x => x.id === p.linkedId) : null;
  return `<div class="card" style="margin-top:12px">
    <div class="row-meta" style="margin:0 0 6px;color:var(--text-3);font-size:14px;display:flex;gap:10px;flex-wrap:wrap"><strong style="color:var(--text-2)">${esc(p.authorName || 'Member')}</strong><span>${fmtDate(p.createdAt)}</span>${p.answered ? `<span class="tag tag-ok">${icon('check')}Answered</span>` : ''}${p.isDraft ? '<span class="tag">Saved on this device</span>' : ''}</div>
    <p style="margin:0;font-size:calc(18px*var(--fs-scale));white-space:pre-wrap">${esc(p.text)}</p>
    ${linked ? `<p class="hint">Answer to: “${esc(linked.text.length > 90 ? linked.text.slice(0, 90) + '…' : linked.text)}”</p>` : ''}
    ${p.kind !== 'praise' ? `<div class="card-actions">
      <button class="btn btn-ghost btn-sm prayed-btn ${prayed ? 'on' : ''}" data-pray="${esc(p.id)}" ${p.isDraft ? 'disabled' : ''}>${icon(prayed ? 'check' : 'pray')}${prayed ? 'You prayed' : 'I prayed'}${p.prayedCount ? ` · ${p.prayedCount}` : ''}</button>
      ${p.authorUid === ctx.me && !p.answered && !p.isDraft ? `<button class="btn btn-outline btn-sm" data-answer="${esc(p.id)}">${icon('sparkle')}Share the answer</button>` : ''}
    </div>` : ''}</div>`;
}
function requestsTab(body, g, reqs, all, ctx) {
  body.innerHTML = `<p class="purpose" style="margin-top:14px">Requests from the group. Tap “I prayed” when you pray for one.</p>
    ${ctx.pending ? '' : `<button class="btn btn-gold btn-block" id="post">${icon('plus')}Share a prayer request</button>`}
    ${reqs.length ? reqs.map(p => postCard(p, ctx, all)).join('') : `<div class="empty"><strong>No requests yet</strong>Be the first to share one.</div>`}`;
  body.querySelector('#post')?.addEventListener('click', () => postComposer('request', g, ctx));
  wirePostActions(body, g, all, ctx);
}
function praisesTab(body, g, praises, all, ctx) {
  body.innerHTML = `<p class="purpose" style="margin-top:14px">Celebrate what God has done. Answers link back to the original request.</p>
    ${ctx.pending ? '' : `<button class="btn btn-gold btn-block" id="post">${icon('sparkle')}Share a praise</button>`}
    ${praises.length ? praises.map(p => postCard(p, ctx, all)).join('') : `<div class="empty"><strong>No praises yet</strong>When God answers, share it here.</div>`}`;
  body.querySelector('#post')?.addEventListener('click', () => postComposer('praise', g, ctx));
}
function wirePostActions(body, g, all, ctx) {
  $$('[data-pray]', body).forEach(b => b.onclick = async () => {
    const p = all.find(x => x.id === b.dataset.pray);
    if ((p.prayedBy || []).includes(ctx.me)) return;
    p.prayedBy = [...(p.prayedBy || []), ctx.me]; p.prayedCount = (p.prayedCount || 0) + 1;
    b.classList.add('on'); b.innerHTML = `${icon('check')}You prayed · ${p.prayedCount}`;
    try { const f = await fs(); await withTimeout(f.f.updateDoc(f.f.doc(f.db, 'groups', g.id, 'posts', p.id), { prayedBy: f.f.arrayUnion(ctx.me), prayedCount: f.f.increment(1) })); }
    catch { toast('Thank you for praying. We could not update the count right now.'); }
  });
  $$('[data-answer]', body).forEach(b => b.onclick = () => postComposer('praise', g, ctx, all.find(x => x.id === b.dataset.answer)));
}
function membersTab(body, g, members, ctx) {
  const active = members.filter(m => m.status !== 'pending'), pending = members.filter(m => m.status === 'pending');
  const row = (m, isPending) => `<div class="row" style="align-items:center"><span class="row-ic">${icon(m.role === 'leader' ? 'star' : 'user')}</span>
    <span class="row-main"><span class="row-title">${esc(m.name || 'Member')}${m.uid === ctx.me ? ' (you)' : ''}</span><span class="row-meta">${m.role === 'leader' ? 'Leader' : isPending ? 'Asked to join' : 'Member'}</span></span>
    ${ctx.isLeader && m.uid !== ctx.me ? (isPending ? `<button class="btn btn-gold btn-sm" data-approve="${esc(m.uid)}">Approve</button>` : '') + `<button class="btn btn-danger btn-sm" data-remove="${esc(m.uid)}" aria-label="Remove ${esc(m.name)}">${isPending ? 'Decline' : 'Remove'}</button>` : ''}</div>`;
  body.innerHTML = `<p class="purpose" style="margin-top:14px">The people in this group.${ctx.isLeader ? ' As leader, you can approve or remove members.' : ''}</p>
    ${pending.length && ctx.isLeader ? `<h3 style="margin-top:12px">Waiting for approval</h3><div class="list">${pending.map(m => row(m, true)).join('')}</div>` : ''}
    <h3 style="margin-top:18px">${active.length} member${active.length === 1 ? '' : 's'}</h3><div class="list">${active.map(m => row(m, false)).join('')}</div>
    ${!ctx.isLeader && state.user ? `<button class="btn btn-danger btn-block" id="leave" style="margin-top:24px">Leave group</button>` : ''}`;
  const f = () => fs();
  $$('[data-approve]', body).forEach(b => b.onclick = async () => {
    try { const x = await f(); await withTimeout(x.f.updateDoc(x.f.doc(x.db, 'groups', g.id, 'members', b.dataset.approve), { status: 'active' })); toast('Approved'); ctx.rerender(); } catch { toast(SWITCHING_ON); }
  });
  $$('[data-remove]', body).forEach(b => b.onclick = async () => {
    if (!await confirmSheet('Remove this person?', 'They will no longer see this group’s requests.', 'Remove', true)) return;
    try { const x = await f(); await withTimeout(x.f.deleteDoc(x.f.doc(x.db, 'groups', g.id, 'members', b.dataset.remove))); toast('Removed'); ctx.rerender(); } catch { toast(SWITCHING_ON); }
  });
  body.querySelector('#leave')?.addEventListener('click', async () => {
    if (!await confirmSheet('Leave this group?', 'You can join again later with the code.', 'Leave', true)) return;
    try { const x = await f(); await withTimeout(x.f.deleteDoc(x.f.doc(x.db, 'groups', g.id, 'members', ctx.me))); await withTimeout(x.f.deleteDoc(x.f.doc(x.db, 'users', ctx.me, 'groups', g.id))); location.hash = '#/groups'; } catch { toast(SWITCHING_ON); }
  });
}
function scheduleTab(body, g, ctx) {
  const sc = g.schedule || { text: '', days: [], time: '' };
  const view = () => {
    const when = [sc.days?.length ? sc.days.join(', ') : '', sc.time ? fmt12(sc.time) : ''].filter(Boolean).join(' at ');
    body.innerHTML = `<p class="purpose" style="margin-top:14px">When this group prays together.</p>
      <div class="card">${when || sc.text ? `${when ? `<h3>${esc(when)}</h3>` : ''}${sc.text ? `<p class="lead" style="white-space:pre-wrap">${esc(sc.text)}</p>` : ''}` : `<p class="lead" style="margin:0">No schedule yet.${ctx.isLeader ? ' Add one so everyone knows when to pray.' : ''}</p>`}</div>
      ${ctx.isLeader ? `<button class="btn btn-gold btn-block" id="edit" style="margin-top:16px">${icon('edit')}Edit schedule</button>` : ''}`;
    body.querySelector('#edit')?.addEventListener('click', edit);
  };
  const edit = () => {
    let days = [...(sc.days || [])];
    const s = openSheet(`<h2 class="sheet-title">Prayer schedule</h2><p class="lead">Let your group know when you pray together.</p>
      <div class="field" style="margin-top:16px"><span class="field-label">Days</span><div class="chips">${DAYS.map(d => `<button class="chip ${days.includes(d) ? 'on' : ''}" data-d="${d}">${d}</button>`).join('')}</div></div>
      <label class="field"><span>Time</span><input type="time" id="s-time" value="${esc(sc.time || '')}"></label>
      <label class="field"><span>Details</span><textarea id="s-text" data-dictate placeholder="For example: We pray in the chapel before the 9 a.m. service, or on a phone call.">${esc(sc.text || '')}</textarea></label>
      <div class="btn-row"><button class="btn btn-gold" id="s-save">Save</button></div>`, { label: 'Schedule' });
    wireDictation(s.el);
    $$('[data-d]', s.el).forEach(b => b.onclick = () => { days = days.includes(b.dataset.d) ? days.filter(x => x !== b.dataset.d) : [...days, b.dataset.d]; b.classList.toggle('on'); });
    s.el.querySelector('#s-save').onclick = async () => {
      stopListening();
      const next = { days: DAYS.filter(d => days.includes(d)), time: s.el.querySelector('#s-time').value, text: s.el.querySelector('#s-text').value.trim() };
      Object.assign(sc, next);
      let ok = false;
      if (state.user && !ctx.offline) { try { const x = await fs(); await withTimeout(x.f.updateDoc(x.f.doc(x.db, 'groups', g.id), { schedule: next })); ok = true; } catch {} }
      if (!ok) saveDrafts(drafts().map(d => d.id === g.id ? { ...d, schedule: next } : d));
      s.close(); toast(ok ? 'Schedule saved' : 'Saved on this device'); view();
    };
  };
  view();
}
function fmt12(t) { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`; }
