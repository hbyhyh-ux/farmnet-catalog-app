# 작업 규칙 (토큰 절약)

- 소스는 `dist/`의 `index.html`, `styles.css`, `app.js`, `sync.js`(공용 저장소 동기화), `config.js`, `data/products.js`와 `apps-script/Code.gs`(구글 시트 백엔드)뿐이다. 루트 `index.html`은 `dist/`로 보내는 리다이렉트이므로 수정하지 않는다.
- 이미지를 base64로 HTML/JS에 넣지 않는다. `dist/assets/products/*.webp`를 상대경로로 참조한다.
- 단일 파일 번들(모든 것을 index.html에 인라인)을 만들지 않는다. 파일 하나가 1MB 가까워져 읽을 때마다 토큰을 크게 소모한다.
- `data/products.js`는 상품이 늘면 크므로 전체를 읽지 말고 `head -c 1500`이나 grep으로 필요한 부분만 본다.
- `file://`로 열어도 동작하도록 데이터는 fetch가 아니라 `<script src>`(`window.__PRODUCTS__`)로 불러온다.
