'use strict';
const CATS = { 식비: '🍜', 교통: '🚇', 숙소: '🏨', 관광: '🎟️', 쇼핑: '🛍️', 기타: '📦' };
const RES = ['미확인', '예약 필요', '예약 가능', '예약 불필요', '예약 완료'];
const MODES = [['transit', '🚇', '대중교통'], ['driving', '🚕', '택시·차량'], ['walking', '🚶', '도보']];
const MODE_COLOR = { transit: '#0f766e', driving: '#2563eb', walking: '#f59e0b' };
const put = (col, id, data) => Store.put(App.tripId, col, id, data);
const members = () => (App.trip.members || '').split(',').map(s => s.trim()).filter(Boolean);
const placesOf = day => App.places.filter(p => p.day === day).sort((a, b) => (a.order || 0) - (b.order || 0));

// ============================ 일정 ============================
function hoursToday(p, day) {
  const lines = (p.hours || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) return '';
  const wd = WD[parseYmd(day).getDay()] + '요일';
  const hit = lines.find(l => l.startsWith(wd));
  if (hit) return hit.replace(/^[^:]+:\s*/, '');
  return lines[0] + (lines.length > 1 ? ' …' : '');
}

Views.plan = {
  token: 0, fitKey: '',
  render(el) {
    const days = tripDays(App.trip);
    if (!days.includes(App.day)) App.day = days.includes(today()) ? today() : days[0];
    const list = placesOf(App.day);
    let h = `<div class="chips">${days.map((d, i) => `<button class="chip ${d === App.day ? 'on' : ''}" data-act="day" data-day="${d}"><b>Day ${i + 1}</b><small>${dayLabel(d)}</small></button>`).join('')}</div>
      <div id="mapslot"></div><div id="daysum" class="daysum"></div><div class="plist">`;
    list.forEach((p, i) => {
      const cost = Number(p.cost) > 0 ? `<span class="tag">💰 ${num(p.cost)} ${esc(p.costCur)}${p.costCur !== 'KRW' && Rates.krwPer(p.costCur) ? ` · 약 ${won(toKrw(p.cost, p.costCur))}` : ''}</span>` : '';
      const res = p.reservation && p.reservation !== '미확인' ? `<span class="tag res${RES.indexOf(p.reservation)}">${esc(p.reservation)}</span>` : '';
      const hrs = hoursToday(p, App.day);
      h += `<div class="pcard" data-act="editPlace" data-id="${p.id}">
        <div class="pnum">${i + 1}</div>
        <div class="pmain"><div class="pname">${esc(p.name)}${p.time ? `<span class="ptime">${esc(p.time)}</span>` : ''}</div>
          ${p.address ? `<div class="pmeta">📍 ${esc(p.address)}</div>` : ''}
          ${hrs ? `<div class="pmeta">🕘 ${esc(hrs)}</div>` : ''}
          ${res || cost ? `<div class="tags">${res}${cost}</div>` : ''}
          ${p.memo ? `<div class="pmeta memo">${esc(p.memo)}</div>` : ''}</div>
        <div class="pmove"><button data-act="movePlace" data-id="${p.id}" data-d="-1" ${i ? '' : 'disabled'} aria-label="위로">▲</button><button data-act="movePlace" data-id="${p.id}" data-d="1" ${i < list.length - 1 ? '' : 'disabled'} aria-label="아래로">▼</button></div>
      </div>`;
      const n = list[i + 1];
      if (n) {
        const sel = p.legMode || 'transit', has = p.lat != null && n.lat != null;
        h += `<div class="leg">${has ? MODES.map(([m, ic, nm]) => `<button class="mode ${m === sel ? 'on' : ''}" data-act="legMode" data-id="${p.id}" data-mode="${m}" title="${nm}">${ic} <span data-leg="${p.id}-${m}">…</span></button>`).join('') : '<span class="mut">위치 정보가 없어 계산 불가</span>'}
          <a class="gm" href="${Maps.dirLink(p, n, sel)}" target="_blank" rel="noopener">경로 ↗</a></div>`;
      }
    });
    if (!list.length) h += `<p class="empty">이 날 일정이 비어 있어요.<br>아래 버튼으로 장소를 추가해 보세요.</p>`;
    h += `</div><button class="primary wide" data-act="addPlace">＋ 장소 추가</button>`;
    el.innerHTML = h;
    this.mountMap(list);
    this.fillLegs(list);
  },
  mountMap(list) {
    const slot = $('#mapslot');
    if (!Maps.ready) {
      slot.innerHTML = `<div class="notice">🗺️ ${Maps.key ? '구글 지도를 불러오지 못했어요. 키 설정을 확인하세요.' : '구글 지도 키를 넣으면 여기에 지도와 핀이 표시됩니다. (설정 탭 참고)'}<br><small>지금은 이동시간이 직선거리 기준 추정치로 표시돼요.</small></div>`;
      return;
    }
    if (!App.mapEl) {
      App.mapEl = document.createElement('div'); App.mapEl.className = 'map';
      App.map = new google.maps.Map(App.mapEl, { center: { lat: 37.5665, lng: 126.978 }, zoom: 11, mapTypeControl: false, streetViewControl: false });
    }
    slot.append(App.mapEl);
    App.overlays.forEach(o => o.setMap(null)); App.overlays = [];
    const pts = list.filter(p => p.lat != null);
    list.forEach((p, i) => {
      if (p.lat == null) return;
      const mk = new google.maps.Marker({ position: { lat: p.lat, lng: p.lng }, map: App.map, title: p.name, label: { text: String(i + 1), color: '#fff', fontWeight: '700' } });
      mk.addListener('click', () => placeForm(p));
      App.overlays.push(mk);
    });
    const key = App.day + '|' + pts.map(p => p.id).join(',');
    if (key !== this.fitKey && pts.length) {
      this.fitKey = key;
      if (pts.length === 1) { App.map.setCenter({ lat: pts[0].lat, lng: pts[0].lng }); App.map.setZoom(14); }
      else { const b = new google.maps.LatLngBounds(); pts.forEach(p => b.extend({ lat: p.lat, lng: p.lng })); App.map.fitBounds(b, 48); }
    }
  },
  async fillLegs(list) {
    const tk = ++this.token, jobs = [];
    let total = 0, est = false;
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1];
      if (a.lat == null || b.lat == null) continue;
      const sel = a.legMode || 'transit';
      for (const [m] of MODES) jobs.push(Maps.route(a, b, m, App.day).then(r => {
        if (tk !== this.token) return;
        const s = $(`[data-leg="${a.id}-${m}"]`);
        if (s) s.textContent = (r.est ? '약 ' : '') + durText(r.sec);
        if (m !== sel) return;
        total += r.sec; est = est || r.est;
        if (Maps.ready) {
          const path = r.poly ? google.maps.geometry.encoding.decodePath(r.poly) : [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }];
          App.overlays.push(new google.maps.Polyline({ path, map: App.map, strokeColor: MODE_COLOR[m], strokeWeight: 4, strokeOpacity: r.poly ? 0.85 : 0.5 }));
        }
      }));
    }
    await Promise.all(jobs);
    if (tk !== this.token || !$('#daysum')) return;
    const cost = list.reduce((s, p) => s + toKrw(p.cost, p.costCur), 0);
    $('#daysum').innerHTML = list.length ? `<span>📍 ${list.length}곳</span>${total ? `<span>🕒 이동 ${durText(total)}</span>` : ''}${cost ? `<span>💰 예상 약 ${won(cost)}</span>` : ''}${est ? '<small>‘약’ 표시는 직선거리 기준 추정치</small>' : ''}` : '';
  },
};

function placeForm(p = {}) {
  const days = tripDays(App.trip);
  const d = sheet(p.id ? '장소 수정' : '장소 추가', `
    ${Maps.ready ? `<label>장소 검색 <small>(선택하면 주소·영업시간이 자동 입력)</small><input id="psearch" placeholder="예: 센소지, 루브르 박물관" autocomplete="off"></label><div id="psugg" class="sugg"></div>` : ''}
    <label>이름<input name="name" required value="${esc(p.name)}"></label>
    <label>주소<input name="address" value="${esc(p.address)}"></label>
    <div class="row"><label>날짜<select name="day">${days.map((x, i) => `<option value="${x}" ${x === (p.day || App.day) ? 'selected' : ''}>Day ${i + 1} · ${dayLabel(x)}</option>`).join('')}</select></label>
      <label>방문 시간<input type="time" name="time" value="${esc(p.time)}"></label></div>
    <label>영업시간 (오픈–마감)<textarea name="hours" rows="3" placeholder="예: 09:00–18:00, 월요일 휴무">${esc(p.hours)}</textarea></label>
    <label>예약<select name="reservation">${RES.map(r => `<option ${r === (p.reservation || '미확인') ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <div class="row"><label>비용 (1인)<input name="cost" type="number" step="any" min="0" inputmode="decimal" value="${esc(p.cost)}"></label>
      <label>통화<select name="costCur">${curOptionsPinned(p.costCur || App.trip.currency)}</select></label></div>
    <label>메모<textarea name="memo" rows="2">${esc(p.memo)}</textarea></label>
    ${p.mapsUrl ? `<a class="link" href="${esc(p.mapsUrl)}" target="_blank" rel="noopener">구글 지도에서 보기 ↗</a>` : ''}
    <input type="hidden" name="lat" value="${p.lat ?? ''}"><input type="hidden" name="lng" value="${p.lng ?? ''}">
    <input type="hidden" name="placeId" value="${esc(p.placeId)}"><input type="hidden" name="mapsUrl" value="${esc(p.mapsUrl)}">`, {
    onSubmit: async f => {
      const data = { ...f, lat: f.lat === '' ? null : Number(f.lat), lng: f.lng === '' ? null : Number(f.lng), cost: f.cost === '' ? '' : Number(f.cost) };
      if (!p.id || p.day !== f.day) data.order = Date.now();
      await put('places', p.id, data);
    },
    onDelete: p.id ? () => Store.remove(App.tripId, 'places', p.id) : null,
  });
  const inp = $('#psearch', d);
  if (!inp) return;
  let timer, seq = 0;
  inp.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = inp.value.trim(), box = $('#psugg', d), my = ++seq;
      if (q.length < 2) { box.innerHTML = ''; return; }
      try {
        const list = await Maps.suggest(q);
        if (my !== seq) return;
        box.innerHTML = '';
        list.slice(0, 5).forEach(s => {
          const b = document.createElement('button');
          b.type = 'button'; b.innerHTML = `<b>${esc(s.main)}</b><small>${esc(s.sub)}</small>`;
          b.onclick = async () => {
            box.innerHTML = '<p class="mut">정보 불러오는 중…</p>';
            try {
              const x = await Maps.details(s.pred), f = $('form', d).elements;
              for (const k of ['name', 'address', 'lat', 'lng', 'placeId', 'mapsUrl']) f[k].value = x[k] ?? '';
              if (x.hours) f.hours.value = x.hours;
              if (x.reservable && f.reservation.value === '미확인') f.reservation.value = '예약 가능';
              if (x.price && !f.memo.value) f.memo.value = '가격대: ' + x.price;
              inp.value = ''; box.innerHTML = '';
            } catch (e) { console.error(e); box.innerHTML = '<p class="mut">장소 정보를 불러오지 못했어요.</p>'; }
          };
          box.append(b);
        });
      } catch (e) { console.error(e); box.innerHTML = '<p class="mut">검색 실패 — Places API (New) 사용 설정을 확인하세요.</p>'; }
    }, 350);
  };
}

Acts.day = b => { App.day = b.dataset.day; render(); };
Acts.addPlace = () => placeForm();
Acts.editPlace = b => placeForm(App.places.find(p => p.id === b.dataset.id));
Acts.legMode = b => put('places', b.dataset.id, { legMode: b.dataset.mode });
Acts.movePlace = async b => {
  const list = placesOf(App.day), i = list.findIndex(p => p.id === b.dataset.id), j = i + Number(b.dataset.d);
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(list.map((p, k) => p.order === k ? null : put('places', p.id, { order: k })));
};

// ============================ 가계부 ============================
Views.ledger = {
  render(el) {
    const ex = [...App.expenses].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
    const total = ex.reduce((s, e) => s + (e.krw || 0), 0);
    const byCat = {}; ex.forEach(e => byCat[e.category] = (byCat[e.category] || 0) + (e.krw || 0));
    const mem = members();
    let h = `<div class="card total"><small>총 지출</small><strong>${won(total)}</strong>
      <div class="bars">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="bar"><span>${CATS[c] || '📦'} ${esc(c)}</span><i><u style="width:${total ? v / total * 100 : 0}%"></u></i><b>${won(v)}</b></div>`).join('')}</div></div>
      <div class="row2"><button class="primary" data-act="addExpense">＋ 직접 입력</button><button class="primary alt" data-act="scanReceipt">📷 영수증 스캔</button></div>`;
    if (mem.length > 1 && total) {
      const share = total / mem.length;
      h += `<div class="card"><small>정산 (1인당 ${won(share)})</small>${mem.map(m => {
        const paid = ex.filter(e => e.payer === m).reduce((s, e) => s + (e.krw || 0), 0), diff = paid - share;
        return `<div class="settle"><span>${esc(m)}</span><span class="mut">낸 돈 ${won(paid)}</span><b class="${diff >= 0 ? 'plus' : 'minus'}">${diff >= 0 ? '받을 돈 ' : '보낼 돈 '}${won(Math.abs(diff))}</b></div>`;
      }).join('')}</div>`;
    }
    let cur = '';
    ex.forEach(e => {
      if (e.date !== cur) { cur = e.date; h += `<h4 class="dhead">${e.date ? dayLabel(e.date) : '날짜 없음'}</h4>`; }
      h += `<div class="erow" data-act="editExpense" data-id="${e.id}"><span class="eic">${CATS[e.category] || '📦'}</span>
        <div class="emain"><b>${esc(e.title)}</b><small>${esc(e.category)} · ${e.method === 'card' ? '카드' : '현금'}${e.payer ? ' · ' + esc(e.payer) : ''}</small></div>
        <div class="eamt"><b>${won(e.krw)}</b>${e.currency !== 'KRW' ? `<small>${num(e.amount)} ${esc(e.currency)}</small>` : ''}</div></div>`;
    });
    if (!ex.length) h += `<p class="empty">아직 지출이 없어요.<br>영수증을 찍으면 금액이 자동으로 입력됩니다.</p>`;
    el.innerHTML = h;
  },
};

function expenseForm(e = {}) {
  const mem = members(), t = App.trip;
  const cur0 = e.currency || t.currency || 'KRW';
  const d = sheet(e.id ? '지출 수정' : '지출 입력', `
    ${e._scanned ? '<p class="notice ok">📷 영수증에서 읽은 내용이에요. 맞는지 확인 후 저장하세요.</p>' : ''}
    <label>내용<input name="title" required value="${esc(e.title)}" placeholder="예: 점심 라멘"></label>
    <div class="row"><label>금액<input name="amount" type="number" step="any" min="0" inputmode="decimal" required value="${esc(e.amount)}"></label>
      <label>통화<select name="currency">${curOptionsPinned(cur0)}</select></label></div>
    <div class="row"><label>결제수단<select name="method"><option value="cash" ${e.method !== 'card' ? 'selected' : ''}>현금</option><option value="card" ${e.method === 'card' ? 'selected' : ''}>카드 (수수료 포함)</option></select></label>
      <label>적용 환율 (1단위=원)<input name="rate" type="number" step="any" value="${e.rate || +Rates.krwPer(cur0).toFixed(4) || ''}"></label></div>
    <label>원화 금액 <small>(자동 계산 · 실제 청구액으로 고쳐도 됨)</small><input name="krw" type="number" step="1" required value="${e.krw ?? ''}"></label>
    <div class="row"><label>날짜<input name="date" type="date" required value="${esc(e.date || (tripDays(t).includes(today()) ? today() : App.day || today()))}"></label>
      <label>분류<select name="category">${Object.keys(CATS).map(c => `<option ${c === (e.category || '식비') ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
    ${mem.length ? `<label>결제한 사람<select name="payer">${mem.map(m => `<option ${m === (e.payer || localStorage.getItem('payer')) ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>` : ''}
    <label>메모<input name="memo" value="${esc(e.memo)}"></label>`, {
    onSubmit: async f => {
      if (f.payer) localStorage.setItem('payer', f.payer);
      await put('expenses', e.id, { ...f, amount: Number(f.amount), rate: Number(f.rate), krw: Math.round(Number(f.krw)), createdAt: e.createdAt || Date.now() });
    },
    onDelete: e.id ? () => Store.remove(App.tripId, 'expenses', e.id) : null,
  });
  const f = $('form', d).elements;
  const calc = () => { f.krw.value = Math.round(Number(f.amount.value || 0) * Number(f.rate.value || 0) * (f.method.value === 'card' && f.currency.value !== 'KRW' ? cardFactor(t) : 1)) || ''; };
  f.currency.onchange = () => { f.rate.value = +Rates.krwPer(f.currency.value).toFixed(4) || ''; calc(); };
  f.amount.oninput = f.rate.oninput = f.method.onchange = calc;
  if (e.krw == null) calc();
}

Acts.addExpense = () => expenseForm();
Acts.editExpense = b => expenseForm(App.expenses.find(e => e.id === b.dataset.id));
Acts.scanReceipt = async () => {
  if (!savedGeminiKey(App.trip)) { toast('설정 탭에서 Gemini API 키를 먼저 입력해 주세요.', 4000); return; }
  const [file] = await pickFiles();
  if (!file) return;
  toast('영수증 읽는 중…', 30000);
  try {
    const r = await Ocr.scan(await imageToJpeg(file, 1600, 0.8, 3e6), App.trip);
    toast('읽기 완료');
    const cur = allCurs().includes(r.currency) ? r.currency : App.trip.currency;
    expenseForm({ _scanned: true, title: [r.store, r.summary].filter(Boolean).join(' · ') || '영수증', amount: r.total ?? '', currency: cur, date: r.date || undefined, category: CATS[r.category] ? r.category : '기타', method: r.payment === 'card' ? 'card' : 'cash' });
  } catch (e) { console.error(e); toast('영수증을 읽지 못했어요: ' + e.message, 5000); expenseForm(); }
};

// ============================ 환율 ============================
Views.fx = {
  render(el) {
    const t = App.trip, s = App.fx = App.fx || { cur: t.currency && t.currency !== 'KRW' ? t.currency : 'USD', amt: '', krw: '' };
    const r = Rates.data;
    el.innerHTML = `<div class="card"><div class="fxhead"><small>${r ? `${r.day} 오전 9시 기준 환율${r.stale ? ' (갱신 실패 — 이전 값 사용 중)' : ''}` : '환율을 불러오지 못했어요 (인터넷 연결 확인)'}</small><button class="mini" data-act="fxRefresh">새로고침</button></div>
        <label><input class="cursearch" type="search" placeholder="나라·도시·통화 검색" autocomplete="off"><select id="fxcur">${curOptions(s.cur).replace(/<option value="KRW".*?<\/option>/, '')}</select></label>
        <p class="fxrate" id="fxrate"></p></div>
      <div class="card"><label>현지 금액<input id="fxamt" type="number" step="any" inputmode="decimal" placeholder="0" value="${esc(s.amt)}"></label>
        <div class="fxres"><div><small>기준환율</small><strong id="fxbase">0원</strong></div><div><small>💳 카드 결제 시 (예상)</small><strong id="fxcard">0원</strong><em id="fxdiff"></em></div></div></div>
      <div class="card"><label>거꾸로: 원화 예산 → 현지 금액<input id="fxkrw" type="number" inputmode="numeric" placeholder="예: 50000" value="${esc(s.krw)}"></label><p class="fxrate" id="fxrev"></p></div>
      <div class="card"><small>카드 수수료 설정 (여행 멤버와 공유)</small>
        <div class="row"><label>해외결제 수수료 %<input id="fxfee" type="number" step="0.01" value="${t.cardFeePct ?? 1.4}"></label><label>환율 가산(전신환) %<input id="fxspread" type="number" step="0.01" value="${t.cardSpreadPct ?? 1}"></label></div>
        <p class="mut small">보통 국제브랜드 1.0~1.1% + 카드사 0.2~0.3%, 그리고 카드사는 기준환율보다 약 1% 높은 전신환매도율을 적용합니다. 트래블카드처럼 수수료가 없으면 둘 다 0으로 두세요.</p></div>
      <div class="card"><small>빠른 환산표</small><div id="fxtable" class="fxtable"></div></div>
      <p class="mut small center">시장 중간 환율(참고용)이라 은행 고시 환율·실제 청구액과 조금 다를 수 있어요.</p>`;
    $('#fxcur').onchange = e => { s.cur = e.target.value; this.update(); };
    $('#fxamt').oninput = e => { s.amt = e.target.value; this.update(); };
    $('#fxkrw').oninput = e => { s.krw = e.target.value; this.update(); };
    $('#fxfee').onchange = e => Store.updateTrip(App.tripId, { cardFeePct: Number(e.target.value) || 0 });
    $('#fxspread').onchange = e => Store.updateTrip(App.tripId, { cardSpreadPct: Number(e.target.value) || 0 });
    this.update();
  },
  update() {
    if (!$('#fxamt')) return;
    const s = App.fx, per = Rates.krwPer(s.cur), cf = cardFactor(App.trip);
    const unit = per && per < 20 ? 100 : 1; // 엔·동처럼 단위가 작은 통화는 100단위로 표시
    $('#fxrate').textContent = per ? `${unit} ${s.cur} = ${num(per * unit)}원` : '이 통화의 환율 정보가 없어요';
    const base = (Number(s.amt) || 0) * per;
    $('#fxbase').textContent = won(base);
    $('#fxcard').textContent = won(base * cf);
    $('#fxdiff').textContent = base ? `수수료 약 +${won(base * (cf - 1))} (${num((cf - 1) * 100)}%)` : '';
    $('#fxrev').textContent = s.krw && per ? `≈ ${num(Number(s.krw) / per, per > 100 ? 2 : 0)} ${s.cur} (카드로 쓰면 약 ${num(Number(s.krw) / per / cf, per > 100 ? 2 : 0)} ${s.cur}어치)` : '';
    const steps = per >= 500 ? [1, 5, 10, 20, 50, 100] : per >= 20 ? [10, 50, 100, 200, 500, 1000] : per >= 1 ? [100, 500, 1000, 3000, 5000, 10000] : [10000, 50000, 100000, 200000, 500000, 1000000];
    $('#fxtable').innerHTML = steps.map(v => `<div><span>${num(v)} ${s.cur}</span><b>${won(v * per)}</b><small>카드 ${won(v * per * cf)}</small></div>`).join('');
  },
};
Acts.fxRefresh = async () => { await Rates.load(true); toast(Rates.data && !Rates.data.stale ? '환율을 새로 받아왔어요' : '환율을 받아오지 못했어요'); Views.fx.render($('#view')); };

// ============================ 사진첩 ============================
const sortedPhotos = () => [...App.photos].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0));
const fullPhoto = async id => { const f = await Store.get(App.tripId, 'photofull', id); return f ? f.data : (App.photos.find(p => p.id === id) || {}).thumb; };

Views.photos = {
  render(el) {
    const ps = sortedPhotos();
    let h = `<div class="row2"><button class="primary" data-act="addPhotos">＋ 사진 추가</button><button class="primary alt" data-act="slideshow" ${ps.length ? '' : 'disabled'}>▶ 슬라이드쇼</button></div>
      <button class="wide ghost" data-act="book">📖 여행북 만들기 (PDF)</button>`;
    let cur = null;
    ps.forEach(p => {
      if (p.date !== cur) { if (cur !== null) h += '</div>'; cur = p.date; h += `<h4 class="dhead">${p.date ? dayLabel(p.date) : '날짜 없음'}</h4><div class="grid">`; }
      h += `<button class="ph" data-act="viewPhoto" data-id="${p.id}"><img src="${p.thumb}" alt="${esc(p.caption || '사진')}" loading="lazy">${p.caption ? `<span>${esc(p.caption)}</span>` : ''}</button>`;
    });
    if (cur !== null) h += '</div>';
    if (!ps.length) h += `<p class="empty">여행 사진을 모아 두면<br>여행북(PDF)과 슬라이드쇼로 만들 수 있어요.</p>`;
    el.innerHTML = h;
  },
};
Acts.addPhotos = async () => {
  const files = await pickFiles({ multiple: true });
  if (!files.length) return;
  const days = tripDays(App.trip);
  let n = 0;
  for (const f of files) {
    toast(`사진 저장 중… (${++n}/${files.length})`, 20000);
    try {
      const id = uid(), taken = ymd(new Date(f.lastModified || Date.now()));
      await put('photofull', id, { data: await imageToJpeg(f, 1280, 0.72) });
      await put('photos', id, { thumb: await imageToJpeg(f, 360, 0.6), date: days.includes(taken) ? taken : App.day || days[0], caption: '', createdAt: Date.now() + n });
    } catch (e) { console.error(e); toast('저장 실패: ' + f.name); }
  }
  toast('사진을 저장했어요');
};
Acts.viewPhoto = async b => {
  const p = App.photos.find(x => x.id === b.dataset.id);
  const d = sheet('사진', `<img class="full" src="${p.thumb}" alt="">
    <label>한 줄 메모<input name="caption" value="${esc(p.caption)}" placeholder="여행북에 함께 실려요"></label>
    <label>날짜<input type="date" name="date" value="${esc(p.date)}"></label>
    <button type="button" class="ghost wide" data-dl>원본 크기로 내려받기</button>`, {
    onSubmit: f => put('photos', p.id, f),
    onDelete: async () => { await Store.remove(App.tripId, 'photos', p.id); await Store.remove(App.tripId, 'photofull', p.id); },
  });
  const src = await fullPhoto(p.id);
  if (d.isConnected) { $('img.full', d).src = src; $('[data-dl]', d).onclick = () => download(`trip-${p.date || 'photo'}-${p.id.slice(0, 4)}.jpg`, src); }
};
Acts.slideshow = async () => {
  const ps = sortedPhotos();
  const o = document.createElement('div'); o.className = 'slides';
  o.innerHTML = `<img alt=""><p></p><small>화면을 누르면 닫혀요</small>`;
  document.body.append(o);
  let i = 0, alive = true;
  o.onclick = () => { alive = false; o.remove(); };
  while (alive) {
    const p = ps[i % ps.length], src = await fullPhoto(p.id);
    if (!alive) break;
    const img = $('img', o);
    img.classList.remove('in'); img.src = src; void img.offsetWidth; img.classList.add('in');
    $('p', o).textContent = [p.date ? dayLabel(p.date) : '', p.caption].filter(Boolean).join(' · ');
    await new Promise(r => setTimeout(r, 3500));
    i++;
  }
};

// ============================ 여행북 ============================
Acts.book = async () => {
  toast('여행북 만드는 중…', 20000);
  const t = App.trip, days = tripDays(t), ps = sortedPhotos();
  const full = Object.fromEntries(await Promise.all(ps.map(async p => [p.id, await fullPhoto(p.id)])));
  const total = App.expenses.reduce((s, e) => s + (e.krw || 0), 0);
  const byCat = {}; App.expenses.forEach(e => byCat[e.category] = (byCat[e.category] || 0) + (e.krw || 0));
  const pics = list => list.length ? `<div class="bpics">${list.map(p => `<figure><img src="${full[p.id]}" alt="">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`).join('')}</div>` : '';
  let h = `<div class="btools noprint"><button class="primary" id="bprint">🖨️ PDF로 저장 / 인쇄</button><button class="ghost" id="bclose">닫기</button><small>인쇄 창에서 ‘PDF로 저장’을 고르세요.</small></div>
    <section class="bcover">${ps[0] ? `<img src="${full[ps[0].id]}" alt="">` : ''}<h1>${esc(t.name)}</h1><p>${t.start ? `${t.start} ~ ${t.end || t.start}` : ''}</p>${members().length ? `<p>${esc(members().join(' · '))}</p>` : ''}</section>`;
  days.forEach((d, i) => {
    const pl = placesOf(d), ph = ps.filter(p => p.date === d);
    if (!pl.length && !ph.length) return;
    const spent = App.expenses.filter(e => e.date === d).reduce((s, e) => s + (e.krw || 0), 0);
    h += `<section class="bday"><h2>Day ${i + 1} <small>${dayLabel(d)}</small></h2>
      ${pl.length ? `<ol>${pl.map(p => `<li><b>${esc(p.name)}</b>${p.time ? ` <i>${esc(p.time)}</i>` : ''}${p.address ? `<br><small>${esc(p.address)}</small>` : ''}${p.memo ? `<br><small>${esc(p.memo)}</small>` : ''}</li>`).join('')}</ol>` : ''}
      ${spent ? `<p class="bspent">이 날 쓴 돈 ${won(spent)}</p>` : ''}${pics(ph)}</section>`;
  });
  const rest = ps.filter(p => !days.includes(p.date));
  if (rest.length) h += `<section class="bday"><h2>그 밖의 순간들</h2>${pics(rest)}</section>`;
  if (total) h += `<section class="bday"><h2>여행 경비</h2><table>${Object.entries(byCat).map(([c, v]) => `<tr><td>${CATS[c] || ''} ${esc(c)}</td><td>${won(v)}</td></tr>`).join('')}<tr class="sum"><td>합계</td><td>${won(total)}</td></tr></table></section>`;
  const b = document.createElement('div'); b.id = 'book'; b.innerHTML = h;
  document.body.append(b); document.body.classList.add('booking');
  toast('여행북이 준비됐어요');
  $('#bprint').onclick = () => window.print();
  $('#bclose').onclick = () => { b.remove(); document.body.classList.remove('booking'); };
};

// ============================ 설정 ============================
Views.settings = {
  render(el) {
    const t = App.trip;
    el.innerHTML = `<div class="card"><small>친구 초대</small><p class="mut small">${Store.cloud ? '아래 링크를 받은 친구는 같은 일정·가계부·사진을 함께 보고 수정할 수 있어요. 링크를 아는 사람은 누구나 수정할 수 있으니 믿는 사람에게만 보내세요.' : '지금은 <b>이 기기에만 저장</b>되는 모드예요. config.js에 Firebase 설정을 넣으면 링크로 친구와 실시간 공유됩니다. (README.md 참고)'}</p>
        <button class="primary wide" data-act="share" ${Store.cloud ? '' : 'disabled'}>🔗 초대 링크 복사</button></div>
      <form class="card" id="setform"><small>여행 정보</small>
        <label>여행 이름<input name="name" required value="${esc(t.name)}"></label>
        <div class="row"><label>시작일<input type="date" name="start" required value="${esc(t.start)}"></label><label>종료일<input type="date" name="end" required value="${esc(t.end)}"></label></div>
        ${curPicker(t.currency)}
        <label>함께 가는 사람 <small>(쉼표로 구분 — 가계부 정산에 사용)</small><input name="members" value="${esc(t.members)}" placeholder="예: 나, 민지, 수현"></label>
        <small>영수증 인식 (Gemini)</small>
        <label>Gemini API 키 <small>(한 번 넣으면 이 기기에 기억 · 이 여행 멤버와 공유됨)</small><input name="geminiKey" type="password" autocomplete="off" value="${esc(savedGeminiKey(t))}" placeholder="aistudio.google.com/apikey 에서 발급"></label>
        <label>모델<input name="geminiModel" value="${esc(t.geminiModel || 'gemini-flash-latest')}"></label>
        <button class="primary wide">저장</button></form>
      <div class="card"><small>연결 상태</small>
        <p class="stat">${Maps.ready ? '✅' : '⚪'} 구글 지도 ${Maps.ready ? '연결됨' : Maps.key ? '불러오기 실패' : '키 없음 (config.js)'}</p>
        <p class="stat">${Store.cloud ? '✅ 실시간 공유 (Firebase)' : '⚪ 기기 저장 모드 (공유 안 됨)'}</p>
        <p class="stat">${savedGeminiKey(t) ? '✅' : '⚪'} 영수증 인식 ${savedGeminiKey(t) ? '사용 가능' : '키 없음'}</p>
        <p class="stat">${Rates.data ? '✅ 환율 ' + Rates.data.day + ' 기준' : '⚪ 환율 없음'}</p></div>
      <div class="row2"><button class="ghost" data-act="backup">백업 파일 저장</button><button class="ghost" data-act="home">다른 여행 보기</button></div>`;
    $('#setform').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (f.end < f.start) return toast('종료일이 시작일보다 빨라요');
      if (f.geminiKey) localStorage.setItem('geminiKey', f.geminiKey); else localStorage.removeItem('geminiKey');
      await Store.updateTrip(App.tripId, f); toast('저장했어요');
    };
  },
};
Acts.share = async () => {
  const url = location.href.split('#')[0] + '#t=' + App.tripId;
  try { if (navigator.share) await navigator.share({ title: App.trip.name, url }); else { await navigator.clipboard.writeText(url); toast('초대 링크를 복사했어요'); } }
  catch { prompt('이 링크를 복사해서 보내세요', url); }
};
Acts.backup = () => {
  const { geminiKey, ...trip } = App.trip;
  download(`${App.trip.name}-backup.json`, URL.createObjectURL(new Blob([JSON.stringify({ trip, places: App.places, expenses: App.expenses }, null, 2)], { type: 'application/json' })));
};
