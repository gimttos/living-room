# CLAUDE.md — 리빙룸 (Living Room)

> 이 파일은 Claude Code가 이 프로젝트에서 작업할 때 매 세션 읽는 운영 지침이다.
> 제품 스펙 전문은 `living-room-spec-v1.md`에 있다. **결정·범위·우선순위가 충돌하면 항상 스펙 문서가 정본(source of truth)이다.**

## 한 줄 정의
내 컴퓨터를 "집"으로 취급해, 내가 만든 이미지·스크린샷·사이버 굿즈를 방마다 자유롭게 배치·전시하는, 켤 필요 없이 늘 떠 있는 로컬 데스크탑 앱. v1은 **거실(Living Room) 한 칸**까지.

## 설계 철학 (어기면 안 됨)
1. **켤 필요가 없다 (Ambient):** 트레이 상주 + 바탕화면 바로가기, 부팅 시 자동 실행(옵션). "실행하는 마찰"이 과거 실패 원인.
2. **의무가 아니라 보상 (Reward, not chore):** 기록하러가 아니라 구경·자랑하러 여는 앱.
3. **내 이미지로 꾸미는 게 핵심 기능:** 이미지 올리기·배치·편집·전시가 앱의 심장.

### 금지 (트래커의 저주)
할 일 목록 / 강제 알림 / "오늘 입력 안 했어요" 류 죄책감 유발 / 통계 대시보드. **절대 만들지 말 것.**

## 기술 스택 (확정)
- **앱 프레임워크:** Tauri v2 (설치 시점 stable 고정). OS 내장 웹뷰 사용, Electron 아님.
- **캔버스/렌더링:** Konva.js 9.x — 드래그/리사이즈/회전(Transformer), 밝기·채도·색조·대비 필터, 크롭 내장.
- **UI 레이어:** 바닐라 JS (+ Konva). v1은 React 등 불필요.
- **저장:** 로컬 파일시스템 (Tauri fs API). DB 없음. 방 상태 = JSON, 이미지 = 앱 데이터 폴더의 실제 파일.
- **백엔드(Rust):** 거의 손대지 않음. 파일/다이얼로그/업데이트는 Tauri JS API로.
- **배포:** GitHub Releases + Tauri updater.

## 성능 3원칙
1. **올릴 때 자동 축소:** 큰 이미지는 가져오는 즉시 **최대 변 1500px**로 줄여 저장 (원본 미보관).
2. **정적 이미지만:** PNG/JPG/WebP만. APNG·동영상 거부.
3. **JSON엔 좌표만, 이미지는 파일로:** base64 금지. JSON에는 "어느 파일을 어디에 어떤 필터로"라는 값만.

## 비파괴 편집 원칙
크롭·색조는 **원본 파일을 절대 바꾸지 않는다.** JSON의 `crop`/`filters` 값으로만 표현하고 렌더 시 Konva가 적용. 항상 되돌리기 가능.

## 데이터 구조
```
<appDataDir>/
├─ rooms/living-room.json     # 방 상태 (좌표·필터값만)
├─ assets/images/
│   ├─ <uuid>.webp            # 자동 축소본
│   └─ <uuid>.thumb.webp      # (선택) 썸네일
└─ settings.json              # 전역 설정
```
방 JSON 스키마는 스펙 5-2 참조. **`schemaVersion`(현재 `1`)을 반드시 둔다.** 오브젝트 `type`은 v1에서 `"image"`만.

## 작업 규율 (테크트리 — 스펙 7장)
**한 번에 한 게이트(단계)만.** 각 단계의 [게이트] 통과 = 그 단계 완료. 통과하면 커밋하고 다음 단계로.

| 단계 | 내용 | 게이트 |
|---|---|---|
| 1 | 환경 세팅 & 빈 창 | 바로가기 더블클릭 → 빈 앱 창. GitHub에 코드. |
| 2 | 이미지 한 장 (Konva 기본) | 이미지 드래그·리사이즈·회전. |
| 3 | 내 이미지 여러 장 (D&D + 자동 축소) | 여러 PNG 배치·선택·삭제·앞뒤정렬, 큰 사진 자동 축소. |
| 4 | 저장/불러오기 | 껐다 켜도 방 복원. |
| 5 | 인앱 편집 (크롭+색조) | 색조 변경·크롭·되돌리기. |
| 6 | 방 배경 & 테마 | "방"처럼 보이고 테마 전환. (배경 일러에 공들이지 말 것 — 가벼운 SVG/CSS) |
| 7 | 배포 + 자동 업데이트 | 친구가 설치·실행, 새 버전 자동 업데이트. |

> v1은 거실 한 칸까지. **배포(단계7)까지 끝내고** 멈춘다. v2를 같은 호흡에 붙이지 말 것.

## 작업 방식 메모
- 버전·API 시그니처(Tauri/Konva)는 시점에 따라 바뀐다. 설치 단계에서 **현재 stable 버전을 확인해 고정**한다.
- 막히면 해당 단계의 "할 일"만 떼서 다시 본다.
- 커밋은 게이트 통과 시점마다.

## 환경 (이 머신) & 빌드 메모
- Windows 11, PowerShell. 작업 디렉토리: `D:\codeworks\house`.
- 설치됨: Node v24, npm 11, Git 2.52, WebView2, **Rust 1.96 (rustup)**, **MSVC C++ 빌드툴(VS BuildTools 2022, VC 14.44) + Windows SDK 10.0.26100**.
- **cargo가 시스템 PATH에 없다.** 빌드/실행 전 항상 PATH에 추가:
  `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`
- **개발 실행:** `npm run tauri dev` (위 PATH 설정 후).
- **릴리즈 빌드:** `npm run tauri build` → 첫 컴파일은 7~10분. 산출물:
  - exe: `src-tauri/target/release/living-room.exe`
  - 설치 파일: `src-tauri/target/release/bundle/nsis/리빙룸_<ver>_x64-setup.exe`
- **Windows 번들은 NSIS만 사용** (`tauri.conf.json` → `bundle.targets: ["nsis"]`).
  WiX MSI는 한글 제품명("리빙룸")에서 `light.exe`가 크래시함 → 쓰지 말 것. NSIS는 유니코드 안전 + Tauri updater 친화.
- **git:** D 드라이브가 소유권 미기록이라 `safe.directory` 예외가 필요했음(전역 설정 완료). 원격: `origin` = github.com/gimttos/living-room (**public** — updater가 인증 없이 릴리즈를 받아야 해서), 기본 브랜치 `main`.
- 무거운 첫 병렬 릴리즈 빌드가 VS 설치 직후 한 번 일시적으로 크래시(ACCESS_VIOLATION)한 적 있음 → 재시도하면 됨. 필요시 `$env:CARGO_BUILD_JOBS="4"`로 병렬도 낮춤.

## 배포 / 서명 / 자동 업데이트 (단계 7)
- **서명 키(절대 분실/공개 금지, 백업 필수):** `.tauri/livingroom.key`(개인키), `.tauri/signing-password.txt`(비번), `.tauri/livingroom.key.pub`(공개키). **`.tauri/`는 git 제외.** 공개키는 `tauri.conf.json`의 `plugins.updater.pubkey`에 박혀 있음.
- **서명 빌드:** PATH 설정 후
  `$env:TAURI_SIGNING_PRIVATE_KEY=(Get-Content .tauri/livingroom.key -Raw).Trim()`
  `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=(Get-Content .tauri/signing-password.txt -Raw).Trim()`
  `npm run tauri build` → `bundle/nsis/`에 `*-setup.exe` + `*-setup.exe.sig` 생성.
  (주의: PowerShell은 빈 문자열 env를 못 만듦 → 키는 반드시 비번 있게.)
- **릴리즈 절차(매 새 버전):** ① `tauri.conf.json`·`Cargo.toml`·`package.json` 버전 동시 올림 → ② 서명 빌드 → ③ 설치본을 **ASCII 이름으로 복사**(GitHub 에셋이 한글명 변형하므로) → ④ `latest.json` 작성(version, signature=.sig 내용, url=ASCII 설치본) **BOM 없는 UTF-8** → ⑤ `gh release create vX.Y.Z ... <ascii-setup.exe> <latest.json>`.
- **updater 엔드포인트:** `https://github.com/gimttos/living-room/releases/latest/download/latest.json` (config에 박힘). 앱은 시작 시 조용히 확인 + 사이드바 "업데이트 확인" 버튼.
- 자동 업데이트 0.1.0→0.1.1 종단 검증 완료(설치본이 부팅 시 스스로 갱신·재시작).

## 단계 진행 현황 — v1 거실 **완료** ✅
- ✅ 단계 1 환경/빈 창 · 2~3 이미지 배치 · 4 저장/복원 · 5 편집(크롭+색조) · 6 배경 테마 · 7 배포+트레이+자동업데이트.
- 현재 버전 **0.1.1** 릴리즈됨. 설치본 배포 + 자동 업데이트 동작.
- **다음(스펙대로 v1 이후):** 진열장(v2)·공방(v3) 등 새 방, 또는 폴리시 단계의 [[transparent-overlay-idea]]. 엔진(오브젝트+캔버스)은 재사용하고 "새 오브젝트 타입/새 방"만 더하는 식.
