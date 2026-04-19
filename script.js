/* ═══════════════════════════════════════════
   상수
═══════════════════════════════════════════ */
const CHOICES  = ['rock', 'scissors', 'paper'];
const ICONS    = { rock: '✊', scissors: '✌️', paper: '🖐' };
const LABELS   = { rock: '바위', scissors: '가위', paper: '보' };
const MAX_MISS = 3; // 연속 인식 실패 허용 횟수

/* ═══════════════════════════════════════════
   유틸
═══════════════════════════════════════════ */
function randomCpuChoice() {
  return CHOICES[Math.floor(Math.random() * 3)];
}

function judge(user, cpu) {
  if (user === cpu) return 'draw';
  if (
    (user === 'rock'     && cpu === 'scissors') ||
    (user === 'scissors' && cpu === 'paper')    ||
    (user === 'paper'    && cpu === 'rock')
  ) return 'win';
  return 'lose';
}

/* ═══════════════════════════════════════════
   제스처 인식 (규칙 기반)

   손가락 랜드마크 인덱스:
     tip  / pip  / mcp
   검지: 8  / 6  / 5
   중지: 12 / 10 / 9
   약지: 16 / 14 / 13
   소지: 20 / 18 / 17
═══════════════════════════════════════════ */
function isExtended(lm, tip, pip) {
  // tip이 pip보다 위(y 작음) → 펼침
  return lm[tip].y < lm[pip].y;
}

function isClearlyBent(lm, tip, mcp) {
  // tip이 MCP보다 아래 → 확실히 접힘
  return lm[tip].y > lm[mcp].y;
}

function detectGesture(lm) {
  const indexUp  = isExtended(lm, 8,  6);
  const middleUp = isExtended(lm, 12, 10);
  const ringUp   = isExtended(lm, 16, 14);
  const pinkyUp  = isExtended(lm, 20, 18);

  // MCP 기준으로 약지·소지가 확실히 접혀있는지 판단 (가위 정확도 향상)
  const ringBent  = isClearlyBent(lm, 16, 13);
  const pinkyBent = isClearlyBent(lm, 20, 17);

  const extCount = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;

  if (extCount <= 1)                               return 'rock';     // 바위: 0~1개 펼침
  if (indexUp && middleUp && ringBent && pinkyBent) return 'scissors'; // 가위: 검지+중지만 펼침
  if (extCount >= 4)                               return 'paper';    // 보: 4개 모두 펼침

  return null; // 애매한 자세
}

/* ═══════════════════════════════════════════
   게임 상태
═══════════════════════════════════════════ */
const state = {
  totalRounds:     1,
  winsNeeded:      1,
  userScore:       0,  // 표시용 (승리 + 무승부 포함)
  cpuScore:        0,  // 표시용 (승리 + 무승부 포함)
  userWins:        0,  // 실제 승리 횟수 (선승 조건 판단용)
  cpuWins:         0,  // 실제 승리 횟수 (선승 조건 판단용)
  round:           0,
  phase:           'idle', // idle | countdown | capturing | cooldown | ended
  countdownVal:    3,
  currentGesture:  null,
  missCount:       0,
};

let captureTimer   = null;
let cooldownTimer  = null;
let countdownTimer = null;

/* ═══════════════════════════════════════════
   DOM 참조
═══════════════════════════════════════════ */
const $setup      = document.getElementById('setup-screen');
const $game       = document.getElementById('game-screen');
const $roundText  = document.getElementById('round-text');
const $scoreText  = document.getElementById('score-text');
const $status     = document.getElementById('capture-status');
const $cdOverlay  = document.getElementById('countdown-overlay');
const $cdNum      = document.getElementById('countdown-number');
const $userGIcon  = document.getElementById('user-g-icon');
const $userGName  = document.getElementById('user-g-name');
const $cpuGIcon   = document.getElementById('cpu-g-icon');
const $cpuGName   = document.getElementById('cpu-g-name');
const $cpuIconBig = document.getElementById('cpu-icon-big');
const $result     = document.getElementById('result-text');
const $endOverlay = document.getElementById('end-overlay');
const $endTitle   = document.getElementById('end-title');
const $endScore   = document.getElementById('end-score');
const $endReason  = document.getElementById('end-reason');
const $video      = document.getElementById('input-video');
const $canvas     = document.getElementById('output-canvas');
const ctx         = $canvas.getContext('2d');

/* ═══════════════════════════════════════════
   화면 전환
═══════════════════════════════════════════ */
function startGame(total, needed) {
  state.totalRounds    = total;
  state.winsNeeded     = needed;
  state.userScore      = 0;
  state.cpuScore       = 0;
  state.userWins       = 0;
  state.cpuWins        = 0;
  state.round          = 0;
  state.phase          = 'idle';
  state.currentGesture = null;
  state.missCount      = 0;

  $setup.style.display = 'none';
  $game.style.display  = 'flex';

  updateHeaderUI();
  resetChoiceUI();
  initMediaPipe(); // 처음 한 번만 실제 초기화, 이후는 즉시 반환
  beginCountdown();
}

function resetToSetup() {
  clearAllTimers();
  state.phase = 'idle';
  $endOverlay.classList.remove('active');
  $game.style.display  = 'none';
  $setup.style.display = 'flex';
}

function quitGame() {
  clearAllTimers();
  resetToSetup();
}

/* ═══════════════════════════════════════════
   라운드 흐름
═══════════════════════════════════════════ */
function beginCountdown() {
  if (state.phase === 'ended') return;
  state.phase        = 'countdown';
  state.countdownVal = 3;
  state.round++;

  updateHeaderUI();
  resetChoiceUI();
  $cdOverlay.classList.add('active');
  tickCountdown();
}

function tickCountdown() {
  $cdNum.textContent      = state.countdownVal;
  $cdNum.style.animation  = 'none';
  void $cdNum.offsetWidth; // reflow → 애니메이션 재실행
  $cdNum.style.animation  = '';

  countdownTimer = setTimeout(() => {
    state.countdownVal--;
    if (state.countdownVal <= 0) {
      $cdOverlay.classList.remove('active');
      startCapture();
    } else {
      tickCountdown();
    }
  }, 1000);
}

function startCapture() {
  state.phase         = 'capturing';
  $status.textContent = '인식 중...';

  captureTimer = setTimeout(() => {
    const gesture = state.currentGesture;

    if (!gesture) {
      state.missCount++;
      if (state.missCount >= MAX_MISS) {
        showEndOverlay(
          '❌ 인식 실패',
          `손을 ${MAX_MISS}회 연속 인식하지 못했습니다.`,
          '메인 화면으로 돌아갑니다.'
        );
        return;
      }
      $status.textContent = `인식 실패 (${state.missCount}/${MAX_MISS}회)`;
      cooldownTimer = setTimeout(beginCountdown, 1500);
      return;
    }

    state.missCount = 0;
    resolveRound(gesture);
  }, 1500);
}

function resolveRound(userGesture) {
  state.phase = 'cooldown';
  const cpuGesture = randomCpuChoice();
  const outcome    = judge(userGesture, cpuGesture);

  $userGIcon.textContent = ICONS[userGesture];
  $userGName.textContent = LABELS[userGesture];

  $cpuGIcon.textContent   = ICONS[cpuGesture];
  $cpuGName.textContent   = LABELS[cpuGesture];
  $cpuIconBig.textContent = ICONS[cpuGesture];

  if (outcome === 'win') {
    state.userWins++;
    state.userScore++;
    showResult('WIN', 'result-win');
  } else if (outcome === 'lose') {
    state.cpuWins++;
    state.cpuScore++;
    showResult('LOSE', 'result-lose');
  } else {
    // 무승부: 표시 점수만 양쪽 +1, 선승 판단용 wins는 그대로
    state.userScore++;
    state.cpuScore++;
    showResult('DRAW', 'result-draw');
  }

  updateHeaderUI();

  // 선승 조건은 실제 승리 횟수(wins)로만 판단
  const gameOver =
    state.userWins >= state.winsNeeded ||
    state.cpuWins  >= state.winsNeeded ||
    state.round    >= state.totalRounds;

  cooldownTimer = setTimeout(gameOver ? endGame : beginCountdown, 2000);
}

function endGame() {
  state.phase = 'ended';
  const isWin  = state.userWins > state.cpuWins;
  const isDraw = state.userWins === state.cpuWins;

  showEndOverlay(
    isWin ? '🎉 승리!' : isDraw ? '🤝 무승부' : '😢 패배...',
    `최종 스코어  나 ${state.userScore} : ${state.cpuScore} 컴퓨터`,
    ''
  );
}

function showEndOverlay(title, score, reason) {
  state.phase            = 'ended';
  $endTitle.textContent  = title;
  $endScore.textContent  = score;
  $endReason.textContent = reason;
  $endOverlay.classList.add('active');
}

/* ═══════════════════════════════════════════
   UI 헬퍼
═══════════════════════════════════════════ */
function showResult(text, cls) {
  $result.textContent = text;
  $result.className   = cls;
}

function resetChoiceUI() {
  $userGIcon.textContent  = '❓';
  $userGName.textContent  = '인식 대기';
  $cpuGIcon.textContent   = '❓';
  $cpuGName.textContent   = '컴퓨터';
  $cpuIconBig.textContent = '❓';
  $result.textContent     = '- - -';
  $result.className       = 'result-wait';
  $status.textContent     = '손을 보여주세요';
}

function updateHeaderUI() {
  $roundText.textContent = `라운드 ${state.round} / ${state.totalRounds}`;
  $scoreText.textContent = `나 ${state.userScore} : ${state.cpuScore} 컴퓨터`;
}

function clearAllTimers() {
  clearTimeout(countdownTimer);
  clearTimeout(captureTimer);
  clearTimeout(cooldownTimer);
}

/* ═══════════════════════════════════════════
   MediaPipe Hands
   - 첫 startGame 호출 시 한 번만 초기화
   - 재게임 시 동일 인스턴스 재사용
   - onHandResults에서 state.phase로 동작 제어
═══════════════════════════════════════════ */
let mpReady = false;
let hands   = null;
let camera  = null;

function initMediaPipe() {
  if (mpReady) return;
  mpReady = true;

  hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands:            1,
    modelComplexity:        1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence:  0.6,
  });

  hands.onResults(onHandResults);

  camera = new Camera($video, {
    onFrame: async () => {
      if (hands) await hands.send({ image: $video });
    },
    width:  640,
    height: 480,
  });

  camera.start().catch((err) => {
    console.error('카메라 오류:', err);
    $status.textContent = '웹캠 오류: 브라우저 권한을 확인하세요.';
  });
}

function onHandResults(results) {
  if (state.phase === 'idle' || state.phase === 'ended') return;

  // 캔버스를 컨테이너 표시 크기에 맞춤 (object-fit:cover 보정)
  const cW = $video.clientWidth  || 640;
  const cH = $video.clientHeight || 480;
  $canvas.width  = cW;
  $canvas.height = cH;
  ctx.clearRect(0, 0, cW, cH);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    state.currentGesture = null;
    $status.textContent  =
      state.phase === 'capturing' ? '손이 감지되지 않음' : '손을 보여주세요';
    return;
  }

  const lm      = results.multiHandLandmarks[0];
  const gesture = detectGesture(lm);

  drawLandmarks(lm, cW, cH);
  state.currentGesture = gesture;

  $status.textContent = gesture
    ? `${ICONS[gesture]} ${LABELS[gesture]}`
    : '자세를 유지해주세요';

  if (gesture && (state.phase === 'countdown' || state.phase === 'capturing')) {
    $userGIcon.textContent = ICONS[gesture];
    $userGName.textContent = LABELS[gesture];
  }
}

function drawLandmarks(lm, cW, cH) {
  const vW = $video.videoWidth  || 640;
  const vH = $video.videoHeight || 480;

  // object-fit:cover 스케일·오프셋 계산
  const scale = Math.max(cW / vW, cH / vH);
  const ox    = (cW - vW * scale) / 2; // 음수 = 좌우 크롭
  const oy    = (cH - vH * scale) / 2; // 음수 = 상하 크롭

  // 정규화 좌표 → 캔버스 픽셀 (x는 미러 보정을 위해 1 - lm.x 사용)
  const px = (x) => (1 - x) * vW * scale + ox;
  const py = (y) => y        * vH * scale + oy;

  const connections = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],[0,17],
  ];

  ctx.strokeStyle = 'rgba(102,126,234,0.85)';
  ctx.lineWidth   = 2;
  connections.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(px(lm[a].x), py(lm[a].y));
    ctx.lineTo(px(lm[b].x), py(lm[b].y));
    ctx.stroke();
  });

  lm.forEach((p) => {
    ctx.beginPath();
    ctx.arc(px(p.x), py(p.y), 4, 0, Math.PI * 2);
    ctx.fillStyle   = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  });
}
