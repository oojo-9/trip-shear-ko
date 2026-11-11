'use strict';
const App = { tripId: null, trip: null, places: [], expenses: [], photos: [], tab: 'plan', day: null, unsub: [], map: null, mapEl: null, overlays: [], fx: null };
const Acts = {};
const Views = {};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (n = 20) => [...crypto.getRandomValues(new Uint8Array(n))].map(x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
const pad = n => String(n).padStart(2, '0');
const won = n => Math.round(n || 0).toLocaleString('ko-KR') + '원';
const num = (n, d = 2) => Number(n || 0).toLocaleString('ko-KR', { maximumFractionDigits: d });
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayLabel = s => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`; };
const durText = sec => { const m = Math.max(1, Math.round(sec / 60)); return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ' ' + (m % 60) + '분' : ''}`; };

// 통화별 검색·자동추천 키워드 (나라, 주요 여행 도시). 여기 없는 통화도 환율 데이터에 있으면 목록에 나온다.
const CUR_KEYS = {
  JPY: '일본 도쿄 오사카 교토 후쿠오카 삿포로 오키나와 나고야 홋카이도 유후인 고베 나라 벳푸',
  USD: '미국 뉴욕 하와이 괌 사이판 로스앤젤레스 샌프란시스코 라스베이거스 시애틀 보스턴 시카고 워싱턴 올랜도 마이애미',
  EUR: '유럽 프랑스 파리 니스 독일 베를린 뮌헨 프랑크푸르트 이탈리아 로마 피렌체 베네치아 밀라노 나폴리 스페인 바르셀로나 마드리드 세비야 포르투갈 리스본 포르투 네덜란드 암스테르담 벨기에 브뤼셀 오스트리아 비엔나 잘츠부르크 그리스 아테네 산토리니 핀란드 헬싱키 아일랜드 더블린 크로아티아 두브로브니크 자그레브 몰타 에스토니아 탈린 라트비아 리투아니아 슬로바키아 슬로베니아 룩셈부르크 키프로스 불가리아',
  CNY: '중국 베이징 상하이 칭다오 장가계 광저우 선전 청두 하얼빈 시안 항저우',
  TWD: '대만 타이완 타이베이 가오슝 타이중 타이난',
  HKD: '홍콩', MOP: '마카오',
  THB: '태국 방콕 푸켓 치앙마이 파타야 끄라비 코사무이',
  VND: '베트남 다낭 하노이 호치민 나트랑 푸꾸옥 호이안 달랏 사파',
  PHP: '필리핀 세부 보라카이 마닐라 보홀 팔라완',
  SGD: '싱가포르', MYR: '말레이시아 쿠알라룸푸르 코타키나발루 페낭 랑카위',
  IDR: '인도네시아 발리 자카르타 롬복', GBP: '영국 런던 에든버러 맨체스터',
  AUD: '호주 시드니 멜버른 브리즈번 골드코스트 퍼스 케언즈', NZD: '뉴질랜드 오클랜드 퀸스타운',
  CAD: '캐나다 밴쿠버 토론토 몬트리올 퀘벡 밴프', CHF: '스위스 취리히 인터라켄 제네바 루체른 체르마트',
  CZK: '체코 프라하', HUF: '헝가리 부다페스트', PLN: '폴란드 바르샤바 크라쿠프', SEK: '스웨덴 스톡홀름', NOK: '노르웨이 오슬로 베르겐',
  DKK: '덴마크 코펜하겐', ISK: '아이슬란드 레이캬비크', RON: '루마니아 부쿠레슈티', RSD: '세르비아 베오그라드', GEL: '조지아 트빌리시',
  TRY: '튀르키예 터키 이스탄불 카파도키아 안탈리아', AED: '아랍에미리트 두바이 아부다비', QAR: '카타르 도하', SAR: '사우디아라비아 리야드',
  ILS: '이스라엘 예루살렘 텔아비브', JOD: '요르단 페트라 암만', EGP: '이집트 카이로', MAD: '모로코 마라케시 카사블랑카',
  ZAR: '남아공 남아프리카 케이프타운', KES: '케냐 나이로비', TZS: '탄자니아 잔지바르',
  INR: '인도 델리 뭄바이', NPR: '네팔 카트만두 포카라', LKR: '스리랑카 콜롬보', MVR: '몰디브',
  MNT: '몽골 울란바토르', KZT: '카자흐스탄 알마티', UZS: '우즈베키스탄 타슈켄트 사마르칸트',
  LAK: '라오스 비엔티안 루앙프라방 방비엥', KHR: '캄보디아 씨엠립 앙코르와트 프놈펜', MMK: '미얀마 양곤', BND: '브루나이',
  MXN: '멕시코 칸쿤 멕시코시티', BRL: '브라질 리우 상파울루', ARS: '아르헨티나 부에노스아이레스', CLP: '칠레 산티아고',
  PEN: '페루 쿠스코 마추픽추 리마', COP: '콜롬비아 보고타', FJD: '피지', XPF: '타히티 보라보라 뉴칼레도니아',
  RUB: '러시아 블라디보스토크 모스크바', KRW: '한국 대한민국 서울 부산 제주',
};
const curNamer = (() => { try { return new Intl.DisplayNames('ko', { type: 'currency' }); } catch { return null; } })();
const curName = c => { try { return (curNamer && curNamer.of(c)) || c; } catch { return c; } };
const allCurs = () => {
  const r = typeof Rates !== 'undefined' && Rates.data && Rates.data.rates;
  return [...Object.keys(CUR_KEYS), ...(r ? Object.keys(r).filter(c => !CUR_KEYS[c]).sort() : [])];
};
const curOptions = (sel, list = allCurs()) => (sel && !list.includes(sel) ? [sel, ...list] : list)
  .map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${c} · ${esc(curName(c))}</option>`).join('');
// 여행지 통화와 원화를 맨 위에 고정하고, 나머지는 그 아래에 이어서 보여 준다 (장소·지출 입력용)
function curOptionsPinned(sel) {
  const pins = [...new Set([App.trip && App.trip.currency, 'KRW'].filter(Boolean))];
  const rest = allCurs().filter(c => !pins.includes(c));
  if (sel && !pins.includes(sel) && !rest.includes(sel)) rest.unshift(sel);
  return `<optgroup label="자주 쓰는 통화">${curOptions(pins.includes(sel) ? sel : null, pins)}</optgroup><optgroup label="다른 통화">${curOptions(rest.includes(sel) ? sel : null, rest)}</optgroup>`;
}
// 코드·통화명·나라·도시로 검색
const searchCurs = q => { q = q.trim().toLowerCase(); return allCurs().filter(c => c.toLowerCase().includes(q) || curName(c).includes(q) || (CUR_KEYS[c] || '').includes(q)); };
// 글 안에 들어 있는 나라·도시 이름으로 통화 추천 (가장 긴 일치 우선: '인도네시아' > '인도')
function guessCur(text) {
  let best = null;
  for (const [cur, keys] of Object.entries(CUR_KEYS)) for (const kw of keys.split(' ')) if (text.includes(kw) && (!best || kw.length > best.kw.length)) best = { cur, kw };
  return best;
}
// 검색창이 달린 통화 선택 (검색 동작은 app.js의 input 이벤트에서 처리)
const curPicker = (sel, label = '현지 통화') => `<label>${label}<input class="cursearch" type="search" placeholder="나라·도시·통화 검색 (예: 발리, 헝가리, USD)" autocomplete="off"><select name="currency">${curOptions(sel)}</select></label>`;

function tripDays(t) {
  const out = [];
  if (!t || !t.start) return [today()];
  const d = parseYmd(t.start), end = parseYmd(t.end || t.start);
  for (let i = 0; i < 60 && d <= end; i++) { out.push(ymd(d)); d.setDate(d.getDate() + 1); }
  return out.length ? out : [t.start];
}

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.append(s); });
}

// 아래에서 올라오는 입력 창. onSubmit(data, dialog)이 false를 반환하면 닫지 않음.
function sheet(title, bodyHtml, { onSubmit, onDelete, submitLabel = '저장' } = {}) {
  const d = document.createElement('dialog');
  d.className = 'sheet';
  d.innerHTML = `<form><header><h3>${esc(title)}</h3><button type="button" class="x" data-x>✕</button></header>
    <div class="body">${bodyHtml}</div>
    <footer>${onDelete ? '<button type="button" class="danger" data-del>삭제</button>' : ''}${onSubmit ? `<button class="primary">${esc(submitLabel)}</button>` : ''}</footer></form>`;
  document.body.append(d);
  d.showModal();
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  $('[data-x]', d).onclick = () => d.close();
  if (onDelete) $('[data-del]', d).onclick = async () => { if (confirm('삭제할까요?')) { await onDelete(); d.close(); } };
  $('form', d).onsubmit = async e => {
    e.preventDefault();
    if (!onSubmit) return;
    try { if (await onSubmit(Object.fromEntries(new FormData(e.target)), d) !== false) d.close(); }
    catch (err) { console.error(err); toast('저장 실패: ' + err.message); }
  };
  return d;
}

// 이미지 파일 → 축소된 JPEG dataURL (maxChars 이하가 될 때까지 품질을 낮춤)
async function imageToJpeg(file, max, quality = 0.75, maxChars = 900000) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await createImageBitmap(file); }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let out = c.toDataURL('image/jpeg', quality);
  while (out.length > maxChars && quality > 0.3) { quality -= 0.1; out = c.toDataURL('image/jpeg', quality); }
  return out;
}

function pickFiles({ multiple = false, capture = false } = {}) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*'; i.multiple = multiple;
    if (capture) i.capture = 'environment';
    i.onchange = () => res([...i.files]);
    i.click();
  });
}

function download(name, href) { const a = document.createElement('a'); a.href = href; a.download = name; a.click(); }
