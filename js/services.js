'use strict';
// ===================== 환율 =====================
// 한국시간 오전 9시를 기준으로 하루 한 번만 받아와 그날 종일 같은 값으로 계산한다.
const Rates = {
  data: null,
  dayKey() {
    const k = new Date(Date.now() + 9 * 3600e3); // KST를 UTC 필드로 읽기
    if (k.getUTCHours() < 9) k.setUTCDate(k.getUTCDate() - 1);
    return k.toISOString().slice(0, 10);
  },
  async load(force) {
    let c = null;
    try { c = JSON.parse(localStorage.getItem('fx') || 'null'); } catch {}
    const day = this.dayKey();
    if (c && c.day === day && !force) return (this.data = c);
    try {
      const rates = await this.fetchRates();
      this.data = { day, at: Date.now(), rates };
      localStorage.setItem('fx', JSON.stringify(this.data));
    } catch (e) {
      console.warn('fx fetch failed', e);
      this.data = c ? { ...c, stale: true } : null;
    }
    return this.data;
  },
  // rates[cur] = 1원당 해당 통화 금액
  async fetchRates() {
    try {
      const j = await (await fetch('https://open.er-api.com/v6/latest/KRW')).json();
      if (j.result === 'success') return j.rates;
      throw new Error('er-api');
    } catch {
      const j = await (await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/krw.json')).json();
      return Object.fromEntries(Object.entries(j.krw).map(([k, v]) => [k.toUpperCase(), v]));
    }
  },
  krwPer(cur) { // 1 단위 통화 = 몇 원
    if (cur === 'KRW') return 1;
    const r = this.data && this.data.rates && this.data.rates[cur];
    return r ? 1 / r : 0;
  },
};
const toKrw = (amt, cur) => (Number(amt) || 0) * Rates.krwPer(cur || 'KRW');
const cardFactor = t => (1 + (t.cardSpreadPct ?? 1) / 100) * (1 + (t.cardFeePct ?? 1.4) / 100);

// ===================== 구글 지도 =====================
const Maps = {
  key: (window.APP_CONFIG || {}).googleMapsKey || '',
  ready: false, session: null, cache: {}, routesOff: false,
  async load() {
    if (!this.key) return false;
    try { this.cache = JSON.parse(localStorage.getItem('routes') || '{}'); } catch {}
    window.gm_authFailure = () => toast('구글 지도 키 인증에 실패했어요. 키와 사용 설정을 확인하세요.', 6000);
    try {
      await new Promise((res, rej) => {
        window.__gmReady = res;
        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(this.key)}&v=weekly&loading=async&language=ko&libraries=places,geometry&callback=__gmReady`;
        s.onerror = rej; document.head.append(s);
      });
      await Promise.all(['maps', 'places', 'geometry'].map(l => google.maps.importLibrary(l)));
      this.ready = true;
    } catch (e) { console.warn('maps load failed', e); }
    return this.ready;
  },
  async suggest(input) {
    const P = google.maps.places;
    this.session = this.session || new P.AutocompleteSessionToken();
    const { suggestions } = await P.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken: this.session, language: 'ko' });
    return suggestions.filter(s => s.placePrediction).map(s => {
      const p = s.placePrediction;
      return { main: String(p.mainText || p.text), sub: String(p.secondaryText || ''), pred: p };
    });
  },
  async details(pred) {
    const place = pred.toPlace();
    const base = ['displayName', 'formattedAddress', 'location', 'googleMapsURI'];
    try { await place.fetchFields({ fields: [...base, 'regularOpeningHours', 'isReservable', 'priceLevel'] }); }
    catch (e) { console.warn('extended place fields failed', e); await place.fetchFields({ fields: base }); }
    this.session = null;
    const priceKo = { FREE: '무료', INEXPENSIVE: '저렴', MODERATE: '보통', EXPENSIVE: '비쌈', VERY_EXPENSIVE: '매우 비쌈' };
    return {
      name: place.displayName || '', address: place.formattedAddress || '',
      lat: place.location ? place.location.lat() : null, lng: place.location ? place.location.lng() : null,
      placeId: place.id || '', mapsUrl: place.googleMapsURI || '',
      hours: ((place.regularOpeningHours && place.regularOpeningHours.weekdayDescriptions) || []).join('\n'),
      reservable: place.isReservable, price: priceKo[place.priceLevel] || '',
    };
  },
  haversine(a, b) {
    const R = 6371000, r = x => x * Math.PI / 180;
    const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  },
  // API를 못 쓸 때: 직선거리 기반 추정
  estimate(a, b, mode) {
    const d = this.haversine(a, b);
    const sec = mode === 'walking' ? d * 1.3 / 1.3 : mode === 'driving' ? d * 1.4 / 7 + 180 : d * 1.4 / 5.5 + 480;
    return { sec, m: d, est: true };
  },
  // 대중교통은 출발 시각이 필요 → 여행 날짜(지났으면 같은 요일의 다음 날짜) 현지 오전 10시쯤으로 계산
  departure(day, lng) {
    const d = parseYmd(day);
    let t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 10) - Math.round(lng / 15) * 3600e3;
    while (t < Date.now() + 600e3) t += 7 * 86400e3;
    return new Date(t).toISOString();
  },
  async apiRoute(a, b, mode, day) {
    const loc = p => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    const body = { origin: loc(a), destination: loc(b), travelMode: { transit: 'TRANSIT', driving: 'DRIVE', walking: 'WALK' }[mode], languageCode: 'ko' };
    if (mode === 'transit') body.departureTime = this.departure(day, b.lng);
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const e = new Error('routes ' + res.status); e.status = res.status; throw e; }
    const r = ((await res.json()).routes || [])[0];
    if (!r || !r.duration) return null; // 경로 없음
    return { sec: parseInt(r.duration, 10), m: r.distanceMeters || 0, poly: r.polyline && r.polyline.encodedPolyline };
  },
  route(a, b, mode, day) {
    const k = [a.lat, a.lng, b.lat, b.lng].map(x => x.toFixed(5)).join(',') + ',' + mode;
    if (this.cache[k]) return Promise.resolve(this.cache[k]);
    return (this.cache[k] = (async () => {
      let r = null;
      if (this.key && !this.routesOff) {
        try { r = await this.apiRoute(a, b, mode, day); }
        catch (e) {
          console.warn(e);
          if (e.status === 403 || e.status === 400) { this.routesOff = true; toast('Routes API를 쓸 수 없어 이동시간을 추정치로 표시합니다.', 5000); }
        }
      }
      if (r) {
        this.cache[k] = r;
        try { localStorage.setItem('routes', JSON.stringify(Object.fromEntries(Object.entries(this.cache).filter(([, v]) => v && v.sec && !v.est).slice(-300)))); } catch {}
        return r;
      }
      return (this.cache[k] = this.estimate(a, b, mode));
    })());
  },
  dirLink(a, b, mode) {
    const q = p => p.lat != null ? `${p.lat},${p.lng}` : encodeURIComponent(p.name);
    return `https://www.google.com/maps/dir/?api=1&origin=${q(a)}&destination=${q(b)}&travelmode=${mode}`;
  },
};

// ===================== 영수증 OCR (Gemini) =====================
// 키는 여행에 저장된 값이 우선, 없으면 이 기기에 기억해 둔 값을 쓴다.
const savedGeminiKey = trip => (trip && trip.geminiKey) || localStorage.getItem('geminiKey') || '';
const Ocr = {
  async scan(dataUrl, trip) {
    const key = savedGeminiKey(trip);
    if (!key) throw new Error('NOKEY');
    const model = trip.geminiModel || 'gemini-flash-latest';
    const prompt = `이 사진은 여행 중 받은 영수증입니다. 아래 JSON 형식으로만 답하세요.
{"store": 가게 이름(원문 그대로), "date": "YYYY-MM-DD" 또는 null, "total": 세금 포함 최종 결제 금액(숫자), "currency": ISO 4217 통화코드, "category": "식비"|"교통"|"숙소"|"관광"|"쇼핑"|"기타" 중 하나, "payment": "cash"|"card"|null, "summary": 무엇을 샀는지 한국어로 15자 이내}
통화 기호가 모호하면 영수증의 언어와 주소로 추정하고, 그래도 모르면 ${trip.currency || 'USD'}로 하세요. 읽을 수 없는 값은 null.`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: dataUrl.split(',')[1] } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + res.status);
    const text = j.candidates[0].content.parts.map(p => p.text || '').join('');
    return JSON.parse(text.replace(/^```json|```$/g, '').trim());
  },
};
