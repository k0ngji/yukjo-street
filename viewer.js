// 한양도성 육조거리 3D 뷰어
// three.js 기반, 오프라인/키오스크 환경에서 동작 (외부 CDN 요청 없음)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MeshBVH, acceleratedRaycast } from 'three/addons/libs/three-mesh-bvh.module.js';

// BVH 가속 레이캐스트: boundsTree가 있는 지오메트리는 색인으로 O(log n) 검사,
// 없는 지오메트리는 기존 방식으로 동작한다 (안전한 전역 교체).
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// 모델(129MB)은 GitHub 저장소의 파일당 100MB 제한 때문에 95MB 이하 조각
// 2개(.part1/.part2)로 나눠 저장소에 넣고, 뷰어가 받아서 이어붙여 파싱한다.
// (GitHub Release 첨부파일은 CORS 헤더를 안 줘서 브라우저 fetch가 차단됨 - 검증 완료.
//  조각 파일은 페이지와 같은 출처라 차단 이슈가 없다.)
// 로컬 개발 서버에서는 assets의 단일 GLB를 그대로 쓴다. ?parts=1 로 조각 경로 테스트 가능.
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const FORCE_PARTS = new URLSearchParams(location.search).get('parts') === '1';

// 모바일은 129MB 모델의 메모리 부담으로 탭이 강제 재시작되는 문제가 있어
// (실사용 확인) 경량 모델(21.5MB, 단순화 강화 + 512px 텍스처)을 따로 쓰고,
// 후처리(GTAO/MSAA)도 끈다. ?mobile=1 로 데스크톱에서 모바일 경로 테스트 가능.
const IS_MOBILE =
	/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ||
	new URLSearchParams(location.search).get('mobile') === '1';

const MODEL_URLS = IS_MOBILE
	? ['./assets/TM_6street2_web_m.glb']
	: (IS_LOCAL && !FORCE_PARTS)
		? ['./assets/TM_6street2_web.glb']
		: ['./assets/TM_6street2_web.glb.part1', './assets/TM_6street2_web.glb.part2'];

const container = document.getElementById('viewer-container');
const posterEl = document.getElementById('viewer-poster');
const loadBtn = document.getElementById('viewer-load-btn');
const progressWrap = document.getElementById('viewer-progress-wrap');
const progressBar = document.getElementById('viewer-progress-bar');
const progressLabel = document.getElementById('viewer-progress-label');
const errorEl = document.getElementById('viewer-error');
const fullscreenBtn = document.getElementById('viewer-fullscreen-btn');
const hotspotLayer = document.getElementById('hotspot-layer');
const hotspotPopup = document.getElementById('hotspot-popup');
const hotspotPopupTitle = document.getElementById('hotspot-popup-title');
const hotspotPopupDesc = document.getElementById('hotspot-popup-desc');
const hotspotPopupDetail = document.getElementById('hotspot-popup-detail');
const hotspotPopupToday = document.getElementById('hotspot-popup-today');
const hotspotPopupClose = document.getElementById('hotspot-popup-close');
const hotspotToggleBtn = document.getElementById('viewer-hotspot-toggle-btn');

// 관청 핫스팟 데이터. 월드 좌표는 headless Playwright + 수직 탑다운 카메라로
// 스크린샷을 찍어 참고 배치도(정규 좌표 지도)와 랜드마크를 대조한 뒤,
// window.__viewer.raycastFromNormalized() 로 각 지점을 레이캐스트해 얻었다
// (지면/지붕 표면 높이에서 살짝(+4) 띄워 마커가 표면 위에 뜨도록 함).
const HOTSPOTS = [
	// 동쪽 열(의정부~한성부)의 x 좌표는 개천이 비스듬히 흘러 남쪽으로 갈수록 블록이
	// 좁아지는 것을 반영해, 물 재질 레이캐스트 스캔으로 실측한 각 블록 마당(평지) 위치다.
	{ id: 'uijeongbu', name: '의정부', hanja: '議政府', desc: '삼정승이 국정을 총괄하던 조선 최고 행정기관', detail: '영의정·좌의정·우의정 세 정승의 합의로 나라의 중요 정책을 심의하고 육조를 통솔했다.', today: '오늘날의 국무회의에 해당', position: new THREE.Vector3(78, 4.0, -123.48) },
	{ id: 'samgunbu', name: '삼군부', hanja: '三軍府', desc: '군령과 숙위를 총괄하던 군무 기관', detail: '조선 초 군사 지휘를 총괄하며 궁궐과 도성의 경비를 맡았고, 광화문 바로 앞 서쪽에 자리해 의정부와 마주 보았다.', today: '오늘날의 합동참모본부에 비견', position: new THREE.Vector3(-92.91, 3.99, -145.78) },
	{ id: 'junggchubu', name: '중추부', hanja: '中樞府', desc: '소임 없는 고위 관원을 예우하던 기관', detail: '일정한 직무 없이 정1품~종2품 고위 관원을 소속시켜 예우하던 기관으로, 관직의 명예를 지켜 주는 자리였다.', today: '', position: new THREE.Vector3(-92.90, 4.03, -65.94) },
	{ id: 'saheonbu', name: '사헌부', hanja: '司憲府', desc: '관리의 비리를 감찰하던 사법·감찰 기관', detail: '관리의 부정과 비리를 탄핵하고 풍속을 바로잡던 기관으로, 사간원과 함께 언론 기능을 맡아 왕권을 견제했다.', today: '오늘날의 감사원에 해당', position: new THREE.Vector3(-92.91, 4.00, -11.94) },
	{ id: 'byeongjo', name: '병조', hanja: '兵曹', desc: '군사와 국방을 담당한 육조의 하나', detail: '무관의 인사와 군적 관리, 병기와 성곽, 역참과 봉수 등 나라의 방위 전반을 관장했다.', today: '오늘날의 국방부에 해당', position: new THREE.Vector3(-92.92, 3.90, 49.69) },
	{ id: 'hyeongjo', name: '형조', hanja: '刑曹', desc: '법률과 형벌을 담당한 육조의 하나', detail: '법률과 소송, 형벌과 노비에 관한 일을 맡았으며, 중대한 재판은 의금부·사헌부와 함께 다루었다.', today: '오늘날의 법무부에 해당', position: new THREE.Vector3(-92.41, 8.82, 131.16) },
	{ id: 'gongjo', name: '공조', hanja: '工曹', desc: '토목과 건축, 공장(工匠)을 담당한 육조의 하나', detail: '궁궐과 성곽의 영건, 도로와 교량, 산림과 수공업 등 나라의 토목·건축 사업을 관장했다.', today: '오늘날의 국토교통부에 해당', position: new THREE.Vector3(-98.73, 4.40, 196.35) },
	{ id: 'yejo', name: '예조', hanja: '禮曹', desc: '외교·의례·교육을 담당한 육조의 하나', detail: '나라의 제사와 의례, 사신 접대와 외교 문서, 과거 시험과 학교에 관한 일을 두루 맡았다.', today: '오늘날의 외교부·교육부에 해당', position: new THREE.Vector3(70, 4.0, -11.94) },
	{ id: 'ijo', name: '이조', hanja: '吏曹', desc: '문관의 인사를 담당한 육조의 하나', detail: '문관의 임명과 평가, 공훈과 봉작 등 인사 행정을 관장해 육조 가운데서도 으뜸으로 꼽혔다.', today: '오늘날의 인사혁신처에 해당', position: new THREE.Vector3(76, 4.0, 46.46) },
	{ id: 'hojo', name: '호조', hanja: '戶曹', desc: '재정과 조세를 담당한 육조의 하나', detail: '호구와 토지 조사, 조세와 공물, 나라 살림의 출납을 맡은 재정 총괄 기관이었다.', today: '오늘날의 기획재정부에 해당', position: new THREE.Vector3(48, 4.1, 105.43) },
	{ id: 'hanseongbu', name: '한성부', hanja: '漢城府', desc: '도성 한양의 행정을 맡던 관청', detail: '수도 한양의 호적과 시장, 도로와 치안 등 도시 행정 전반을 맡은 서울의 관청이었다.', today: '오늘날의 서울특별시청에 해당', position: new THREE.Vector3(55, 4.0, 167.13) },
	{ id: 'girosso', name: '기로소', hanja: '耆老所', desc: '연로한 고위 문신을 예우하던 기구', detail: '일흔이 넘은 정2품 이상 문신을 예우하던 기구로, 왕도 연로하면 이름을 올릴 만큼 명예로운 곳이었다.', today: '', position: new THREE.Vector3(-97.27, 17.76, 232.25) },
];

// 태양광 방향 (정규화 전 벡터) - 고도 약 40도, 초기 카메라 방위각(35도)과 충분히
// 어긋난 방위각(약 150도)으로 잡아 건물/담장에 뚜렷한 방향성 그림자가 카메라 쪽으로
// 잘 보이도록 한다 (고도가 너무 높거나 태양-카메라 방위각이 비슷하면 그림자가
// 물체 뒤로 숨어 거의 안 보이게 된다).
const SUN_DIRECTION = new THREE.Vector3(0.38, 0.64, -0.66).normalize();

let renderer, scene, camera, controls, pmremGenerator;
let composer, renderPass, gtaoPass, outputPass;
let sunLight, hemiLight;
let animationStarted = false;
let modelRoot = null;
let recenterState = null;
// 연못/개천 수면에 입힌 절차적 잔물결 노멀맵. animate()에서 offset을 흘려 애니메이션한다.
let waterNormalMap = null;

// 화면 정규 좌표(0~1, y는 위에서 아래)에서 씬으로 레이캐스트해 표면 월드 좌표를 반환한다.
// 핫스팟 좌표 보정(캘리브레이션) 및 더블클릭 리센터 기능에서 공용으로 사용.
//
// 성능: 씬 전체(나무 인스턴스 1,200여 그루의 고밀도 잎 지오메트리 포함)를 검사하면
// 더블클릭마다 매번 ~400ms 멈춰 애니메이션이 끊긴다 (실측). 인스턴스 메시(수목)를
// 제외한 일반 메시 목록을 로드 시 한 번 캐시해 두고 그것만 검사한다 - 나무를
// 클릭하면 그 뒤의 지면/건물로 이동하므로 오히려 자연스럽다.
let raycastTargets = null; // buildRaycastTargets()가 로드 후 채운다
function buildRaycastTargets(root) {
	raycastTargets = [];
	let bvhCount = 0;
	root.traverse((node) => {
		if (!node.isMesh || node.isInstancedMesh) return;
		raycastTargets.push(node);
		// BVH 색인은 '화면 전체에 걸쳐 있어 모든 레이캐스트에 전수 검사되는'
		// 초대형 메시(지형/대로 - 수백만 삼각형)에만 만든다. 이들이 더블클릭당
		// ~400ms 멈춤의 주범이었다. 주의: 임계값을 낮춰 수십 개 메시에 색인을
		// 만들면 색인 메모리(삼각형당 수십 바이트)가 수백 MB로 불어나
		// 렌더링 전체가 느려진다 (실측: 프레임 33ms -> 75ms 악화).
		const index = node.geometry.index;
		const triCount = (index ? index.count : node.geometry.attributes.position.count) / 3;
		if (triCount > 400000) {
			try {
				node.geometry.boundsTree = new MeshBVH(node.geometry);
				bvhCount += 1;
			} catch (e) {
				// 색인 실패 시 기존 전수 검사로 동작 (기능엔 문제 없음)
			}
		}
	});
	console.log(`[viewer] 레이캐스트 대상 ${raycastTargets.length}개, BVH 색인 ${bvhCount}개 구축`);
}

const _sharedRaycaster = new THREE.Raycaster();
function raycastFromNormalized(nx, ny) {
	if (!camera || !scene) return null;
	const mouse = new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1));
	_sharedRaycaster.setFromCamera(mouse, camera);
	const pool = raycastTargets;
	const hits = pool
		? _sharedRaycaster.intersectObjects(pool, false)
		: _sharedRaycaster.intersectObjects(scene.children, true);
	const hit = hits.find((h) => h.object.visible && h.object.isMesh);
	return hit ? hit.point.clone() : null;
}

// ---------- 더블클릭 리센터 (스케치팹 스타일) ----------
// 시선 방향은 유지한 채 새 지점을 회전 중심으로 삼고, 동시에 지정 거리까지
// 다가가며(줌인) 부드럽게(ease-out) 이동한다. 외부 트윈 라이브러리 없이
// animate() 루프 안에서 매 프레임 lerp 로 보간한다.
// targetDistance 를 생략하면 현재 카메라-target 거리를 그대로 유지한다.
function startRecenter(newTarget, targetDistance) {
	if (!camera || !controls) return;
	const offset = camera.position.clone().sub(controls.target);
	const currentDistance = offset.length();
	const newDistance = targetDistance !== undefined ? targetDistance : currentDistance;
	const newCameraPos = newTarget.clone().addScaledVector(
		offset.normalize(),
		newDistance
	);
	const startCamPos = camera.position.clone();
	// 이동 거리에 비례해 지속시간을 늘려, 짧은 이동은 경쾌하고 긴 이동은 차분하게.
	const travel = startCamPos.distanceTo(newCameraPos);
	const duration = THREE.MathUtils.clamp(450 + travel * 1.2, 600, 1100);
	recenterState = {
		startTarget: controls.target.clone(),
		startCamPos,
		newTarget,
		newCameraPos,
		// 주의: 절대시간(performance.now 기준 경과시간)으로 진행률을 계산하면 안 된다.
		// (1) 더블클릭 직후 rAF가 '멈추기 전' 프레임의 타임스탬프를 들고 와 경과시간이
		//     음수가 되면 ease 계산이 역외삽되어 카메라가 엉뚱한 곳에서 한 컷 렌더링되고,
		// (2) 셰이더 컴파일 등으로 수백 ms 멈춘 뒤에는 애니메이션이 그만큼 건너뛰어
		//     점프컷처럼 보인다 (둘 다 실측으로 확인).
		// 대신 프레임마다 실제 흐른 시간을 최대 50ms까지만 progress에 누적한다.
		progress: 0,
		lastNow: null,
		duration,
	};
	// 이동 중 OrbitControls 입력(드래그/줌)과 충돌하지 않도록 잠시 비활성화한다.
	controls.enabled = false;
}

// 더블클릭 한 번당 현재 거리의 절반씩 다가간다 (스케치팹과 비슷한 감각).
// 바닥값을 두어 연속 더블클릭이 최소 관찰 거리 근처로 수렴하게 한다.
function recenterZoomDistance(factor, floor) {
	const currentDistance = camera.position.distanceTo(controls.target);
	return Math.max(currentDistance * factor, floor);
}

function cancelRecenter() {
	if (recenterState) {
		recenterState = null;
		controls.enabled = true;
	}
}

function updateRecenter(now) {
	if (!recenterState || !camera || !controls) return;
	const s = recenterState;
	// 프레임당 진행량 상한: 수백 ms 멈춤(freeze) 뒤의 점프컷만 막는 안전장치.
	// 너무 낮게(50ms) 잡으면 프레임이 느린 기기(모바일 등)에서 실제 시간보다
	// 애니메이션이 느리게 가며 계단식으로 끊겨 보인다 - 일반적인 느린 프레임
	// (~100ms)은 그대로 통과시키고 병적인 멈춤만 자르도록 120ms로 둔다.
	const dt = s.lastNow === null ? 16 : THREE.MathUtils.clamp(now - s.lastNow, 0, 120);
	s.lastNow = now;
	s.progress = Math.min(1, s.progress + dt / s.duration);
	const t = s.progress;
	const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
	controls.target.lerpVectors(recenterState.startTarget, recenterState.newTarget, eased);
	camera.position.lerpVectors(recenterState.startCamPos, recenterState.newCameraPos, eased);
	if (t >= 1) {
		recenterState = null;
		controls.enabled = true;
	}
}

function recenterAtClientPoint(clientX, clientY) {
	if (!camera || !scene || !controls || !renderer) return;
	const rect = renderer.domElement.getBoundingClientRect();
	const nx = (clientX - rect.left) / rect.width;
	const ny = (clientY - rect.top) / rect.height;
	const point = raycastFromNormalized(nx, ny);
	if (!point) return; // 모델 표면과 교차하지 않으면 무시
	const floor = Math.max(controls.minDistance * 1.8, 25);
	startRecenter(point, recenterZoomDistance(0.5, floor));
}

function onCanvasDoubleClick(event) {
	recenterAtClientPoint(event.clientX, event.clientY);
}

// 모바일 더블탭 → 리센터. OrbitControls가 캔버스에 touch-action:none을 걸어
// 브라우저가 더블탭을 dblclick 이벤트로 합성해 주지 않으므로 직접 감지한다.
// (350ms 이내, 25px 이내의 연속 두 탭)
let lastTap = null;
function onCanvasPointerUp(event) {
	if (event.pointerType !== 'touch') return;
	const now = performance.now();
	if (
		lastTap &&
		now - lastTap.time < 350 &&
		Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 25
	) {
		lastTap = null;
		recenterAtClientPoint(event.clientX, event.clientY);
		return;
	}
	lastTap = { time: now, x: event.clientX, y: event.clientY };
}

// ---------- 관청 핫스팟 오버레이 ----------
// 마커 배지에 들어가는 기와지붕(전각) 아이콘. currentColor를 따르므로 배지의
// 글자색(아이보리)이 그대로 적용된다.
const MARKER_ICON_SVG =
	'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
	'<path d="M12 4.5c-3 3.1-6 4.9-9 5.7 1.6 1.1 3.3 1.5 4.8 1.4V13h8.4v-1.4c1.5.1 3.2-.3 4.8-1.4-3-.8-6-2.6-9-5.7z"/>' +
	'<path d="M7.5 14.2h9v1.6h-9zM8.3 17h7.4v2.5h-3v-1.4h-1.4v1.4h-3z"/>' +
	'</svg>';

let hotspotsVisible = true;
let activeHotspotId = null;

function buildHotspotMarkers() {
	if (!hotspotLayer) return;
	HOTSPOTS.forEach((hs) => {
		// 바깥 el: 위치 이동(translate3d) 전용. 안쪽 dot: 원형 배지 + 호버 확대 전용.
		// 같은 요소에서 scale 속성을 쓰면 CSS 변환 합성 순서상 scale이 translate에
		// 곱해져 호버 순간 마커의 화면 위치 자체가 튀어버린다(도망가는 버그).
		const el = document.createElement('div');
		el.className = 'hotspot-marker is-hidden';
		const dot = document.createElement('span');
		dot.className = 'hotspot-marker-dot';
		dot.innerHTML = MARKER_ICON_SVG;
		el.appendChild(dot);
		el.title = hs.name;
		el.setAttribute('role', 'button');
		el.setAttribute('aria-label', hs.name);
		el.addEventListener('click', (event) => {
			event.stopPropagation();
			onHotspotClick(hs);
		});
		hotspotLayer.appendChild(el);
		hs.el = el;
	});
}

function openHotspotPopup(hs) {
	activeHotspotId = hs.id;
	hotspotPopupTitle.textContent = hs.name;
	if (hs.hanja) {
		const hanjaEl = document.createElement('span');
		hanjaEl.className = 'hotspot-popup-hanja';
		hanjaEl.textContent = hs.hanja;
		hotspotPopupTitle.appendChild(hanjaEl);
	}
	hotspotPopupDesc.textContent = hs.desc;
	if (hotspotPopupDetail) hotspotPopupDetail.textContent = hs.detail || '';
	if (hotspotPopupToday) hotspotPopupToday.textContent = hs.today || '';
	hotspotPopup.hidden = false;
	HOTSPOTS.forEach((h) => h.el && h.el.classList.toggle('is-active', h.id === hs.id));
}

function closeHotspotPopup() {
	activeHotspotId = null;
	hotspotPopup.hidden = true;
	HOTSPOTS.forEach((h) => h.el && h.el.classList.remove('is-active'));
}

function onHotspotClick(hs) {
	if (activeHotspotId === hs.id) {
		closeHotspotPopup();
		return;
	}
	openHotspotPopup(hs);
	// 관청 하나가 화면에 적당히 차는 거리로 다가간다. 이미 더 가까이 있으면
	// 억지로 물러나지 않도록 상한을 현재 거리로 둔다.
	const currentDistance = camera && controls
		? camera.position.distanceTo(controls.target)
		: 0;
	const viewDistance = Math.min(
		Math.max(currentDistance * 0.55, 130),
		Math.max(currentDistance, 130)
	);
	startRecenter(hs.position.clone(), viewDistance);
}

function setHotspotsVisible(visible) {
	hotspotsVisible = visible;
	if (hotspotToggleBtn) {
		hotspotToggleBtn.classList.toggle('is-off', !visible);
		hotspotToggleBtn.textContent = visible ? '관청 안내 켜짐' : '관청 안내 꺼짐';
		hotspotToggleBtn.setAttribute('aria-pressed', String(visible));
	}
	if (!visible) {
		closeHotspotPopup();
		HOTSPOTS.forEach((h) => h.el && h.el.classList.add('is-hidden'));
	}
}

// 매 프레임 3D 좌표를 화면에 project() 하여 HTML 오버레이 위치를 갱신.
// 렌더와 같은 프레임의 같은 카메라 행렬을 쓰고, translate3d(합성 전용 채널)로
// 써서 레이아웃/페인트 없이 곧바로 화면에 반영되게 한다 (마커가 화면에 '고정'된 느낌).
//
// 주의: project()는 카메라 '뒤'에 있는 점에서 원근 나눗셈(w<0) 때문에 좌표가
// 좌우/상하로 뒤집힌 채 화면 안쪽 값으로 나올 수 있다 (ndc.z > 1 검사만으로는
// 걸러지지 않음). 이때 마커가 엉뚱한 곳으로 순간이동하며 마구 튀는 현상이 생기므로,
// 투영 전에 카메라 시선 방향과의 내적으로 앞/뒤를 먼저 판정한다.
const _hotspotNdc = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _toHotspot = new THREE.Vector3();
function updateHotspotPositions() {
	if (!hotspotsVisible || !camera || !modelRoot) return;
	const w = container.clientWidth;
	const h = container.clientHeight;
	camera.getWorldDirection(_camForward);
	HOTSPOTS.forEach((hs) => {
		// 1) 카메라 전방(near 앞)에 있는지 내적으로 판정 - 뒤에 있으면 즉시 숨김
		_toHotspot.copy(hs.position).sub(camera.position);
		if (_toHotspot.dot(_camForward) < camera.near + 0.5) {
			hs.el.classList.add('is-hidden');
			return;
		}
		// 2) 시야(프러스텀) 밖으로 많이 벗어난 마커도 숨김 - 화면 가장자리에서
		//    자연스럽게 나타나고 사라지도록 약간의 여유(1.1)를 둔다
		const ndc = _hotspotNdc.copy(hs.position).project(camera);
		if (Math.abs(ndc.x) > 1.1 || Math.abs(ndc.y) > 1.1 || ndc.z > 1) {
			hs.el.classList.add('is-hidden');
			return;
		}
		hs.el.classList.remove('is-hidden');
		const x = (ndc.x * 0.5 + 0.5) * w;
		const y = (-ndc.y * 0.5 + 0.5) * h;
		hs.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
		if (activeHotspotId === hs.id) {
			hotspotPopup.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, calc(-100% - 18px))`;
		}
	});
}

if (hotspotPopupClose) {
	hotspotPopupClose.addEventListener('click', (event) => {
		event.stopPropagation();
		closeHotspotPopup();
	});
}

document.addEventListener('click', (event) => {
	if (hotspotPopup && !hotspotPopup.hidden && !hotspotPopup.contains(event.target) && !event.target.closest('.hotspot-marker')) {
		closeHotspotPopup();
	}
});

if (hotspotToggleBtn) {
	hotspotToggleBtn.addEventListener('click', () => setHotspotsVisible(!hotspotsVisible));
}

buildHotspotMarkers();

function initScene() {
	renderer = new THREE.WebGLRenderer({ antialias: true });
	// 모바일은 GPU/메모리 부담을 줄이기 위해 픽셀비율 1로 제한
	renderer.setPixelRatio(IS_MOBILE ? 1 : Math.min(window.devicePixelRatio, 2));
	renderer.setSize(container.clientWidth, container.clientHeight);
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.1;
	renderer.outputColorSpace = THREE.SRGBColorSpace;

	// 그림자: 씬이 정적이므로 로드 직후 한 번만 계산 (autoUpdate=false + needsUpdate=true)
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.shadowMap.autoUpdate = false;
	renderer.shadowMap.needsUpdate = false;

	container.appendChild(renderer.domElement);

	scene = new THREE.Scene();
	// OutputPass가 프레임 전체(배경 포함)에 ACES 톤매핑 + sRGB 인코딩을 적용하므로,
	// 최종 화면에서 거의 흰색에 가까운 아주 연한 하늘색(#eaf4fa~#f0f8fd 부근)으로 보이도록 한다.
	// ACES 필름형 톤매핑은 0~1 범위의 sRGB 색만으로는 출력이 약 0.90(sRGB) 언저리에서
	// 포화되어 버려(하이라이트 롤오프) 더 밝게 뺄 수 없으므로, 선명한 하늘색을 HDR 영역
	// (1.0 초과)까지 밝기를 올려(multiplyScalar) 톤매핑 커브를 더 타고 올라가게 한 뒤
	// 스크린샷으로 실측하며 흰색에 가깝게 수렴시켰다 (최종: #e9f2f5 부근).
	scene.background = new THREE.Color(0x9fd4ee).multiplyScalar(2.75);

	camera = new THREE.PerspectiveCamera(
		45,
		container.clientWidth / container.clientHeight,
		0.1,
		1000
	);
	camera.position.set(10, 8, 10);

	// IBL 환경광 - 태양광 대비를 살리기 위해 세기를 낮춘다
	pmremGenerator = new THREE.PMREMGenerator(renderer);
	scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
	scene.environmentIntensity = 0.42;

	// 하늘/지면 보조광 (약하게, 그림자 진 부분이 완전히 새까맣게 되지 않도록)
	hemiLight = new THREE.HemisphereLight(0xcde8f6, 0x8a7a5a, 0.18);
	scene.add(hemiLight);

	// 태양광 (그림자를 드리우는 메인 방향광) - 그림자 대비를 뚜렷하게 하기 위해 강하게
	sunLight = new THREE.DirectionalLight(0xfff1d6, 3.5);
	sunLight.position.copy(SUN_DIRECTION); // 임시 위치, 모델 로드 후 씬 크기에 맞춰 재배치
	sunLight.castShadow = true;
	sunLight.shadow.mapSize.set(IS_MOBILE ? 2048 : 4096, IS_MOBILE ? 2048 : 4096);
	sunLight.shadow.bias = -0.0003;
	sunLight.shadow.normalBias = 0.6;
	scene.add(sunLight);
	scene.add(sunLight.target);

	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.screenSpacePanning = true;
	controls.maxPolarAngle = THREE.MathUtils.degToRad(85);

	// 후처리 체인: RenderPass -> GTAO(SSAO) -> OutputPass
	// MSAA 손실 방지를 위해 composer 렌더타깃에 samples(WebGL2 멀티샘플) 지정
	// 모바일은 GPU 메모리/발열 부담이 커서 후처리 체인 전체를 생략한다
	// (composer가 없으면 animate()가 renderer.render로 직접 그리고,
	//  톤매핑은 렌더러가 자체 적용하므로 색감은 거의 동일하다).
	if (!IS_MOBILE) {
	const pixelRatio = renderer.getPixelRatio();
	const w = container.clientWidth * pixelRatio;
	const h = container.clientHeight * pixelRatio;
	const composerRenderTarget = new THREE.WebGLRenderTarget(w, h, {
		type: THREE.HalfFloatType,
		samples: 4,
	});

	composer = new EffectComposer(renderer, composerRenderTarget);

	renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);

	gtaoPass = new GTAOPass(scene, camera, container.clientWidth, container.clientHeight);
	gtaoPass.output = GTAOPass.OUTPUT.Default;
	// GTAO 내부 normal/depth 프리패스에서 씬 전체에 깔린 얇은 수면 평면을 제외한다
	// (지형과 거의 같은 높이에서 겹쳐 z-fighting -> 광범위한 검은 뭉개짐 아티팩트 원인).
	const baseOverrideVisibility = gtaoPass.overrideVisibility.bind(gtaoPass);
	gtaoPass.overrideVisibility = function () {
		baseOverrideVisibility();
		this.scene.traverse((obj) => {
			if ((obj.isMesh || obj.isInstancedMesh) && isWaterMaterial(obj.material)) {
				obj.visible = false;
			}
		});
	};
	// 발굴 피트처럼 깊게 파인 지형에서는 GTAO 원시값이 거의 0(완전 폐색)까지 떨어져
	// 디테일이 안 보일 정도로 새까매지므로, 블렌드 강도를 낮춰 최소 밝기를 보존한다.
	gtaoPass.blendIntensity = 0.6;
	// GTAO의 내부 normal/depth prepass 는 기본적으로 MeshNormalMaterial(FrontSide)로 그리는데,
	// 지형/담장 등 양면(DoubleSide) 머티리얼 메시가 있으면 컬링 불일치로 깊이/노멀 버퍼가
	// 실제 화면과 어긋나 넓은 면이 통째로 검게 뭉개지는 문제가 생긴다. DoubleSide로 맞춘다.
	gtaoPass.normalMaterial.side = THREE.DoubleSide;
	// 씬 스케일(반경 수백 미터)에 맞춘 값 - 기본값(0.25 등)은 실내/소형 씬 기준이라 너무 작다.
	// radius/thickness 를 너무 크게 잡으면(4/3) 완만한 경사(성토 비탈 등)에서
	// 수평선 누적 계산이 포화되어 넓은 면이 통째로 검게 뭉개지는 아티팩트가 발생해
	// 훨씬 보수적인 값으로 낮췄다.
	gtaoPass.updateGtaoMaterial({
		radius: 1.5,
		distanceExponent: 1,
		thickness: 1,
		scale: 1,
		samples: 16,
		distanceFallOff: 0.5,
		screenSpaceRadius: false,
	});
	gtaoPass.updatePdMaterial({
		lumaPhi: 10,
		depthPhi: 2,
		normalPhi: 3,
		radius: 6,
		radiusExponent: 1,
		rings: 3,
		samples: 16,
	});
	composer.addPass(gtaoPass);

	outputPass = new OutputPass();
	composer.addPass(outputPass);
	} // if (!IS_MOBILE) - 후처리 체인 끝

	window.addEventListener('resize', onResize);

	// 더블클릭 리센터 (스케치팹 스타일) + 모바일 더블탭
	renderer.domElement.addEventListener('dblclick', onCanvasDoubleClick);
	renderer.domElement.addEventListener('pointerup', onCanvasPointerUp);
	// 이동 중 사용자가 드래그/줌을 시작하면 애니메이션을 즉시 넘겨주어(캔슬)
	// 조작이 막힌 느낌이 들지 않게 한다.
	renderer.domElement.addEventListener('pointerdown', cancelRecenter);
	renderer.domElement.addEventListener('wheel', cancelRecenter, { passive: true });

	// 디버그/좌표 보정용 노출 (유지해도 됨). scene/camera/controls 는 이후 재할당되지 않고
	// 내부 상태만 바뀌므로 여기서 한 번만 노출해도 항상 최신 상태를 참조한다.
	window.__viewer = {
		scene,
		camera,
		controls,
		renderer,
		THREE,
		raycastFromNormalized,
		getModelRoot: () => modelRoot,
		HOTSPOTS,
	};
}

function onResize() {
	if (!renderer || !camera) return;
	const w = container.clientWidth;
	const h = container.clientHeight;
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
	renderer.setSize(w, h);
	if (composer) composer.setSize(w, h);
}

function animate(now) {
	requestAnimationFrame(animate);
	updateRecenter(now || performance.now());
	if (waterNormalMap) {
		// 잔물결이 천천히 흘러가는 느낌 - 절대시간 기반이라 프레임 드랍에도 속도가 일정하다.
		const t = (now || performance.now()) * 0.001;
		// 거울 같은 잔잔한 수면을 위해 이전보다 절반 이하로 늦췄다
		waterNormalMap.offset.set((t * 0.008) % 1, (t * 0.005) % 1);
	}
	if (controls) controls.update();
	if (composer) {
		composer.render();
	} else if (renderer && scene && camera) {
		renderer.render(scene, camera);
	}
	updateHotspotPositions();
}

function frameCameraToObject(object) {
	const box = new THREE.Box3().setFromObject(object);
	if (box.isEmpty()) return;

	const center = box.getCenter(new THREE.Vector3());
	const sphere = box.getBoundingSphere(new THREE.Sphere());
	const radius = Math.max(sphere.radius, 0.001);

	controls.target.copy(center);

	// 부감(약 55도)으로 살짝 비스듬한 초기 시점
	const distance = radius * 1.6;
	const polar = THREE.MathUtils.degToRad(55);
	const azimuth = THREE.MathUtils.degToRad(35);

	const offset = new THREE.Vector3(
		Math.sin(polar) * Math.sin(azimuth),
		Math.cos(polar),
		Math.sin(polar) * Math.cos(azimuth)
	).multiplyScalar(distance);

	camera.position.copy(center).add(offset);
	camera.near = Math.max(radius / 100, 0.01);
	// GTAO(SSAO)는 depth 버퍼로부터 위치를 복원하므로 near/far 비율이 너무 크면
	// (예: 이전의 radius*50) 심도 정밀도가 부족해져 넓은 영역이 통째로 검게 뭉개진다.
	// 카메라가 실제로 도달 가능한 범위(maxDistance + 씬 반경) 정도로 넉넉히 타이트하게 잡는다.
	camera.far = radius * 6;
	camera.updateProjectionMatrix();

	controls.minDistance = radius * 0.05;
	controls.maxDistance = radius * 3;
	controls.update();

	configureSunShadow(center, radius);

	if (gtaoPass) {
		gtaoPass.setSceneClipBox(box);
	}
}

// 모델 바운딩 구/박스에 맞춰 태양광 shadow camera(ortho) 범위를 설정하고
// 그림자 acne/피터패닝을 막기 위해 near/far, bias 를 씬 스케일에 맞춘다.
function configureSunShadow(center, radius) {
	if (!sunLight) return;

	const lightDistance = radius * 2.2;
	sunLight.position.copy(center).addScaledVector(SUN_DIRECTION, lightDistance);
	sunLight.target.position.copy(center);
	sunLight.target.updateMatrixWorld();

	const cam = sunLight.shadow.camera;
	const margin = radius * 1.05;
	cam.left = -margin;
	cam.right = margin;
	cam.top = margin;
	cam.bottom = -margin;
	cam.near = Math.max(lightDistance - radius * 1.5, 0.1);
	cam.far = lightDistance + radius * 1.5;
	cam.updateProjectionMatrix();

	// shadow.bias 는 정규화(0~1) 깊이 공간에서 적용되므로 씬 스케일과 무관하게 아주 작은 값을
	// 써야 한다 (텍셀 크기로 스케일하면 far/near 범위 때문에 자릿수가 완전히 틀어져
	// peter-panning으로 그림자가 통째로 사라진다). normalBias 만 텍셀 크기(월드 단위)에 맞춘다.
	const texelSize = (margin * 2) / sunLight.shadow.mapSize.width;
	sunLight.shadow.bias = -0.0006;
	sunLight.shadow.normalBias = texelSize * 1.5;

	// 정적 씬이므로 다음 렌더 프레임에서 그림자맵을 한 번만 갱신한다
	renderer.shadowMap.needsUpdate = true;
}

// 모델 전역에 걸쳐 있는 얇은 수면(연못/해자) 평면 하나가 지형과 거의 같은 높이에서
// 넓게 겹쳐 있어, 그림자맵/GTAO 심도버퍼에서 z-fighting을 일으켜 넓은 영역이 통째로
// 검게 뭉개지는 원인이 된다. 이런 메시는 그림자 캐스팅과 GTAO 프리패스에서 제외한다.
function isWaterMaterial(material) {
	const mats = Array.isArray(material) ? material : [material];
	return mats.some((m) => m && /pool|water/i.test(m.name || ''));
}

function enableShadowsOnObject(object) {
	object.traverse((node) => {
		if (node.isMesh || node.isInstancedMesh) {
			node.castShadow = !isWaterMaterial(node.material);
			node.receiveShadow = true;
		}
	});
}

// ---------- 연못/개천 물 재질 사실화 ----------
// isWaterMaterial()은 이름에 "water"만 들어가도 걸리므로 연잎(수련) 알파 카드 재질
// (MI_MI_WaterLily01...)까지 함께 걸러진다 - 그림자/GTAO 제외 용도로는 문제없지만,
// 여기서는 실제 수면 재질만 사실적으로 바꿔야 하므로 "pool"이 이름에 있고 "lily"는
// 없는 재질만 골라내는 별도 판정을 쓴다 (수면 재질은 MI_Pool_02 하나뿐이고 연잎은
// 이름으로 명확히 구분된다). 실측 결과 이 모델에서는 씬 전체에 깔린 얇은 수면 박스
// 하나(MI_Pool_02)가 지형이 그 아래로 파인 자리(연못/개천)에서만 지형 틈으로 드러나
// 보이는 방식이라, "작은 연못 메시"가 지오메트리 상 따로 존재하지 않는다 - 이 재질을
// 사실적으로 바꾸는 것이 곧 연못/개천을 사실적으로 바꾸는 유일한 방법이다. 재질 이름은
// 그대로 유지해 그림자/GTAO 제외 판정(isWaterMaterial)에는 영향이 없다.
function isPondSurfaceMaterial(material) {
	return !!material && /pool/i.test(material.name || '') && !/lily/i.test(material.name || '');
}

// 외부 텍스처 없이 캔버스로 절차적 잔물결 노멀맵을 한 장 생성한다. 여러 방향·주파수의
// 사인파를 합성해 높이맵을 만들고, 이웃 텍셀과의 차분으로 기울기를 구해 노멀(RGB)로
// 인코딩한다. 경계를 wrap 계산해 RepeatWrapping과 이음매 없이 이어지도록 한다.
function createWaterNormalMap(size = 384) {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	const imageData = ctx.createImageData(size, size);

	const height = new Float32Array(size * size);
	const waves = [
		{ kx: 6.0, ky: 1.5, amp: 1.0 },
		{ kx: -3.0, ky: 4.0, amp: 0.6 },
		{ kx: 2.0, ky: -5.5, amp: 0.4 },
		{ kx: 8.5, ky: 6.0, amp: 0.25 },
	];
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const u = x / size;
			const v = y / size;
			let h = 0;
			for (const w of waves) {
				h += w.amp * Math.sin((u * w.kx + v * w.ky) * Math.PI * 2);
			}
			// 저주파 물결 위에 얹는 고주파 잔물결(살짝 일그러뜨려 규칙적으로 안 보이게)
			h += 0.15 * Math.sin((u * 23.0 + v * 17.0) * Math.PI * 2 + Math.sin(v * 9.0));
			height[y * size + x] = h;
		}
	}

	const wrap = (i) => ((i % size) + size) % size;
	const gradientStrength = 2.2; // 노멀 세기는 material.normalScale에서 최종 조절
	const normal = new THREE.Vector3();
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const hL = height[y * size + wrap(x - 1)];
			const hR = height[y * size + wrap(x + 1)];
			const hD = height[wrap(y - 1) * size + x];
			const hU = height[wrap(y + 1) * size + x];
			const dx = (hR - hL) * gradientStrength;
			const dy = (hU - hD) * gradientStrength;
			normal.set(-dx, -dy, 1).normalize();
			const idx = (y * size + x) * 4;
			imageData.data[idx + 0] = Math.round((normal.x * 0.5 + 0.5) * 255);
			imageData.data[idx + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
			imageData.data[idx + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
			imageData.data[idx + 3] = 255;
		}
	}
	ctx.putImageData(imageData, 0, 0);

	const texture = new THREE.CanvasTexture(canvas);
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.needsUpdate = true;
	return texture;
}

// 지오메트리에 UV가 없으면(연못/개천 수면 메시가 그렇다) x,z 월드 좌표를 그대로 UV로
// 써서 평면 매핑을 만든다. RepeatWrapping + texture.repeat로 실제 타일 크기(미터)를
// 맞추므로 UV를 0~1로 정규화할 필요는 없다.
function ensurePlanarUV(geometry) {
	if (geometry.attributes.uv) return;
	const pos = geometry.attributes.position;
	const uv = new Float32Array(pos.count * 2);
	for (let i = 0; i < pos.count; i++) {
		uv[i * 2] = pos.getX(i);
		uv[i * 2 + 1] = pos.getZ(i);
	}
	geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// 연못/개천 수면 재질을 낮은 roughness + 절차적 잔물결 노멀맵을 가진 MeshPhysicalMaterial로
// 교체해 하늘/환경 반사가 또렷한 사실적인 물로 만든다. 재질 이름은 유지해 기존
// 그림자/GTAO 제외 판정에는 영향을 주지 않는다.
// 반환하는 배열은 이 함수가 만든 MeshPhysicalMaterial 인스턴스 목록으로, 이후
// captureWaterEnvMap()에서 CubeCamera로 촬영한 실사 반사 큐브맵을 envMap으로
// 꽂아 넣을 때 쓴다 (전체 traverse를 다시 돌 필요 없이 바로 참조하기 위함).
function upgradeWaterMaterials(root) {
	const rippleMap = createWaterNormalMap();
	// 참조 사진(경회루 연못)처럼 파장이 길고 거의 안 보일 정도로 잔잔하게 -
	// 타일을 크게 키워(약 16m) 잔물결 주파수를 낮춘다.
	rippleMap.repeat.set(1 / 16, 1 / 16);

	const waterMaterials = [];
	let count = 0;
	root.traverse((node) => {
		if (!(node.isMesh || node.isInstancedMesh) || !node.geometry) return;
		const mats = Array.isArray(node.material) ? node.material : [node.material];
		if (!mats.some(isPondSurfaceMaterial)) return;

		ensurePlanarUV(node.geometry);

		const newMats = mats.map((m) => {
			if (!isPondSurfaceMaterial(m)) return m;
			const water = new THREE.MeshPhysicalMaterial({
				// 밝은 청록이 아니라 어둡고 녹색기 도는 청록 (참조 사진 물색). 실측 결과
				// 씬의 배경(아주 밝은 하늘색, HDR로 밝혀둔 값)이 반사/IBL에 그대로 실려
				// 예상보다 훨씬 밝게 뜨는 것을 확인해 베이스 컬러를 한 단계 더 낮췄다.
				color: new THREE.Color(0x0a2420),
				// 완전 미러(roughness 0.03대)로 하면 씬의 아주 밝은 하늘색 배경이
				// 그대로 반사되어 정오 수영장처럼 밝아진다 - 살짝 더 거칠게 해
				// 반사를 부드럽게 뭉개고(눈부신 점 반사 방지) 어두운 기본색이 우세하게 한다.
				roughness: 0.08,
				metalness: 0,
				// CubeCamera 촬영 실패 시(찾기 실패) 이 값이 scene.environment 폴백에도
				// 적용되므로 과하지 않게 낮게 잡는다. 촬영 성공 시 captureWaterEnvMap()에서
				// 실사 큐브맵 + 절제된 세기로 덮어쓴다.
				// (실측: envMapIntensity 1.0/0.45 모두 씬의 밝은 하늘 배경이 IBL로 실려
				// 수면 전체가 밝은 청록으로 뜨는 원인이었다 - 반사가 "살짝 비치는" 정도로만
				// 남도록 크게 낮춘다.)
				envMapIntensity: 0.18,
				// 태양 직사 스페큘러 하이라이트 세기도 낮춰(반사 자체는 살리되 눈부신
				// 점광 하이라이트만 죽인다) 참조 사진처럼 반짝임이 거의 없게 한다.
				specularIntensity: 0.5,
				transparent: true,
				opacity: 0.97,
				normalMap: rippleMap,
				// 태양 스페큘러가 노멀 노이즈에 갈려 생기던 "자글자글한 윤슬"의 주원인 -
				// 크게 낮춰 표면을 거의 평평하게(잔물결이 비치는 상만 살짝 흔드는 정도로).
				// 0.05에서도 밝은 하늘 반사가 물결 모양의 흰 띠로 크게 일렁여 더 낮췄다.
				normalScale: new THREE.Vector2(0.03, 0.03),
			});
			water.name = m.name; // isWaterMaterial() 이름 매칭 유지
			waterMaterials.push(water);
			return water;
		});
		node.material = Array.isArray(node.material) ? newMats : newMats[0];
		count += 1;
	});

	if (count > 0) {
		waterNormalMap = rippleMap;
		console.log(`[viewer] 연못/개천 물 재질 ${count}개를 업그레이드했습니다.`);
	} else {
		console.warn('[viewer] 연못/개천 물 메시를 찾지 못했습니다.');
	}
	return waterMaterials;
}

// ---------- 연못 실사 반사 (CubeCamera 1회 촬영) ----------
// 절차적 잔물결 노멀맵 + 낮은 roughness만으로는 반사되는 상이 scene.environment
// (RoomEnvironment, 실내용 더미 환경) 뿐이라 하늘색 밋밋한 "수영장" 느낌을 벗어나지
// 못한다. 실제 주변 나무/건물/하늘이 비치도록 연못 수면 바로 위에서 CubeCamera로
// 주변을 한 번 촬영해 그 결과를 물 재질의 envMap으로 지정한다. 씬은 정적이므로
// 1회 촬영이면 충분하고, 매 프레임 갱신하지 않아 성능 부담이 없다.
function captureWaterEnvMap(root, waterMaterials) {
	if (!waterMaterials || !waterMaterials.length) return;

	// 수면 재질이 씬 전체에 걸친 얇은 박스 하나라 좌표를 기하학적으로 뽑아낼 수 없어,
	// 의정부 연못(사용자가 참조 룩 검증에 쓰는 지점) 부근에서 아래로 레이캐스트해
	// 실제 수면 높이를 찾는다.
	const probeX = 110;
	const probeZ = -121;
	const downRay = new THREE.Raycaster(
		new THREE.Vector3(probeX, 2000, probeZ),
		new THREE.Vector3(0, -1, 0),
		0,
		4000
	);
	const hits = downRay.intersectObjects(root.children, true);
	const waterHit = hits.find((h) => {
		if (!h.object.isMesh) return false;
		const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material];
		return mats.some(isPondSurfaceMaterial);
	});
	if (!waterHit) {
		console.warn('[viewer] 물 반사 CubeCamera 위치(수면 높이)를 찾지 못해 실사 반사를 건너뜁니다.');
		return;
	}

	// 주의: 큐브 렌더타깃에 generateMipmaps를 켜서 직접 쓰면 6개 면이 각각
	// 밉맵을 만들면서 면 경계가 수면 반사에 곧은 이음매 줄로 드러난다 (실사용 확인).
	// 촬영은 밉맵 없이 하고, 아래에서 PMREM으로 변환해 이음매 없는 반사맵을 만든다.
	const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(IS_MOBILE ? 256 : 512, {
		type: THREE.HalfFloatType,
	});
	const cubeCamera = new THREE.CubeCamera(0.1, 2000, cubeRenderTarget);
	cubeCamera.position.set(probeX, waterHit.point.y + 1.5, probeZ);
	scene.add(cubeCamera);

	// 촬영 중에는 물 메시를 숨겨 자기 자신(수면)이 반사에 찍히지 않게 한다.
	const hiddenNodes = [];
	root.traverse((node) => {
		if (!(node.isMesh || node.isInstancedMesh) || !node.material) return;
		const mats = Array.isArray(node.material) ? node.material : [node.material];
		if (mats.some(isPondSurfaceMaterial)) {
			hiddenNodes.push([node, node.visible]);
			node.visible = false;
		}
	});

	cubeCamera.update(renderer, scene);

	hiddenNodes.forEach(([node, visible]) => {
		node.visible = visible;
	});
	scene.remove(cubeCamera);

	// PMREM 변환: roughness에 따라 부드럽게 흐려지는 이음매 없는 반사맵.
	// (원본 큐브 렌더타깃은 변환 후 바로 해제)
	const pmremTarget = pmremGenerator.fromCubemap(cubeRenderTarget.texture);
	cubeRenderTarget.dispose();

	waterMaterials.forEach((m) => {
		m.envMap = pmremTarget.texture;
		// 씬 배경(하늘)이 의도적으로 아주 밝게 잡혀 있어(연한 하늘색을 HDR로 밝힘)
		// 반사 세기를 1.0으로 두면 거울처럼 하늘빛을 그대로 반사해 수영장처럼 밝아진다.
		// 참조 사진처럼 어두운 수면 위에 주변 형상이 옅게만 비치도록 절제한다.
		m.envMapIntensity = 0.45;
		m.needsUpdate = true;
	});

	console.log('[viewer] 연못 CubeCamera 실사 반사 캡처를 완료했습니다.');
}

// 세로로 서 있는 대형 배경 이미지 평면(광화문 뒤 등, gltfpack이 mesh 이름을 지워
// 이름으로는 식별 불가) 판별: 한 수평축(X 또는 Z)으로 매우 길고(>200), 세로(Y)로는
// 수십 유닛, 나머지 수평축 두께는 거의 0인 Mesh. 재질/메시 이름에 Plane/Image가
// 남아있는 경우도 보조 힌트로 활용한다.
function isBackgroundPlaneMesh(node) {
	if (!node.isMesh) return false;

	const nameHint = /plane|image/i.test(node.name || '');
	const matNames = Array.isArray(node.material)
		? node.material.map((m) => (m && m.name) || '').join(' ')
		: (node.material && node.material.name) || '';
	const materialNameHint = /plane|image/i.test(matNames);

	const box = new THREE.Box3().setFromObject(node);
	if (box.isEmpty()) return false;
	const size = box.getSize(new THREE.Vector3());

	const longAxis = Math.max(size.x, size.z);
	const thinAxis = Math.min(size.x, size.z);
	const isThinVerticalSlab = longAxis > 200 && thinAxis < 1 && size.y > 10 && size.y < 100;

	return isThinVerticalSlab || ((nameHint || materialNameHint) && longAxis > 100);
}

// 배경판 재질을 unlit(MeshBasicMaterial)으로 교체한다. 기존 map/color는 유지하고
// toneMapped는 true로 두어 주변과 같은 톤매핑을 받게 해 자연스럽게 어울리도록 한다.
function toUnlitBackgroundMaterial(material) {
	const unlit = new THREE.MeshBasicMaterial({
		map: material.map || null,
		color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
		transparent: material.transparent,
		alphaTest: material.alphaTest || 0,
		side: material.side,
		toneMapped: true,
	});
	unlit.name = material.name;
	return unlit;
}

function applyUnlitBackgroundPlanes(root) {
	let count = 0;
	root.traverse((node) => {
		if (!isBackgroundPlaneMesh(node)) return;

		node.material = Array.isArray(node.material)
			? node.material.map(toUnlitBackgroundMaterial)
			: toUnlitBackgroundMaterial(node.material);
		node.castShadow = false;
		node.receiveShadow = false;
		count += 1;
	});
	if (count > 0) {
		console.log(`[viewer] 배경 이미지 평면 ${count}개를 unlit 처리했습니다.`);
	} else {
		console.warn('[viewer] 배경 이미지 평면을 찾지 못했습니다.');
	}
}

function formatBytes(bytes) {
	const mb = bytes / (1024 * 1024);
	return `${mb.toFixed(1)} MB`;
}

function setProgress(loaded, total) {
	progressWrap.hidden = false;
	// 주의: GitHub Pages 등은 파일을 gzip으로 압축 전송해서 HEAD의 Content-Length가
	// '압축된' 크기다. 스트림으로 쌓이는 loaded는 '압축 해제된' 바이트라 total을
	// 넘어설 수 있다 (실사용에서 93.8/53.1MB(100%) 표기 발생). 넘어서면 total을
	// 신뢰할 수 없으므로 크기 미상 모드로 전환한다.
	if (total && total > 0 && loaded <= total) {
		const pct = Math.min(100, (loaded / total) * 100);
		progressBar.style.width = `${pct}%`;
		progressLabel.textContent = `${formatBytes(loaded)} / ${formatBytes(total)} (${pct.toFixed(0)}%)`;
	} else {
		// total 을 모를 때는 로드된 바이트 수만 표시하고, 진행바는 애니메이션으로 처리
		progressBar.style.width = '100%';
		progressBar.classList.add('indeterminate');
		progressLabel.textContent = `${formatBytes(loaded)} 로드됨`;
	}
}

function showError(message) {
	errorEl.hidden = false;
	errorEl.textContent = message;
	progressWrap.hidden = true;
	loadBtn.disabled = false;
	loadBtn.textContent = '다시 시도';
}

function loadModel() {
	loadBtn.disabled = true;
	loadBtn.textContent = '불러오는 중...';
	errorEl.hidden = true;
	progressWrap.hidden = false;
	progressBar.classList.remove('indeterminate');
	progressBar.style.width = '0%';
	progressLabel.textContent = '준비 중...';

	if (!animationStarted) {
		initScene();
		animate();
		animationStarted = true;
	}

	const ktx2Loader = new KTX2Loader()
		.setTranscoderPath('./libs/basis/')
		.detectSupport(renderer);

	const gltfLoader = new GLTFLoader();
	gltfLoader.setKTX2Loader(ktx2Loader);
	gltfLoader.setMeshoptDecoder(MeshoptDecoder);

	fetchModelData(MODEL_URLS, setProgress)
		.then(
			(buffer) =>
				new Promise((resolve, reject) => {
					gltfLoader.parse(buffer, './', resolve, reject);
				})
		)
		.then((gltf) => {
			scene.add(gltf.scene);
			modelRoot = gltf.scene;
			enableShadowsOnObject(gltf.scene);
			applyUnlitBackgroundPlanes(gltf.scene);
			buildRaycastTargets(gltf.scene);
			const waterMaterials = upgradeWaterMaterials(gltf.scene);
			captureWaterEnvMap(gltf.scene, waterMaterials);
			frameCameraToObject(gltf.scene);

			progressWrap.hidden = true;
			posterEl.classList.add('viewer-poster--hidden');
		})
		.catch((error) => {
			console.error('GLTF 로드 오류:', error);
			showError(
				'3D 모델을 불러오지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요. (로컬에서 여는 경우 http:// 서버를 통해 접속해야 하며, file:// 로는 동작하지 않습니다)'
			);
		});
}

// 모델 데이터를 (여러 조각이면 순서대로) 내려받아 하나의 ArrayBuffer로 이어붙인다.
// HEAD 요청으로 전체 크기를 먼저 합산해 진행률을 정확히 표시한다.
async function fetchModelData(urls, onProgress) {
	let total = 0;
	try {
		for (const url of urls) {
			const head = await fetch(url, { method: 'HEAD' });
			// gzip/br 압축 전송이면 Content-Length는 '압축된' 크기라 실제 받는
			// 바이트(압축 해제)와 달라 퍼센트가 왜곡된다 - 크기 미상 모드로 간다.
			if (head.headers.get('content-encoding')) {
				total = 0;
				break;
			}
			total += Number(head.headers.get('Content-Length')) || 0;
		}
	} catch (e) {
		total = 0; // HEAD 실패 시 진행률은 크기 미상 모드로 표시
	}

	// 전체 크기를 알면 최종 버퍼를 미리 확보하고 조각을 바로 그 자리에 써서
	// 메모리 피크를 절반으로 줄인다 (모바일 탭 강제종료 방지에 중요).
	let merged = total > 0 ? new Uint8Array(total) : null;
	const chunks = merged ? null : [];
	let loaded = 0;
	for (const url of urls) {
		const resp = await fetch(url);
		if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${url}`);
		const reader = resp.body.getReader();
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (merged) {
				if (loaded + value.byteLength > merged.length) {
					// 실제 크기가 HEAD 합계보다 클 수 있다 (gzip 전송 시 Content-Length는
					// 압축 크기). 조각마다 정확히 늘리면 매 조각 전체 복사가 일어나
					// 폰에서 심하게 버벅이므로, 1.5배 여유를 두고 한 번에 늘린다.
					const grown = new Uint8Array(
						Math.max(loaded + value.byteLength, Math.floor(merged.length * 1.5))
					);
					grown.set(merged.subarray(0, loaded));
					merged = grown;
				}
				merged.set(value, loaded);
			} else {
				chunks.push(value);
			}
			loaded += value.byteLength;
			onProgress(loaded, total);
		}
	}

	// 정확히 맞으면 복사 없이 그대로 반환 (slice는 사본을 만들어 메모리를 2배로 쓴다)
	if (merged) return loaded === merged.length ? merged.buffer : merged.buffer.slice(0, loaded);
	const out = new Uint8Array(loaded);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.byteLength;
	}
	return out.buffer;
}

loadBtn.addEventListener('click', loadModel);

// ---------- 풀스크린 토글 ----------
// 뷰어 컨테이너(#viewer-container) 자체를 Fullscreen API 대상으로 삼는다.
// 버튼이 그 컨테이너의 자식이라 풀스크린 상태에서도 계속 보이고 클릭 가능하다.
function isFullscreen() {
	return document.fullscreenElement === container;
}

function updateFullscreenButton() {
	if (!fullscreenBtn) return;
	if (isFullscreen()) {
		fullscreenBtn.classList.add('is-active');
		fullscreenBtn.title = '전체화면 종료';
		fullscreenBtn.setAttribute('aria-label', '전체화면 종료');
	} else {
		fullscreenBtn.classList.remove('is-active');
		fullscreenBtn.title = '전체화면';
		fullscreenBtn.setAttribute('aria-label', '전체화면');
	}
}

function toggleFullscreen() {
	if (!isFullscreen()) {
		container.requestFullscreen().catch((err) => {
			console.error('전체화면 전환 실패:', err);
		});
	} else if (document.exitFullscreen) {
		document.exitFullscreen();
	}
}

if (fullscreenBtn) {
	fullscreenBtn.addEventListener('click', toggleFullscreen);
}

document.addEventListener('fullscreenchange', () => {
	updateFullscreenButton();
	// 컨테이너 크기가 바뀌므로 렌더러/카메라/컴포저를 다시 맞춘다.
	onResize();
});

// ---------- 우측 고정 도트 내비게이션 ----------
// (Google Arts "Meroë" 스타일) IntersectionObserver로 현재 보이는 섹션을 추적하고,
// 클릭 시 부드럽게 스크롤한다. three.js 와는 무관한 순수 DOM 기능이라 씬 로드 여부와
// 상관없이 페이지 로드 시 바로 동작한다.
(function initDotNav() {
	const nav = document.getElementById('dot-nav');
	if (!nav) return;

	const items = Array.from(nav.querySelectorAll('li[data-section]'));
	const links = Array.from(nav.querySelectorAll('a[data-target]'));
	const sections = links
		.map((a) => document.getElementById(a.dataset.target))
		.filter(Boolean);

	function setActive(id) {
		items.forEach((li) => {
			li.classList.toggle('is-active', li.dataset.section === id);
		});
	}

	links.forEach((a) => {
		a.addEventListener('click', (event) => {
			event.preventDefault();
			const target = document.getElementById(a.dataset.target);
			if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	});

	if (sections.length === 0) return;

	if (!('IntersectionObserver' in window)) {
		setActive(sections[0].id);
		return;
	}

	const ratios = new Map();
	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
			});
			let bestId = null;
			let bestRatio = 0;
			ratios.forEach((ratio, id) => {
				if (ratio > bestRatio) {
					bestRatio = ratio;
					bestId = id;
				}
			});
			if (bestId) setActive(bestId);
		},
		{ threshold: [0, 0.1, 0.25, 0.5, 0.75, 1], rootMargin: '-35% 0px -35% 0px' }
	);

	sections.forEach((s) => observer.observe(s));
	setActive(sections[0].id);
})();
