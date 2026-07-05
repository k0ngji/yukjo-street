# 한양도성 육조거리 홍보 웹페이지

조선시대 한양 도성의 중심 관청거리, 육조거리를 디지털로 재현한 3D 모델을 소개하는 홍보 페이지입니다.
three.js 기반 인터랙티브 3D 뷰어가 포함되어 있으며, 오프라인/키오스크 환경에서도 동작하도록
모든 라이브러리를 로컬에 포함하고 있습니다 (런타임에 외부 CDN을 호출하지 않습니다).

## 폴더 구성

```
web/
  index.html        홍보 페이지 (히어로/소개/3D 뷰어/푸터)
  viewer.js          three.js 뷰어 스크립트 (ES module)
  libs/              three.js 라이브러리 (로컬 고정 버전)
    three.module.js
    addons/          GLTFLoader, KTX2Loader, OrbitControls, RoomEnvironment 등
    basis/           KTX2(basis universal) transcoder (js + wasm)
  assets/            3D 모델(GLB) 파일 위치
  serve.cmd          로컬 서버 실행 스크립트 (Windows)
  README.md          본 문서
```

## 실행 방법

1. `assets/TM_6street2_web.glb` 파일이 존재하는지 확인합니다. (아래 "3D 모델 교체 방법" 참고)
2. `serve.cmd` 파일을 더블클릭(또는 실행)합니다.
   - PC에 Python이 설치되어 있으면 `python -m http.server 8080` 으로 서버를 띄웁니다.
   - Python이 없으면 `npx http-server -p 8080 -c-1` 을 사용합니다 (Node.js 필요, 최초 실행 시
     인터넷에서 http-server 패키지를 내려받습니다).
   - 브라우저가 자동으로 `http://localhost:8080` 을 엽니다.
3. 브라우저에서 "3D 모델 불러오기" 버튼을 클릭하면 모델 로딩이 시작됩니다.

### 주의: 반드시 http:// 로 접속해야 합니다

`index.html` 파일을 더블클릭해서 `file://...` 경로로 여는 것은 **동작하지 않습니다**.
ES module의 `importmap`, 그리고 KTX2/Meshopt 디코더가 사용하는 `.wasm` 파일은 브라우저 보안 정책상
반드시 http(s):// 프로토콜(로컬 서버 포함)로 서비스되어야 합니다.

## 3D 모델(GLB) 파일

`assets/` 폴더에 GLB 파일이 들어 있습니다.

| 파일 | 실제 크기 | 설명 |
| --- | --- | --- |
| `TM_6street2_web.glb` | 약 107MB (112,388,624 bytes) | 기본 URL(`index.html`)로 접속하면 이 파일이 로드됩니다. |

## 3D 모델(GLB) 교체 방법

1. gltfpack 등으로 압축한 GLB 파일을 준비합니다. (사용된 확장: `KHR_texture_basisu`,
   `EXT_meshopt_compression`, `EXT_mesh_gpu_instancing`, `KHR_mesh_quantization`)
2. 파일명을 `TM_6street2_web.glb`로 맞추고 `assets/` 폴더에 넣습니다.
   - 다른 파일명을 쓰고 싶다면 `viewer.js` 상단의 `MODEL_URL` 상수를 수정하세요.
3. 브라우저를 새로고침한 뒤 "3D 모델 불러오기" 버튼으로 정상 로드되는지 확인합니다.
4. 모델 크기가 매우 크다면(수십~수백 MB) 로딩 시간이 길어질 수 있습니다. 진행률 바에 표시되는
   퍼센트(또는 total 크기를 알 수 없을 경우 누적 로드 용량 MB)로 진행 상황을 확인할 수 있습니다.

## 라이브러리 버전

- three.js **r172 (0.172.0)** 을 `libs/` 에 고정 다운로드하여 사용합니다.
- 버전을 올리고 싶다면 `libs/`, `libs/addons/` 내 파일들을 동일한 jsdelivr 배포 구조
  (`build/three.module.js`, `examples/jsm/...`)에서 통째로 새로 받아 교체하세요. addons 파일들은
  서로 상대경로로 `import` 하므로 일부 파일만 새 버전으로 바꾸면 오류가 날 수 있습니다.

## 디자인/폰트

- 폰트는 시스템에 설치된 Pretendard / Noto Sans KR / 맑은 고딕 순으로 폴백되며, 웹폰트를
  별도로 내려받지 않습니다. (오프라인 환경 대응)
- 색상은 먹색(어두운 배경), 한지색(밝은 텍스트), 단청 계열의 붉은색/금색을 포인트로 사용합니다.

## 문제 해결

- **화면이 까맣고 아무 것도 안 보임**: 개발자 도구(F12) 콘솔에서 오류를 확인하세요. 대부분
  `file://` 로 열었거나, `assets/TM_6street2_web.glb` 파일이 없는 경우입니다.
- **모델은 로드되는데 텍스처가 깨짐**: KTX2 basis transcoder(`libs/basis/basis_transcoder.wasm`)
  파일이 제대로 받아졌는지, 크기가 0바이트가 아닌지 확인하세요.
- **콘솔에 CORS 오류**: 반드시 `serve.cmd` 로 로컬 서버를 띄운 뒤 `http://localhost:8080` 으로
  접속하세요.
