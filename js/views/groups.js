// Groups: pray together with a church, Bible study, youth group, family or ministry.
//
// Firestore layout (see /firestore.rules in the project root for the matching rules):
//   codes/{CODE}                      { groupId, name, church, type, typeName, approval }  -> lets someone find a group by code
//   groups/{groupId}                  { name, type, typeName, church, code, approval, leaderUid, createdAt, schedule:{text,days[],time} }
//   groups/{groupId}/members/{uid}    { uid, name, role:'leader'|'member', status:'active'|'pending'|'blocked', joinedAt }
//   groups/{groupId}/reports/{id}     { targetUid, targetName, postId, postText, reason, details, reporterUid, reporterName, createdAt, status }
//   reports/{id}                      same plus groupId, groupName  -> copy for the Called to Pray team
//   registrations/{groupId}           { groupId, name, type, church, leaderUid, contact:{name,email,phone,title}, createdAt } -> for the Called to Pray team
// Group fields also include allowInvites (members may share the code) and contactName.
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
        const mineDoc = await withTimeout(getDoc(doc(f.db, 'groups', g.id, 'members', state.user.uid)));
        g.status = mineDoc.exists() ? mineDoc.data().status : 'removed';
        if (g.status === 'removed' || g.status === 'blocked') return g;
        const gs = await withTimeout(getDoc(doc(f.db, 'groups', g.id)));
        if (gs.exists()) Object.assign(g, gs.data(), { id: g.id, status: g.status });
        if (mineDoc.exists() && mineDoc.data().role === 'leader') g.role = 'leader';
        if (g.status === 'active' && m.status !== 'active') f.f.updateDoc(doc(f.db, 'users', state.user.uid, 'groups', g.id), { status: 'active' }).catch(() => {});
        if (g.status !== 'active') { g.memberCount = null; return g; }
        const ms = await withTimeout(getDocs(collection(f.db, 'groups', g.id, 'members')));
        g.memberCount = ms.docs.filter(d => d.data().status === 'active').length;
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
      <p class="purpose">Pray together with your church, Bible study, youth group, family or ministry. Share requests, pray for one another, and record the answers.</p>
    </header>
    <div style="display:grid;gap:12px;margin-top:6px">
      <button class="btn btn-gold btn-block" id="join">${icon('plus')}Join a group (I have a code)</button>
      <button class="btn btn-outline btn-block" id="create">${icon('church')}Register your church or group (free)</button>
    </div>
    <section class="card" style="margin-top:16px">
      <div class="card-label">${icon('info')}How groups work</div>
      <ol class="install-steps" style="margin-bottom:4px">
        <li><strong>One person registers the group.</strong> Usually the pastor, ministry leader or group contact. It is free for churches, ministries, small groups and families.</li>
        <li><strong>Invite people.</strong> Share the group's code, link or QR code. Members can invite others too, if the leader allows it.</li>
        <li><strong>The leader lets people in.</strong> Approve each new person, or set the group to let everyone with the code in.</li>
        <li><strong>Pray together.</strong> Share requests, tap "I prayed," and record the answers so the whole group can look back.</li>
      </ol>
      <p class="hint" style="margin-bottom:0">Leaders can remove or block anyone, and any member can report a post or a person.</p>
    </section>
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
      <div class="empty"><strong>No groups yet</strong>Ask your group leader for the 6-character code, or register your own group and invite people.</div>`;
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
    if (g.status === 'removed' || g.status === 'blocked') meta.push(`<span class="tag">You are no longer in this group</span>`);
    if (g.role === 'leader' && g.pendingCount) meta.push(`<span class="tag tag-gold">${g.pendingCount} waiting for you to approve</span>`);
    if (g.isDraft) meta.push(`<span class="tag">Saved on this device</span>`);
    html += `<a class="row" href="#/groups/g/${encodeURIComponent(g.id)}" style="margin-top:10px"><span class="row-ic">${icon(typeOf(g.type).icon)}</span><span class="row-main"><span class="row-title">${esc(g.name)}</span><span class="row-meta">${meta.join('')}</span></span><span class="chev">${icon('chevR')}</span></a>`;
  }
  gl.innerHTML = (local.length && (deniedFlag || !state.user) ? `<div class="notice" style="margin-top:12px">${icon('info')}${state.user ? SWITCHING_ON : 'Sign in to share your group with others.'}</div>` : '') + html;
}

// ---------------- create ----------------
function openCreate() {
  if (!state.user) { toast('Please sign in or create a free account first. Then register your group.', 4200); return openAuthSheet('signup', { onDone: () => openCreate() }); }
  let type = 'church';
  let approval = true, invites = true;
  const s = openSheet('', { label: 'Register a group' });
  const draw = () => {
    const name = s.el.querySelector('#g-name')?.value || '';
    const church = s.el.querySelector('#g-church')?.value || '';
    const custom = s.el.querySelector('#g-custom')?.value || '';
    const cName = s.el.querySelector('#c-name')?.value ?? (state.profile.name || state.user?.displayName || '');
    const cTitle = s.el.querySelector('#c-title')?.value || '';
    const cEmail = s.el.querySelector('#c-email')?.value ?? (state.user?.email || '');
    const cPhone = s.el.querySelector('#c-phone')?.value || '';
    s.set(`
      <h2 class="sheet-title">Register your group</h2>
      <p class="lead">Free for churches, ministries, small groups and families. You will be the group's leader and point of contact, and you will get a code to invite people.</p>
      <div class="field" style="margin-top:18px"><span class="field-label">What kind of group?</span>
        <div class="type-grid">${GROUP_TYPES.map(t => `<button data-type="${t.k}" class="${t.k === type ? 'on' : ''}">${icon(t.icon)}${esc(t.n)}</button>`).join('')}</div></div>
      ${type === 'other' ? `<label class="field"><span>Name this kind of group</span><input type="text" id="g-custom" data-dictate value="${esc(custom)}" placeholder="For example: Prayer Team"></label>` : ''}
      <label class="field"><span>Group name</span><input type="text" id="g-name" data-dictate value="${esc(name)}" placeholder="For example: Tuesday Morning Prayer"></label>
      <label class="field"><span>Church or ministry (optional)</span><input type="text" id="g-church" data-dictate value="${esc(church)}" placeholder="For example: Grace Community Church"></label>
      <div class="card" style="padding:4px 16px">
        <div class="toggle-row"><div class="tr-text"><strong>Leader approves new members</strong><small>Recommended. You choose who joins. Turn off to let everyone with the code in.</small></div><label class="switch"><input type="checkbox" id="g-appr" ${approval ? 'checked' : ''}><span></span></label></div>
        <div class="toggle-row"><div class="tr-text"><strong>Members can invite others</strong><small>Members can share the group code. You still approve new people if approval is on.</small></div><label class="switch"><input type="checkbox" id="g-inv" ${invites ? 'checked' : ''}><span></span></label></div>
      </div>
      <h3 style="margin-top:22px">Point of contact</h3>
      <p class="hint" style="margin-top:4px">Only the Called to Pray team sees your email and phone. Members see your name as the leader.</p>
      <label class="field"><span>Your name</span><input type="text" id="c-name" value="${esc(cName)}" autocomplete="name"></label>
      <label class="field"><span>Your role (optional)</span><input type="text" id="c-title" value="${esc(cTitle)}" placeholder="For example: Pastor, Women's Ministry Leader"></label>
      <label class="field"><span>Email</span><input type="email" id="c-email" value="${esc(cEmail)}" autocomplete="email" inputmode="email" autocapitalize="off"></label>
      <label class="field"><span>Phone (optional)</span><input type="tel" id="c-phone" value="${esc(cPhone)}" autocomplete="tel" inputmode="tel"></label>
      <div class="btn-row"><button class="btn btn-gold" id="g-go">Register group</button></div>`);
    wireDictation(s.el);
    $$('[data-type]', s.el).forEach(b => b.onclick = () => { approval = s.el.querySelector('#g-appr').checked; invites = s.el.querySelector('#g-inv').checked; type = b.dataset.type; draw(); });
    s.el.querySelector('#g-go').onclick = create;
  };
  const create = async () => {
    stopListening();
    const name = s.el.querySelector('#g-name').value.trim();
    if (!name) return toast('Please give your group a name.');
    const contact = { name: s.el.querySelector('#c-name').value.trim(), title: s.el.querySelector('#c-title').value.trim(), email: s.el.querySelector('#c-email').value.trim(), phone: s.el.querySelector('#c-phone').value.trim() };
    if (!contact.name) return toast('Please add your name as the point of contact.');
    if (!/^\S+@\S+\.\S+$/.test(contact.email)) return toast('Please add an email we can reach you at.');
    const g = {
      id: newId(), name, type, typeName: type === 'other' ? (s.el.querySelector('#g-custom')?.value.trim() || 'Other') : '',
      church: s.el.querySelector('#g-church').value.trim(), approval: s.el.querySelector('#g-appr').checked, allowInvites: s.el.querySelector('#g-inv').checked,
      code: groupCode(), createdAt: Date.now(), schedule: { text: '', days: [], time: '' }, contact, contactName: contact.name,
    };
    const btn = s.el.querySelector('#g-go'); btn.disabled = true; btn.textContent = 'Registering…';
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
    const me = state.user.uid, name = g.contact?.name || state.profile.name || state.user.displayName || 'Leader';
    const b = writeBatch(f.db);
    b.set(doc(f.db, 'groups', g.id), { name: g.name, type: g.type, typeName: g.typeName, church: g.church, code: g.code, approval: g.approval, allowInvites: g.allowInvites !== false, leaderUid: me, contactName: name, createdAt: Timestamp.fromMillis(g.createdAt), schedule: g.schedule });
    if (g.contact) b.set(doc(f.db, 'registrations', g.id), { groupId: g.id, name: g.name, type: g.type, typeName: g.typeName, church: g.church, leaderUid: me, contact: g.contact, createdAt: Timestamp.fromMillis(g.createdAt) });
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
    <p class="lead">${online ? 'Share this code, link or QR code so people can join.' : (state.user ? SWITCHING_ON : 'Your group is saved on this device. Sign in so others can join with this code.')}</p>
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
        const { doc, writeBatch, Timestamp, getDoc } = f.f;
        try {
          const already = await withTimeout(getDoc(doc(f.db, 'groups', c.groupId, 'members', me))).catch(() => null);
          if (already?.exists()) {
            const st = already.data().status;
            s.close();
            if (st === 'blocked') return toast('You can\u2019t join this group. Please contact the group leader.', 4200);
            toast(st === 'pending' ? 'You already asked to join. The leader will approve you soon.' : 'You are already in this group.');
            location.hash = `#/groups/g/${encodeURIComponent(c.groupId)}`; return;
          }
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
    if (!d) {
      const mine = await withTimeout(getDoc(doc(f.db, 'groups', id, 'members', state.user.uid)));
      const st = mine.exists() ? mine.data().status : 'removed';
      if (st === 'removed' || st === 'blocked') {
        const copy = await withTimeout(getDoc(doc(f.db, 'users', state.user.uid, 'groups', id))).catch(() => null);
        res.g = copy?.exists() ? { id, ...copy.data() } : { id, name: 'This group' };
        res.removed = true; return res;
      }
      if (st === 'pending') {
        const gs0 = await withTimeout(getDoc(doc(f.db, 'groups', id)));
        res.g = gs0.exists() ? { id, ...gs0.data() } : null;
        res.members = [{ uid: state.user.uid, ...mine.data() }];
        return res;
      }
    }
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
  const isLeader = g.isDraft || (myMember ? myMember.role === 'leader' && myMember.status === 'active' : g.leaderUid === me);
  const pending = myMember?.status === 'pending' || g.status === 'pending';
  if (data.removed) {
    app.innerHTML = `<header class="view-head"><a class="link-btn" href="#/groups">${icon('chevL')} Groups</a><h1>${esc(g.name)}</h1><p class="purpose">You are no longer in this group. If you think this is a mistake, please contact the group leader.</p>
      <button class="btn btn-ghost btn-block" id="forget" style="margin-top:18px">Remove it from my list</button></header>`;
    app.querySelector('#forget').onclick = async () => { try { const x = await fs(); await withTimeout(x.f.deleteDoc(x.f.doc(x.db, 'users', me, 'groups', id))); } catch {} location.hash = '#/groups'; };
    return;
  }
  const canInvite = !pending && g.code && (isLeader || g.allowInvites !== false);
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
      ${g.contactName ? `<p class="hint" style="margin:6px 0 0">Leader: ${esc(g.contactName)}</p>` : ''}
      <div class="btn-row" style="margin-top:14px">${canInvite ? `<button class="btn btn-ghost btn-sm" id="invite">${icon('qr')}Invite someone</button>` : ''}${isLeader && !g.isDraft ? `<button class="btn btn-ghost btn-sm" id="gset">${icon('gear')}Group settings</button>` : ''}</div>
    </header>
    <div class="subtabs" role="tablist">${TABS.map(([k, n]) => `<button role="tab" data-gtab="${k}" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}">${n}</button>`).join('')}</div>
    <div id="gbody"></div>`;
  app.querySelector('#invite')?.addEventListener('click', () => { const s = openSheet('', { label: 'Invite' }); showCode(s, g, !data.offline); });
  app.querySelector('#gset')?.addEventListener('click', () => groupSettings(g, () => groupView(app, id, tab)));
  $$('[data-gtab]', app).forEach(b => b.onclick = () => { location.hash = `#/groups/g/${encodeURIComponent(id)}/${b.dataset.gtab}`; });
  const body = app.querySelector('#gbody');
  const rerender = () => groupView(app, id, tab);
  const hidden = new Set(kv('hiddenPosts', []));
  const shown = posts.filter(p => !hidden.has(p.id));
  if (tab === 'requests') requestsTab(body, g, shown.filter(p => p.kind !== 'praise'), posts, { me, isLeader, pending, offline: data.offline, rerender });
  else if (tab === 'praises') praisesTab(body, g, shown.filter(p => p.kind === 'praise'), posts, { me, isLeader, pending, offline: data.offline, rerender });
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
  return `<div class="card post-card" style="margin-top:12px">
    <div class="row-meta" style="margin:0 0 6px;color:var(--text-3);font-size:14px;display:flex;gap:10px;flex-wrap:wrap"><strong style="color:var(--text-2)">${esc(p.authorName || 'Member')}</strong><span>${fmtDate(p.createdAt)}</span>${p.answered ? `<span class="tag tag-ok">${icon('check')}Answered</span>` : ''}${p.isDraft ? '<span class="tag">Saved on this device</span>' : ''}</div>
    <p style="margin:0;font-size:calc(18px*var(--fs-scale));white-space:pre-wrap">${esc(p.text)}</p>
    ${linked ? `<p class="hint">Answer to: “${esc(linked.text.length > 90 ? linked.text.slice(0, 90) + '…' : linked.text)}”</p>` : ''}
    ${p.isDraft ? '' : `<button class="post-more" data-more="${esc(p.id)}" aria-label="More options">${icon('dots')}</button>`}
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
  wirePostActions(body, g, all, ctx);
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
  $$('[data-more]', body).forEach(b => b.onclick = () => postMenu(g, all.find(x => x.id === b.dataset.more), ctx));
}
function postMenu(g, p, ctx) {
  if (!p) return;
  const mine = p.authorUid === ctx.me;
  const s = openSheet(`<h2 class="sheet-title">${mine ? 'Your post' : 'This post'}</h2>
    <p class="lead" style="white-space:pre-wrap">${esc(p.text.length > 160 ? p.text.slice(0, 160) + '…' : p.text)}</p>
    <div style="display:grid;gap:10px;margin-top:16px">
      ${mine || ctx.isLeader ? `<button class="btn btn-danger btn-block" id="pm-del">${icon('trash')}${mine ? 'Delete my post' : 'Remove this post from the group'}</button>` : ''}
      ${!mine ? `<button class="btn btn-ghost btn-block" id="pm-hide">Hide it from me</button>
      <button class="btn btn-ghost btn-block" id="pm-report">${icon('flag')}Report this post</button>` : ''}
    </div>`, { label: 'Post options' });
  s.el.querySelector('#pm-del')?.addEventListener('click', async () => {
    if (!await confirmSheet(mine ? 'Delete your post?' : 'Remove this post?', 'It will be removed for everyone in the group.', mine ? 'Delete' : 'Remove', true)) return;
    try { const x = await fs(); await withTimeout(x.f.deleteDoc(x.f.doc(x.db, 'groups', g.id, 'posts', p.id))); s.close(); toast('Removed'); ctx.rerender(); } catch { toast('We could not remove it right now. Please try again.'); }
  });
  s.el.querySelector('#pm-hide')?.addEventListener('click', () => { kvSet('hiddenPosts', [...kv('hiddenPosts', []), p.id]); s.close(); toast('Hidden. You won’t see this post again.'); ctx.rerender(); });
  s.el.querySelector('#pm-report')?.addEventListener('click', () => { s.close(); openReport(g, { targetUid: p.authorUid, targetName: p.authorName, postId: p.id, postText: p.text }); });
}

// ---------------- reports ----------------
const REASONS = ['Inappropriate or offensive', 'Harassing or threatening someone', 'Spam, selling or scams', 'Doesn’t belong in this group', 'Sharing someone’s private matter', 'Other'];
export function openReport(g, target) {
  let reason = '';
  const s = openSheet(`<h2 class="sheet-title">Report ${target.postId ? 'a post' : esc(target.targetName || 'this person')}</h2>
    <p class="lead">Your report goes to the group leaders and the Called to Pray team. ${target.postId ? 'The person who posted it will not see who reported it.' : 'They will not see who reported them.'}</p>
    <p class="hint" style="margin-top:14px">What is wrong?</p>
    <div class="chips">${REASONS.map(r => `<button class="chip chip-sm" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div>
    <label class="field"><span>Anything else we should know? (optional)</span><textarea id="r-text" data-dictate></textarea></label>
    <div class="btn-row"><button class="btn btn-gold" id="r-go">Send report</button></div>`, { label: 'Report' });
  wireDictation(s.el);
  $$('[data-r]', s.el).forEach(b => b.onclick = () => { reason = b.dataset.r; $$('[data-r]', s.el).forEach(x => x.classList.toggle('on', x === b)); });
  s.el.querySelector('#r-go').onclick = async () => {
    stopListening();
    if (!reason) return toast('Please choose what is wrong.');
    const rep = { targetUid: target.targetUid || '', targetName: target.targetName || '', postId: target.postId || '', postText: (target.postText || '').slice(0, 1000), reason, details: s.el.querySelector('#r-text').value.trim().slice(0, 2000), reporterUid: state.user?.uid || '', reporterName: state.profile.name || state.user?.displayName || '', status: 'open' };
    const rid = newId();
    try {
      const x = await fs(); const { doc, writeBatch, Timestamp } = x.f;
      const b = writeBatch(x.db);
      b.set(doc(x.db, 'groups', g.id, 'reports', rid), { ...rep, createdAt: Timestamp.now() });
      b.set(doc(x.db, 'reports', rid), { ...rep, groupId: g.id, groupName: g.name, createdAt: Timestamp.now() });
      await withTimeout(b.commit());
      if (target.postId) kvSet('hiddenPosts', [...kv('hiddenPosts', []), target.postId]);
      s.close(); toast('Thank you. Your report was sent.', 3200);
    } catch { toast('We could not send your report right now. Please try again.'); }
  };
}

// ---------------- leader settings ----------------
function groupSettings(g, done) {
  const s = openSheet(`<h2 class="sheet-title">Group settings</h2>
    <p class="lead">${esc(g.name)}</p>
    <div class="card" style="padding:4px 16px;margin-top:14px">
      <div class="toggle-row"><div class="tr-text"><strong>Leader approves new members</strong><small>Turn off to let everyone with the code join right away.</small></div><label class="switch"><input type="checkbox" id="st-appr" ${g.approval ? 'checked' : ''}><span></span></label></div>
      <div class="toggle-row"><div class="tr-text"><strong>Members can invite others</strong><small>Lets members share the group code.</small></div><label class="switch"><input type="checkbox" id="st-inv" ${g.allowInvites !== false ? 'checked' : ''}><span></span></label></div>
    </div>
    <div class="btn-row"><button class="btn btn-gold" id="st-save">Save</button></div>
    <h3 style="margin-top:24px">Code: ${esc(g.code || '')}</h3>
    <p class="hint">If your code was shared with people who shouldn’t have it, make a new one. The old code stops working. People already in the group stay in.</p>
    <button class="btn btn-ghost btn-block" id="st-code">${icon('refresh')}Make a new code</button>`, { label: 'Group settings' });
  s.el.querySelector('#st-save').onclick = async () => {
    const approval = s.el.querySelector('#st-appr').checked, allowInvites = s.el.querySelector('#st-inv').checked;
    try {
      const x = await fs(); const { doc, writeBatch } = x.f; const b = writeBatch(x.db);
      b.update(doc(x.db, 'groups', g.id), { approval, allowInvites });
      if (g.code) b.update(doc(x.db, 'codes', g.code), { approval });
      await withTimeout(b.commit()); Object.assign(g, { approval, allowInvites });
      s.close(); toast('Settings saved'); done();
    } catch { toast('We could not save right now. Please try again.'); }
  };
  s.el.querySelector('#st-code').onclick = async () => {
    if (!await confirmSheet('Make a new code?', 'The old code will stop working. You will need to share the new one.', 'Make new code')) return;
    const code = groupCode();
    try {
      const x = await fs(); const { doc, writeBatch } = x.f; const b = writeBatch(x.db);
      b.set(doc(x.db, 'codes', code), { groupId: g.id, name: g.name, church: g.church || '', type: g.type, typeName: g.typeName || '', approval: !!g.approval });
      if (g.code) b.delete(doc(x.db, 'codes', g.code));
      b.update(doc(x.db, 'groups', g.id), { code });
      await withTimeout(b.commit()); g.code = code;
      s.close(); toast('New code: ' + code, 4000); done();
    } catch { toast('We could not make a new code right now. Please try again.'); }
  };
}

function membersTab(body, g, members, ctx) {
  const active = members.filter(m => m.status === 'active'), pending = members.filter(m => m.status === 'pending'), blocked = members.filter(m => m.status === 'blocked');
  const row = m => {
    const tag = m.role === 'leader' ? 'Leader' : m.status === 'pending' ? 'Asked to join' : m.status === 'blocked' ? 'Blocked' : 'Member';
    let actions = '';
    if (m.uid !== ctx.me) {
      if (ctx.isLeader && m.status === 'pending') actions = `<button class="btn btn-gold btn-sm" data-approve="${esc(m.uid)}">Approve</button>`;
      actions += `<button class="btn btn-ghost btn-sm" data-mm="${esc(m.uid)}" aria-label="Options for ${esc(m.name || 'member')}">${icon('dots')}</button>`;
    }
    return `<div class="row" style="align-items:center;gap:8px"><span class="row-ic">${icon(m.role === 'leader' ? 'star' : m.status === 'blocked' ? 'ban' : 'user')}</span>
      <span class="row-main"><span class="row-title">${esc(m.name || 'Member')}${m.uid === ctx.me ? ' (you)' : ''}</span><span class="row-meta">${tag}</span></span>${actions}</div>`;
  };
  body.innerHTML = `<p class="purpose" style="margin-top:14px">The people in this group.${ctx.isLeader ? ' As a leader, you approve new people and can remove or block anyone.' : ' Tap the three dots next to a name to report a problem.'}</p>
    ${ctx.isLeader ? `<div id="reports"></div>` : ''}
    ${pending.length && ctx.isLeader ? `<h3 style="margin-top:12px">Waiting for your approval</h3><div class="list">${pending.map(row).join('')}</div>` : ''}
    <h3 style="margin-top:18px">${active.length} member${active.length === 1 ? '' : 's'}</h3><div class="list">${active.map(row).join('')}</div>
    ${blocked.length && ctx.isLeader ? `<h3 style="margin-top:18px">Blocked</h3><p class="hint">Blocked people can’t see the group or join again, even with the code.</p><div class="list">${blocked.map(row).join('')}</div>` : ''}
    ${!ctx.isLeader && state.user ? `<button class="btn btn-danger btn-block" id="leave" style="margin-top:24px">Leave group</button>` : ''}`;
  const f = () => fs();
  const setStatus = async (uid, patch, msg) => { try { const x = await f(); await withTimeout(x.f.updateDoc(x.f.doc(x.db, 'groups', g.id, 'members', uid), patch)); toast(msg); ctx.rerender(); } catch { toast('We could not do that right now. Please try again.'); } };
  $$('[data-approve]', body).forEach(b => b.onclick = () => setStatus(b.dataset.approve, { status: 'active' }, 'Approved'));
  $$('[data-mm]', body).forEach(b => b.onclick = () => {
    const m = members.find(x => x.uid === b.dataset.mm); if (!m) return;
    const leaders = members.filter(x => x.role === 'leader' && x.status === 'active').length;
    const L = ctx.isLeader;
    const s = openSheet(`<h2 class="sheet-title">${esc(m.name || 'Member')}</h2>
      <div style="display:grid;gap:10px;margin-top:14px">
        ${L && m.status === 'pending' ? `<button class="btn btn-gold btn-block" data-a="approve">Approve</button><button class="btn btn-ghost btn-block" data-a="decline">Decline</button>` : ''}
        ${L && m.status === 'active' && m.role !== 'leader' ? `<button class="btn btn-ghost btn-block" data-a="lead">${icon('star')}Make a co-leader</button>` : ''}
        ${L && m.status === 'active' && m.role === 'leader' && leaders > 1 ? `<button class="btn btn-ghost btn-block" data-a="unlead">No longer a leader</button>` : ''}
        ${L && m.status === 'active' && m.role !== 'leader' ? `<button class="btn btn-danger btn-block" data-a="remove">Remove from group</button>` : ''}
        ${L && m.status !== 'blocked' && m.role !== 'leader' ? `<button class="btn btn-danger btn-block" data-a="block">${icon('ban')}Block</button>` : ''}
        ${L && m.status === 'blocked' ? `<button class="btn btn-ghost btn-block" data-a="unblock">Unblock (they can ask to join again)</button>` : ''}
        ${m.status !== 'blocked' ? `<button class="btn btn-ghost btn-block" data-a="report">${icon('flag')}Report ${esc(m.name || 'this person')}</button>` : ''}
      </div>`, { label: 'Member options' });
    $$('[data-a]', s.el).forEach(x => x.onclick = async () => {
      const a = x.dataset.a;
      if (a === 'report') { s.close(); return openReport(g, { targetUid: m.uid, targetName: m.name }); }
      if (a === 'approve') { s.close(); return setStatus(m.uid, { status: 'active' }, 'Approved'); }
      if (a === 'lead') { s.close(); return setStatus(m.uid, { role: 'leader' }, `${m.name || 'They'} can now approve and manage members.`); }
      if (a === 'unlead') { s.close(); return setStatus(m.uid, { role: 'member' }, 'Updated'); }
      if (a === 'block') {
        if (!await confirmSheet(`Block ${m.name || 'this person'}?`, 'They will be taken out of the group and can’t join again, even with the code. You can unblock them later.', 'Block', true)) return;
        s.close(); return setStatus(m.uid, { status: 'blocked', role: 'member' }, 'Blocked');
      }
      if (a === 'remove' && !await confirmSheet('Remove this person?', 'They will no longer see this group. They could ask to join again with the code. To stop that, block them instead.', 'Remove', true)) return;
      s.close();
      try { const y = await f(); await withTimeout(y.f.deleteDoc(y.f.doc(y.db, 'groups', g.id, 'members', m.uid))); toast(a === 'unblock' ? 'Unblocked' : a === 'decline' ? 'Declined' : 'Removed'); ctx.rerender(); } catch { toast('We could not do that right now. Please try again.'); }
    });
  });
  body.querySelector('#leave')?.addEventListener('click', async () => {
    if (!await confirmSheet('Leave this group?', 'You can join again later with the code.', 'Leave', true)) return;
    try { const x = await f(); await withTimeout(x.f.deleteDoc(x.f.doc(x.db, 'groups', g.id, 'members', ctx.me))); await withTimeout(x.f.deleteDoc(x.f.doc(x.db, 'users', ctx.me, 'groups', g.id))); location.hash = '#/groups'; } catch { toast('We could not do that right now. Please try again.'); }
  });
  if (ctx.isLeader) loadReports(body.querySelector('#reports'), g, ctx);
}
async function loadReports(el, g, ctx) {
  if (!el) return;
  try {
    const x = await fs(); const { collection, getDocs, query, where } = x.f;
    const qs = await withTimeout(getDocs(query(collection(x.db, 'groups', g.id, 'reports'), where('status', '==', 'open'))));
    const reps = qs.docs.map(d => ({ id: d.id, ...d.data(), createdAt: toMs(d.data().createdAt) }));
    if (!reps.length) return;
    el.innerHTML = `<h3 style="margin-top:12px">Reports to review (${reps.length})</h3>${reps.map(r => `<div class="card" style="margin-top:10px">
      <p class="hint" style="margin:0">${fmtDate(r.createdAt)} · about ${esc(r.targetName || 'a member')}</p>
      <p style="margin:6px 0 0"><strong>${esc(r.reason)}</strong></p>
      ${r.postText ? `<p class="hint" style="white-space:pre-wrap">Post: “${esc(r.postText.length > 200 ? r.postText.slice(0, 200) + '…' : r.postText)}”</p>` : ''}
      ${r.details ? `<p class="hint" style="white-space:pre-wrap">${esc(r.details)}</p>` : ''}
      <div class="card-actions"><button class="btn btn-ghost btn-sm" data-done="${esc(r.id)}">${icon('check')}Mark reviewed</button></div></div>`).join('')}`;
    $$('[data-done]', el).forEach(b => b.onclick = async () => { try { await withTimeout(x.f.updateDoc(x.f.doc(x.db, 'groups', g.id, 'reports', b.dataset.done), { status: 'reviewed' })); ctx.rerender(); } catch { toast('Please try again.'); } });
  } catch (e) { console.info('Reports not available', e.code || e.message); }
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
