/**
 * 갓생 살자! 手機通知＋Email 提醒（Google Apps Script）
 * 不用開網頁，也會照 App 裡的設定跳手機通知、寄 Email 給你：
 *   1. 每天晚上「明天預告」（時間跟 App 設定頁一樣，預設 21:00）
 *   2. 週日晚上「下週預告」
 *   （行程、待辦的個別提醒預設不寄，要的話到 App 設定頁勾選）
 * 安裝步驟請看「安裝說明.md」。裝好後只要執行一次 setup。
 */
const PROJECT_ID = 'careeveryday-c49fc';
const APP_URL = 'https://shinju-ruby.github.io/careeveryday/';
const TZ = 'Asia/Taipei';
const EXTRA_TO = '';   // 想同時寄給別人（例如先生），在這裡填 Email，多個用逗號隔開

// ===== 安裝：手動執行一次 =====
function setup(){
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(10).create();
  const db = loadDb();
  const n = sendPush_('✅ 設定完成', '之後每天晚上會在這裡跳出明天預告 🎉');
  MailApp.sendEmail({to: myEmail_(), subject: '✅ 갓생 살자! Email 提醒設定完成',
    htmlBody: wrap_('設定完成 🎉', '之後每 10 分鐘會檢查一次，時間到就通知你。\n\n手機通知：' + (PUSH_TOKENS.length ? '已送出測試通知到 ' + n + ' 支手機' : '還沒有手機開啟通知（到 App 設定按「開啟這支手機的通知」，再執行一次 setup）') + '\n\n目前讀到：行程 ' + db.events.length + ' 個、待辦 ' + db.todos.length + ' 件、紀念日 ' + (db.anniv||[]).length + ' 個。\n\n下面是明天預告的樣子：\n\n' + dayReport(addD(todayT(), 1), '明天'))});
}
// 想先看看會寄什麼：執行 preview
function preview(){ Logger.log(dailyText()); Logger.log(weeklyText()); Logger.log(daySummary(addD(todayT(), 1))); }
// 只想測試手機通知：執行 testPush
function testPush(){ loadDb(); Logger.log('送出 ' + sendPush_('🔔 測試通知', '看到這則就代表手機通知正常 👍') + ' 則'); }

// ===== 每 10 分鐘執行 =====
function tick(){
  const db = loadDb(); DB = db;
  const st = db.settings || {}, mail = st.mail || {}, props = PropertiesService.getScriptProperties();
  const t = todayT(), hm = Utilities.formatDate(new Date(), TZ, 'HH:mm'), now = Date.now();
  const sent = JSON.parse(props.getProperty('sent') || '[]'); let changed = false;
  const mark = k => { sent.push(k); changed = true; }, was = k => sent.indexOf(k) >= 0;
  // 固定提醒
  const parts = [];
  // 早上：今天的安排（設定時間後 4 小時內才送，避免太晚才補送）
  const mins = x => { const p = String(x).split(':'); return (+p[0])*60 + (+p[1]||0); };
  const mo = st.morning || {on:true, time:'10:00'};
  if(mail.morning !== false && mo.on && hm >= mo.time && mins(hm) - mins(mo.time) < 240 && !was('morning:'+t)){
    mark('morning:'+t); sendPush_('☀️ 今天的安排', daySummary(t));
    if(mail.email !== false) send_('☀️ 今天的安排', dayReport(t, '今天') + '\n\n' + progressReport());
  }
  if(mail.daily !== false && st.daily && st.daily.on && hm >= st.daily.time && !was('daily:'+t)){ mark('daily:'+t); parts.push('daily'); }
  if(mail.weekly !== false && st.weekly && st.weekly.on && wday(t) === ([0,5,6].indexOf(+st.weekly.day) >= 0 ? +st.weekly.day : 0) && hm >= st.weekly.time && !was('weekly:'+t)){ mark('weekly:'+t); parts.push('weekly'); }
  if(parts.length){
    const w = parts.indexOf('weekly') >= 0;
    const dl = parts.indexOf('daily') >= 0;
    const title = w ? '🗓️ 下週預告' : '🌙 明天預告';
    sendPush_(title, w ? weekSummary() + (dl ? '\n' + daySummary(addD(t,1)) : '') : daySummary(addD(t,1)));
    if(mail.email !== false) send_(title, w && dl ? weekReport(1) + '\n\n' + dailyText() : w ? weeklyText() : dailyText());
  }
  // 行程、待辦的個別提醒
  if(mail.items === true){   // 預設不寄個別提醒，到 App 設定勾選才會寄
    const items = [];
    [t, addD(t,1)].forEach(d => db.events.forEach(ev => {
      if(!(ev.remind >= 0) || !occurs(ev, d)) return;
      const at = Date.parse(d + 'T' + (ev.time || '09:00') + ':00+08:00'), fire = at - ev.remind*60000, k = 'ev:' + ev.id + ':' + d;
      if(now >= fire && now < at + 3600000 && !was(k)){ mark(k); items.push('📅 ' + ev.title + '\n   ' + pretty(d) + ' ' + (ev.time || '全天') + (ev.note ? '（' + ev.note + '）' : '')); }
    }));
    db.todos.forEach(td => {
      if(td.done || !td.remindAt) return;
      const at = Date.parse(td.remindAt + (td.remindAt.length === 16 ? ':00' : '') + '+08:00'), k = 'td:' + td.id + ':' + td.remindAt;
      if(now >= at && now < at + 86400000 && !was(k)){ mark(k); items.push('✅ ' + td.title + (td.due ? '\n   期限 ' + pretty(td.due) : '') + (td.steps.length ? '，進度 ' + progress(td) + '%' : '')); }
    });
    if(items.length) sendPush_('🔔 提醒', items.join('\n'));
    if(items.length && mail.email !== false) send_('🔔 提醒：' + items[0].split('\n')[0].replace(/^\S+\s/, '') + (items.length > 1 ? ' 等 ' + items.length + ' 項' : ''), items.join('\n\n'));
  }
  if(changed) props.setProperty('sent', JSON.stringify(sent.slice(-300)));
  familyActivity_(props);
}

// ===== 家人動態：家人新增或修改共用資料時，推播給其他人 =====
function familyActivity_(props){
  if(!SPACE_DOC) return;
  let acts = []; try{ acts = JSON.parse(fv_(SPACE_DOC, 'activity') || '[]'); }catch(e){ acts = []; }
  const last = acts.length ? acts[acts.length - 1].t : 0, seen = +(props.getProperty('actSeen') || 0);
  if(!seen){ props.setProperty('actSeen', String(last || Date.now())); return; }   // 第一次執行：舊的不推
  const fresh = acts.filter(a => a.t > seen); if(!fresh.length) return;
  MEMBERS.forEach(m => {
    if(m.off || !m.tokens.length) return;
    const mine = fresh.filter(a => a.uid !== m.uid); if(!mine.length) return;
    const lines = []; mine.forEach(a => a.items.forEach(x => lines.push(a.by + '：' + x)));
    pushTo_(m.tokens, '👨‍👩‍👧 家人動態', lines.slice(0, 6).join('\n') + (lines.length > 6 ? '\n…還有 ' + (lines.length - 6) + ' 項' : ''));
  });
  props.setProperty('actSeen', String(last));
}

// ===== 讀取 App 資料（Firestore） =====
let DB = null;
function fsGet_(path){
  const r = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents/' + path,
    {headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT_ID}, muteHttpExceptions: true});
  if(r.getResponseCode() !== 200) throw new Error('讀取 Firestore 失敗（' + r.getResponseCode() + '）：' + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText());
}
const fv_ = (doc, k) => doc.fields && doc.fields[k] && doc.fields[k].stringValue;
let PUSH_TOKENS = [], SPACE_DOC = null, MEMBERS = [];
const tokens_ = d => ((d.fields && d.fields.pushTokens && d.fields.pushTokens.arrayValue.values) || []).map(v => v.stringValue).filter(Boolean);
function loadDb(){
  const me = myEmail_().toLowerCase(); let pageToken = '', mine = null; const all = [];
  do{
    const res = fsGet_('users?pageSize=100' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
    (res.documents || []).forEach(d => { all.push(d); if((fv_(d, 'email') || '').toLowerCase() === me) mine = d; });
    pageToken = res.nextPageToken || '';
  } while(pageToken);
  if(!mine) throw new Error('找不到你的資料。請先用 ' + me + ' 登入一次網頁版 App（新版會記下 Email），再執行一次。');
  const space = fv_(mine, 'space'), doc = space ? fsGet_('spaces/' + space) : mine;
  // 手機通知：自己的手機，加上同一個家庭空間裡有開啟通知的家人
  PUSH_TOKENS = tokens_(mine);
  if(space) all.forEach(d => { if(d !== mine && fv_(d, 'space') === space) PUSH_TOKENS = PUSH_TOKENS.concat(tokens_(d)); });
  PUSH_TOKENS = PUSH_TOKENS.filter((x, i, a) => a.indexOf(x) === i);
  SPACE_DOC = space ? doc : null; MEMBERS = [];
  if(space) all.forEach(d => { if(fv_(d, 'space') !== space) return; let st = {}; try{ st = JSON.parse(fv_(d, 'json') || '{}').settings || {}; }catch(e){}
    MEMBERS.push({uid: (d.name || '').split('/').pop(), tokens: tokens_(d), off: st.notifyFamily === false}); });
  // 新版：個人資料（提醒設定、作業）在自己的帳號，共用資料（行程、待辦、紀念日）在家庭空間
  const pj = JSON.parse(fv_(mine, 'json') || '{}'), sj = space ? JSON.parse(fv_(doc, 'json') || '{}') : pj;
  const d = Object.assign({}, sj, {settings: pj.settings || sj.settings, hwBy: pj.hwBy});
  if(space){ d.events = sj.events; d.todos = sj.todos; d.anniv = sj.anniv; }
  d.events = d.events || []; d.todos = (d.todos || []).map(x => Object.assign({steps: [], pri: 'mid'}, x)); d.settings = d.settings || {};
  DB = d; return d;
}
function myEmail_(){ return Session.getEffectiveUser().getEmail(); }

// ===== 手機通知 =====
function sendPush_(title, body){ return pushTo_(PUSH_TOKENS, title, body); }
function pushTo_(tokens, title, body){
  let ok = 0;
  tokens.forEach(token => {
    const r = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + PROJECT_ID + '/messages:send', {method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT_ID},
      payload: JSON.stringify({message: {token: token, webpush: {notification: {title: title, body: body.slice(0, 600), icon: APP_URL + 'icons/icon-192.png'}, fcm_options: {link: APP_URL}}}})});
    if(r.getResponseCode() === 200) ok++; else console.log('手機通知失敗（' + r.getResponseCode() + '）：' + r.getContentText().slice(0, 300));
  });
  return ok;
}
function daySummary(ds){
  const evs = eventsOn(ds), tds = DB.todos.filter(td => !td.done && td.due === ds), hs = holidaysOn(ds);
  let out = pretty(ds) + '：' + (evs.length ? '行程 ' + evs.length + ' 個' : '沒有行程') + '、' + (tds.length ? '待辦 ' + tds.length + ' 件' : '沒有到期待辦');
  if(hs.length) out += '\n' + hs.join('、');
  if(evs.length) out += '\n' + evs.slice(0, 3).map(e => (e.time || '全天') + ' ' + e.title).join('、');
  if(tds.length) out += '\n✅ ' + tds.slice(0, 3).map(t => t.title).join('、');
  return out;
}
function weekSummary(){
  const r = weekRange(1), evs = eventsBetween(r[0], r[1]), tds = DB.todos.filter(x => !x.done && x.due && x.due >= r[0] && x.due <= r[1]);
  const hs = []; for(let d = r[0]; d <= r[1]; d = addD(d,1)) holidaysOn(d).forEach(h => hs.push(md(d) + ' ' + h));
  return '下週 ' + md(r[0]) + '～' + md(r[1]) + '：行程 ' + evs.length + ' 個、待辦 ' + tds.length + ' 件' + (hs.length ? '\n' + hs.join('、') : '');
}

// ===== 寄信 =====
function send_(subject, text){
  MailApp.sendEmail({to: myEmail_() + (EXTRA_TO ? ',' + EXTRA_TO : ''), subject: subject + '｜갓생 살자!', body: text + '\n\n' + APP_URL, htmlBody: wrap_(subject, text)});
}
function wrap_(title, text){
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return '<div style="font-family:sans-serif;max-width:560px;margin:auto;border:3px solid #1d1d35;border-radius:18px;overflow:hidden">'
    + '<div style="background:#FF6B3D;color:#fff;padding:16px 20px"><div style="font-size:22px;font-weight:900">갓생 살자!</div><div style="font-size:16px;font-weight:700">' + esc(title) + '</div></div>'
    + '<div style="padding:16px 20px;font-size:15px;line-height:1.7;white-space:pre-wrap;color:#1d1d35">' + esc(text) + '</div>'
    + '<div style="padding:0 20px 20px"><a href="' + APP_URL + '" style="display:inline-block;background:#FFC93C;color:#1d1d35;border:2px solid #1d1d35;border-radius:999px;padding:8px 18px;font-weight:900;text-decoration:none">打開 App →</a></div></div>';
}

// ===== 日期工具（全部用台灣時間的 yyyy-mm-dd 字串） =====
const WD = ['日','一','二','三','四','五','六'];
function todayT(){ return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
const toN = ds => { const p = ds.split('-').map(Number); return Date.UTC(p[0], p[1]-1, p[2]) / 864e5; };
const fromN = n => new Date(n * 864e5).toISOString().slice(0, 10);
const addD = (ds, k) => fromN(toN(ds) + k);
const wday = ds => new Date(toN(ds) * 864e5).getUTCDay();
const md = ds => +ds.slice(5,7) + '/' + +ds.slice(8,10);
const pretty = ds => md(ds) + '（' + WD[wday(ds)] + '）';
const mondayOf = ds => addD(ds, -((wday(ds) + 6) % 7));
function weekRange(off){ const s = addD(mondayOf(todayT()), off*7); return [s, addD(s, 6)]; }

// ===== 行程、待辦（和 App 同樣的規則） =====
function occurs(ev, d){
  if(d < ev.date) return false;
  if(!ev.repeat) return d === ev.date;
  if(ev.until && d > ev.until) return false;
  if(ev.skip && ev.skip.indexOf(d) >= 0) return false;
  switch(ev.repeat){
    case 'daily': return true;
    case 'weekly': case 'biweekly': {
      const days = ev.days && ev.days.length ? ev.days : [wday(ev.date)];
      if(days.indexOf(wday(d)) < 0) return false;
      return ev.repeat === 'weekly' || Math.round((toN(mondayOf(d)) - toN(mondayOf(ev.date))) / 7) % 2 === 0;
    }
    case 'monthly': return d.slice(8) === ev.date.slice(8);
    case 'yearly': return d.slice(5) === ev.date.slice(5);
  }
  return false;
}
const evSort = (a,b) => (a.time || '').localeCompare(b.time || '');
const eventsOn = d => DB.events.filter(e => occurs(e, d)).map(e => Object.assign({}, e, {date: d})).sort(evSort);
function eventsBetween(a, b){ const out = []; for(let d = a; d <= b; d = addD(d,1)) out.push.apply(out, eventsOn(d)); return out; }
const PRI_ORDER = {high:0, mid:1, low:2};
const progress = t => t.steps.length ? Math.round(t.steps.filter(s => s.done).length / t.steps.length * 100) : (t.done ? 100 : 0);
const startOf = t => t.start || (t.due && t.createdAt && Utilities.formatDate(new Date(t.createdAt), TZ, 'yyyy-MM-dd') > t.due ? t.due : (t.createdAt ? Utilities.formatDate(new Date(t.createdAt), TZ, 'yyyy-MM-dd') : t.due));
const isLate = t => !t.done && t.due && t.due < todayT();
const tdSort = (a,b) => (a.done - b.done) || (a.due || '9999').localeCompare(b.due || '9999') || (PRI_ORDER[a.pri] || 1) - (PRI_ORDER[b.pri] || 1);
const listTodos = arr => arr.map(t => '  • ' + (t.tag ? '[' + t.tag + '] ' : '') + t.title + (t.due ? '（' + pretty(t.due) + '）' : '') + (t.steps.length ? ' 進度 ' + progress(t) + '%' : '') + (t.pri === 'high' ? ' 🔥' : '')).join('\n');
const listEvents = (arr, withDate) => arr.map(e => '  • ' + (withDate ? pretty(e.date) + ' ' : '') + (e.time || '全天') + ' ' + e.title).join('\n');
function nextStep(t){ const s = t.steps.find(x => !x.done); return s ? '「' + t.title + '」的下一步：' + s.title : '「' + t.title + '」'; }

function dayReport(ds, label){
  const t = todayT(), evs = eventsOn(ds);
  const tds = DB.todos.filter(td => !td.done && td.due && (td.due === ds || (ds === t && td.due < t))).sort(tdSort);
  const active = DB.todos.filter(td => !td.done && td.due && startOf(td) <= ds && td.due > ds).sort(tdSort);
  let out = '【' + label + ' ' + pretty(ds) + '】' + (lunarFull(ds) ? ' ' + lunarFull(ds) : '') + '\n';
  const hs = holidaysOn(ds); if(hs.length) out += hs.join('、') + '\n';
  out += evs.length ? '📅 行程 ' + evs.length + ' 個：\n' + listEvents(evs) + '\n' : '📅 沒有行程\n';
  out += tds.length ? '🎯 要完成 ' + tds.length + ' 件：\n' + listTodos(tds) + '\n' : '🎯 沒有到期的待辦\n';
  if(active.length) out += '🏃 進行中 ' + active.length + ' 件：\n' + listTodos(active) + '\n';
  const pick = tds.find(x => x.pri === 'high') || tds[0] || active[0];
  out += pick ? '\n建議先做：' + nextStep(pick) : '\n很輕鬆的一天，可以整理一下靈感 ✨';
  return out;
}
function weekReport(offset){
  const r = weekRange(offset), ws = r[0], we = r[1], label = offset === 0 ? '本週' : '下週';
  const evs = eventsBetween(ws, we);
  const wk = DB.todos.filter(x => x.due && x.due >= ws && x.due <= we).sort(tdSort), open = wk.filter(x => !x.done);
  let out = '【' + label + ' ' + pretty(ws) + ' ～ ' + pretty(we) + '】\n';
  const hs = []; for(let d = ws; d <= we; d = addD(d,1)) holidaysOn(d).forEach(h => hs.push(md(d) + ' ' + h));
  if(hs.length) out += hs.join('、') + '\n';
  out += evs.length ? '📅 行程 ' + evs.length + ' 個：\n' + listEvents(evs, true) + '\n' : '📅 沒有行程\n';
  out += open.length ? '🎯 要完成 ' + open.length + ' 件：\n' + listTodos(open) + '\n' : '🎯 沒有待完成的事\n';
  if(wk.length) out += '\n整體進度：' + Math.round(wk.reduce((a,x) => a + progress(x), 0) / wk.length) + '%（' + (wk.length - open.length) + '/' + wk.length + ' 件全部完成）';
  return out;
}
function progressReport(){
  const r = weekRange(0), ws = r[0], we = r[1];
  const wk = DB.todos.filter(x => x.due && x.due >= ws && x.due <= we);
  const od = DB.todos.filter(isLate).sort(tdSort);
  const doing = DB.todos.filter(x => !x.done && x.steps.length && progress(x) > 0).sort((a,b) => progress(b) - progress(a));
  let out = '【進度報告】\n';
  out += wk.length ? '本週到期 ' + wk.length + ' 件，整體進度 ' + Math.round(wk.reduce((a,x) => a + progress(x), 0) / wk.length) + '%\n' : '本週沒有到期的事\n';
  if(doing.length) out += '🏃 做到一半的：\n' + doing.map(x => '  • ' + x.title + ' ' + progress(x) + '%（' + x.steps.filter(s => s.done).length + '/' + x.steps.length + ' 步）').join('\n') + '\n';
  out += od.length ? '⚠️ 已逾期 ' + od.length + ' 件：\n' + listTodos(od) + '\n' : '👍 沒有逾期的事\n';
  const open = DB.todos.filter(x => !x.done).sort(tdSort);
  out += open.length ? '\n下一步建議：' + nextStep(od[0] || open[0]) : '\n全部完成，太厲害了！🎉';
  return out;
}
function dailyText(){ if(!DB) loadDb(); return dayReport(addD(todayT(), 1), '明天') + '\n\n' + progressReport(); }
function weeklyText(){ if(!DB) loadDb(); return weekReport(1) + '\n\n' + progressReport(); }

// ===== 農曆、節日、紀念日（和 App 同一份農曆表） =====
const LUNAR_TBL = '53x.0.10r,5dr.0.237,5nl.4.2vp,5y9.0.1be,683.0.251,6hy.2.1x1,6sm.0.xi,72g.6.432,7d4.0.21a,7my.0.2li,7ws.5.5ra,87g.0.2mr,8hb.0.14a,8r5.3.2ne,91t.0.1v1,9bo.b.1ul,9mc.0.x9,9w6.0.219,a60.6.56z,ago.0.2lh,aqi.0.2mq,b0c.5.5ec,bb0.0.28q,bkv.0.12l,buq.2.1uj,c5e.0.wr,cf8.7.42f,cpw.0.217,czq.0.23p,d9k.5.4h1,dk8.0.1ci,du2.0.256,e3x.3.246,eel.0.1tj,eog.8.1tb,ez4.0.wn,f8y.0.18r,fis.6.2mi,ftf.0.2w5,g3a.0.1be,gd4.4.48c,gns.0.23y,gxn.0.1ta'.split(',').map(x => { const p = x.split('.'); return {o: parseInt(p[0],36), leap: parseInt(p[1],16), b: parseInt(p[2],36)}; });
function lunarOf(ds){ const n = toN(ds) - Date.UTC(2000,0,1)/864e5;
  for(let i = LUNAR_TBL.length - 1; i >= 0; i--){ const t = LUNAR_TBL[i]; if(n < t.o) continue;
    const cnt = t.leap ? 13 : 12; let off = n - t.o;
    for(let k = 0; k < cnt; k++){ const len = (t.b >> (cnt-1-k)) & 1 ? 30 : 29;
      if(off < len){ let m = k+1, leap = false; if(t.leap){ if(k === t.leap){ m = t.leap; leap = true; } else if(k > t.leap) m = k; } return {m: m, d: off+1, leap: leap}; }
      off -= len; }
    return null; }
  return null; }
const LMN = ['','正','二','三','四','五','六','七','八','九','十','冬','臘'], LDN = ['','一','二','三','四','五','六','七','八','九','十'];
const lunarDay = d => d <= 10 ? '初' + LDN[d] : d < 20 ? '十' + LDN[d-10] : d === 20 ? '二十' : d < 30 ? '廿' + LDN[d-20] : '三十';
function lunarFull(ds){ const l = lunarOf(ds); return l ? '農曆' + (l.leap ? '閏' : '') + LMN[l.m] + '月' + lunarDay(l.d) : ''; }
const SOLAR_FEST = {'1-1':'元旦','2-14':'情人節','2-28':'和平紀念日','3-8':'婦女節','4-4':'兒童節','5-1':'勞動節','8-8':'父親節','9-28':'教師節','10-10':'國慶日','10-25':'光復節','10-31':'萬聖節','12-25':'聖誕節'};
const LUNAR_FEST = {'1-1':'春節','1-15':'元宵節','5-5':'端午節','7-7':'七夕','7-15':'中元節','8-15':'中秋節','9-9':'重陽節'};
function holidaysOn(ds){
  const y = +ds.slice(0,4), m = +ds.slice(5,7), d = +ds.slice(8,10), out = [];
  const l = lunarOf(ds), nx = lunarOf(addD(ds,1)), isLast = l && !l.leap && l.d >= 29 && nx && nx.d === 1;
  (DB.anniv || []).forEach(a => {
    const hit = a.lunar ? (l && !l.leap && l.m === a.m && (l.d === a.d || (isLast && a.d > l.d))) : (m === a.m && d === a.d);
    if(hit) out.push((a.emoji || '🎂') + ' ' + a.name);
  });
  const f = SOLAR_FEST[m + '-' + d]; if(f) out.push('🎉 ' + f);
  if(m === 4 && d === ((y % 4) <= 1 ? 4 : 5)) out.push('🎉 清明節');
  if(m === 5 && wday(ds) === 0 && d > 7 && d <= 14) out.push('🎉 母親節');
  if(l && !l.leap){ const lf = LUNAR_FEST[l.m + '-' + l.d]; if(lf) out.push('🎉 ' + lf); if(l.m === 12 && isLast) out.push('🎉 除夕'); }
  return out;
}
