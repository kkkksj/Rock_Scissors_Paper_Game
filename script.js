/* ═══════════════════════════════════════════
   상수
═══════════════════════════════════════════ */
const CHOICES  = ['rock', 'scissors', 'paper', 'spock', 'lizard'];
const ICONS    = { rock: '✊', scissors: '✌️', paper: '🖐', spock: '👽', lizard: '🦎' };
const LABELS   = { rock: '바위', scissors: '가위', paper: '보', spock: '스팍', lizard: '도마뱀' };
const MAX_MISS = 3;

/* ═══════════════════════════════════════════
   승리 관계 (winner → [losers])
═══════════════════════════════════════════ */
const WINS = {
  scissors: ['paper',  'lizard'],
  paper:    ['rock',   'spock'],
  rock:     ['lizard', 'scissors'],
  lizard:   ['spock',  'paper'],
  spock:    ['scissors','rock'],
};

/* 승리 설명 텍스트 */
const WIN_DESC = {
  'scissors-paper':  '가위가 보를 자릅니다',
  'scissors-lizard': '가위가 도마뱀을 자릅니다',
  'paper-rock':      '보가 바위를 감쌉니다',
  'paper-spock':     '보가 스팍을 감쌉니다',
  'rock-lizard':     '바위가 도마뱀을 짓밟습니다',
  'rock-scissors':   '바위가 가위를 부숩니다',
  'lizard-spock':    '도마뱀이 스팍을 독살합니다',
  'lizard-paper':    '도마뱀이 보를 먹습니다',
  'spock-scissors':  '스팍이 가위를 부셉니다',
  'spock-rock':      '스팍이 바위를 증발시킵니다',
};

/* ═══════════════════════════════════════════
   유틸
═══════════════════════════════════════════ */
function randomCpuChoice() {
  return CHOICES[Math.floor(Math.random() * CHOICES.length)];
}

function judge(user, cpu) {
  if (user === cpu) return 'draw';
  return WINS[user].includes(cpu) ? 'win' : 'lose';
}

function getDescription(winner, loser) {
  return WIN_DESC[`${winner}-${loser}`] || '';
}

/* ═══════════════════════════════════════════
   제스처 인식 (규칙 기반)

   손가락 랜드마크 인덱스:
     tip  / pip  / mcp
   검지: 8  / 6  / 5
   중지: 12 / 10 / 9
   약지: 16 / 14 / 13
   소지: 20 / 18 / 17
   손바닥 폭 기준: 검지 MCP(5) ↔ 소지 MCP(17)
═══════════════════════════════════════════ */
function isExtended(lm, tip, pip) {
  return lm[tip].y < lm[pip].y; // tip이 pip보다 위 → 펼침
}

function isClearlyBent(lm, tip, mcp) {
  return lm[tip].y > lm[mcp].y; // tip이 MCP보다 아래 → 확실히 접힘
}

function detectGesture(lm) {
  const indexUp  = isExtended(lm, 8,  6);
  const middleUp = isExtended(lm, 12, 10);
  const ringUp   = isExtended(lm, 16, 14);
  const pinkyUp  = isExtended(lm, 20, 18);

  const ringBent  = isClearlyBent(lm, 16, 13);
  const pinkyBent = isClearlyBent(lm, 20, 17);

  const extCount = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;

  const handSpan = Math.abs(lm[5].x - lm[17].x); // 검지MCP ~ 소지MCP 가로 폭

  // ── 가위: 검지+중지 펼침, 약지+소지 확실히 접힘
  if (indexUp && middleUp && ringBent && pinkyBent) return 'scissors';

  // ── 공통 계산
  const dist = (a, b) => Math.sqrt(
    (lm[a].x - lm[b].x) ** 2 + (lm[a].y - lm[b].y) ** 2
  );
  const handH = dist(0, 9); // 손목(0) ~ 중지MCP(9) 손 척도

  // 인접 손가락 끝 사이의 2D 거리
  const dIM = dist(8,  12); // 검지끝-중지끝
  const dMR = dist(12, 16); // 중지끝-약지끝
  const dRP = dist(16, 20); // 약지끝-소지끝

  // x 기반 간격 (스팍·보 판별용)
  const gapIM = Math.abs(lm[8].x  - lm[12].x);
  const gapMR = Math.abs(lm[12].x - lm[16].x);
  const gapRP = Math.abs(lm[16].x - lm[20].x);

  // ── 도마뱀: 4손가락이 뭉쳐있고 엄지가 닿아있지 않은 "입을 벌린" 형태
  const fingersTogether = handH > 0 &&
    dIM / handH < 0.25 &&   // 검지-중지 밀착
    dMR / handH < 0.25 &&   // 중지-약지 밀착
    dRP / handH < 0.25;     // 약지-소지 밀착

  const thumbToIdx = dist(4, 8); // 엄지끝 ~ 검지끝 거리

  // 방향 무관 — 엄지와 검지 사이에 간격(닿지 않음)만 있으면 도마뱀
  // extCount >= 2: 손가락이 어느 정도 펴져 있어야 함 (주먹은 extCount 0~1이므로 자동 배제)
  const thumbNotTouching = handH > 0 && thumbToIdx / handH > 0.40;

  if (fingersTogether && thumbNotTouching && extCount >= 2) return 'lizard';

  // ── 보 / 스팍: 4개 모두 펼침
  if (extCount >= 4) {
    // 스팍: 중지·약지 V자 간격이 인접 간격보다 1.3배 이상 크면
    if (gapMR > gapIM * 1.3 && gapMR > gapRP * 1.3) return 'spock';

    // 보: 모든 인접 손가락이 고르게 벌어져 있을 때만
    const allSpread = handSpan > 0 &&
      gapIM / handSpan > 0.10 &&
      gapMR / handSpan > 0.10 &&
      gapRP / handSpan > 0.10;

    return allSpread ? 'paper' : 'spock';
  }

  // ── 바위: 기본
  return 'rock';
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
const $roundDesc  = document.getElementById('round-desc');
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
  $cdNum.textContent     = state.countdownVal;
  $cdNum.style.animation = 'none';
  void $cdNum.offsetWidth; // reflow → 애니메이션 재실행
  $cdNum.style.animation = '';

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
    showDesc(getDescription(userGesture, cpuGesture));
  } else if (outcome === 'lose') {
    state.cpuWins++;
    state.cpuScore++;
    showResult('LOSE', 'result-lose');
    showDesc(getDescription(cpuGesture, userGesture));
  } else {
    // 무승부: 표시 점수만 양쪽 +1, 선승 판단용 wins는 그대로
    state.userScore++;
    state.cpuScore++;
    showResult('DRAW', 'result-draw');
    showDesc('무승부! 다시 겨뤄봐요.');
  }

  updateHeaderUI();

  // 선승 조건은 실제 승리 횟수(wins)로만 판단
  const gameOver =
    state.userWins >= state.winsNeeded ||
    state.cpuWins  >= state.winsNeeded ||
    state.round    >= state.totalRounds;

  cooldownTimer = setTimeout(gameOver ? endGame : beginCountdown, 2500);
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

function showDesc(text) {
  $roundDesc.textContent = text;
}

function resetChoiceUI() {
  $userGIcon.textContent  = '❓';
  $userGName.textContent  = '인식 대기';
  $cpuGIcon.textContent   = '❓';
  $cpuGName.textContent   = '컴퓨터';
  $cpuIconBig.textContent = '❓';
  $result.textContent     = '- - -';
  $result.className       = 'result-wait';
  $roundDesc.textContent  = '';
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
  const ox    = (cW - vW * scale) / 2;
  const oy    = (cH - vH * scale) / 2;

  // 정규화 좌표 → 캔버스 픽셀 (x는 미러 보정)
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
