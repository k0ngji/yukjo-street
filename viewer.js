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

// 모델(129MB)은 GitHub 저장소의 파일당 100MB 제한 때문에 저장소가 아닌
// Release 첨부파일로 올린다. 로컬 개발 서버에서는 assets의 파일을 그대로 쓰고,
// 배포된 사이트(github.io)에서는 Release 주소에서 내려받는다.
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const MODEL_URL = IS_LOCAL
	? './assets/TM_6street2_web.glb'
	: 'https://github.com/k0ngji/yukjo-street/releases/download/v1.0/TM_6street2_web.glb';

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

// 화면 정규 좌표(0~1, y는 위에서 아래)에서 씬으로 레이캐스트해 표면 월드 좌표를 반환한다.
// 핫스팟 좌표 보정(캘리브레이션) 및 더블클릭 리센터 기능에서 공용으로 사용.
function raycastFromNormalized(nx, ny) {
	if (!camera || !scene) return null;
	const mouse = new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1));
	const raycaster = new THREE.Raycaster();
	raycaster.setFromCamera(mouse, camera);
	const hits = raycaster.intersectObjects(scene.children, true);
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
		startTime: performance.now(),
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
	const t = Math.min(1, (now - recenterState.startTime) / recenterState.duration);
	const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
	controls.target.lerpVectors(recenterState.startTarget, recenterState.newTarget, eased);
	camera.position.lerpVectors(recenterState.startCamPos, recenterState.newCameraPos, eased);
	if (t >= 1) {
		recenterState = null;
		controls.enabled = true;
	}
}

function onCanvasDoubleClick(event) {
	if (!camera || !scene || !controls || !renderer) return;
	const rect = renderer.domElement.getBoundingClientRect();
	const nx = (event.clientX - rect.left) / rect.width;
	const ny = (event.clientY - rect.top) / rect.height;
	const point = raycastFromNormalized(nx, ny);
	if (!point) return; // 모델 표면과 교차하지 않으면 무시
	const floor = Math.max(controls.minDistance * 1.8, 25);
	startRecenter(point, recenterZoomDistance(0.5, floor));
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
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
	sunLight.shadow.mapSize.set(4096, 4096);
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

	window.addEventListener('resize', onResize);

	// 더블클릭 리센터 (스케치팹 스타일)
	renderer.domElement.addEventListener('dblclick', onCanvasDoubleClick);
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
	if (total && total > 0) {
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

	gltfLoader.load(
		MODEL_URL,
		(gltf) => {
			scene.add(gltf.scene);
			modelRoot = gltf.scene;
			enableShadowsOnObject(gltf.scene);
			applyUnlitBackgroundPlanes(gltf.scene);
			frameCameraToObject(gltf.scene);

			progressWrap.hidden = true;
			posterEl.classList.add('viewer-poster--hidden');
		},
		(xhr) => {
			setProgress(xhr.loaded, xhr.total);
		},
		(error) => {
			console.error('GLTF 로드 오류:', error);
			showError(
				'3D 모델을 불러오지 못했습니다. assets/TM_6street2_web.glb 파일이 존재하는지, 그리고 http:// 로 서버를 통해 접속했는지 확인해 주세요. (file:// 로는 동작하지 않습니다)'
			);
		}
	);
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
