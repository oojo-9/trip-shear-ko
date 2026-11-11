'use strict';
const TABS = [['plan', '🗺️', '일정'], ['ledger', '🧾', '가계부'], ['fx', '💱', '환율'], ['photos', '📷', '사진'], ['settings', '⚙️', '설정']];
const myTrips = () => { try { return JSON.parse(localStorage.getItem('trips') || '[]'); } catch { return []; } };
const saveTrips = l => localStorage.setItem('trips', JSON.stringify(l));

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => { renderQueued = false; doRender(); });
}
function doRender() {
  const root = $('#app');
  if (!App.tripId) {
    const hm = $('.home'), ae = document.activeElement; // 첫 화면에서 입력하는 중이면 다시 그리지 않음
    return hm && hm.contains(ae) && ae.matches('input,select') ? null : renderHome(root);
  }
  if (!App.trip) { root.innerHTML = '<p class="empty">여행을 불러오는 중…</p>'; return; }
  if (!$('#view')) {
    root.innerHTML = `<header class="top"><button data-act="home" aria-label="여행 목록">‹</button><h1 id="tripname"></h1><button data-act="share" aria-label="공유">🔗</button></header>
      <main id="view"></main>
      <nav class="tabs">${TABS.map(([k, ic, nm]) => `<button data-act="tab" data-tab="${k}"><i>${ic}</i>${nm}</button>`).join('')}</nav>`;
  }
  $('#tripname').textContent = App.trip.name;
  $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === App.tab));
  const v = $('#view');
  if (App.tab === 'fx' && v.dataset.tab === 'fx') return Views.fx.update(); // 입력 중인 값 유지
  if (App.tab === 'settings' && v.dataset.tab === 'settings' && v.contains(document.activeElement) && document.activeElement.matches('input,select')) return;
  v.dataset.tab = App.tab;
  Views[App.tab].render(v);
}

function renderHome(root) {
  const list = myTrips();
  root.innerHTML = `<div class="home"><div class="hero"><img src="icon.svg" alt="" width="56" height="56"><h1>트립노트</h1><p>일정 · 가계부 · 환율 · 사진을 친구들과 한곳에서</p></div>
    ${list.length ? `<div class="card"><small>내 여행</small>${list.map(t => `<div class="trow"><button data-act="open" data-id="${t.id}"><b>${esc(t.name)}</b><small>${esc(t.dates || '')}</small></button><button class="x" data-act="forget" data-id="${t.id}" aria-label="목록에서 제거">✕</button></div>`).join('')}</div>` : ''}
    <form class="card" id="jointrip"><small>기존 여행 불러오기</small>
      <label>초대 링크 붙여넣기<input name="link" required placeholder="https://…/#t=…" autocomplete="off" autocapitalize="off"></label>
      <button class="primary alt wide">여행 열기</button></form>
    <form class="card" id="newtrip"><small>새 여행 만들기</small>
      <label>여행 이름<input name="name" required placeholder="예: 오사카 3박 4일"></label>
      <div class="row"><label>시작일<input type="date" name="start" required value="${today()}"></label><label>종료일<input type="date" name="end" required value="${today()}"></label></div>
      ${curPicker('JPY')}<small id="curhint" class="hint"></small>
      <label>함께 가는 사람 <small>(쉼표로 구분, 나중에 수정 가능)</small><input name="members" placeholder="예: 나, 민지, 수현"></label>
      <button class="primary wide">여행 만들기</button></form>
    <p class="mut small center">⚙️ 설정(영수증 인식 키, 친구 초대)은 여행을 만들거나 연 뒤 화면 아래 탭에 나타나요.</p>
    <p class="mut small center">${Store.cloud ? '친구에게 받은 초대 링크를 열면 그 여행이 자동으로 추가돼요.' : '현재 기기 저장 모드입니다. 친구와 공유하려면 README.md의 Firebase 설정을 따라 하세요.'}</p></div>`;
  // 초대 링크(또는 링크 끝의 20자리 코드)를 붙여넣어 기존 여행 열기
  $('#jointrip').onsubmit = e => {
    e.preventDefault();
    const v = e.target.elements.link.value.trim();
    const m = v.match(/#t=([a-z0-9]+)/) || v.match(/^([a-z0-9]{20})$/);
    if (!m) return toast('초대 링크가 아닌 것 같아요. 여행 화면의 🔗 버튼으로 복사한 링크를 붙여넣어 주세요.', 4500);
    openTrip(m[1]);
  };
  // 여행 이름에 나라·도시가 들어 있으면 통화 자동 추천 (직접 고른 뒤에는 건드리지 않음)
  const nf = $('#newtrip'), csel = nf.elements.currency;
  let picked = false;
  csel.onchange = () => { picked = true; $('#curhint').textContent = ''; };
  nf.elements.name.oninput = e => {
    const g = !picked && guessCur(e.target.value);
    if (!g) return;
    csel.value = g.cur;
    $('#curhint').textContent = `‘${g.kw}’ → ${g.cur} · ${curName(g.cur)} 자동 선택`;
  };
  $('#newtrip').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.end < f.start) return toast('종료일이 시작일보다 빨라요');
    if (savedGeminiKey()) f.geminiKey = savedGeminiKey(); // 기억해 둔 키를 새 여행에 자동 적용
    try { openTrip(await Store.createTrip(f)); } catch (err) { console.error(err); toast('여행을 만들지 못했어요: ' + err.message); }
  };
}

function closeTrip() {
  App.unsub.forEach(u => u()); App.unsub = [];
  Object.assign(App, { tripId: null, trip: null, places: [], expenses: [], photos: [], day: null, fx: null, tab: 'plan' });
}
function openTrip(id) {
  closeTrip();
  App.tripId = id;
  if (location.hash !== '#t=' + id) history.replaceState(null, '', '#t=' + id);
  App.unsub.push(Store.watchTrip(id, t => {
    if (!t) { toast('여행을 찾을 수 없어요. 링크를 확인해 주세요.', 4000); return goHome(); }
    App.trip = t;
    // Gemini 키 맞추기: 이 기기에만 있고 여행에 없으면 여행에 실어 멤버와 공유하고,
    // 여행에만 있고 이 기기에 없으면 기억해 둔다 (새 여행을 만들 때 자동 적용).
    const devKey = localStorage.getItem('geminiKey');
    if (!t.geminiKey && devKey) Store.updateTrip(id, { geminiKey: devKey }).catch(console.error);
    else if (t.geminiKey && !devKey) localStorage.setItem('geminiKey', t.geminiKey);
    saveTrips([{ id, name: t.name, dates: t.start ? `${t.start} ~ ${t.end || t.start}` : '' }, ...myTrips().filter(x => x.id !== id)]);
    render();
  }));
  for (const c of ['places', 'expenses', 'photos']) App.unsub.push(Store.watch(id, c, l => { App[c] = l; render(); }));
  render();
}
function goHome() { closeTrip(); history.replaceState(null, '', location.pathname); $('#app').innerHTML = ''; render(); }

Acts.home = goHome;
Acts.open = b => openTrip(b.dataset.id);
Acts.forget = b => { if (confirm('목록에서만 지웁니다. (데이터는 그대로 남아요)')) { saveTrips(myTrips().filter(t => t.id !== b.dataset.id)); render(); } };
Acts.tab = b => { App.tab = b.dataset.tab; window.scrollTo(0, 0); render(); };

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled && Acts[b.dataset.act]) Acts[b.dataset.act](b, e);
});
// 통화 검색창: 입력하면 바로 아래 선택 목록을 걸러 주고 첫 결과를 선택
document.addEventListener('input', e => {
  if (!e.target.matches('.cursearch')) return;
  const sel = e.target.closest('label').querySelector('select'), q = e.target.value.trim();
  const hits = q ? searchCurs(q) : null;
  if (hits && !hits.length) return;
  sel.innerHTML = hits ? curOptions(hits[0], hits) : curOptions(sel.value);
  sel.dispatchEvent(new Event('change'));
});
window.addEventListener('hashchange', () => { const m = location.hash.match(/^#t=([a-z0-9]+)/); if (m && m[1] !== App.tripId) openTrip(m[1]); });

(async function boot() {
  if (window.APP_LOCKED) return; // 비밀번호 화면(gate.js)이 떠 있는 동안에는 시작하지 않음
  try { await Store.init(); }
  catch (e) { console.error(e); $('#app').innerHTML = `<p class="empty">저장소를 열지 못했어요.<br>${esc(e.message)}</p>`; return; }
  Rates.load().then(render);
  Maps.load().then(ok => ok && render());
  const m = location.hash.match(/^#t=([a-z0-9]+)/);
  m ? openTrip(m[1]) : render();
})();
