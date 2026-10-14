// ===== 상태 변수 =====
let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let lastTranslateX = 0;
let lastTranslateY = 0;
const MIN_SCALE = 0.08;
const MAX_SCALE = 3;
let activeHotspot = null;
let imgWidth = 0;
let imgHeight = 0;
let mouseMoved = false;

// ===== TTS 상태 =====
let ttsEnabled = true;  // 기본 ON
let ttsUtterance = null;

// ===== 효과음 (Web Audio API) =====
let _audioCtx = null;
function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
}

// 딩동댕 — 3음 체임 (D5 → G5 → A5)
function playCorrectSound() {
    try {
        const ctx = getAudioCtx();
        const notes = [587.33, 783.99, 880.00]; // D5, G5, A5
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.18;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.38, t + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
            osc.start(t);
            osc.stop(t + 0.4);
        });
    } catch (e) { }
}

// 삐삐 — 두 번 짧은 버저
function playWrongSound() {
    try {
        const ctx = getAudioCtx();
        [0, 0.22].forEach(offset => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.value = 220;
            const t = ctx.currentTime + offset;
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            osc.start(t);
            osc.stop(t + 0.2);
        });
    } catch (e) { }
}

// ===== 꽃가루 (Canvas confetti) =====
let _confettiCanvas = null;
let _confettiCtx = null;
let _confettiParticles = [];
let _confettiRaf = null;

function ensureConfettiCanvas() {
    if (_confettiCanvas) return;
    _confettiCanvas = document.createElement('canvas');
    _confettiCanvas.style.cssText = [
        'position:fixed', 'inset:0', 'width:100%', 'height:100%',
        'pointer-events:none', 'z-index:9999'
    ].join(';');
    document.body.appendChild(_confettiCanvas);
    _confettiCtx = _confettiCanvas.getContext('2d');
}

function resizeConfettiCanvas() {
    if (_confettiCanvas) {
        _confettiCanvas.width = window.innerWidth;
        _confettiCanvas.height = window.innerHeight;
    }
}
window.addEventListener('resize', resizeConfettiCanvas);

const CONFETTI_COLORS = [
    '#FFD700', '#FF6B6B', '#6BFFB8', '#6BB8FF', '#FF6BFF',
    '#FFAA00', '#AAFFAA', '#FF9966', '#C0F0FF', '#FFE0A0'
];

function launchConfetti() {
    ensureConfettiCanvas();
    resizeConfettiCanvas();
    const W = _confettiCanvas.width;
    const H = _confettiCanvas.height;

    // 150개 파티클 — 화면 하단 중앙에서 위로 솟구침
    for (let i = 0; i < 150; i++) {
        // 발사 원점: 화면 하단 중앙 ±30%
        const originX = W * (0.35 + Math.random() * 0.30);
        const originY = H + 10;

        // 위 방향 초속, 45°~135° 사이로 넓게 퍼짐
        const angle = -(Math.PI * 0.25 + Math.random() * Math.PI * 0.50);
        const speed = 10 + Math.random() * 18;

        _confettiParticles.push({
            x: originX,
            y: originY,
            w: 7 + Math.random() * 8,
            h: 4 + Math.random() * 5,
            color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.3,
            life: 1.0,
            decay: 0.005 + Math.random() * 0.005
        });
    }

    if (!_confettiRaf) tickConfetti();
}

function tickConfetti() {
    const ctx = _confettiCtx;
    const H = _confettiCanvas.height;
    ctx.clearRect(0, 0, _confettiCanvas.width, H);

    _confettiParticles = _confettiParticles.filter(p => p.life > 0.01 && p.y < H + 20);

    _confettiParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;   // gravity
        p.vx *= 0.99;
        p.angle += p.spin;
        p.life -= p.decay;

        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
    });

    if (_confettiParticles.length > 0) {
        _confettiRaf = requestAnimationFrame(tickConfetti);
    } else {
        _confettiRaf = null;
        ctx.clearRect(0, 0, _confettiCanvas.width, _confettiCanvas.height);
    }
}

// ===== 게임 상태 =====
let gameModeActive = false;
let gameQueue = [];
let gameRound = 0;
let gameScore = 0;
let gameWrong = [];
let gameLocked = false;

// ===== DOM 요소 =====
const viewport = document.getElementById('viewport');
const canvas = document.getElementById('canvas');
const photo = document.getElementById('photo');
const hotspotsContainer = document.getElementById('hotspots');
const tooltip = document.getElementById('tooltip');
const infoPanel = document.getElementById('info-panel');
const infoName = document.getElementById('info-name');
const infoYears = document.getElementById('info-years');
const infoDesc = document.getElementById('info-desc');
const closePanel = document.getElementById('close-panel');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');
const helpHint = document.getElementById('help-hint');
const ttsToggleBtn = document.getElementById('tts-toggle');

// ===== 게임 DOM =====
const modeGameBtn = document.getElementById('mode-game');
const modeDescBtn = document.getElementById('mode-desc');
const gamePanel = document.getElementById('game-panel');
const gameRoundEl = document.getElementById('game-round-display');
const gameScoreEl = document.getElementById('game-score-display');
const gameNameEl = document.getElementById('game-name');
const gameFeedbackEl = document.getElementById('game-feedback');
const gameDescEl = document.getElementById('game-desc');
const gameNextBtn = document.getElementById('game-next');
const gameResultEl = document.getElementById('game-result');
const gameResultScore = document.getElementById('game-result-score');
const gameWrongList = document.getElementById('game-wrong-list');
const gameRetryBtn = document.getElementById('game-retry');
const gameRestartBtn = document.getElementById('game-restart');
const gameExitBtn = document.getElementById('game-exit');

// 모드 탭 UI 업데이트 헬퍼
function setModeUI(mode) {
    // mode: 'game' | 'desc'
    // 게임 모드: 크이 설명 버튼만 노출 / 설명 모드: 크이 게임 버튼만 노출
    document.body.classList.toggle('game-on', mode === 'game');
    if (mode === 'game') {
        closeList();
        modeGameBtn.classList.add('hidden');     // 현재 게임모드 → 게임버튼 숨김
        modeDescBtn.classList.remove('hidden'); // 설명버튼 표시
    } else {
        modeDescBtn.classList.add('hidden');    // 현재 설명모드 → 설명버튼 숨김
        modeGameBtn.classList.remove('hidden'); // 게임버튼 표시
    }
}

// ===== 이미지 로드 후 초기화 =====
let _initialized = false;
function _init() {
    if (_initialized) return;
    _initialized = true;
    imgWidth = photo.naturalWidth || 3820;
    imgHeight = photo.naturalHeight || 2964;
    const ld = document.getElementById('loading');
    if (ld) ld.classList.add('hidden');
    initializeView();
    createHotspots();
    setModeUI('desc');  // 설명 모드로 시작
}

photo.addEventListener('load', _init);
if (photo.complete && photo.naturalWidth > 0) _init();

function initializeView() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;

    canvas.style.width = imgWidth + 'px';
    canvas.style.height = imgHeight + 'px';
    photo.style.width = imgWidth + 'px';
    photo.style.height = imgHeight + 'px';

    // 처음에는 인물들이 있는 장면(아치 아랫부분)이 화면에 꽉 차도록 맞춤
    const f = { x: 321, y: 383, w: 3212, h: 1980 };
    scale = Math.min(vw / f.w, vh / f.h);
    translateX = (vw - f.w * scale) / 2 - f.x * scale;
    translateY = (vh - f.h * scale) / 2 - f.y * scale;
    // 세로로 긴 화면에서는 얼굴이 너무 작으므로 인물들이 모인 가운데 띠를 크게 보여 줌 (좌우는 끌어서 보기)
    if (vh > vw * 1.15) {
        const band = { cx: 1930, cy: 1660, w: 1900 };
        scale = Math.min(vw / band.w * 1.0, vh / 1300);
        translateX = vw / 2 - band.cx * scale;
        translateY = vh / 2 - band.cy * scale;
    }

    applyTransform();
}

function applyTransform() {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const w = imgWidth * scale, h = imgHeight * scale;
    translateX = Math.min(vw * 0.6, Math.max(vw * 0.4 - w, translateX));
    translateY = Math.min(vh * 0.6, Math.max(vh * 0.4 - h, translateY));
    canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    // 테두리 굵기가 확대 배율과 상관없이 화면에서 일정하게 보이도록
    canvas.style.setProperty('--inv', (1 / scale).toFixed(3));
}

// ===== 핫스팟 생성 (픽셀 좌표 기반) =====
function createHotspots() {
    hotspotsContainer.innerHTML = '';
    people.forEach((s, i) => {
        const el = document.createElement('div');
        el.className = 'hotspot';
        // 얼굴을 감싸는 타원 (rx·ry 없으면 원 r)
        const rx = s.rx || s.r, ry = s.ry || s.r;
        el.style.left = (s.cx - rx) + 'px';
        el.style.top = (s.cy - ry) + 'px';
        el.style.width = (rx * 2) + 'px';
        el.style.height = (ry * 2) + 'px';
        if (s.rot) el.style.rotate = s.rot + 'deg';
        el.dataset.index = i;
        if (s.oldView) el.classList.add('old-view');
        // 작은 원(뒤쪽 무리 얼굴)이 큰 원에 가려 눌리지 않도록 작을수록 위에 놓음
        el.style.zIndex = String(1000 - Math.round(Math.sqrt(rx * ry)));

        el.addEventListener('mouseenter', onHotspotEnter);
        el.addEventListener('mouseleave', onHotspotLeave);
        el.addEventListener('mousemove', onHotspotMove);
        el.addEventListener('click', onHotspotClick);
        el.addEventListener('touchstart', onTouchHotspot, { passive: true });

        hotspotsContainer.appendChild(el);
    });
}

// ===== 툴팁 표시 =====
function onHotspotEnter(e) {
    if (gameModeActive) return;  // 게임 모드에서는 툴팁 비활성화
    const idx = parseInt(e.target.dataset.index);
    const s = people[idx];
    tooltip.textContent = `${s.name} (${s.nameEn})`;
    tooltip.classList.remove('hidden');
    positionTooltip(e);
}

function onHotspotLeave() {
    tooltip.classList.add('hidden');
}

function onHotspotMove(e) {
    positionTooltip(e);
}

function positionTooltip(e) {
    const x = e.clientX;
    const y = e.clientY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Let layout recalculate for wrapping
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;

    let left = x + 16;
    let top = y - th - 12;

    // Clamp horizontally
    if (left + tw > vw - 12) left = vw - tw - 12;
    if (left < 12) left = 12;
    // Clamp vertically
    if (top < 10) top = y + 20;
    if (top + th > vh - 10) top = vh - th - 10;

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

// ===== 클릭 → 정보 패널 =====
function onHotspotClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const idx = parseInt(e.target.dataset.index);

    // 게임 모드 분기
    if (gameModeActive) {
        gameHandleClick(idx, e.target);
        return;
    }

    openInfo(idx);
}

// 인물 정보 열기 (클릭·탭·목록 공통)
function openInfo(idx) {
    const s = people[idx];
    const el = hotspotsContainer.children[idx];
    if (activeHotspot) activeHotspot.classList.remove('active');
    activeHotspot = el;
    activeHotspot.classList.add('active');
    tooltip.classList.add('hidden');

    infoName.textContent = `${s.name}   ${s.nameEn}`;
    infoYears.textContent = s.years;
    infoDesc.textContent = s.desc;
    infoDesc.scrollTop = 0;

    infoPanel.classList.remove('hidden');
    helpHint.style.opacity = '0';

    // 고른 얼굴이 정보 패널이나 버튼에 가려지면 보이는 곳으로 옮김
    requestAnimationFrame(() => ensureVisible(idx));

    ttsSpeak(s);
}

// 얼굴이 화면의 빈 곳(머리글 아래 ~ 정보 패널 위)에 오도록 이동
function ensureVisible(idx, force) {
    const s = people[idx];
    const vr = viewport.getBoundingClientRect();
    const top = (document.getElementById('app-header').getBoundingClientRect().bottom || 0) + 10;
    const panelTop = infoPanel.classList.contains('hidden') ? window.innerHeight : infoPanel.getBoundingClientRect().top;
    const bottom = Math.min(window.innerHeight, panelTop) - 10;
    const fx = vr.left + translateX + s.cx * scale;
    const fy = vr.top + translateY + s.cy * scale;
    const ry = (s.ry || s.r) * scale;
    const margin = 70;
    if (!force && fx > margin && fx < window.innerWidth - margin && fy - ry > top && fy + ry < bottom) return;
    const targetX = window.innerWidth / 2;
    const targetY = (top + bottom) / 2;
    animatePan(translateX + (targetX - fx), translateY + (targetY - fy));
}

// 부드럽게 화면 이동 (선택적으로 확대 배율도 바꿈)
let _panRaf = null;
function animatePan(tx, ty, newScale) {
    cancelAnimationFrame(_panRaf);
    const sx = translateX, sy = translateY, ss = scale;
    const es = newScale || scale;
    const t0 = performance.now(), dur = 380;
    const step = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        scale = ss + (es - ss) * e;
        translateX = sx + (tx - sx) * e;
        translateY = sy + (ty - sy) * e;
        applyTransform();
        if (k < 1) _panRaf = requestAnimationFrame(step);
    };
    _panRaf = requestAnimationFrame(step);
}

// 얼굴로 날아가기: 얼굴이 적당한 크기로 보이게 확대하고 가운데로
function flyTo(idx) {
    const s = people[idx];
    const vr = viewport.getBoundingClientRect();
    const ry = s.ry || s.r;
    const target = Math.min(MAX_SCALE, Math.max(scale, 70 / ry));
    const top = (document.getElementById('app-header').getBoundingClientRect().bottom || 0) + 10;
    const panelGuess = window.innerHeight * (window.innerWidth <= 768 ? 0.42 : 0.3);
    const cyScreen = (top + window.innerHeight - panelGuess) / 2 - vr.top;
    animatePan(vr.width / 2 - s.cx * target, cyScreen - s.cy * target, target);
}

function onTouchHotspot(e) {
    // 탭은 click 이벤트(onHotspotClick)가 처리함. 얼굴 위에서 시작한 끌기·핀치도 그대로 되도록 막지 않음.
}

// ===== 정보 패널 닫기 =====
closePanel.addEventListener('click', () => {
    infoPanel.classList.add('hidden');
    if (activeHotspot) {
        activeHotspot.classList.remove('active');
        activeHotspot = null;
    }
    ttsStop();
});

// ===== 마우스 휠 줌 =====
viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    const factor = 1 + delta * 0.12;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));

    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const ratio = newScale / scale;
    translateX = mx - ratio * (mx - translateX);
    translateY = my - ratio * (my - translateY);
    scale = newScale;

    applyTransform();
}, { passive: false });

// ===== 드래그 팬 =====
viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    mouseMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    lastTranslateX = translateX;
    lastTranslateY = translateY;
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) mouseMoved = true;
    translateX = lastTranslateX + dx;
    translateY = lastTranslateY + dy;
    applyTransform();
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

// ===== 터치 팬/줌 =====
let lastTouchDist = 0;
let lastTouchMid = { x: 0, y: 0 };
let touchStartTime = 0;
let touchMoved = false;

viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        isDragging = true;
        touchMoved = false;
        touchStartTime = Date.now();
        dragStartX = e.touches[0].clientX;
        dragStartY = e.touches[0].clientY;
        lastTranslateX = translateX;
        lastTranslateY = translateY;
    } else if (e.touches.length === 2) {
        isDragging = false;
        touchMoved = true;
        lastTouchDist = getTouchDist(e.touches);
        lastTouchMid = getTouchMid(e.touches);
    }
}, { passive: true });

viewport.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - dragStartX;
        const dy = e.touches[0].clientY - dragStartY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) touchMoved = true;
        translateX = lastTranslateX + dx;
        translateY = lastTranslateY + dy;
        applyTransform();
    } else if (e.touches.length === 2) {
        const newDist = getTouchDist(e.touches);
        const newMid = getTouchMid(e.touches);
        const ratio = newDist / lastTouchDist;
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * ratio));

        const rect = viewport.getBoundingClientRect();
        const mx = newMid.x - rect.left;
        const my = newMid.y - rect.top;

        const scaleRatio = newScale / scale;
        translateX = mx - scaleRatio * (mx - translateX);
        translateY = my - scaleRatio * (my - translateY);
        scale = newScale;

        lastTouchDist = newDist;
        applyTransform();
    }
}, { passive: false });

viewport.addEventListener('touchend', () => {
    isDragging = false;
});

// 손가락·마우스 종류 기억 (가까운 얼굴 보정 범위에 씀)
let lastPointerType = 'mouse';
viewport.addEventListener('pointerdown', (e) => { lastPointerType = e.pointerType || 'mouse'; }, true);

// 누른 곳 가까이에 있는 얼굴 찾기 (화면 픽셀 기준 tol 안)
function nearestHotspot(clientX, clientY, tol) {
    const vr = viewport.getBoundingClientRect();
    const px = (clientX - vr.left - translateX) / scale;
    const py = (clientY - vr.top - translateY) / scale;
    let best = -1, bestGap = Infinity;
    people.forEach((s, i) => {
        const rx = s.rx || s.r, ry = s.ry || s.r;
        const a = -(s.rot || 0) * Math.PI / 180;
        const dx0 = px - s.cx, dy0 = py - s.cy;
        const dx = dx0 * Math.cos(a) - dy0 * Math.sin(a);
        const dy = dx0 * Math.sin(a) + dy0 * Math.cos(a);
        const d = Math.hypot(dx / rx, dy / ry);
        const gap = Math.max(0, d - 1) * Math.min(rx, ry) * scale;  // 타원 가장자리까지 대략의 화면 거리
        if (gap < bestGap) { bestGap = gap; best = i; }
    });
    return bestGap <= tol ? best : -1;
}

function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getTouchMid(touches) {
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    };
}

// ===== 줌 버튼 =====
zoomInBtn.addEventListener('click', () => zoomTo(1.3));
zoomOutBtn.addEventListener('click', () => zoomTo(1 / 1.3));
zoomResetBtn.addEventListener('click', () => {
    initializeView();
    infoPanel.classList.add('hidden');
    if (activeHotspot) {
        activeHotspot.classList.remove('active');
        activeHotspot = null;
    }
});

function zoomTo(factor) {
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    const rect = viewport.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const ratio = newScale / scale;
    translateX = cx - ratio * (cx - translateX);
    translateY = cy - ratio * (cy - translateY);
    scale = newScale;

    applyTransform();
}

// ===== 창 크기 변경 대응 =====
window.addEventListener('resize', () => {
    initializeView();
});

// ===== 도움말 자동 숨김 =====
setTimeout(() => {
    if (helpHint) helpHint.style.opacity = '0';
}, 8000);

// ===== 빈 곳 클릭 시 정보 패널 닫기 =====
viewport.addEventListener('click', (e) => {
    if (mouseMoved) return; // ignore clicks after drag
    if (!e.target.classList.contains('hotspot')) {
        // 얼굴을 살짝 빗나가게 눌렀으면 가장 가까운 얼굴로 보정
        const near = nearestHotspot(e.clientX, e.clientY, lastPointerType === 'mouse' ? 8 : 22);
        if (near >= 0) {
            if (gameModeActive) gameHandleClick(near, hotspotsContainer.children[near]);
            else openInfo(near);
            return;
        }
        if (gameModeActive) return;
        infoPanel.classList.add('hidden');
        if (activeHotspot) {
            activeHotspot.classList.remove('active');
            activeHotspot = null;
        }
    }
});

// ===== iOS context menu 방지 =====
document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('#viewport')) e.preventDefault();
});

// ===== TTS (Audio element + Web Speech API fallback) =====
let currentAudio = null;

// 재생 요청마다 번호를 매겨, 이전 요청의 늦게 도착한 실패 신호가 새 재생을 방해하지 않게 함
let ttsRequestId = 0;

// MP3를 재생하고, 파일이 없거나 재생이 막히면 브라우저 음성으로 "한 번만" 대신 읽음
function playAudioOrSpeak(audioPath, fallbackText, speakFn) {
    const myId = ++ttsRequestId;
    let fellBack = false;
    const fallback = () => {
        if (fellBack || myId !== ttsRequestId) return;   // 오류·재생실패가 둘 다 와도 한 번만
        fellBack = true;
        ttsToggleBtn.classList.remove('tts-speaking');
        if (currentAudio) { currentAudio.onerror = null; currentAudio = null; }
        speakFn(fallbackText);
    };
    if (!audioPath) { fallback(); return; }
    const audio = new Audio(audioPath);
    currentAudio = audio;
    audio.onplay = () => { if (myId === ttsRequestId) ttsToggleBtn.classList.add('tts-speaking'); };
    audio.onended = () => {
        if (myId !== ttsRequestId) return;
        ttsToggleBtn.classList.remove('tts-speaking');
        currentAudio = null;
    };
    audio.onerror = fallback;
    audio.play().catch(fallback);
}

function ttsSpeak(s) {
    if (!ttsEnabled) return;
    ttsStop();
    playAudioOrSpeak(s.audioFile, s.tts || s.desc, ttsSpeakWebSpeech);
}

function getTtsVoice() {
    const voices = window.speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang));
    if (!voices.length) return null;
    return voices.find(v => /natural|online|neural/i.test(v.name))
        || voices.find(v => /google/i.test(v.name))
        || voices[0];
}

function speakHint(text) {
    const hint = new SpeechSynthesisUtterance(text);
    hint.lang = 'ko-KR';
    hint.rate = 1.0;
    const voice = getTtsVoice();
    if (voice) hint.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(hint);
}

function ttsSpeakWebSpeech(text) {
    window.speechSynthesis.cancel();   // 대기열에 남은 말이 다시 나오지 않게 비움
    ttsUtterance = new SpeechSynthesisUtterance(text);
    ttsUtterance.lang = 'ko-KR';
    ttsUtterance.rate = 0.92;
    ttsUtterance.pitch = 1.0;
    ttsUtterance.volume = 1.0;

    const setVoiceAndSpeak = () => {
        const voice = getTtsVoice();
        if (voice) ttsUtterance.voice = voice;
        ttsUtterance.onstart = () => ttsToggleBtn.classList.add('tts-speaking');
        ttsUtterance.onend = () => {
            ttsToggleBtn.classList.remove('tts-speaking');
            ttsUtterance = null;
        };
        ttsUtterance.onerror = () => {
            ttsToggleBtn.classList.remove('tts-speaking');
            ttsUtterance = null;
        };
        window.speechSynthesis.speak(ttsUtterance);
    };

    if (window.speechSynthesis.getVoices().length > 0) {
        setVoiceAndSpeak();
    } else {
        // 음성 목록이 늦게 오는 기기 대비: 목록이 오거나 0.6초가 지나면 한 번만 읽음
        let done = false;
        const once = () => {
            if (done) return;
            done = true;
            window.speechSynthesis.onvoiceschanged = null;
            setVoiceAndSpeak();
        };
        window.speechSynthesis.onvoiceschanged = once;
        setTimeout(once, 600);
    }
}

function ttsStop() {
    ttsRequestId++;   // 진행 중이던 요청의 늦은 대체 재생도 취소
    // Audio 요소 정지
    if (currentAudio) {
        currentAudio.onerror = null;
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    // Web Speech API 정지
    window.speechSynthesis.cancel();
    ttsToggleBtn.classList.remove('tts-speaking');
    ttsUtterance = null;
}

// TTS ON/OFF 토글
ttsToggleBtn.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    if (ttsEnabled) {
        ttsToggleBtn.classList.remove('tts-off');
        ttsToggleBtn.classList.add('tts-on');
        ttsToggleBtn.querySelector('.tts-icon').textContent = '🔊';
        ttsToggleBtn.title = '음성 읽기 ON (클릭하여 끄기)';
    } else {
        ttsStop();
        ttsToggleBtn.classList.remove('tts-on', 'tts-speaking');
        ttsToggleBtn.classList.add('tts-off');
        ttsToggleBtn.querySelector('.tts-icon').textContent = '🔇';
        ttsToggleBtn.title = '음성 읽기 OFF (클릭하여 켜기)';
    }
});

// ===== 게임 모드 =====
function withEulReul(w) {
    const c = w.charCodeAt(w.length - 1);
    if (c < 0xAC00 || c > 0xD7A3) return w + '을(를)';
    return w + (((c - 0xAC00) % 28) ? '을' : '를');
}
function spokenName(s) { return s.name.replace(/\s*\(.*?\)\s*/g, ''); }

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function startGame() {
    gameModeActive = true;
    gameRound = 0;
    gameScore = 0;
    gameWrong = [];
    gameLocked = false;

    // 인물 셔플 후 10명 선택
    // 학계에서 이름이 정해지지 않은 옛 해석 인물(oldView)은 문제로 내지 않음
    gameQueue = shuffleArray(people.filter(p => !p.oldView)).slice(0, 10);

    // 설명 모드 UI 숨기기
    infoPanel.classList.add('hidden');
    ttsStop();

    // 게임 탭 활성화
    setModeUI('game');

    // 게임 패널 표시
    gamePanel.classList.remove('hidden');
    gameResultEl.classList.add('hidden');

    gameNewRound();
}

function endGame() {
    gameModeActive = false;
    gameLocked = false;

    // 핫스팟 애니메이션 초기화
    clearGameHotspotStyles();

    // 게임 UI 숨기기
    gamePanel.classList.add('hidden');
    gameResultEl.classList.add('hidden');

    // 설명 탭 활성화
    setModeUI('desc');

    ttsStop();
}

function gameNewRound() {
    if (gameRound >= gameQueue.length) {
        showGameResult();
        return;
    }

    gameLocked = false;
    clearGameHotspotStyles();

    const s = gameQueue[gameRound];
    gameRound++;

    gameRoundEl.textContent = `${gameRound} / ${gameQueue.length}`;
    gameScoreEl.textContent = `${gameScore}점`;
    gameNameEl.textContent = s.name;

    // 피드백 / 설명 / 버튼 숨김
    gameFeedbackEl.className = 'hidden';
    gameFeedbackEl.textContent = '';
    gameDescEl.classList.add('hidden');
    gameDescEl.textContent = '';
    gameNextBtn.classList.add('hidden');

    // 이름을 TTS로 읽어줌 — hint MP3 우선, 없으면 Web Speech API fallback
    if (ttsEnabled) {
        ttsStop();
        // audioFile 경로(예: "audio/plato.mp3")에서 hint 경로 유추
        const hintPath = s.audioFile
            ? s.audioFile.replace(/\/([^/]+)\.mp3$/, '/hint_$1.mp3')
            : null;
        playAudioOrSpeak(hintPath, `${withEulReul(spokenName(s))} 찾아보세요`, speakHint);
    }
}

function gameHandleClick(clickedIdx, clickedEl) {
    if (gameLocked) return;

    const correctIdx = people.indexOf(gameQueue[gameRound - 1]);
    const correctEl = hotspotsContainer.children[correctIdx];

    if (clickedIdx === correctIdx) {
        // ===== 정답 =====
        gameLocked = true;
        gameScore++;
        gameScoreEl.textContent = `${gameScore}점`;

        clickedEl.classList.add('hotspot-correct');

        gameFeedbackEl.textContent = '🎉 정답!';
        gameFeedbackEl.className = 'correct';

        // 효과음 + 꽃가루
        playCorrectSound();
        launchConfetti();

        // 설명 텍스트 표시 (TTS 없이)
        const s = gameQueue[gameRound - 1];
        gameDescEl.textContent = s.desc;
        gameDescEl.classList.remove('hidden');

        // 다음 문제 버튼 표시
        gameNextBtn.classList.remove('hidden');

    } else {
        // ===== 오답 =====
        gameLocked = true;

        const wrongName = people[clickedIdx].name;
        const correctName = gameQueue[gameRound - 1].name;

        // 오답 기록
        gameWrong.push({
            question: correctName,
            clicked: wrongName
        });

        clickedEl.classList.add('hotspot-wrong');

        gameFeedbackEl.textContent = `❌ 오답! 선택하신 인물은 ${wrongName}입니다!`;
        gameFeedbackEl.className = 'wrong';

        // 효과음
        playWrongSound();

        // 정답 인물 금색 원 강조
        correctEl.classList.add('hotspot-reveal');

        // 다음 문제 버튼 표시 (오답도 동일하게 수동 진행)
        gameNextBtn.classList.remove('hidden');
    }
}

function showGameResult() {
    gameLocked = true;
    gamePanel.classList.add('hidden');

    // 점수 표시
    const total = gameQueue.length;
    const perfect = gameScore === total;
    gameResultScore.textContent = `${gameScore} / ${total} 점${perfect ? ' 🏆 완벽!' : ''}`;

    // 오답 있으면 retry 버튼 표시, 없으면 숨김
    if (gameWrong.length === 0) {
        gameRetryBtn.classList.add('hidden');
    } else {
        gameRetryBtn.classList.remove('hidden');
    }

    gameResultEl.classList.remove('hidden');
}

// 틀린 문제만 다시 출제
function startRetryGame() {
    // gameWrong 에 기록된 과학자 이름으로 people 객체 조회
    const wrongPeople = gameWrong
        .map(w => people.find(s => s.name === w.question))
        .filter(Boolean);

    if (wrongPeople.length === 0) return;

    gameModeActive = true;
    gameRound = 0;
    gameScore = 0;
    gameWrong = [];
    gameLocked = false;
    gameQueue = shuffleArray(wrongPeople);

    infoPanel.classList.add('hidden');
    ttsStop();

    setModeUI('game');

    gamePanel.classList.remove('hidden');
    gameResultEl.classList.add('hidden');

    gameNewRound();
}

function clearGameHotspotStyles() {
    document.querySelectorAll('.hotspot').forEach(el => {
        el.classList.remove('hotspot-correct', 'hotspot-wrong', 'hotspot-reveal', 'active');
    });
    if (activeHotspot) { activeHotspot = null; }
}



// ===== 모드 버튼 이벤트 =====
modeGameBtn.addEventListener('click', () => {
    if (!gameModeActive) startGame();
});

modeDescBtn.addEventListener('click', () => {
    if (gameModeActive) endGame();
});

// 틀린 문제 다시 풀기
gameRetryBtn.addEventListener('click', () => {
    startRetryGame();
});

// 새 게임 하기
gameRestartBtn.addEventListener('click', () => {
    startGame();
});

// 기본모드로 돌아가기
gameExitBtn.addEventListener('click', () => {
    endGame();
});

// 다음 문제 버튼 (정답/오답 후 공통)
gameNextBtn.addEventListener('click', () => {
    gameNextBtn.classList.add('hidden');
    gameDescEl.classList.add('hidden');
    // 정답·오답·정답강조 핫스팟 스타일 모두 초기화
    document.querySelectorAll('.hotspot-correct, .hotspot-wrong, .hotspot-reveal')
        .forEach(el => el.classList.remove('hotspot-correct', 'hotspot-wrong', 'hotspot-reveal'));
    gameNewRound();
});


// ===== 인물 목록 서랍 =====
const listBtn = document.getElementById('list-toggle');
const listDrawer = document.getElementById('list-drawer');
const listBody = document.getElementById('list-body');
function buildList() {
    const groups = [
        ['널리 알려진 인물', people.map((p, i) => [p, i]).filter(([p]) => !p.oldView)],
        ['해석이 갈리는 인물', people.map((p, i) => [p, i]).filter(([p]) => p.oldView)]
    ];
    listBody.innerHTML = '';
    groups.forEach(([title, items]) => {
        const h = document.createElement('h3');
        h.textContent = `${title} (${items.length})`;
        listBody.appendChild(h);
        const ul = document.createElement('ul');
        items.forEach(([p, i]) => {
            const li = document.createElement('li');
            const b = document.createElement('button');
            b.type = 'button';
            b.innerHTML = `<span class="ln"></span><span class="le"></span>`;
            b.querySelector('.ln').textContent = p.name;
            b.querySelector('.le').textContent = p.nameEn;
            b.addEventListener('click', () => {
                closeList();
                flyTo(i);
                setTimeout(() => openInfo(i), 400);
            });
            li.appendChild(b);
            ul.appendChild(li);
        });
        listBody.appendChild(ul);
    });
}
function openList() { listDrawer.classList.remove('hidden'); listBtn.classList.add('on'); }
function closeList() { if (listDrawer) { listDrawer.classList.add('hidden'); listBtn && listBtn.classList.remove('on'); } }
listBtn.addEventListener('click', () => listDrawer.classList.contains('hidden') ? openList() : closeList());
document.getElementById('list-close').addEventListener('click', closeList);
buildList();

// ===== 얼굴 위치 표시 켜기/끄기 =====
const facesBtn = document.getElementById('faces-toggle');
facesBtn.addEventListener('click', () => {
    const on = hotspotsContainer.classList.toggle('show-all');
    facesBtn.classList.toggle('on', on);
});

// ===== Esc 키로 목록·정보 패널 닫기 =====
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!listDrawer.classList.contains('hidden')) { closeList(); return; }
    if (!infoPanel.classList.contains('hidden')) closePanel.click();
});
