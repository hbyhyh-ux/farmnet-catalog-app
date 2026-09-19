# 팜넷 상품관리 및 월간 발행

엑셀 상품 리스트를 바탕으로 만든 정적 HTML 웹앱 초안입니다.

## 주요 기능

- 상품 등록
- 보기모드 상세 팝업
- 수정모드 표(엑셀형) 직접 편집
- 운영중 / 임시품절 / 단종 상태 관리
- 선택 상품을 년·월 단위로 발행
- 과거 월호 및 발행 당시 상품 스냅샷 조회

## 실행

루트 `index.html`(또는 `dist/index.html`)을 더블클릭하면 바로 열립니다. 상품 데이터는 `dist/data/products.js`에서 스크립트로 불러오므로 별도 서버가 필요 없습니다.

```bash
python -m http.server 8000 --directory dist
```

## 데이터 저장 방식

- `dist/config.js`의 `FARMNET_API`가 비어 있으면: 각자 브라우저(`localStorage`)에만 저장됩니다.
- 주소를 넣으면: 구글 시트(Apps Script)를 공용 저장소로 써서 모든 담당자가 함께 수정하고, 열 순서·너비도 공통입니다. 설정 방법은 [apps-script/README.md](apps-script/README.md)를 참고하세요.

## GitHub Pages

`main` 브랜치에 push하면 `.github/workflows/pages.yml`이 `dist` 폴더를 GitHub Pages에 배포합니다. 저장소의 **Settings → Pages → Source**에서 **GitHub Actions**를 선택해야 합니다.
