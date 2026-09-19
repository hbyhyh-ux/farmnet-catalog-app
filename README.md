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

`dist` 폴더를 정적 웹 서버로 열면 됩니다. 파일을 직접 더블클릭하면 상품 JSON을 불러오지 못할 수 있습니다.

```bash
python -m http.server 8000 --directory dist
```

브라우저에서 `http://localhost:8000`을 엽니다.

## 데이터 저장 방식

현재 초안의 상품 수정과 월호 발행 데이터는 브라우저 `localStorage`에 저장됩니다. 여러 담당자가 데이터를 공유하는 운영 버전에는 로그인과 데이터베이스가 필요합니다.

## GitHub Pages

`main` 브랜치에 push하면 `.github/workflows/pages.yml`이 `dist` 폴더를 GitHub Pages에 배포합니다. 저장소의 **Settings → Pages → Source**에서 **GitHub Actions**를 선택해야 합니다.
