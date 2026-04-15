/**
 * =========================================================
 * 0) Config & State（設定與狀態）
 * =========================================================
 */
import localforage from "localforage";
import { dataService } from "./services/dataService";
import { registerSW } from "virtual:pwa-register";
registerSW({ immediate: true });

let currentFilterCategory = "全部";
let currentFilter = "all";
let currentFilterDate = null;
let activeListTab = "note";
let currentSessionScore = { correct: 0, total: 0 };
// env
// 改到api/gemini.js中串接api key
let selectedTrashNotes = new Set();
let selectedReviewNotes = new Set();

let lastActivePageId = "page-home";

let timerInterval;
let seconds = 0;
let recordingStartedAtMs = 0;
let recognition;
let fullTranscript = "";
let isRecording = false;
let isGeneratingSummary = false;
let isRecognitionStarting = false;
let isStoppingRecognition = false;

let recognitionRestartTimer = null;
let recognitionEndFailCount = 0;
let lastInterim = "";
let finalizedSpeechTimeline = [];
let lastTimelineAssignedSecond = -1;
let pendingSpeechAnchorSecond = null;
let lastResultAt = 0;
let lastRestartAt = 0;
let lastErrorCode = "";
let noResultWatchdogTimer = null;
let startTimeoutTimer = null;
let isRecoveryHintVisible = false;
let recoveryAckTimer = null;
let recoveryHideTimer = null;
let recoveryAttemptToken = 0;
let awaitingRecoveryAckToken = 0;
let recoveryRestartShownAt = 0;
let lastWatchdogObservedResultAt = 0;
let watchdogMissWhileSpeakingCount = 0;
let vadAudioContext = null;
let vadStream = null;
let vadAnalyser = null;
let vadSourceNode = null;
let vadSampleTimer = null;
let vadReady = false;
let vadNoiseFloorRms = 0.004;
let vadLastVoiceAt = 0;

const TEMP_TRANSCRIPT_KEY = "temp_transcript";
const RECOGNITION_MAX_RESTARTS = 5;
const NO_RESULT_TIMEOUT_MS = 12000;
const WATCHDOG_INTERVAL_MS = 1500;
const RESTART_GRACE_MS = 2500;
const HARD_REBUILD_AFTER_FAILS = 3;
const PERIODIC_TRANSCRIPT_PERSIST_MS = 5000;
const RECOGNITION_START_TIMEOUT_MS = 3000;
const ONEND_RESTART_DELAY_MS = 500;
const RECOVERY_MONITOR_DELAY_MS = 6000;
const RECOVERY_SUCCESS_AUTO_HIDE_MS = 1000;
const RECOVERY_RESTART_MIN_VISIBLE_MS = 700;
const VAD_SAMPLE_INTERVAL_MS = 250;
const VAD_CALIBRATION_MS = 1500;
const VAD_SPEECH_HOLD_MS = 1800;
const VAD_MIN_RMS = 0.012;
const VAD_NOISE_MULTIPLIER = 2.2;
const TIMELINE_MERGE_GAP_SECONDS = 1;
const TIMELINE_SHORT_TEXT_MERGE_THRESHOLD = 24;

const STORAGE_KEYS = {
  QUIZ_HISTORY: "president_quiz_history",
  WRONG_QUESTIONS: "president_wrong_questions",
  NOTES: "president_notes",
  SETTINGS: "president_settings",
  TEMP_TRANSCRIPT: TEMP_TRANSCRIPT_KEY,
};

const storage = localforage.createInstance({
  name: "MemorAIze",
  storeName: "app_state",
});

function parseJsonSafe(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function getStorageValueWithLegacyFallback(key, fallback, parser = (v) => v) {
  const value = await storage.getItem(key);
  if (value !== null && value !== undefined) return value;

  const legacyRaw = localStorage.getItem(key);
  if (legacyRaw === null) return fallback;

  const legacyValue = parser(legacyRaw);
  await storage.setItem(key, legacyValue);
  localStorage.removeItem(key);
  return legacyValue;
}

function persistStorageValue(key, value) {
  return storage.setItem(key, value).catch((err) => {
    console.error(`儲存失敗 (${key}):`, err);
  });
}

let quizHistory = [];

function saveQuizRecord(record) {
  const item = {
    ...record,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    updatedAt: Date.now(),
  };
  quizHistory.push(item);
  void dataService.addQuizRecord(item).then((nextHistory) => {
    quizHistory = Array.isArray(nextHistory) ? nextHistory : quizHistory;
    renderLearningDashboard();
  });
}

// main.js
let wrongQuestions = [];

// 艾賓浩斯複習間隔 (毫秒)
const EB_INTERVALS = [
  0, // Level 0: 初始
  86400000, // Level 1: 1天後
  259200000, // Level 2: 3天後
  604800000, // Level 3: 7天後
  1209600000, // Level 4: 14天後 (進入長期記憶)
];

function saveWrongQuestions() {
  void dataService.persistWrongQuestions(wrongQuestions).then((nextWrong) => {
    wrongQuestions = Array.isArray(nextWrong) ? nextWrong : wrongQuestions;
    renderSRSSection();
  });
}
/**
 * Notes / Settings
 */
let notesLibrary = [
  {
    id: "note-long-1",
    title: "馬斯洛需求層次：人類動機的核心",
    intro:
      "本課深入探討人本主義心理學家 Maslow 的理論。從生理基礎到自我實現，解析不同階層需求如何驅動人類行為與學習動力。",
    date: "3 / 1",
    duration: "12:45",
    category: "心理學",
    sections: [
      {
        category: "需求金字塔 (由下而上)",
        items: [
          "**缺失需求**：包含生理(食衣住行)、安全(穩定環境)與社交(愛與歸屬)。",
          "**成長需求**：自尊(成就感與尊重)以及最高的**自我實現**。",
          "關鍵邏輯：低層次需求若未滿足，個體難以產生追求高層次需求的動力。",
        ],
      },
      {
        category: "教育應用策略",
        items: [
          "確保學生在課堂感到安全與被接納，是開啟學習動機的前提。",
          "透過適度的讚賞與挑戰，滿足學生的自尊需求，進而引發主動學習。",
        ],
      },
    ],
    segments: [
      {
        time: "00:00",
        text: "各位同學，今天我們要聊聊為什麼我們會想做某些事情？動機到底是什麼？",
      },
      {
        time: "01:15",
        text: "Abraham Maslow 提出了一個非常經典的金字塔模型。最底層是生理需求，像是肚子餓了你絕對沒辦法專心聽課。",
      },
      {
        time: "02:30",
        text: "接著是安全感，如果你在學校一直被排擠、覺得不安全，你的大腦會處於防衛狀態，這就是社交需求的缺失。",
      },
      {
        time: "04:00",
        text: "當這些都滿足了，我們才會開始追求『自尊』，希望被老師肯定、被同學敬佩。",
      },
      {
        time: "05:45",
        text: "最後的巔峰是『自我實現』，也就是發揮你的天賦，單純為了成長而學習。",
      },
      {
        time: "07:20",
        text: "在教育環境中，如果一個孩子早餐沒吃、家裡氣氛緊張，我們逼他追求學術成就（自我實現）是非常困難的。",
      },
      {
        time: "09:00",
        text: "所以Memo助手建議，教學者要先建立溫暖的環境，這就是滿足基礎需求的過程。",
      },
      {
        time: "11:30",
        text: "總結來說，層次結構並非絕對，但它提供了一個理解人類行為的極佳藍圖。",
      },
    ],
    isFavorite: true,
    isDeleted: false,
  },
  {
    id: "note-long-2",
    title: "皮亞傑：兒童認知發展階段論",
    intro:
      "解析 Jean Piaget 如何觀察兒童建構世界觀。逐字稿中詳細描述了從感覺動作期到形式操作期的質變過程。",
    date: "3 / 2",
    duration: "15:20",
    category: "教育學",
    sections: [
      {
        category: "四大發展階段",
        items: [
          "**感覺動作期 (0-2歲)**：發展出『物體恆存』概念，了解東西不見不代表消失。",
          "**前運思期 (2-7歲)**：以自我為中心，具備符號功能，但缺乏守恆概念。",
          "**具體運思期 (7-11歲)**：具備邏輯推理，但需依靠具體事物操作。",
          "**形式運思期 (11歲+)**：發展出抽象思維與假設檢定能力。",
        ],
      },
    ],
    segments: [
      {
        time: "00:00",
        text: "今天我們要來談兒童心理學的泰斗：皮亞傑。他認為小孩不是『縮小版的大人』，他們看世界的方式跟我們完全不同。",
      },
      {
        time: "01:50",
        text: "兩歲以前的孩子是在『感覺動作期』。你會發現跟他們玩躲貓貓，只要遮住臉，他們就以為你消失了。",
      },
      {
        time: "03:40",
        text: "等到了幼兒園時期，他們進入『前運思期』。這時候他們很愛問為什麼，但想法通常很自我中心。",
      },
      {
        time: "05:15",
        text: "你有沒有試過把同樣多的水倒進窄長跟寬扁的杯子？這時期的孩子會覺得長杯子的水比較多，因為他們還沒發展出『守恆』。",
      },
      {
        time: "07:30",
        text: "上了小學後，邏輯開始出現了，這是『具體運思期』。但如果你問他們太抽象的問題，他們會當機。",
      },
      {
        time: "09:45",
        text: "到了青少年時期，也就是『形式運思期』，他們終於能思考正義、真理這種看不見的東西。",
      },
      {
        time: "12:00",
        text: "所以老師在備課時，一定要根據學生目前的認知階段來設計教具，不要越級打怪。",
      },
    ],
    isFavorite: false,
    isDeleted: false,
  },
  {
    id: "note-long-3",
    title: "行為修正：斯金納的增強理論",
    intro:
      "探討操作制約如何透過後果改變行為。內容涵蓋正負增強、懲罰，以及在教室管理中的實務應用方案。",
    date: "3 / 3",
    duration: "10:10",
    category: "心理學",
    sections: [
      {
        category: "核心行為法則",
        items: [
          "**正增強**：給予喜愛的事物(獎勵)以增加行為頻率。",
          "**負增強**：移走厭惡的事物(如減免作業)以增加行為頻率。",
          "**懲罰**：給予痛苦或剝奪喜愛，旨在減少不當行為。",
        ],
      },
      {
        category: "教育現場建議",
        items: [
          "增強的效果遠大於懲罰。過度依賴懲罰可能導致學生習得無助感或產生焦慮。",
        ],
      },
    ],
    segments: [
      {
        time: "00:00",
        text: "如果你的學生表現好，你會給他貼紙嗎？這就是 B.F. Skinner 說的操作制約。",
      },
      {
        time: "01:20",
        text: "行為的後果會決定這個行為以後會不會再發生。我們最常用的是『正增強』。",
      },
      {
        time: "02:50",
        text: "很多人會搞混『負增強』。這不是懲罰喔！它是移走不舒服的東西。比如你表現好，我就免除你今天的打掃工作。",
      },
      {
        time: "04:30",
        text: "至於懲罰，雖然能快速壓制行為，但斯金納不建議常使用，因為它會產生負面情緒，甚至破壞師生關係。",
      },
      {
        time: "06:15",
        text: "最好的方式是『忽略不當行為，增強正確行為』。讓正確的行為被獎勵機制留下來。",
      },
      {
        time: "08:00",
        text: "這套理論在特教班或一般的班級經營中，至今仍然是非常強大的工具。",
      },
    ],
    isFavorite: false,
    isDeleted: false,
  },
  {
    id: "note-long-4",
    title: "社會學習理論：班杜拉與波波玩偶",
    intro:
      "跳脫獎懲框架，強調『觀察』與『模仿』的重要性。詳述人類如何透過社會互動建立自我效能感。",
    date: "3 / 4",
    duration: "11:30",
    category: "心理學",
    sections: [
      {
        category: "觀察學習四階段",
        items: [
          "**注意**：觀察模範者的行為。",
          "**保持**：將行為記憶在大腦中。",
          "**產出**：具備執行該行為的能力。",
          "**動機**：有理由想去執行它。",
        ],
      },
      {
        category: "自我效能 (Self-efficacy)",
        items: [
          "相信自己有能力完成特定任務的信心。這受成功經驗與他人說服影響。",
        ],
      },
    ],
    segments: [
      {
        time: "00:00",
        text: "為什麼小孩會學大人說髒話？就算你沒獎勵他，他還是學會了。這就是 Bandura 的社會學習論。",
      },
      {
        time: "02:10",
        text: "他在著名的 Bobo Doll 實驗中發現，小孩只要看到大人打玩偶，即使沒被教導，也會模仿暴力的動作。",
      },
      {
        time: "03:45",
        text: "學習的第一步是『注意』。如果你這個老師不夠吸引人，學生根本不會去觀察你的示範。",
      },
      {
        time: "05:30",
        text: "接著是『保持』，他們要在腦袋裡演練一遍。最後是『產出』跟『動機』。",
      },
      {
        time: "07:00",
        text: "Bandura 還提到一個很重要的詞：『自我效能感』。就是你覺得你自己行不行。",
      },
      {
        time: "08:45",
        text: "一個自我效能感強的人，遇到困難會想辦法解決；弱的人則會直接放棄。",
      },
      {
        time: "10:30",
        text: "所以老師的職責不只是教書，更是要成為一個值得模仿的榜樣，並建立學生的信心。",
      },
    ],
    isFavorite: true,
    isDeleted: false,
  },
  {
    id: "note-long-5",
    title: "訊息處理理論：記憶的運作模型",
    intro:
      "將人類大腦類比為電腦。解析感官、短期與長期記憶之間的轉換過程，以及有效的學習編碼策略。",
    date: "3 / 5",
    duration: "13:50",
    category: "教育學",
    sections: [
      {
        category: "記憶三階段",
        items: [
          "**感官記憶**：存留時間極短，僅篩選有注意到的訊息。",
          "**短期/工作記憶**：容量有限 (約7±2個單位)，需透過覆誦維持。",
          "**長期記憶**：近乎無限的儲存空間，需透過『意譯編碼』長期保存。",
        ],
      },
      {
        category: "有效複習技巧",
        items: [
          "**塊狀化 (Chunking)**：將零散資訊組合成意義群組。",
          "**精緻化複習**：將新知識與舊經驗連結，而非機械式背誦。",
        ],
      },
    ],
    segments: [
      {
        time: "00:00",
        text: "大腦是怎麼存東西的？我們可以把大腦想像成一台效能極佳的電腦。",
      },
      {
        time: "01:30",
        text: "第一站是感官記憶。你現在看到的所有畫面都在這裡，但如果你沒『注意』，幾秒鐘就消失了。",
      },
      {
        time: "03:00",
        text: "被注意到的訊息會進入『工作記憶』。但它的空間很小，大約只能同時記住七組號碼。",
      },
      {
        time: "04:45",
        text: "如果你想考高分，你必須把東西搬進『長期記憶』。這需要『編碼』，也就是把知識分類、整理。",
      },
      {
        time: "06:15",
        text: "有一招叫『塊狀化』。比如記手機號碼 0912-345-678，比記十個獨立數字容易多了。",
      },
      {
        time: "08:30",
        text: "老師在教學時，如果一次塞太多，學生的工作記憶會『溢位』，那就等於白講了。",
      },
      {
        time: "10:50",
        text: "這就是為什麼Memo助手強調要分段錄音、分段整理的原因，這符合訊息處理的心理規則。",
      },
    ],
    isFavorite: false,
    isDeleted: false,
  },
];

const DEFAULT_NOTES_LIBRARY = JSON.parse(JSON.stringify(notesLibrary));

let currentNoteData = notesLibrary?.[0] || null;

const DEFAULT_APP_SETTINGS = {
  nickname: "同學",
  avatarSeed: "Fox",
  noteStyle: "standard",
  aiStyle: "default",
};

let appSettings = { ...DEFAULT_APP_SETTINGS };
let isAuthInProgress = false;

const animalAvatars = [
  "Fox",
  "Cat",
  "Dog",
  "Bear",
  "Penguin",
  "Owl",
  "Rabbit",
  "Frog",
  "Bee",
  "Butterfly",
  "Elephant",
  "Zebra",
];

let tempSelectedAvatar = appSettings.avatarSeed;

function mountAuthControlsIfNeeded() {
  if (safeEl("auth-signin-btn") || safeEl("auth-signout-btn")) return;

  const settingsRoot = document.querySelector("#page-settings .settings-scroll .px-6");
  if (!settingsRoot) return;

  const section = document.createElement("section");
  section.className = "mb-8";
  section.innerHTML = `
    <p class="text-[10px] text-gray-300 font-black tracking-widest uppercase mb-4 ml-1">雲端同步帳號</p>
    <div class="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm space-y-3">
      <p id="auth-status-text" class="text-xs font-bold text-gray-500">未登入（僅本機模式）</p>
      <button
        id="auth-signin-btn"
        type="button"
        data-action="auth-signin-google"
        class="w-full py-3 bg-white border border-gray-100 text-gray-700 rounded-2xl text-xs font-black shadow-sm active:scale-95"
      >
        <i class="fab fa-google mr-2"></i>Google 登入並同步筆記
      </button>
      <button
        id="auth-signout-btn"
        type="button"
        data-action="auth-signout"
        class="hidden w-full py-3 bg-gray-50 text-gray-500 rounded-2xl text-xs font-black active:scale-95"
      >
        登出
      </button>
    </div>
  `;

  const sections = settingsRoot.querySelectorAll("section");
  if (sections.length >= 2) {
    settingsRoot.insertBefore(section, sections[2]);
  } else {
    settingsRoot.appendChild(section);
  }
}

function updateAuthUI() {
  const user = dataService.getCurrentUser();
  const statusEl = safeEl("auth-status-text");
  const signInBtn = safeEl("auth-signin-btn");
  const signOutBtn = safeEl("auth-signout-btn");

  if (statusEl) {
    statusEl.innerText = user
      ? `已登入：${user.displayName || user.email || user.uid}`
      : "未登入（僅本機模式）";
  }

  if (signInBtn) signInBtn.classList.toggle("hidden", !!user);
  if (signOutBtn) signOutBtn.classList.toggle("hidden", !user);
}

function isStandalonePwaMode() {
  const standaloneByMedia = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const standaloneByNavigator = window.navigator?.standalone === true;
  return !!(standaloneByMedia || standaloneByNavigator);
}

function isLikelyMobileDevice() {
  const ua = String(window.navigator?.userAgent || "").toLowerCase();
  return /android|iphone|ipad|ipod|mobile/i.test(ua);
}

function isInAppWebView() {
  const ua = String(window.navigator?.userAgent || "").toLowerCase();
  return /(line|fbav|fban|instagram|micromessenger|wv)/i.test(ua);
}

function shouldPreferRedirectAuth() {
  return isStandalonePwaMode() || isLikelyMobileDevice() || isInAppWebView();
}

async function signInWithGoogleFlow() {
  if (isAuthInProgress) return;

  const inApp = isInAppWebView();
  const preferRedirect = shouldPreferRedirectAuth();

  if (inApp) {
    alert("目前偵測為 App 內建瀏覽器，登入可能失敗。建議點選右上角改用 Safari/Chrome 開啟後再登入。");
  }

  isAuthInProgress = true;
  const signInBtn = safeEl("auth-signin-btn");
  if (signInBtn) {
    signInBtn.disabled = true;
    signInBtn.style.opacity = "0.6";
  }

  try {
    const user = await dataService.signInWithGoogle({ preferRedirect });

    if (!user?.uid) {
      if (preferRedirect) {
        alert("正在前往 Google 登入頁面...");
      }
      return;
    }

    notesLibrary = dataService.getNotes();
    currentNoteData = notesLibrary?.[0] || null;
    updateAuthUI();
    renderCategoryFilters();
    renderNotesList();
    renderReviewSelection();
    renderTrashList();
    console.info("[ui] sign-in flow completed");
  } catch (err) {
    console.error("[ui] sign-in failed:", err);
    alert(`Google 登入失敗：${err.message || "未知錯誤"}`);
  } finally {
    isAuthInProgress = false;
    if (signInBtn) {
      signInBtn.disabled = false;
      signInBtn.style.opacity = "1";
    }
  }
}

async function signOutFlow() {
  try {
    await dataService.signOut();
    updateAuthUI();
    console.info("[ui] sign-out completed");
  } catch (err) {
    console.error("[ui] sign-out failed:", err);
    alert(`登出失敗：${err.message || "未知錯誤"}`);
  }
}

async function initializePersistedState() {
  mountAuthControlsIfNeeded();

  dataService.onAuthChanged(() => {
    updateAuthUI();
  });

  const loadedNotes = await dataService.init(DEFAULT_NOTES_LIBRARY);
  notesLibrary = Array.isArray(loadedNotes) && loadedNotes.length
    ? loadedNotes
    : JSON.parse(JSON.stringify(DEFAULT_NOTES_LIBRARY));

  quizHistory = dataService.getQuizHistory();
  wrongQuestions = dataService.getWrongQuestions();

  dataService.onNotesChanged((nextNotes) => {
    notesLibrary = Array.isArray(nextNotes) ? nextNotes : [];
    currentNoteData = notesLibrary?.[0] || null;
    renderCategoryFilters();
    renderNotesList();
    renderReviewSelection();
    renderTrashList();
  });

  dataService.onLearningChanged(({ quizHistory: nextHistory, wrongQuestions: nextWrong }) => {
    quizHistory = Array.isArray(nextHistory) ? nextHistory : [];
    wrongQuestions = Array.isArray(nextWrong) ? nextWrong : [];
    renderLearningDashboard();
    renderSRSSection();
  });

  const loadedSettings = await getStorageValueWithLegacyFallback(
    STORAGE_KEYS.SETTINGS,
    DEFAULT_APP_SETTINGS,
    (raw) => parseJsonSafe(raw, DEFAULT_APP_SETTINGS),
  );
  appSettings = {
    ...DEFAULT_APP_SETTINGS,
    ...(loadedSettings || {}),
  };

  const loadedTranscript = await getStorageValueWithLegacyFallback(
    STORAGE_KEYS.TEMP_TRANSCRIPT,
    "",
    (raw) => String(raw || ""),
  );
  fullTranscript = String(loadedTranscript || "");

  tempSelectedAvatar = appSettings.avatarSeed;
  currentNoteData = notesLibrary?.[0] || null;
  updateAuthUI();
  renderLearningDashboard();
  renderSRSSection();
}

/**
 * =========================================================
 * 1) Utils（小工具）
 * =========================================================
 */

function adjustTitleFontSize() {
  const titleEl = safeEl("content-title");
  if (!titleEl) return;

  titleEl.style.fontSize = "14px";

  let currentSize = 14;
  const minSize = 10;

  while (titleEl.scrollWidth > titleEl.offsetWidth && currentSize > minSize) {
    currentSize -= 0.5;
    titleEl.style.fontSize = `${currentSize}px`;
  }
}

function safeEl(id) {
  return document.getElementById(id);
}

function debounce(fn, delay = 150) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatHighlightedBullet(value) {
  return escapeHtml(value).replace(
    /\*\*(.*?)\*\*/g,
    '<span class="text-[#13B5B1] font-black">$1</span>',
  );
}

function formatHTMLDateToNoteDate(htmlDate) {
  if (!htmlDate) return null;
  const parts = String(htmlDate).split("-");
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
  return `${month} / ${day}`;
}

function updateHomeGreeting() {
  const el = safeEl("home-user-greeting");
  const avatarImg = safeEl("home-avatar-img");

  if (el) el.innerText = `${appSettings.nickname} 您好 ✨`;
  if (avatarImg) {
    avatarImg.src = `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${appSettings.avatarSeed}`;
  }
}

function syncFavoriteUI(note) {
  const icon = safeEl("star-icon");
  const btn = safeEl("star-btn");
  if (!icon || !btn) return;

  if (note?.isFavorite) {
    icon.classList.replace("far", "fas");
    btn.classList.replace("bg-yellow-50", "bg-yellow-400");
    btn.classList.replace("text-yellow-400", "text-white");
  } else {
    icon.classList.replace("fas", "far");
    btn.classList.replace("bg-yellow-400", "bg-yellow-50");
    btn.classList.replace("text-white", "text-yellow-400");
  }
}

function renderAvatarChoices(targetId = "modal-avatar-grid") {
  const grid = safeEl(targetId);
  if (!grid) return;

  grid.innerHTML = animalAvatars
    .map((animal) => {
      const isSelected = tempSelectedAvatar === animal;
      const avatarUrl = `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${animal}`;
      return `
        <div
          data-action="select-avatar"
          data-seed="${animal}"
          class="aspect-ratio-1 cursor-pointer rounded-2xl border-2 p-1 transition-all ${
            isSelected
              ? "border-[#13B5B1] bg-[#F0F9F9]"
              : "border-transparent bg-gray-50"
          }"
        >
          <img src="${avatarUrl}" class="w-full h-full" alt="${animal}">
        </div>
      `;
    })
    .join("");
}

function loadSettingsToUI() {
  const nickInput = safeEl("settings-nickname");
  const styleSelect = safeEl("settings-ai-style");
  const previewImg = document.querySelector("#settings-avatar-preview img");
  if (styleSelect) {
    styleSelect.value = appSettings.aiStyle || "default";
  }

  if (nickInput) nickInput.value = appSettings.nickname;

  if (previewImg) {
    previewImg.src = `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${appSettings.avatarSeed}`;
  }

  tempSelectedAvatar = appSettings.avatarSeed;
}

function saveSettingsFromUI() {
  appSettings.nickname = safeEl("settings-nickname")?.value || "Memo";
  appSettings.avatarSeed = tempSelectedAvatar;
  appSettings.aiStyle = safeEl("settings-ai-style")?.value || "default";
  void persistStorageValue(STORAGE_KEYS.SETTINGS, appSettings);
  updateHomeGreeting();
  alert("您的個人檔案已同步更新 ✨");
  window.navigateTo("page-home");
}

/**
 * =========================================================
 * 2) Storage（資料存取）
 * =========================================================
 */

function saveNotesToDisk() {
  void dataService.persistNotesSnapshot(notesLibrary).catch((err) => {
    console.error("[ui] saveNotesToDisk sync failed:", err);
  });
}

function markNoteDeleted(noteId) {
  const note = notesLibrary.find((n) => n.id === noteId);
  if (!note) return;
  note.isDeleted = true;
  note.deletedAt = Date.now();
  saveNotesToDisk();
}

/**
 * =========================================================
 * 3) Speech / Recording（語音與錄音流程）
 * =========================================================
 */

function getTranscriptText() {
  return `${fullTranscript}${lastInterim}`.trim();
}

function persistTempTranscript(text = getTranscriptText()) {
  void persistStorageValue(STORAGE_KEYS.TEMP_TRANSCRIPT, text || "");
}

function clearRecognitionStartTimeout() {
  if (!startTimeoutTimer) return;
  clearTimeout(startTimeoutTimer);
  startTimeoutTimer = null;
}

function stopNoResultWatchdog() {
  if (!noResultWatchdogTimer) return;
  clearInterval(noResultWatchdogTimer);
  noResultWatchdogTimer = null;
}

function clearRecoveryAckTimer() {
  if (!recoveryAckTimer) return;
  clearTimeout(recoveryAckTimer);
  recoveryAckTimer = null;
}

function clearRecoveryHideTimer() {
  if (!recoveryHideTimer) return;
  clearTimeout(recoveryHideTimer);
  recoveryHideTimer = null;
}

function showRecoveryHint(text, autoHideMs = 0) {
  const recoveryEl = safeEl("record-recovery-status");
  if (recoveryEl) {
    recoveryEl.innerText = text;
    recoveryEl.classList.remove("hidden");
  }

  isRecoveryHintVisible = true;
  clearRecoveryHideTimer();

  if (autoHideMs > 0) {
    recoveryHideTimer = setTimeout(() => {
      const el = safeEl("record-recovery-status");
      if (el) el.classList.add("hidden");
      isRecoveryHintVisible = false;
      recoveryHideTimer = null;
    }, autoHideMs);
  }
}

function hideRecoveryHint() {
  clearRecoveryHideTimer();
  const recoveryEl = safeEl("record-recovery-status");
  if (recoveryEl) recoveryEl.classList.add("hidden");
  isRecoveryHintVisible = false;
}

function markRecoveryMonitoring() {
  if (awaitingRecoveryAckToken !== 0) return;
  showRecoveryHint("收音暫時中斷，正在重新連線...");
}

function markRecoveryRestarting(message = "收音暫時中斷，正在重新連線...") {
  recoveryAttemptToken += 1;
  awaitingRecoveryAckToken = recoveryAttemptToken;
  recoveryRestartShownAt = Date.now();
  showRecoveryHint(message);
}

function markRecoveryRestarted() {
  if (awaitingRecoveryAckToken === 0) return;
  awaitingRecoveryAckToken = 0;
  clearRecoveryAckTimer();
  const elapsed = Date.now() - recoveryRestartShownAt;
  const remain = Math.max(0, RECOVERY_RESTART_MIN_VISIBLE_MS - elapsed);

  if (remain > 0) {
    setTimeout(() => {
      if (!isRecording) return;
      showRecoveryHint("收音已恢復", RECOVERY_SUCCESS_AUTO_HIDE_MS);
    }, remain);
    return;
  }

  showRecoveryHint("收音已恢復", RECOVERY_SUCCESS_AUTO_HIDE_MS);
}

function resetRecoveryState() {
  awaitingRecoveryAckToken = 0;
  recoveryAttemptToken = 0;
  recoveryRestartShownAt = 0;
  watchdogMissWhileSpeakingCount = 0;
  clearRecoveryAckTimer();
  hideRecoveryHint();
}

async function startVoiceActivityMonitor() {
  stopVoiceActivityMonitor();

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const canUseVAD = !!(AudioContextCtor && navigator.mediaDevices?.getUserMedia);
  if (!canUseVAD) {
    vadReady = false;
    return;
  }

  // 行動端 Web Speech API 已佔用麥克風，避免 VAD 再開第二條音訊流。
  // 部分手機瀏覽器與 PWA 無法穩定同時持有兩條 getUserMedia 流，會導致偶發斷流或權限互斥。
  // vadReady = false 時 isLikelySpeakingNow() 回傳 true，watchdog 維持既有安全 fallback 行為。
  if (isLikelyMobileDevice()) {
    vadReady = false;
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    if (!isRecording) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    vadAudioContext = new AudioContextCtor();
    if (vadAudioContext.state === "suspended") {
      await vadAudioContext.resume().catch(() => {});
    }

    vadStream = stream;
    vadSourceNode = vadAudioContext.createMediaStreamSource(stream);
    vadAnalyser = vadAudioContext.createAnalyser();
    vadAnalyser.fftSize = 1024;
    vadAnalyser.smoothingTimeConstant = 0.65;
    vadSourceNode.connect(vadAnalyser);

    const samples = new Float32Array(vadAnalyser.fftSize);
    const calibration = [];
    const startAt = Date.now();
    vadReady = false;
    vadNoiseFloorRms = 0.004;
    vadLastVoiceAt = 0;

    vadSampleTimer = setInterval(() => {
      if (!vadAnalyser) return;

      vadAnalyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const v = samples[i];
        sum += v * v;
      }
      const rms = Math.sqrt(sum / samples.length);
      const now = Date.now();

      if (!vadReady) {
        calibration.push(rms);
        if (now - startAt >= VAD_CALIBRATION_MS) {
          const avg = calibration.reduce((acc, v) => acc + v, 0) / Math.max(1, calibration.length);
          vadNoiseFloorRms = Math.max(0.003, avg || 0.003);
          vadReady = true;
        }
      }

      const threshold = Math.max(VAD_MIN_RMS, vadNoiseFloorRms * VAD_NOISE_MULTIPLIER);
      if (rms >= threshold) {
        vadLastVoiceAt = now;
      }
    }, VAD_SAMPLE_INTERVAL_MS);
  } catch (err) {
    // Fallback to legacy behavior when VAD init fails.
    vadReady = false;
    console.warn("VAD init failed, fallback to result-only watchdog:", err);
  }
}

function stopVoiceActivityMonitor() {
  if (vadSampleTimer) {
    clearInterval(vadSampleTimer);
    vadSampleTimer = null;
  }

  if (vadSourceNode) {
    try {
      vadSourceNode.disconnect();
    } catch (_) {}
    vadSourceNode = null;
  }

  vadAnalyser = null;

  if (vadStream) {
    vadStream.getTracks().forEach((track) => track.stop());
    vadStream = null;
  }

  if (vadAudioContext) {
    void vadAudioContext.close().catch(() => {});
    vadAudioContext = null;
  }

  vadReady = false;
  vadNoiseFloorRms = 0.004;
  vadLastVoiceAt = 0;
}

function isLikelySpeakingNow(now = Date.now()) {
  // If VAD is unavailable, keep legacy restart behavior for safety.
  if (!vadReady) return true;
  return now - vadLastVoiceAt <= VAD_SPEECH_HOLD_MS;
}

function hardRebuildRecognition() {
  // Rebuild recognition instance after repeated failures to recover bad internal state.
  recognition = null;
  isRecognitionStarting = false;
  isStoppingRecognition = false;
  clearRecognitionStartTimeout();
  initRecognition();
}

function startNoResultWatchdog() {
  stopNoResultWatchdog();
  lastWatchdogObservedResultAt = lastResultAt;
  watchdogMissWhileSpeakingCount = 0;

  noResultWatchdogTimer = setInterval(() => {
    if (!isRecording || isStoppingRecognition || !recognition) return;

    const now = Date.now();
    const likelySpeaking = isLikelySpeakingNow(now);
    const hasTranscriptUpdated = lastResultAt > lastWatchdogObservedResultAt;
    lastWatchdogObservedResultAt = lastResultAt;

    // Immediate restart path: speaking is likely, but transcript stream is stale.
    if (!likelySpeaking) {
      watchdogMissWhileSpeakingCount = 0;
      return;
    }
    if (hasTranscriptUpdated) {
      watchdogMissWhileSpeakingCount = 0;
      return;
    }

    watchdogMissWhileSpeakingCount += 1;
    if (watchdogMissWhileSpeakingCount < 2) return;
    if (now - lastRestartAt <= RESTART_GRACE_MS) return;
    watchdogMissWhileSpeakingCount = 0;

    // Soft restart only: stop then start, and persist first to reduce loss on interruption.
    markRecoveryRestarting("收音暫時中斷，正在重新連線...");
    persistTempTranscript(getTranscriptText());
    stopRecognitionSafely();

    setTimeout(() => {
      if (!isRecording) return;
      const ok = startRecognitionSafely();
      if (!ok) {
        console.warn("Watchdog soft restart start() failed");
      }
    }, ONEND_RESTART_DELAY_MS);
  }, WATCHDOG_INTERVAL_MS);
}

function stopRecognitionSafely() {
  if (!recognition) return;
  isStoppingRecognition = true;
  clearRecognitionStartTimeout();
  if (recognitionRestartTimer) {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = null;
  }
  try {
    recognition.stop();
  } catch (err) {
    isStoppingRecognition = false;
    console.warn("Recognition stop skipped:", err);
  }
}

function startRecognitionSafely() {
  if (!recognition) initRecognition();
  if (!recognition || isRecognitionStarting) return false;

  isRecognitionStarting = true;
  clearRecognitionStartTimeout();
  lastRestartAt = Date.now();

  startTimeoutTimer = setTimeout(() => {
    // Guard against start() stuck without onstart callback.
    if (isRecognitionStarting) {
      isRecognitionStarting = false;
      console.warn("Recognition start timed out; unlock start gate for retry.");
    }
    startTimeoutTimer = null;
  }, RECOGNITION_START_TIMEOUT_MS);

  try {
    recognition.start();
    return true;
  } catch (err) {
    clearRecognitionStartTimeout();
    isRecognitionStarting = false;
    console.error("Recognition start failed:", err);
    return false;
  }
}

function getRecognitionErrorMessage(errorCode) {
  const map = {
    "not-allowed": "麥克風權限被拒絕，請允許權限後重試。",
    "service-not-allowed": "瀏覽器禁止語音辨識服務，請檢查瀏覽器設定。",
    "audio-capture": "找不到可用麥克風裝置，請確認輸入裝置。",
    network: "語音辨識網路中斷，請檢查網路後重試。",
    "no-speech": "未偵測到語音輸入，請靠近麥克風再試一次。",
  };
  return map[errorCode] || `語音辨識發生錯誤：${errorCode || "unknown"}`;
}

function splitTranscriptIntoReadableChunks(text, maxChars = 28, minChars = 14) {
  const source = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return [];

  const seeds = source
    .split(/[。！？!?\n；;]+/)
    .map((piece) => piece.trim())
    .filter(Boolean);

  const chunks = [];
  const pieces = seeds.length ? seeds : [source];

  pieces.forEach((piece) => {
    let rest = piece;

    while (rest.length > maxChars) {
      const windowText = rest.slice(0, maxChars + 1);
      let splitAt = -1;
      ["，", "、", ",", " "].forEach((mark) => {
        const idx = windowText.lastIndexOf(mark);
        if (idx > splitAt) splitAt = idx;
      });

      if (splitAt < minChars) splitAt = maxChars;
      const part = rest.slice(0, splitAt).trim();
      if (part) chunks.push(part);
      rest = rest.slice(splitAt).trim();
    }

    if (rest) chunks.push(rest);
  });

  return chunks;
}

function getElapsedRecordingSeconds() {
  if (recordingStartedAtMs > 0) {
    return Math.max(0, Math.floor((Date.now() - recordingStartedAtMs) / 1000));
  }
  return Math.max(0, Math.floor(seconds || 0));
}

function mergeTimelineSegmentsForDisplay(timelineSegments) {
  const merged = [];

  timelineSegments.forEach((item) => {
    if (merged.length === 0) {
      merged.push({ second: item.second, text: item.text });
      return;
    }

    const prev = merged[merged.length - 1];
    const gap = item.second - prev.second;
    const shouldMergeSameSecond = gap === 0;
    const shouldMergeDenseShort =
      gap > 0
      && gap <= TIMELINE_MERGE_GAP_SECONDS
      && prev.text.length < TIMELINE_SHORT_TEXT_MERGE_THRESHOLD;

    if (shouldMergeSameSecond || shouldMergeDenseShort) {
      prev.text = `${prev.text} ${item.text}`.replace(/\s+/g, " ").trim();
      return;
    }

    merged.push({ second: item.second, text: item.text });
  });

  return merged;
}

function appendFinalChunksToTimeline(finalChunks, currentSecond, anchorSecond = null) {
  if (!Array.isArray(finalChunks) || finalChunks.length === 0) return;

  const lastItemSecond = finalizedSpeechTimeline.length > 0
    ? Math.floor(Number(finalizedSpeechTimeline[finalizedSpeechTimeline.length - 1]?.second) || -1)
    : -1;
  const monotonicBase = Math.max(lastTimelineAssignedSecond, lastItemSecond);

  const safeCurrentSecond = Math.max(0, Math.floor(Number(currentSecond) || 0));
  const safeAnchorSecond = Number.isFinite(Number(anchorSecond))
    ? Math.max(0, Math.floor(Number(anchorSecond)))
    : null;

  const spreadStart = safeAnchorSecond === null
    ? Math.max(0, safeCurrentSecond - finalChunks.length + 1, monotonicBase + 1)
    : Math.max(0, Math.min(safeAnchorSecond, safeCurrentSecond), monotonicBase + 1);
  const spreadEnd = Math.max(spreadStart, safeCurrentSecond);
  const spreadRange = spreadEnd - spreadStart;
  const denom = Math.max(1, finalChunks.length - 1);
  let cursorSecond = monotonicBase;

  finalChunks.forEach((chunk, idx) => {
    const mapped = spreadStart + Math.round((idx * spreadRange) / denom);
    const sec = Math.max(cursorSecond + 1, mapped);
    finalizedSpeechTimeline.push({
      second: sec,
      text: chunk,
    });
    cursorSecond = sec;
  });
  lastTimelineAssignedSecond = cursorSecond;
}

function initRecognition() {
  if (!("webkitSpeechRecognition" in window)) {
    console.warn("This browser does not support webkitSpeechRecognition.");
    recognition = null;
    return;
  }

  if (recognition) return;

  recognition = new window.webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "zh-TW";

  recognition.onstart = () => {
    clearRecognitionStartTimeout();
    isRecognitionStarting = false;
    recognitionEndFailCount = 0;
    lastRestartAt = Date.now();
    lastErrorCode = "";
    markRecoveryRestarted();
    if (isRecording && recordingStartedAtMs === 0) {
      recordingStartedAtMs = Date.now();
    }
  };

  recognition.onresult = (event) => {
    lastResultAt = Date.now();
    if (awaitingRecoveryAckToken === 0 && isRecoveryHintVisible) {
      hideRecoveryHint();
    }
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const piece = event.results[i][0]?.transcript || "";
      if (event.results[i].isFinal) {
        fullTranscript += piece;
        const finalChunks = splitTranscriptIntoReadableChunks(piece);
        const anchorSecond = pendingSpeechAnchorSecond;
        appendFinalChunksToTimeline(
          finalChunks,
          getElapsedRecordingSeconds(),
          anchorSecond,
        );
        pendingSpeechAnchorSecond = null;
        //console.log("finalizedSpeechTimeline seconds:", finalizedSpeechTimeline.map((item, index) => ({ index, second: item.second })));
      } else {
        interim += piece;
        if (piece.trim() && pendingSpeechAnchorSecond === null) {
          pendingSpeechAnchorSecond = getElapsedRecordingSeconds();
        }
      }
    }

    lastInterim = interim;
    const displayText = getTranscriptText();
    persistTempTranscript(displayText);

    const el = safeEl("live-transcript");
    if (el) el.innerText = displayText || "正在聽課中...";
  };

  recognition.onerror = (event) => {
    const code = event?.error || "unknown";

    if (code === "aborted" && isStoppingRecognition) return;

    const msg = getRecognitionErrorMessage(code);
    console.error("Recognition error:", code, event);

    if (["not-allowed", "service-not-allowed", "audio-capture"].includes(code)) {
      isRecording = false;
      stopNoResultWatchdog();
      clearRecognitionStartTimeout();
      clearInterval(timerInterval);
      alert(msg);
      window.navigateTo("page-list");
      return;
    }

    if (["network", "no-speech", "aborted"].includes(code)) {
      lastErrorCode = code;
    }

    console.warn(msg);
  };

  recognition.onend = () => {
    isRecognitionStarting = false;

    if (isStoppingRecognition) {
      isStoppingRecognition = false;
      return;
    }

    if (!isRecording) return;

    if (recognitionRestartTimer) {
      clearTimeout(recognitionRestartTimer);
      recognitionRestartTimer = null;
    }

    if (recognitionEndFailCount >= RECOGNITION_MAX_RESTARTS) {
      const snapshot = getTranscriptText();
      persistTempTranscript(snapshot);
      isRecording = false;
      stopNoResultWatchdog();
      clearRecognitionStartTimeout();
      clearInterval(timerInterval);
      alert("語音辨識已中斷且重啟失敗，逐字稿已暫存。請重新開始錄音。");
      window.navigateTo("page-list");
      return;
    }

    recognitionRestartTimer = setTimeout(() => {
      recognitionEndFailCount += 1;
      markRecoveryRestarting("收音暫時中斷，正在重新連線...");
      const shouldHardRebuild = recognitionEndFailCount >= HARD_REBUILD_AFTER_FAILS;
      if (shouldHardRebuild) {
        hardRebuildRecognition();
      }

      const ok = startRecognitionSafely();
      if (!ok) {
        console.warn(
          `Recognition restart attempt ${recognitionEndFailCount}/${RECOGNITION_MAX_RESTARTS} failed`,
        );
      }
    }, ONEND_RESTART_DELAY_MS);
  };
}

function startRecordPage() {
  if (isRecording || isGeneratingSummary) return;

  initRecognition();

  fullTranscript = "";
  lastInterim = "";
  finalizedSpeechTimeline = [];
  lastTimelineAssignedSecond = -1;
  pendingSpeechAnchorSecond = null;
  recordingStartedAtMs = 0;
  resetRecoveryState();
  persistTempTranscript("");
  seconds = 0;
  isRecording = true;
  recognitionEndFailCount = 0;
  lastErrorCode = "";
  lastResultAt = Date.now();
  lastRestartAt = Date.now();
  lastWatchdogObservedResultAt = lastResultAt;
  isRecoveryHintVisible = false;
  stopVoiceActivityMonitor();

  const timerEl = safeEl("record-timer");
  const liveEl = safeEl("live-transcript");
  const recoveryEl = safeEl("record-recovery-status");
  if (timerEl) timerEl.innerText = "00:00";
  if (liveEl) liveEl.innerText = "正在聽課中...";
  if (recoveryEl) recoveryEl.classList.add("hidden");

  window.navigateTo("page-record");

  const started = startRecognitionSafely();
  if (!started) {
    alert("語音辨識啟動失敗，請檢查麥克風權限後重試。");
    isRecording = false;
    stopNoResultWatchdog();
    clearRecognitionStartTimeout();
    window.navigateTo("page-list");
    return;
  }

  startNoResultWatchdog();
  void startVoiceActivityMonitor();

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    seconds++;
    if (seconds % Math.floor(PERIODIC_TRANSCRIPT_PERSIST_MS / 1000) === 0) {
      persistTempTranscript(getTranscriptText());
    }
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    const t = safeEl("record-timer");
    if (t) t.innerText = `${m}:${s}`;
  }, 1000);
}

function cancelRecording() {
  isRecording = false;
  recordingStartedAtMs = 0;
  resetRecoveryState();
  stopVoiceActivityMonitor();
  stopNoResultWatchdog();
  clearRecognitionStartTimeout();
  stopRecognitionSafely();
  clearInterval(timerInterval);
  persistTempTranscript(getTranscriptText());
  window.navigateTo("page-list");
}

function parseDurationToSeconds(durationText) {
  const parts = String(durationText || "00:00")
    .split(":")
    .map((n) => Number(n));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    return 0;
  }
  return parts[0] * 60 + parts[1];
}

function formatSecondsToTimestamp(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function buildSegmentsFromTranscript(
  transcript,
  totalSeconds = 0,
  timeline = [],
) {
  const timelineSegments = Array.isArray(timeline)
    ? timeline
        .map((item) => ({
          second: Math.max(0, Math.floor(Number(item?.second) || 0)),
          text: String(item?.text || "").trim(),
        }))
        .filter((item) => item.text)
    : [];

  if (timelineSegments.length > 0) {
    const mergedTimeline = mergeTimelineSegmentsForDisplay(timelineSegments);
    return mergedTimeline.map((item) => ({
      time: formatSecondsToTimestamp(item.second),
      text: item.text,
    }));
  }

  const raw = String(transcript || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return [];

  const merged = splitTranscriptIntoReadableChunks(raw);
  if (merged.length === 0) return [];

  const effectiveTotalSeconds = Math.max(
    0,
    Math.floor(Number(totalSeconds) || 0),
    Math.ceil(raw.length / 6),
  );
  const totalChars = merged.reduce((acc, item) => acc + item.length, 0);
  let passedChars = 0;

  return merged.map((text, idx) => {
    const ratioBase = totalChars > 0 ? passedChars / totalChars : idx / Math.max(merged.length - 1, 1);
    const secondAt = effectiveTotalSeconds > 0
      ? Math.round(ratioBase * effectiveTotalSeconds)
      : idx * 8;
    passedChars += text.length;
    return {
      time: formatSecondsToTimestamp(secondAt),
      text,
    };
  });
}

async function stopRecording() {

  if (isGeneratingSummary) return;

  isGeneratingSummary = true;
  isRecording = false;
  recordingStartedAtMs = 0;
  resetRecoveryState();
  stopVoiceActivityMonitor();
  stopNoResultWatchdog();
  clearRecognitionStartTimeout();
  stopRecognitionSafely();
  clearInterval(timerInterval);

  const trailingInterim = String(lastInterim || "").trim();
  if (trailingInterim) {
    const trailingChunks = splitTranscriptIntoReadableChunks(trailingInterim);
    appendFinalChunksToTimeline(trailingChunks, getElapsedRecordingSeconds(), pendingSpeechAnchorSecond);
    pendingSpeechAnchorSecond = null;
    lastInterim = "";
  }

  const finalTranscript = getTranscriptText();
  persistTempTranscript(finalTranscript || "");

  const durationText = safeEl("record-timer")?.innerText || "00:00";
  const durationFromUi = parseDurationToSeconds(durationText);
  const totalRecordedSeconds = Math.max(durationFromUi, Math.floor(seconds || 0));
  const finalDurationText = formatSecondsToTimestamp(totalRecordedSeconds);

  if (!finalTranscript) {
    alert("尚未取得有效逐字稿，請再錄一次。若中途失敗可檢查麥克風權限。");
    window.navigateTo("page-list");
    isGeneratingSummary = false;
    return;
  }

  window.navigateTo("page-loading");

  const prompt = `你是一位專業筆記助手「Memo助手」。請將這段錄音逐字稿整理成高品質繁體中文筆記 JSON。請只根據提供內容整理，不要補充逐字稿中不存在的內容。逐字稿：${finalTranscript}`;

  const speechSegments = buildSegmentsFromTranscript(
    finalTranscript,
    totalRecordedSeconds,
    finalizedSpeechTimeline,
  );

  const schema = {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      intro: { type: "STRING" },
      sections: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING" },
            items: { type: "ARRAY", items: { type: "STRING" } },
          },
        },
      },
    },
  };

  let result;
  try {
    const data = await callGemini(prompt, schema, appSettings.aiStyle || "default");
    const raw = extractAiText(data);
    result = normalizeAiNotePayload(safeParseAiJson(raw));
  } catch (err) {
    // Only enter fallback after callGemini built-in retries are exhausted.
    console.error("摘要生成最終失敗:", err);

    try {
      const fallbackSegments = Array.isArray(speechSegments) && speechSegments.length > 0
        ? speechSegments
        : [{ time: "00:00", text: finalTranscript }];

      const fallbackNote = {
        id: `${Date.now()}-fallback`,
        title: "逐字稿暫存筆記",
        intro: "AI 摘要失敗，已先保留逐字稿內容。",
        category: "未分類",
        date: `${new Date().getMonth() + 1} / ${new Date().getDate()}`,
        duration: finalDurationText,
        sections: [],
        segments: fallbackSegments,
        rawTranscript: finalTranscript,
        isFavorite: false,
        isDeleted: false,
      };

      const nextNotes = await dataService.createNote(fallbackNote);
      notesLibrary = Array.isArray(nextNotes) ? nextNotes : [fallbackNote, ...notesLibrary];
      window.loadNoteDetails(fallbackNote.id);
      void storage.removeItem(STORAGE_KEYS.TEMP_TRANSCRIPT);
      alert("AI 摘要失敗，已建立逐字稿暫存筆記。可先查看逐字稿內容。");
    } catch (fallbackErr) {
      console.error("Fallback note 建立失敗:", fallbackErr);
      alert(`生成失敗，但逐字稿已為您暫存。\n原因：${err.message || "未知錯誤"}`);
      window.navigateTo("page-list");
    }

    isGeneratingSummary = false;
    return;
  }

  try {
    const newNote = {
      ...result,
      id: Date.now().toString(),
      category: "未分類",
      date: `${new Date().getMonth() + 1} / ${new Date().getDate()}`,
      duration: finalDurationText,
      segments: speechSegments,
      rawTranscript: finalTranscript,
      isFavorite: false,
      isDeleted: false,
    };

    const nextNotes = await dataService.createNote(newNote);
    notesLibrary = Array.isArray(nextNotes) ? nextNotes : [newNote, ...notesLibrary];
    window.loadNoteDetails(newNote.id);
    void storage.removeItem(STORAGE_KEYS.TEMP_TRANSCRIPT);
  } catch (persistErr) {
    console.error("摘要成功但筆記儲存失敗:", persistErr);
    alert(`筆記儲存失敗，但逐字稿已為您暫存。\n原因：${persistErr.message || "未知錯誤"}`);
    window.navigateTo("page-list");
  } finally {
    isGeneratingSummary = false;
  }
}

/**
 * =========================================================
 * 4) AI / API（Gemini 互動）
 * =========================================================
 */

async function callGemini(
  prompt,
  responseSchema = null,
  aiStyle = "default",
  retryCount = 0,
) {
  const MAX_RETRY = 5;          // 最多重試 5 次（不含首次）
  const MAX_RETRY_503 = 3;      // 503 服務暫時不可用，最多重試 3 次
  const base = Math.pow(2, retryCount) * 1000;
  const jitter = base * (0.7 + Math.random() * 0.6);

  const shouldRetryNetworkError = (err) => {
    // AbortError 代表前端 25s 計時器主動取消，不應重試
    if (err?.name === "AbortError") return false;
    const msg = String(err?.message || "");
    return /network|fetch/i.test(msg);
  };

  const shouldRetryStatus = (status, retry) => {
    if (status === 429) return false;           // 限流中，絕對不重試
    if (status === 503) return retry < MAX_RETRY_503;
    if (status >= 500) return retry < MAX_RETRY;
    return false;
  };

  const extractRemoteMessage = (data, status) =>
    String(data?.error?.message || data?.error || `API 請求失敗 (${status})`);

  const isQuotaExhaustedError = (status, data) => {
    const remoteMsg = extractRemoteMessage(data, status);
    return /(quota|配額|resource[_\s-]?exhausted|insufficient[_\s-]?quota|quota[_\s-]?exceeded|billing|exceed.*limit)/i
      .test(remoteMsg);
  };

  const styleToUse = aiStyle || appSettings?.aiStyle || "default";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  const requestPayload = {
    prompt: prompt,
    aiStyle: styleToUse || "default",
  };
  if (responseSchema && typeof responseSchema === "object" && !Array.isArray(responseSchema)) {
    requestPayload.schema = responseSchema;
  }

  try {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      // 429 限流特殊處理：使用 alert 提示使用者
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After") || "60";
        const errorMsg = `請求過於頻繁，請等待 ${retryAfter} 秒後再試。`;
        alert(errorMsg);
        throw new Error(errorMsg);
      }

      // Quota/Billing 類錯誤直接停止重試，避免無效等待
      if (isQuotaExhaustedError(response.status, data)) {
        throw new Error(
          "目前 AI 配額不足（Quota Exceeded），已停止自動重試。請稍後再試，或檢查 API/Billing 配額。",
        );
      }

      if (shouldRetryStatus(response.status, retryCount)) {
        await new Promise((r) => setTimeout(r, jitter));
        return callGemini(prompt, responseSchema, styleToUse, retryCount + 1);
      }

      const remoteMsg = extractRemoteMessage(data, response.status);
      throw new Error(remoteMsg);
    }

    if (!data) throw new Error("AI 回應格式錯誤，請稍後再試。")

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (retryCount < MAX_RETRY && shouldRetryNetworkError(err)) {
      await new Promise((r) => setTimeout(r, jitter));
      return callGemini(prompt, responseSchema, styleToUse, retryCount + 1);
    }
    // AbortError：明確告知使用者是超時，而非網路錯誤
    if (err?.name === "AbortError") {
      throw new Error("AI 請求超時（25 秒），請稍後再試。");
    }
    throw err;
  }
}

function extractAiText(data) {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function safeParseAiJson(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) throw new Error("AI 回傳空內容");

  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }

  throw new Error("AI JSON 解析失敗，請重試。");
}

function normalizeAiNotePayload(payload) {
  const sections = Array.isArray(payload?.sections)
    ? payload.sections
        .map((sec) => ({
          category: String(sec?.category || "未分類重點"),
          items: Array.isArray(sec?.items)
            ? sec.items.map((i) => String(i || "")).filter(Boolean)
            : [],
        }))
        .filter((sec) => sec.items.length > 0)
    : [];

  const segments = Array.isArray(payload?.segments)
    ? payload.segments
        .map((seg) => ({
          time: String(seg?.time || ""),
          text: String(seg?.text || "").trim(),
        }))
        .filter((seg) => seg.text)
    : [];

  return {
    title: String(payload?.title || "").trim() || "新筆記",
    intro: String(payload?.intro || "").trim() || "尚無摘要",
    sections,
    segments,
  };
}

/**
 * =========================================================
 * 5) Render / UI（渲染與介面）
 * =========================================================
 */

function getAllCategories() {
  const cats = notesLibrary
    .filter((n) => !n.isDeleted)
    .map((n) => (n.category || "未分類").trim());
  const uniq = [...new Set(cats)].filter(Boolean);
  return ["全部", ...uniq];
}

function renderCategoryFilters() {
  const containerIds = [
    "category-filter-container",
    "category-filter-review",
    "category-filter-trash",
  ];

  const allCategories = getAllCategories();

  const optionsHTML = allCategories
    .map(
      (cat) =>
        `<option value="${escapeHtml(cat)}" ${
          currentFilterCategory === cat ? "selected" : ""
        }>分類: ${escapeHtml(cat)}</option>`,
    )
    .join("");

  const selectHTML = `
    <select class="bg-gray-50 border-none outline-none text-[10px] font-black text-gray-500 py-1.5 px-3 rounded-xl cursor-pointer shadow-sm">
      ${optionsHTML}
    </select>
  `;

  containerIds.forEach((id) => {
    const container = safeEl(id);
    if (container) container.innerHTML = selectHTML;
  });
}

function renderNoteUI(data) {
  if (!data) return;

  safeEl("content-title").innerText = data.title || "課堂摘要";
  safeEl("ai-intro-text").innerText = data.intro || "尚無摘要";
  safeEl("content-duration").innerText = `00:00 / ${data.duration || "00:00"}`;

  syncFavoriteUI(data);

  const noteContainer = safeEl("note-cards-container");
  if (noteContainer) {
    noteContainer.innerHTML = "";
    (data.sections || []).forEach((sec) => {
      const card = document.createElement("div");
      card.className = "note-highlight";
      card.innerHTML = `
        <div class="font-black text-[#13B5B1] text-xs mb-3 uppercase tracking-wider">${escapeHtml(sec.category || "")}</div>
        <ul class="space-y-3">
          ${(sec.items || [])
            .map(
              (i) => `
              <li class="text-[12px] text-gray-700 font-bold">• ${formatHighlightedBullet(i)}</li>
            `,
            )
            .join("")}
        </ul>
      `;
      noteContainer.appendChild(card);
    });
  }

  const transcriptContainer = safeEl("transcript-container");
  if (transcriptContainer) {
    transcriptContainer.innerHTML = '<div class="timeline-line"></div>';
    (data.segments || []).forEach((seg, idx) => {
      const item = document.createElement("div");
      item.className = "relative mb-10 pl-8";
      item.innerHTML = `
        <div class="timeline-dot ${idx === 0 ? "active" : ""}"></div>
        <div class="text-[9px] ${
          idx === 0 ? "text-[#13B5B1]" : "text-gray-300"
        } font-black mb-1 tracking-wider">${escapeHtml(seg.time || "")}</div>
        <div class="text-xs ${
          idx === 0
            ? "text-gray-800 font-black bg-[#F0F9F9] -mx-4 px-4 py-2 rounded-2xl shadow-sm border border-[#13B5B1]/5"
            : "text-gray-400 font-bold"
        } leading-relaxed">${escapeHtml(seg.text || "")}</div>
      `;
      transcriptContainer.appendChild(item);
    });
  }
}

function noteMatchesFilters(note, searchTermLower = "") {
  const matchesSearch = (note.title || "")
    .toLowerCase()
    .includes(searchTermLower);

  const noteCat = (note.category || "未分類").trim();
  const matchesCategory =
    currentFilterCategory === "全部" || noteCat === currentFilterCategory;

  const matchesFavorite = currentFilter === "fav" ? !!note.isFavorite : true;

  const noteDateNorm = (note.date || "").replace(/\s/g, "");
  const filterDateNorm = (currentFilterDate || "").replace(/\s/g, "");
  const matchesDate = !currentFilterDate || noteDateNorm === filterDateNorm;

  return matchesSearch && matchesCategory && matchesFavorite && matchesDate;
}

function renderNotesList() {
  const container = safeEl("list-container");
  const searchTerm = safeEl("search-input")?.value.toLowerCase() || "";
  if (!container) return;

  const filteredNotes = notesLibrary.filter(
    (note) => !note.isDeleted && noteMatchesFilters(note, searchTerm),
  );

  if (filteredNotes.length === 0) {
    const msg = currentFilterDate
      ? `${currentFilterDate} 沒有紀錄`
      : "目前沒有筆記";
    const safeMsg = escapeHtml(msg);
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-20 text-gray-300 opacity-60">
        <i class="fas fa-file-invoice-alt text-4xl mb-4"></i>
        <p class="text-sm font-black">${safeMsg}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  filteredNotes.forEach((note) => {
    const wrapper = document.createElement("div");
    wrapper.className = "flex gap-4 items-start mb-6 w-full";

    const starHtml = note.isFavorite
      ? `<i class="fas fa-star text-yellow-400 text-[10px] ml-1"></i>`
      : "";

    const dateParts = String(note.date || "1 / 1").split("/");
    const month = dateParts[0] ? dateParts[0].trim() : "1";
    const day = dateParts[1] ? dateParts[1].trim() : "1";
    const safeTitle = escapeHtml(note.title || "未命名筆記");
    const safeCategory = escapeHtml(note.category || "未分類");
    const safeIntro = escapeHtml(note.intro || "尚無摘要內容...");
    const safeDuration = escapeHtml(note.duration || "00:00");

    wrapper.innerHTML = `
      <div class="card-visual-slot">
        <div class="active-date shadow-sm">
          <div class="text-[9px] font-bold opacity-80 uppercase">${escapeHtml(month)}月</div>
          <div class="text-lg font-black leading-tight">${escapeHtml(day)}</div>
        </div>
      </div>

      <div class="note-card-main" data-action="open-note" data-note-id="${escapeHtml(note.id)}">
        <div class="flex justify-between items-start mb-2">
          <div class="font-black text-gray-800 text-sm leading-snug flex-1">
            ${safeTitle}${starHtml}
          </div>
          <span class="ml-2 px-2 py-0.5 bg-[#13B5B1]/10 text-[#13B5B1] text-[8px] rounded-full font-black">
            ${safeCategory}
          </span>
        </div>

        <p class="card-intro-text line-clamp-2">
          ${safeIntro}
        </p>

        <div class="flex justify-between items-center">
          <div class="flex items-center gap-1.5 text-gray-300 font-black tracking-widest">
            <i class="far fa-clock text-[9px]"></i>
            <span class="text-[8px]">${safeDuration}</span>
          </div>

          <div class="flex gap-2">
            <button type="button"
              class="w-8 h-8 ${
                note.isFavorite
                  ? "bg-yellow-400 text-white"
                  : "bg-yellow-50 text-yellow-400"
              } rounded-xl flex items-center justify-center active:scale-95 transition-all"
              data-action="list-toggle-favorite"
              data-note-id="${escapeHtml(note.id)}">
              <i class="${note.isFavorite ? "fas" : "far"} fa-star text-[10px]"></i>
            </button>

            <button type="button"
              class="w-8 h-8 bg-red-50 text-red-400 rounded-xl flex items-center justify-center active:scale-95 transition-all"
              data-action="delete-note"
              data-note-id="${escapeHtml(note.id)}">
              <i class="fas fa-trash-alt text-[10px]"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(wrapper);
  });
}

function renderTrashList() {
  const container = safeEl("trash-container");
  const emptyState = safeEl("trash-empty-state");
  const searchTerm = safeEl("search-trash")?.value.toLowerCase() || "";
  if (!container || !emptyState) return;

  const trashNotes = notesLibrary.filter(
    (n) => n.isDeleted === true && noteMatchesFilters(n, searchTerm),
  );

  safeEl("clear-date-trash")?.classList.toggle("hidden", !currentFilterDate);

  if (trashNotes.length === 0) {
    container.innerHTML = "";
    emptyState.classList.remove("hidden");
  } else {
    emptyState.classList.add("hidden");
    container.innerHTML = trashNotes
      .map(
        (note) => {
          const safeTitle = escapeHtml(note.title || "未命名筆記");
          const safeCategory = escapeHtml(note.category || "未分類");
          const safeIntro = escapeHtml(note.intro || "已刪除的筆記摘要...");
          const safeDuration = escapeHtml(note.duration || "00:00");
          const safeDate = escapeHtml(note.date || "");
          const safeDeletedAt = escapeHtml(
            note.deletedAt ? new Date(note.deletedAt).toLocaleDateString() : "未知",
          );
          const safeId = escapeHtml(note.id);

          return `
        <div class="flex gap-4 items-start mb-6 w-full group opacity-85">
          <div class="card-visual-slot pt-4">
            <div data-action="trash-toggle-note" data-id="${safeId}"
              class="w-6 h-6 rounded-lg border-2 border-gray-100 flex items-center justify-center transition-all cursor-pointer
              ${
                selectedTrashNotes.has(note.id)
                  ? "bg-[#13B5B1] border-[#13B5B1]"
                  : "bg-white"
              }">
              ${
                selectedTrashNotes.has(note.id)
                  ? '<i class="fas fa-check text-white text-[10px]"></i>'
                  : ""
              }
            </div>
          </div>

          <div class="note-card-main">
            <div class="flex justify-between items-start mb-2">
              <div class="font-black text-gray-800 text-sm leading-snug flex-1">${safeTitle}</div>
              <span class="ml-2 px-2 py-0.5 bg-gray-50 text-gray-400 text-[8px] rounded-full font-black border border-gray-100">${
                safeCategory
              }</span>
            </div>

            <p class="card-intro-text line-clamp-2">${safeIntro}</p>

            <div class="flex justify-between items-center mt-2">
              <div class="flex flex-1 items-center gap-4 flex-wrap">
                <div class="flex items-center gap-1.5 text-gray-300 font-black tracking-widest uppercase">
                  <i class="far fa-clock text-[9px]"></i>
                  <span class="text-[8px]">${safeDuration}</span>
                </div>
                <span class="text-[8px] text-gray-300 font-black tracking-widest uppercase">${safeDate}</span>
                <div class="text-[8px] text-gray-300 font-black tracking-widest uppercase">
                  <i class="fas fa-history mr-1"></i> 刪除於: ${
                    safeDeletedAt
                  }
                </div>
              </div>

              <div class="flex gap-2 flex-shrink-0">
                <button type="button"
                  class="w-8 h-8 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                  data-action="open-note" data-note-id="${safeId}">
                  <i class="fas fa-external-link-alt text-[10px]"></i>
                </button>

                <button type="button"
                  class="w-8 h-8 bg-[#13B5B1]/10 text-[#13B5B1] rounded-xl flex items-center justify-center active:scale-95 transition-all"
                  data-action="trash-restore" data-note-id="${safeId}">
                  <i class="fas fa-undo-alt text-[10px]"></i>
                </button>

                <button type="button"
                  class="w-8 h-8 bg-red-50 text-red-400 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                  data-action="trash-permadelete" data-note-id="${safeId}">
                  <i class="fas fa-times text-[10px]"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
        },
      )
      .join("");
  }

  const hasSel = selectedTrashNotes.size > 0;
  ["btn-batch-restore", "btn-batch-delete"].forEach((id) => {
    const b = safeEl(id);
    if (b) {
      b.disabled = !hasSel;
      b.style.opacity = hasSel ? "1" : "0.5";
    }
  });
}

function renderReviewSelection() {
  const noteContainer = safeEl("review-note-list");
  const searchTerm = safeEl("search-review")?.value.toLowerCase() || "";
  if (!noteContainer) return;

  const availableNotes = notesLibrary.filter(
    (n) => !n.isDeleted && noteMatchesFilters(n, searchTerm),
  );

  safeEl("clear-date-review")?.classList.toggle("hidden", !currentFilterDate);

  noteContainer.innerHTML = availableNotes
    .map(
      (note) => {
        const safeTitle = escapeHtml(note.title || "未命名筆記");
        const safeCategory = escapeHtml(note.category || "未分類");
        const safeIntro = escapeHtml(note.intro || "尚無摘要內容...");
        const safeDuration = escapeHtml(note.duration || "00:00");
        const safeDate = escapeHtml(note.date || "");
        const safeId = escapeHtml(note.id);

        return `
        <div class="flex gap-4 items-start mb-6 w-full group">
          <div class="card-visual-slot pt-4">
            <div data-action="review-toggle-note" data-id="${safeId}"
              class="w-6 h-6 rounded-lg border-2 border-gray-100 flex items-center justify-center transition-all cursor-pointer
              ${
                selectedReviewNotes.has(note.id)
                  ? "bg-[#13B5B1] border-[#13B5B1]"
                  : "bg-white"
              }">
              ${
                selectedReviewNotes.has(note.id)
                  ? '<i class="fas fa-check text-white text-[10px]"></i>'
                  : ""
              }
            </div>
          </div>

          <div class="note-card-main" data-action="review-toggle-note" data-id="${safeId}">
            <div class="flex justify-between items-start mb-2">
              <div class="font-black text-gray-800 text-sm leading-snug flex-1">
                ${safeTitle}
                ${note.isFavorite ? '<i class="fas fa-star text-yellow-400 text-[10px] ml-1"></i>' : ""}
              </div>
              <span class="ml-2 px-2 py-0.5 bg-[#13B5B1]/10 text-[#13B5B1] text-[8px] rounded-full font-black whitespace-nowrap">
                ${safeCategory}
              </span>
            </div>

            <p class="card-intro-text line-clamp-2">${safeIntro}</p>

            <div class="flex justify-between items-center mt-2">
              <div class="flex justify-start items-center gap-4">
                <div class="flex items-center gap-1.5 text-gray-300 font-black tracking-widest uppercase">
                  <i class="far fa-clock text-[9px]"></i>
                  <span class="text-[8px]">${safeDuration}</span>
                </div>
                <span class="text-[8px] text-gray-300 font-black tracking-widest uppercase">${safeDate}</span>
              </div>

              <button type="button"
                class="w-8 h-8 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                data-action="open-note"
                data-note-id="${safeId}">
                <i class="fas fa-external-link-alt text-[10px]"></i>
              </button>
            </div>
          </div>
        </div>
      `;
      },
    )
    .join("");

  const startBtn = safeEl("btn-start-review");
  if (startBtn) {
    const hasSel = selectedReviewNotes.size > 0;
    startBtn.disabled = !hasSel;
    startBtn.style.opacity = hasSel ? "1" : "0.5";
  }
}

function updateNavUI(pageId) {
  const navItems = {
    "page-home": "nav-home",
    "page-list": "nav-notes",
    "page-review": "nav-review",
    "page-trash": "nav-trash",
    "page-settings": "nav-settings",
  };

  Object.values(navItems).forEach((id) => {
    const el = safeEl(id);
    if (!el) return;
    el.classList.remove("nav-item-active", "text-[#13B5B1]");
    el.classList.add("nav-item-inactive", "text-gray-300");
  });

  const activeId = navItems[pageId];
  if (activeId) {
    const activeEl = safeEl(activeId);
    if (activeEl) {
      activeEl.classList.remove("nav-item-inactive", "text-gray-300");
      activeEl.classList.add("nav-item-active", "text-[#13B5B1]");
    }
  }
}

/**
 * =========================================================
 * 6) Actions（功能）
 * =========================================================
 */

function toggleFavorite() {
  if (!currentNoteData) return;
  const note = notesLibrary.find((n) => n.id === currentNoteData.id);
  if (!note) return;

  note.isFavorite = !note.isFavorite;
  saveNotesToDisk();
  currentNoteData = note;
  renderNoteUI(note);
}

function filterNotes(type) {
  currentFilter = type;

  document.querySelectorAll("[data-filter]").forEach((el) => {
    const isActive = el.dataset.filter === type;
    el.className = isActive
      ? "text-xs font-black text-[#13B5B1] cursor-pointer border-b-2 border-[#13B5B1] pb-1 transition-all"
      : "text-xs font-black text-gray-300 cursor-pointer pb-1 transition-all";
  });

  renderNotesList();
  renderReviewSelection();
  renderTrashList();
}

function editNoteTitle() {
  if (!currentNoteData) return;

  const newTitle = prompt("請輸入新的筆記標題：", currentNoteData.title || "");
  if (!newTitle || newTitle.trim() === "") return;

  const v = newTitle.trim();
  currentNoteData.title = v;

  const idx = notesLibrary.findIndex((n) => n.id === currentNoteData.id);
  if (idx !== -1) notesLibrary[idx].title = v;

  saveNotesToDisk();
  safeEl("content-title").innerText = v;
  adjustTitleFontSize();
  renderNotesList();
}

function showModal(text) {
  const modal = safeEl("ai-modal");
  const content = safeEl("modal-content");
  if (!modal || !content) return;

  modal.style.display = "flex";
  content.innerHTML = `
    <div class="flex flex-col items-center py-12">
      <i class="fas fa-magic text-[#13B5B1] text-4xl animate-bounce mb-6"></i>
      <p class="text-sm font-black text-gray-400">${escapeHtml(text)}</p>
    </div>
  `;
}

function closeModal() {
  const modal = safeEl("ai-modal");
  if (modal) modal.style.display = "none";
}

function openConfirmModal() {
  const m = safeEl("confirm-modal");
  if (m) m.style.display = "flex";
}

function closeConfirmModal() {
  const m = safeEl("confirm-modal");
  if (m) m.style.display = "none";
}

/**
 * ============================================================
 * 統一反饋系統（HTML+CSS 替換 alert）
 * ============================================================
 */
function showFeedback(message, type = "info", title = null) {
  const feedbackModal = safeEl("feedback-modal");
  const iconEl = safeEl("feedback-icon");
  const titleEl = safeEl("feedback-title");
  const textEl = safeEl("feedback-text");
  const btnEl = safeEl("feedback-close-btn");

  if (!feedbackModal || !iconEl || !textEl || !titleEl) return;

  // 設定圖示、顏色和標題
  const configs = {
    error: {
      icon: "❌",
      bgClass: "bg-red-50",
      textClass: "text-red-600",
      btnClass: "bg-red-500 hover:bg-red-600",
      defaultTitle: "操作失敗",
    },
    success: {
      icon: "✅",
      bgClass: "bg-green-50",
      textClass: "text-green-600",
      btnClass: "bg-green-500 hover:bg-green-600",
      defaultTitle: "操作成功",
    },
    warning: {
      icon: "⚠️",
      bgClass: "bg-yellow-50",
      textClass: "text-yellow-600",
      btnClass: "bg-yellow-500 hover:bg-yellow-600",
      defaultTitle: "警告訊息",
    },
    info: {
      icon: "ℹ️",
      bgClass: "bg-blue-50",
      textClass: "text-blue-600",
      btnClass: "bg-blue-500 hover:bg-blue-600",
      defaultTitle: "系統訊息",
    },
  };

  const config = configs[type] || configs.info;

  // 更新樣式
  iconEl.textContent = config.icon;
  iconEl.className = `w-16 h-16 ${config.bgClass} text-3xl rounded-full flex items-center justify-center mx-auto mb-4`;
  titleEl.textContent = title || config.defaultTitle;
  textEl.textContent = escapeHtml(message);

  btnEl.className = `w-full py-3 ${config.btnClass} text-white rounded-2xl font-bold text-sm transition`;

  // 顯示模態
  feedbackModal.style.display = "flex";

  // 自動關閉按鈕
  btnEl.onclick = () => {
    feedbackModal.style.display = "none";
  };
}

function showError(message, title = "操作失敗") {
  showFeedback(message, "error", title);
}

function showSuccess(message, title = "操作成功") {
  showFeedback(message, "success", title);
}

function showWarning(message, title = "警告訊息") {
  showFeedback(message, "warning", title);
}

function showInfo(message, title = "系統訊息") {
  showFeedback(message, "info", title);
}

function changeCategory() {
  if (!currentNoteData) return;

  const dynamicCats = [
    ...new Set(
      notesLibrary
        .filter((n) => !n.isDeleted)
        .map((n) => (n.category || "未分類").trim()),
    ),
  ];
  const presets = ["心理學", "生物學", "通識課", "待處理"];
  const finalCategories = [...new Set([...dynamicCats, ...presets])].filter(
    Boolean,
  );

  let html = `
    <h3 class="text-lg font-black mb-4 text-gray-800 flex items-center gap-2">
      <i class="fas fa-tag text-[#13B5B1]"></i> 選擇分類
    </h3>
    <div class="grid grid-cols-2 gap-2 mb-6">
  `;

  finalCategories.forEach((cat) => {
    const isActive = (currentNoteData.category || "未分類") === cat;
    const safeCat = escapeHtml(cat);
    html += `
      <button type="button"
        data-action="set-category"
        data-category="${safeCat}"
        class="py-2.5 px-1 text-center font-bold text-[11px] rounded-2xl border transition-all leading-tight
        ${
          isActive
            ? "bg-[#13B5B1] text-white border-[#13B5B1]"
            : "bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100"
        }">
        ${safeCat}
      </button>
    `;
  });

  html += `
    </div>
    <div class="border-t border-gray-100 pt-4 mb-2">
      <p class="text-[9px] text-gray-400 font-black mb-3 uppercase tracking-widest text-center">或是建立新分類</p>
      <div class="flex flex-col gap-3">
        <input type="text" id="new-cat-input" placeholder="請輸入新分類名稱..."
          class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-[#13B5B1] text-center">
        <button type="button" data-action="set-category-from-input"
          class="w-full bg-[#13B5B1] text-white py-3 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all">
          ＋ 新增並套用
        </button>
      </div>
    </div>
  `;

  const modal = safeEl("ai-modal");
  const content = safeEl("modal-content");
  if (modal && content) {
    content.innerHTML = html;
    modal.style.display = "flex";
  }
}

function setCategory(cat) {
  if (!currentNoteData) return;

  if (!cat || cat.trim() === "") {
    alert("請輸入有效的分類名稱！");
    return;
  }
  const v = cat.trim();

  currentNoteData.category = v;
  const idx = notesLibrary.findIndex((n) => n.id === currentNoteData.id);
  if (idx !== -1) notesLibrary[idx].category = v;

  saveNotesToDisk();
  renderCategoryFilters();
  renderNotesList();
  renderReviewSelection();
  renderTrashList();
  renderNoteUI(currentNoteData);
  closeModal();
}

function restoreNote(noteId) {
  const note = notesLibrary.find((n) => n.id === noteId);
  if (!note) return;
  note.isDeleted = false;
  delete note.deletedAt;
  saveNotesToDisk();
  renderTrashList();
  alert("筆記已還原 ✨");
}

function permanentDeleteNote(noteId) {
  if (!confirm("此動作無法復原，確定永久刪除？")) return;
  notesLibrary = notesLibrary.filter((n) => n.id !== noteId);
  selectedTrashNotes.delete(noteId);
  saveNotesToDisk();
  renderTrashList();
  renderNotesList();
  renderReviewSelection();
}

function permanentClearAll() {
  const hasDeletedItems = notesLibrary.some((n) => n.isDeleted);
  if (!hasDeletedItems) return;
  if (!confirm("確定要永久刪除回收站內的所有內容嗎？此操作不可逆！")) return;

  notesLibrary = notesLibrary.filter((n) => !n.isDeleted);
  selectedTrashNotes.clear();
  saveNotesToDisk();
  renderTrashList();
}

/**
 * Quiz / Expand / Export
 */
function checkAnswer(btn, selected, correct) {
  const allBtns = btn.parentElement.querySelectorAll("button");
  const corrIdx = Number(correct);
  const isCorrect = Number(selected) === corrIdx;

  saveQuizRecord({
    noteId: currentNoteData?.id || "smart-review",
    category: currentNoteData?.category || "綜合複習",
    type: selectedQuizType,
    isCorrect: isCorrect,
  });

  currentSessionScore.total++;
  if (isCorrect) currentSessionScore.correct++;

  const questionContainer = btn.closest(".mb-8");
  const questionText = questionContainer
    .querySelector("p")
    .innerText.replace(/^\d+\.\s/, "");

  if (isCorrect) {
    promoteWrongQuestion(questionText);
  } else {
    const options = Array.from(
      questionContainer.querySelectorAll("button.quiz-option"),
    ).map((b) => b.innerText);

    addToWrongQuestions(
      {
        question: questionText,
        options: options,
        answer: correct,
      },
      selectedQuizType,
    );
  }

  if (isCorrect) {
    btn.classList.add("quiz-correct");
    btn.innerHTML += " ✅";
  } else {
    btn.classList.add("quiz-wrong");
    if (!isNaN(corrIdx) && allBtns[corrIdx]) {
      allBtns[corrIdx].classList.add("quiz-correct");
    }
  }

  allBtns.forEach((b) => (b.disabled = true));

  const totalBtns = document.querySelectorAll(
    'button[data-action="quiz-answer"]',
  ).length;
  const disabledBtns = document.querySelectorAll(
    'button[data-action="quiz-answer"]:disabled',
  ).length;

  if (disabledBtns === totalBtns && totalBtns > 0) {
    setTimeout(() => showQuizResult(), 1000);
  }
}

function showQuizResult() {
  const content = safeEl("modal-content");
  const { correct, total } = currentSessionScore;
  const accuracy = Math.round((correct / total) * 100);

  let comment =
    accuracy >= 80
      ? "太強了！這份筆記你已經完全精通 ✨"
      : accuracy >= 50
        ? "做得好！再複習一下弱點就完美了 💪"
        : "別灰心，Memo助手陪你再看一次筆記 🍎";

  content.innerHTML = `
    <div class="text-center py-6 animate-fadeIn">
      <div class="w-24 h-24 mx-auto mb-6 relative flex items-center justify-center">
        <svg class="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="48" cy="48" r="44" stroke="#f3f4f6" stroke-width="8" fill="transparent" />
          <circle cx="48" cy="48" r="44" stroke="#13B5B1" stroke-width="8" fill="transparent" 
            stroke-dasharray="276" stroke-dashoffset="${276 - (276 * accuracy) / 100}" />
        </svg>
        <span class="text-2xl font-black text-gray-800">${accuracy}%</span>
      </div>
      
      <h3 class="text-lg font-black text-gray-800 mb-2">測驗完成！</h3>
      <p class="text-xs text-gray-400 font-bold px-6 leading-relaxed mb-8">${comment}</p>
      
      <div class="flex flex-col gap-3 px-6">
        <button type="button" data-action="open-learning-progress"
          class="w-full py-4 bg-[#13B5B1] text-white rounded-2xl text-xs font-black shadow-lg">
          查看長期學習進度
        </button>
        <button type="button" data-action="modal-close"
          class="w-full py-4 bg-gray-50 text-gray-400 rounded-2xl text-xs font-black">
          返回筆記
        </button>
      </div>
    </div>
  `;
}

// --- 整合後的測驗設定邏輯 ---

let selectedQuizCount = 3;
let selectedQuizType = "mc";

/**
 * 開啟測驗自定義設定選單
 * @param {boolean} isReviewMode - 是否為智能複習模式
 */
function openQuizSettings(isReviewMode = false) {
  const modal = safeEl("ai-modal");
  const content = safeEl("modal-content");
  if (!modal || !content) return;

  if (isReviewMode && selectedReviewNotes.size === 0) {
    alert("總裁，請先挑選至少一份筆記再開始挑戰喔！✨");
    return;
  }

  content.innerHTML = `
    <h3 class="text-lg font-black mb-6 text-gray-800 flex items-center gap-2">
      <i class="fas fa-sliders-h text-[#13B5B1]"></i> ${isReviewMode ? "智能複習自定義" : "測驗自定義設定"}
    </h3>
    
    <div class="space-y-6">
      <div>
        <p class="text-[10px] text-gray-300 font-black uppercase tracking-widest mb-3 ml-1">設定題數</p>
        <div class="flex gap-2">
          ${[3, 5, 10]
            .map(
              (n) => `
            <button type="button" data-quiz-count="${n}" 
              class="quiz-setting-btn flex-1 py-3 rounded-2xl border-2 font-black text-xs transition-all
              ${n === 3 ? "border-[#13B5B1] bg-[#F0F9F9] text-[#13B5B1]" : "border-gray-50 bg-gray-50 text-gray-400"}">
              ${n} 題
            </button>
          `,
            )
            .join("")}
        </div>
      </div>

      <div>
        <p class="text-[10px] text-gray-300 font-black uppercase tracking-widest mb-3 ml-1">切換題型</p>
        <div class="flex flex-col gap-2">
          ${[
            { id: "mc", label: "選擇題" },
            { id: "tf", label: "是非題" },
            { id: "fib", label: "短答填空題" },
          ]
            .map(
              (t, idx) => `
            <button type="button" data-quiz-type="${t.id}" 
              class="quiz-type-btn w-full py-3 px-4 rounded-2xl border-2 font-black text-xs text-left transition-all
              ${idx === 0 ? "border-[#13B5B1] bg-[#F0F9F9] text-[#13B5B1]" : "border-gray-50 bg-gray-50 text-gray-400"}">
              ${t.label}
            </button>
          `,
            )
            .join("")}
        </div>
      </div>

      <button id="start-custom-quiz" class="cta-btn cta-primary mt-4">
        確認並開始挑戰
      </button>
    </div>
  `;

  modal.style.display = "flex";
  bindQuizSettingsEvents(isReviewMode);
}

function bindQuizSettingsEvents(isReviewMode) {
  selectedQuizCount = 3;
  selectedQuizType = "mc";

  document.querySelectorAll("[data-quiz-count]").forEach((btn) => {
    btn.onclick = () => {
      selectedQuizCount = parseInt(btn.dataset.quizCount);
      document.querySelectorAll("[data-quiz-count]").forEach((b) => {
        b.className =
          "quiz-setting-btn flex-1 py-3 rounded-2xl border-2 font-black text-xs transition-all border-gray-50 bg-gray-50 text-gray-400";
      });
      btn.className =
        "quiz-setting-btn flex-1 py-3 rounded-2xl border-2 font-black text-xs transition-all border-[#13B5B1] bg-[#F0F9F9] text-[#13B5B1]";
    };
  });

  document.querySelectorAll("[data-quiz-type]").forEach((btn) => {
    btn.onclick = () => {
      selectedQuizType = btn.dataset.quizType;
      document.querySelectorAll("[data-quiz-type]").forEach((b) => {
        b.className =
          "quiz-type-btn w-full py-3 px-4 rounded-2xl border-2 font-black text-xs text-left transition-all border-gray-50 bg-gray-50 text-gray-400";
      });
      btn.className =
        "quiz-type-btn w-full py-3 px-4 rounded-2xl border-2 font-black text-xs text-left transition-all border-[#13B5B1] bg-[#F0F9F9] text-[#13B5B1]";
    };
  });

  safeEl("start-custom-quiz").onclick = () => {
    generateCustomQuiz(selectedQuizCount, selectedQuizType, isReviewMode);
  };
}

/**
 * 核心出題函數：支援自定義題數、題型，以及單篇/多篇筆記模式
 * @param {number} count - 題數 (3, 5, 10)
 * @param {string} type - 題型 ('mc': 單選, 'tf': 是非, 'fib': 填空)
 * @param {boolean} isReviewMode - 是否為智能複習模式 (多選筆記)
 */
async function generateCustomQuiz(count, type, isReviewMode = false) {
  let contentData = "";
  let loadingMsg = "";
  currentSessionScore = { correct: 0, total: 0 };
  // 1. 決定資料來源
  if (isReviewMode) {
    // 智能複習模式：整合所有選取的筆記內容
    const notesToReview = notesLibrary.filter((n) =>
      selectedReviewNotes.has(n.id),
    );
    if (notesToReview.length === 0) {
      alert("請先選取筆記再開始挑戰喔！✨");
      return;
    }
    contentData = notesToReview
      .map(
        (n) =>
          `標題: ${n.title}\n內容摘要: ${n.intro}\n詳細重點: ${JSON.stringify(n.sections)}`,
      )
      .join("\n\n---\n\n");
    loadingMsg = `✨ Memo助手正在整合 ${notesToReview.length} 份筆記，產出 ${count} 題跨領域挑戰...`;
  } else {
    // 單篇筆記模式
    if (!currentNoteData) return;
    contentData = `標題: ${currentNoteData.title}\n內容: ${JSON.stringify(currentNoteData.sections)}`;
    loadingMsg = `✨ Memo助手正在針對本篇筆記，精選 ${count} 題考題...`;
  }

  showModal(loadingMsg);

  // 2. 根據題型設定 AI 指令
  let typeInstruction = "";
  if (type === "mc") {
    typeInstruction =
      "4個選項的單選題。請提供 options 陣列，answer 為正確選項的索引 (0-3)。";
  } else if (type === "tf") {
    typeInstruction =
      "是非題。options 必須固定為 ['O', 'X']，answer 為正確答案的索引 (0代表O，1代表X)。";
  } else if (type === "fib") {
    typeInstruction =
      "填空挑戰題。題目中請用 ___ 表示填空處。不要提供 options 陣列 (留空 [])，answer 必須直接填入該填空的正確繁體中文字串。";
  }

  // 3. 建立 Prompt 與 Schema
  const prompt = `你是一位專業教授「MemorAIze」。請根據以下提供的學習內容，出一份高品質的測驗。
題數：${count} 題
題型要求：${typeInstruction}

請嚴格遵守 JSON 格式回傳，不要包含 \`\`\`json 等標籤：
{"questions": [{"question": "題目內容", "options": ["選項1","選項2"...], "answer": "索引或字串"}]}

學習內容如下：
${contentData}`;

  const schema = {
    type: "OBJECT",
    properties: {
      questions: {
        type: "ARRAY",
        minItems: count,
        maxItems: count,
        items: {
          type: "OBJECT",
          properties: {
            question: { type: "STRING" },
            options: { type: "ARRAY", items: { type: "STRING" } },
            answer: { type: "STRING" }, // 統一用字串接收，後面再轉型判定
          },
          required: ["question", "answer"],
        },
      },
    },
    required: ["questions"],
  };

  try {
    // 4. 呼叫 Gemini API
    const data = await callGemini(prompt, schema);
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleanJson = String(rawText)
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const result = JSON.parse(cleanJson);

    // 5. 呼叫渲染函數顯示結果 (這個函數我們接下來會實作)
    renderQuizUI(result, type, count);
  } catch (err) {
    console.error("出題失敗：", err);
    safeEl("modal-content").innerHTML = `
      <div class="text-center py-10">
        <i class="fas fa-exclamation-triangle text-orange-400 text-3xl mb-4"></i>
        <p class="text-sm font-black text-gray-500">哎呀！Memo助手斷線了，請再試一次。</p>
        <button type="button" data-action="modal-close" class="mt-4 text-xs text-[#13B5B1] font-black underline">關閉視窗</button>
      </div>
    `;
  }
}

function renderQuizUI(result, type, count) {
  let html = `<h3 class="text-lg font-black mb-6 text-gray-800">🧠 認知挑戰：${type === "fib" ? "填空測驗" : "智能小考"}</h3>`;

  result.questions.forEach((q, qIdx) => {
    const safeQuestion = escapeHtml(q.question || "");
    html += `
      <div class="mb-8 border-b border-gray-50 pb-6">
        <p class="text-sm font-bold mb-4 text-gray-700">${qIdx + 1}. ${safeQuestion}</p>
        <div class="space-y-3">`;

    if (type === "fib") {
      const safeAnswer = escapeHtml(q.answer || "");
      html += `
        <div class="flex gap-2">
          <input type="text" id="fib-input-${qIdx}" placeholder="請輸入答案..."
            class="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-[#13B5B1]">
          <button type="button" data-action="check-fib" data-idx="${qIdx}" data-answer="${safeAnswer}"
            class="px-4 bg-[#13B5B1] text-white rounded-xl text-xs font-black shadow-md active:scale-95 transition-all">
            檢查
          </button>
        </div>
        <div id="fib-feedback-${qIdx}" class="hidden mt-2 text-[10px] font-black"></div>
      `;
    } else {
      html += (q.options || [])
        .map(
          (opt, oIdx) => `
        <button type="button" class="quiz-option" data-action="quiz-answer"
          data-selected="${oIdx}" data-correct="${escapeHtml(q.answer)}">${escapeHtml(opt)}</button>
      `,
        )
        .join("");
    }

    html += `</div></div>`;
  });

  safeEl("modal-content").innerHTML = html;
}

async function expandContent() {
  if (!currentNoteData) return;

  showModal("✨ Memo助手正在查閱知識庫...");
  const prompt = `針對主題「${currentNoteData.title}」提供 3 個延伸學習建議。請用繁體中文。`;

  try {
    const data = await callGemini(prompt);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const safeText = escapeHtml(text)
      .replace(/\n/g, "<br>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    safeEl("modal-content").innerHTML = `
      <div class="text-left">
        <h3 class="text-lg font-black mb-4 text-[#13B5B1]">📚 Memo助手的延伸筆記</h3>
        <div class="text-sm leading-relaxed text-gray-600 whitespace-pre-wrap">${safeText}</div>
      </div>
    `;
  } catch (err) {
    console.error(err);
    safeEl("modal-content").innerHTML = "獲取失敗。";
  }
}

async function exportToPDF() {
  const element = safeEl("view-note");
  const title = safeEl("content-title")?.innerText || "note";
  if (!element) return;

  const opt = {
    margin: 10,
    filename: `${title}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };

  showModal("✨ Memo助手正在為您裝訂 PDF...");

  try {
    if (typeof html2pdf !== "function") {
      throw new Error("html2pdf is not loaded");
    }
    await html2pdf().set(opt).from(element).save();
    closeModal();
  } catch (err) {
    console.error(err);
    alert("匯出失敗，請再試一次。");
    closeModal();
  }
}

async function startSmartReviewQuiz() {
  if (selectedReviewNotes.size === 0) return;

  const notesToReview = notesLibrary.filter((n) =>
    selectedReviewNotes.has(n.id),
  );

  const combinedContent = notesToReview
    .map((n) => {
      const sectionsText = (n.sections || [])
        .map((s) => `[${s.category}] ${(s.items || []).join(" ")}`)
        .join("\n");
      return `筆記標題: ${n.title}\n分類: ${n.category}\n內容: ${sectionsText}`;
    })
    .join("\n\n---\n\n");

  showModal("✨ Memo助手正在進行出題...");

  const prompt = `你是一位嚴謹的教授「MemorAIze」。請針對以下提供的多篇筆記內容，出一份具備「深度聯繫」的 5 題單選題測驗。
題目必須包含：
1. 針對單一筆記內容的重點考核。
2. 跨筆記（跨領域）的比較或關聯性問題（例如：A與B概念有何共同點？）。

請嚴格遵守 JSON 格式回傳：
{"questions": [{"question": "題目", "options": ["選項1","選項2","選項3","選項4"], "answer": 0}]}
內容如下：\n${combinedContent}`;

  const schema = {
    type: "OBJECT",
    properties: {
      questions: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            question: { type: "STRING" },
            options: { type: "ARRAY", items: { type: "STRING" }, minItems: 4 },
            answer: { type: "NUMBER" },
          },
          required: ["question", "options", "answer"],
        },
      },
    },
    required: ["questions"],
  };

  try {
    const data = await callGemini(prompt, schema);
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleanJson = String(rawText)
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const result = JSON.parse(cleanJson);

    let html = `<h3 class="text-lg font-black mb-6 text-gray-800">🧠 MemorAIze：跨領域戰役</h3>`;
    result.questions.forEach((q, qIdx) => {
      const safeQuestion = escapeHtml(q.question || "");
      const safeAnswer = escapeHtml(q.answer);
      html += `
        <div class="mb-8 border-b border-gray-50 pb-6">
          <p class="text-sm font-bold mb-4 text-gray-700">${qIdx + 1}. ${safeQuestion}</p>
          <div class="space-y-2">
            ${q.options
              .map(
                (opt, oIdx) => `
                  <button type="button"
                    class="quiz-option"
                    data-action="quiz-answer"
                    data-selected="${oIdx}"
                    data-correct="${safeAnswer}"
                  >${escapeHtml(opt)}</button>
                `,
              )
              .join("")}
          </div>
        </div>
      `;
    });

    safeEl("modal-content").innerHTML = html;
  } catch (err) {
    console.error("出題失敗：", err);
    safeEl("modal-content").innerHTML =
      `<div class="text-center py-10"><p class="text-xs font-bold text-gray-400">連線失敗，請確認網路或 API Key。</p></div>`;
  }
}
function renderLearningDashboard() {
  const container = safeEl("learning-dashboard");
  if (!container) return;

  if (quizHistory.length === 0) {
    container.innerHTML = `<p class="text-xs text-gray-400 text-center py-8 font-bold">✨ 開始您的第一次測驗，<br>Memo助手將為您生成數據報告！</p>`;
    return;
  }

  const total = quizHistory.length;
  const correct = quizHistory.filter((h) => h.isCorrect).length;
  const accuracy = Math.round((correct / total) * 100);

  const themeColor =
    accuracy >= 80 ? "#10b981" : accuracy >= 60 ? "#13B5B1" : "#f59e0b";

  const categories = [...new Set(quizHistory.map((h) => h.category))];
  const catStats = categories
    .map((cat) => {
      const trials = quizHistory.filter((h) => h.category === cat);
      const score = Math.round(
        (trials.filter((h) => h.isCorrect).length / trials.length) * 100,
      );
      return { name: cat, score };
    })
    .sort((a, b) => a.score - b.score);

  container.innerHTML = `
    <div class="flex items-center justify-between mb-8 p-4 bg-gray-50 rounded-3xl border border-gray-100/50">
      <div class="relative w-20 h-20 flex items-center justify-center">
        <svg class="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="40" cy="40" r="36" stroke="#e5e7eb" stroke-width="6" fill="transparent" />
          <circle cx="40" cy="40" r="36" stroke="${themeColor}" stroke-width="6" fill="transparent" 
            stroke-dasharray="226" stroke-dashoffset="${226 - (226 * accuracy) / 100}" style="transition: stroke-dashoffset 1s ease-out" />
        </svg>
        <span class="text-lg font-black" style="color: ${themeColor}">${accuracy}%</span>
      </div>
      <div class="text-right">
        <p class="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">累計答題</p>
        <h4 class="text-2xl font-black text-gray-800">${total} <span class="text-[10px] text-gray-400">次</span></h4>
      </div>
    </div>
    
    <div class="space-y-5">
      <div class="flex justify-between items-center ml-1">
        <p class="text-[10px] text-gray-400 font-black uppercase tracking-widest">弱點學科分析</p>
        <i class="fas fa-chart-line text-gray-300 text-[10px]"></i>
      </div>
      ${catStats
        .slice(0, 3)
        .map(
          (cat) => `
        <div class="group">
          <div class="flex justify-between mb-2">
            <span class="text-[11px] font-black text-gray-700">${escapeHtml(cat.name)}</span>
            <span class="text-[10px] font-black text-orange-500">${escapeHtml(cat.score)}%</span>
          </div>
          <div class="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-1000" 
                 style="width: ${cat.score}%; background: linear-gradient(90deg, #f59e0b, #fbbf24)"></div>
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

//
function addToWrongQuestions(qObj, type) {
  // 檢查是否已存在
  const existingIdx = wrongQuestions.findIndex(
    (item) => item.question === qObj.question,
  );

  if (existingIdx === -1) {
    wrongQuestions.push({
      question: qObj.question,
      options: qObj.options || [],
      answer: qObj.answer,
      type: type,
      level: 1,
      nextReviewTime: Date.now() + EB_INTERVALS[1],
    });
  } else {
    wrongQuestions[existingIdx].level = 1;
    wrongQuestions[existingIdx].nextReviewTime = Date.now() + EB_INTERVALS[1];
  }
  saveWrongQuestions();
}

function promoteWrongQuestion(qText) {
  const idx = wrongQuestions.findIndex((item) => item.question === qText);
  if (idx === -1) return;

  const q = wrongQuestions[idx];
  q.level++;

  if (q.level >= EB_INTERVALS.length) {
    wrongQuestions.splice(idx, 1);
  } else {
    q.nextReviewTime = Date.now() + EB_INTERVALS[q.level];
  }
  saveWrongQuestions();
}

function renderSRSSection() {
  const section = safeEl("srs-review-section");
  if (!section) return;

  const dueQuestions = wrongQuestions.filter(
    (q) => q.nextReviewTime <= Date.now(),
  );
  if (dueQuestions.length > 0) {
    section.classList.remove("hidden");
    safeEl("srs-count").innerText = dueQuestions.length;
  } else {
    section.classList.add("hidden");
  }
}
/**
 * =========================================================
 * 7) Navigation / Global bindings
 * =========================================================
 */

function rerenderForPage(pageId) {
  if (pageId === "page-list") {
    renderCategoryFilters();
    renderNotesList();
  } else if (pageId === "page-trash") {
    renderCategoryFilters();
    renderTrashList();
  } else if (pageId === "page-review") {
    renderCategoryFilters();
    renderReviewSelection();
    renderSRSSection();
  } else if (pageId === "page-settings") {
    loadSettingsToUI();
    renderLearningDashboard();
  }
}

function clearAllDateInputs() {
  ["date-filter", "date-filter-review", "date-filter-trash"].forEach((id) => {
    const el = safeEl(id);
    if (el) el.value = "";
  });
}

Object.assign(window, {
  navigateTo: (pageId) => {
    const pages = document.querySelectorAll(".page");
    const currentActivePage = document.querySelector(".page:not(.hidden)");

    if (currentActivePage && pageId === "page-content") {
      const from = currentActivePage.id;
      if (from !== "page-loading" && from !== "page-record") {
        lastActivePageId = from;
      }
    }

    pages.forEach((p) => {
      p.classList.add("hidden");
      p.classList.remove("active");
    });

    const targetPage = safeEl(pageId);
    if (targetPage) {
      targetPage.classList.remove("hidden");

      requestAnimationFrame(() => {
        targetPage.classList.add("active");
      });
    }

    const nav = safeEl("main-nav");
    if (nav) {
      if (pageId === "page-record" || pageId === "page-loading") {
        nav.classList.add("hidden");
      } else {
        nav.classList.remove("hidden");
      }
    }

    rerenderForPage(pageId);
    updateNavUI(pageId);
    requestAnimationFrame(syncLayoutHeights);
  },

  filterByDate: (val) => {
    currentFilterDate = formatHTMLDateToNoteDate(val);
    renderNotesList();
    renderReviewSelection();
    renderTrashList();
  },

  clearDateFilter: () => {
    currentFilterDate = null;
    clearAllDateInputs();
    renderNotesList();
    renderReviewSelection();
    renderTrashList();
  },

  loadNoteDetails: (id) => {
    const note = notesLibrary.find((n) => n.id === id);
    if (!note) return;
    currentNoteData = note;
    renderNoteUI(note);

    const isTranscript = activeListTab === "transcript";

    safeEl("view-note")?.classList.toggle("hidden", isTranscript);
    safeEl("view-transcript")?.classList.toggle("hidden", !isTranscript);

    const activeClass =
      "tab-btn flex-1 py-2.5 bg-[#13B5B1] text-white rounded-full text-xs font-black shadow-md";
    const inactiveClass =
      "tab-btn flex-1 py-2.5 text-gray-400 rounded-full text-xs font-black";

    safeEl("tab-note").className = !isTranscript ? activeClass : inactiveClass;
    safeEl("tab-transcript").className = isTranscript
      ? activeClass
      : inactiveClass;

    window.navigateTo("page-content");
    requestAnimationFrame(adjustTitleFontSize);
  },

  closeModal,
  closeConfirmModal,
});

/**
 * =========================================================
 * 8) UI Event Wiring（事件委派）
 * =========================================================
 */

(function bindUIEvents() {
  const call = (fn, ...args) =>
    typeof fn === "function" ? fn(...args) : undefined;

  safeEl("search-input")?.addEventListener(
    "input",
    debounce(() => renderNotesList()),
  );
  safeEl("search-review")?.addEventListener(
    "input",
    debounce(() => renderReviewSelection()),
  );
  safeEl("search-trash")?.addEventListener(
    "input",
    debounce(() => renderTrashList()),
  );

  safeEl("date-filter")?.addEventListener("change", (e) =>
    window.filterByDate(e.target.value),
  );
  safeEl("date-filter-review")?.addEventListener("change", (e) =>
    window.filterByDate(e.target.value),
  );
  safeEl("date-filter-trash")?.addEventListener("change", (e) =>
    window.filterByDate(e.target.value),
  );

  document.addEventListener("click", (e) => {
    const el = e.target.closest(
      "[data-action], [data-page], [data-filter], [data-list-view], [data-content-view]",
    );
    if (!el) return;

    if (el.dataset.page) {
      window.navigateTo(el.dataset.page);
      return;
    }

    if (el.dataset.filter) {
      filterNotes(el.dataset.filter);
      return;
    }

    if (el.dataset.listView) {
      const isNote = el.dataset.listView === "note";
      activeListTab = el.dataset.listView;

      safeEl("list-tab-note").className = isNote
        ? "tab-btn flex-1 py-2.5 bg-[#13B5B1] text-white rounded-full text-[10px] font-black shadow-md"
        : "tab-btn flex-1 py-2.5 text-gray-400 rounded-full text-[10px] font-black";
      safeEl("list-tab-transcript").className = !isNote
        ? "tab-btn flex-1 py-2.5 bg-[#13B5B1] text-white rounded-full text-[10px] font-black shadow-md"
        : "tab-btn flex-1 py-2.5 text-gray-400 rounded-full text-[10px] font-black";
      return;
    }

    if (el.dataset.contentView) {
      const isNote = el.dataset.contentView === "note";
      safeEl("view-note")?.classList.toggle("hidden", !isNote);
      safeEl("view-transcript")?.classList.toggle("hidden", isNote);

      safeEl("tab-note").className = isNote
        ? "tab-btn flex-1 py-2.5 bg-[#13B5B1] text-white rounded-full text-xs font-black shadow-md"
        : "tab-btn flex-1 py-2.5 text-gray-400 rounded-full text-xs font-black";
      safeEl("tab-transcript").className = !isNote
        ? "tab-btn flex-1 py-2.5 bg-[#13B5B1] text-white rounded-full text-xs font-black shadow-md"
        : "tab-btn flex-1 py-2.5 text-gray-400 rounded-full text-xs font-black";
      return;
    }

    const action = el.dataset.action;

    switch (action) {
      case "back-to-source":
        window.navigateTo(lastActivePageId);
        break;

      case "start-record":
        call(startRecordPage);
        break;
      case "stop-record":
        call(stopRecording);
        break;
      case "cancel-record":
        call(cancelRecording);
        break;

      case "toggle-favorite":
        call(toggleFavorite);
        break;

      case "edit-title":
        call(editNoteTitle);
        break;

      case "delete-current": {
        if (!currentNoteData) return;
        openConfirmModal();
        const btn = safeEl("btn-real-delete");
        if (btn) {
          btn.onclick = () => {
            markNoteDeleted(currentNoteData.id);
            closeConfirmModal();
            window.navigateTo("page-list");
            renderNotesList();
            renderTrashList();
            alert("已移至回收站 🗑️");
          };
        }
        break;
      }

      case "list-toggle-favorite": {
        e.stopPropagation();
        const noteId = el.dataset.noteId;
        const note = notesLibrary.find((n) => n.id === noteId);
        if (!note) return;

        note.isFavorite = !note.isFavorite;
        saveNotesToDisk();
        renderNotesList();
        renderReviewSelection();
        renderTrashList();
        break;
      }

      case "delete-note": {
        e.stopPropagation();
        openConfirmModal();
        const btn = safeEl("btn-real-delete");
        if (btn) {
          btn.onclick = () => {
            markNoteDeleted(el.dataset.noteId);
            closeConfirmModal();
            renderNotesList();
            renderTrashList();
          };
        }
        break;
      }

      case "trash-restore":
        call(restoreNote, el.dataset.noteId);
        break;

      case "trash-permadelete":
        call(permanentDeleteNote, el.dataset.noteId);
        break;

      case "trash-clear-all":
        call(permanentClearAll);
        break;

      case "trash-toggle-note": {
        const id = el.dataset.id;
        if (selectedTrashNotes.has(id)) selectedTrashNotes.delete(id);
        else selectedTrashNotes.add(id);
        renderTrashList();
        break;
      }

      case "trash-select-all": {
        const searchTerm = safeEl("search-trash")?.value.toLowerCase() || "";
        notesLibrary.forEach((n) => {
          if (
            n.isDeleted &&
            (n.title || "").toLowerCase().includes(searchTerm)
          ) {
            selectedTrashNotes.add(n.id);
          }
        });
        renderTrashList();
        break;
      }

      case "trash-batch-restore": {
        if (selectedTrashNotes.size === 0) return;
        notesLibrary.forEach((n) => {
          if (selectedTrashNotes.has(n.id)) {
            n.isDeleted = false;
            delete n.deletedAt;
          }
        });
        selectedTrashNotes.clear();
        saveNotesToDisk();
        renderTrashList();
        renderNotesList();
        alert("所選筆記已還原 ✨");
        break;
      }

      case "trash-batch-delete": {
        if (selectedTrashNotes.size === 0) return;
        if (
          confirm(
            `確定要永久刪除這 ${selectedTrashNotes.size} 份筆記嗎？此操作不可逆！`,
          )
        ) {
          notesLibrary = notesLibrary.filter(
            (n) => !selectedTrashNotes.has(n.id),
          );
          selectedTrashNotes.clear();
          saveNotesToDisk();
          renderTrashList();
          renderNotesList();
        }
        break;
      }

      case "review-toggle-note": {
        const id = el.dataset.id;
        if (selectedReviewNotes.has(id)) selectedReviewNotes.delete(id);
        else selectedReviewNotes.add(id);
        renderReviewSelection();
        break;
      }

      case "review-select-all":
        notesLibrary.forEach((n) => {
          if (!n.isDeleted) selectedReviewNotes.add(n.id);
        });
        renderReviewSelection();
        break;

      case "run-smart-quiz":
        call(() => openQuizSettings(true));
        break;

      case "open-note":
        e.stopPropagation();
        call(() => window.loadNoteDetails(el.dataset.noteId));
        break;

      case "quiz":
        call(openQuizSettings);
        break;

      case "start-srs-quiz": {
        const dueQuestions = wrongQuestions.filter(
          (q) => q.nextReviewTime <= Date.now(),
        );
        if (dueQuestions.length > 0) {
          renderQuizUI({ questions: dueQuestions }, "srs", dueQuestions.length);

          safeEl("ai-modal").style.display = "flex";
        }
        break;
      }

      case "quiz-answer": {
        const selected = Number(el.dataset.selected);
        const correct = Number(el.dataset.correct);
        checkAnswer(el, selected, correct);
        break;
      }
      case "check-fib": {
        const idx = el.dataset.idx;
        const correctAnswer = el.dataset.answer;
        const inputEl = safeEl(`fib-input-${idx}`);
        const feedbackEl = safeEl(`fib-feedback-${idx}`);
        const userInput = inputEl.value.trim().toLowerCase();
        const target = correctAnswer.trim().toLowerCase();

        const isCorrect = userInput === target;

        inputEl.disabled = true;
        el.disabled = true;
        el.style.opacity = "0.5";

        if (isCorrect) {
          inputEl.classList.add("border-green-500", "bg-green-50");
          feedbackEl.innerHTML = `<span class="text-green-600 font-black">✅ 太棒了！答案完全正確。</span>`;
        } else {
          inputEl.classList.add("border-red-500", "bg-red-50");
          feedbackEl.innerHTML = `<span class="text-red-600 font-black">❌ 可惜了，正確答案是：${escapeHtml(correctAnswer)}</span>`;
        }
        feedbackEl.classList.remove("hidden");

        saveQuizRecord({
          noteId: currentNoteData?.id || "smart-review",
          category: currentNoteData?.category || "綜合複習",
          type: "fib",
          isCorrect: isCorrect,
        });

        currentSessionScore.total++;
        if (isCorrect) currentSessionScore.correct++;

        const totalQuestions = document.querySelectorAll(
          'button[data-action="check-fib"]',
        ).length;
        const disabledQuestions = document.querySelectorAll(
          'button[data-action="check-fib"]:disabled',
        ).length;

        if (disabledQuestions === totalQuestions) {
          setTimeout(() => showQuizResult(), 1000);
        }
        break;
      }

      case "clear-quiz-history": {
        if (confirm("確定要將所有測驗紀錄歸零嗎？這不會刪除您的筆記喔！✨")) {
          void dataService.clearQuizHistory().then(() => {
            quizHistory = dataService.getQuizHistory();
            renderLearningDashboard();
          });

          alert("數據已全數歸零，準備好重新挑戰了嗎？🚀");
        }
        break;
      }

      case "expand":
        call(expandContent);
        break;

      case "export-pdf":
        call(exportToPDF);
        break;

      case "change-category":
        call(changeCategory);
        break;

      case "set-category":
        call(setCategory, el.dataset.category);
        break;

      case "set-category-from-input":
        call(setCategory, safeEl("new-cat-input")?.value ?? "");
        break;

      case "open-date-picker": {
        const dateInput = safeEl("date-filter");
        if (dateInput && typeof dateInput.showPicker === "function")
          dateInput.showPicker();
        else dateInput?.click();
        break;
      }

      case "open-date-picker-review":
        safeEl("date-filter-review")?.showPicker?.();
        break;

      case "open-date-picker-trash":
        safeEl("date-filter-trash")?.showPicker?.();
        break;

      case "clear-date":
        window.clearDateFilter();
        break;

      case "open-avatar-modal": {
        const modalContent = safeEl("modal-content");
        if (!modalContent) return;

        modalContent.innerHTML = `
          <h3 class="text-lg font-black mb-6 text-gray-800 flex items-center gap-2">
            <i class="fas fa-paw text-[#13B5B1]"></i> 選擇頭貼
          </h3>
          <div id="modal-avatar-grid" class="grid grid-cols-4 gap-3 mb-4"></div>
          <p class="text-[10px] text-center text-gray-300 font-bold uppercase tracking-widest">點擊上方圖示即可即時套用預覽</p>
        `;
        renderAvatarChoices("modal-avatar-grid");
        safeEl("ai-modal").style.display = "flex";
        break;
      }

      case "select-avatar": {
        tempSelectedAvatar = el.dataset.seed;
        renderAvatarChoices("modal-avatar-grid");

        const previewImg = document.querySelector(
          "#settings-avatar-preview img",
        );
        if (previewImg) {
          previewImg.src = `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${tempSelectedAvatar}`;
        }
        break;
      }

      case "save-settings":
        saveSettingsFromUI();
        break;

      case "auth-signin-google":
        void signInWithGoogleFlow();
        break;

      case "auth-signout":
        void signOutFlow();
        break;

      case "open-learning-progress":
        closeModal();
        window.navigateTo("page-settings");
        break;

      case "export-data": {
        const backup = {
          exportedAt: new Date().toISOString(),
          app: "MemorAIze",
          notes: notesLibrary,
          settings: appSettings,
          quizHistory,
          wrongQuestions,
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const stamp = new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/[T:]/g, "-");
        a.download = `president-backup-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        break;
      }

      case "clear-all-data":
        if (confirm("清除？")) {
          void (async () => {
            try {
              await dataService.clearCloudNotesIfSignedIn();
            } catch (err) {
              console.error("[ui] clear cloud notes failed:", err);
            } finally {
              await storage.clear();
              location.reload();
            }
          })();
        }
        break;

      case "modal-close":
        closeModal();
        break;

      case "confirm-cancel":
        closeConfirmModal();
        break;

      default:
        break;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const el = e.target.closest(
      "[data-page], [data-filter], [data-action], [data-list-view], [data-content-view]",
    );
    if (el) el.click();
  });

  document.addEventListener("change", (e) => {
    const sel = e.target.closest(
      "#category-filter-container select, #category-filter-review select, #category-filter-trash select",
    );
    if (!sel) return;
    currentFilterCategory = sel.value;
    renderCategoryFilters();
    renderNotesList();
    renderReviewSelection();
    renderTrashList();
  });

  const confirmModal = safeEl("confirm-modal");
  confirmModal?.addEventListener("click", (e) => {
    if (e.target === confirmModal) closeConfirmModal();
  });

  const aiModal = safeEl("ai-modal");
  aiModal?.addEventListener("click", (e) => {
    if (e.target === aiModal) closeModal();
  });
})();

/**
 * =========================================================
 * 9) Layout sync（高度同步）
 * =========================================================
 */

function syncLayoutHeights() {
  const nav = safeEl("main-nav");
  const homeCta = document.querySelector(".home-cta");
  const reviewCta = document.querySelector(".review-cta");
  const assistant = document.querySelector(".list-assistant-fixed");

  const root = document.documentElement;
  if (nav) root.style.setProperty("--nav-h", `${nav.offsetHeight}px`);
  if (homeCta)
    root.style.setProperty("--home-cta-h", `${homeCta.offsetHeight}px`);
  if (reviewCta)
    root.style.setProperty("--review-cta-h", `${reviewCta.offsetHeight}px`);
  if (assistant)
    root.style.setProperty("--assistant-h", `${assistant.offsetHeight}px`);
}

window.addEventListener("load", async () => {
  await initializePersistedState();
  initRecognition();
  updateHomeGreeting();
  renderCategoryFilters();
  window.navigateTo("page-home");
  syncLayoutHeights();
  requestAnimationFrame(syncLayoutHeights);
  setTimeout(syncLayoutHeights, 200);
});

window.addEventListener("resize", syncLayoutHeights);
window.addEventListener("orientationchange", syncLayoutHeights);

(function observeLayoutHeights() {
  const ro = new ResizeObserver(() => syncLayoutHeights());

  ["main-nav"].forEach((id) => {
    const el = safeEl(id);
    if (el) ro.observe(el);
  });

  [
    document.querySelector("#page-home .home-cta"),
    document.querySelector("#page-review .review-cta"),
    document.querySelector(".list-assistant-fixed"),
  ]
    .filter(Boolean)
    .forEach((el) => ro.observe(el));
})();

if (window.visualViewport) {
  window.addEventListener("resize", () => {
    syncLayoutHeights();
    adjustTitleFontSize();
  });
}

window.addEventListener("beforeunload", () => {
  if (isRecording || getTranscriptText()) {
    persistTempTranscript(getTranscriptText());
  }
});
