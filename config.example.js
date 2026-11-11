// 트립노트 설정 예시 — 이 파일을 config.js 로 복사한 뒤 발급받은 값을 채우세요. (README.md 참고)
// config.js 가 없거나 값이 비어 있으면: 지도 없이 / 이 기기에만 저장되는 모드로 동작합니다.
// 값을 채운 뒤 lock.html 에서 비밀번호로 잠그면 config.js 가 암호화된 형태로 바뀝니다.
window.APP_CONFIG = {
  // 구글 지도 API 키 (Maps JavaScript API, Places API (New), Routes API 사용 설정 필요)
  googleMapsKey: '',

  // Firebase 웹 앱 설정 (친구들과 실시간 공유용). Firebase 콘솔 > 프로젝트 설정 > 내 앱 에서 복사
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },
};
