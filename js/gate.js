'use strict';
// 비밀번호 잠금: config.js가 암호화된 형태(APP_CONFIG_LOCKED)이면, 비밀번호를 맞혀야
// 지도 키·Firebase 설정이 풀린다. 한 번 풀면 이 기기에 기억해 다음부터는 묻지 않는다.
(function () {
  const L = window.APP_CONFIG_LOCKED;
  if (!L) return;
  const tag = L.data.slice(0, 24); // 비밀번호를 바꿔 다시 잠그면 예전 기억은 무효
  try {
    const c = JSON.parse(localStorage.getItem('unlocked') || 'null');
    if (c && c.tag === tag) { window.APP_CONFIG = c.config; return; }
  } catch {}
  window.APP_LOCKED = true;

  const bytes = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  async function unlock(pw) {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes(L.salt), iterations: L.iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(L.iv) }, key, bytes(L.data)); // 비밀번호가 틀리면 여기서 실패
    return JSON.parse(new TextDecoder().decode(plain));
  }

  document.getElementById('app').innerHTML = `<div class="home"><div class="hero"><img src="icon.svg" alt="" width="56" height="56"><h1>트립노트</h1><p>함께 쓰는 사람만 들어올 수 있어요</p></div>
    <form class="card" id="gate"><label>비밀번호<input type="password" id="gatepw" autocomplete="current-password" required autofocus></label>
    <button class="primary wide">들어가기</button><p class="mut small center" id="gatemsg">한 번만 입력하면 이 기기에서는 다시 묻지 않아요.</p></form></div>`;
  document.getElementById('gate').onsubmit = async e => {
    e.preventDefault();
    const msg = document.getElementById('gatemsg'), btn = e.target.querySelector('button');
    btn.disabled = true; msg.textContent = '확인 중…';
    try {
      const config = await unlock(document.getElementById('gatepw').value);
      localStorage.setItem('unlocked', JSON.stringify({ tag, config }));
      location.reload(); // 초대 링크(#t=...)는 그대로 유지된다
    } catch {
      btn.disabled = false; msg.textContent = '비밀번호가 맞지 않아요.';
      document.getElementById('gatepw').select();
    }
  };
})();
