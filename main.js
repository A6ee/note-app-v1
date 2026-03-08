/**
 * =========================================================
 * 0) Config & State（設定與狀態）
 * =========================================================
 */
import { registerSW } from "virtual:pwa-register";
registerSW({ immediate: true });

let currentFilterCategory = "全部";
let currentFilter = "all";
let currentFilterDate = null;
let activeListTab = "note";
let currentSessionScore = { correct: 0, total: 0 };
// env
// 改到api/gemini.js中串接api key
//let selectedTrashNotes = new Set();
let selectedReviewNotes = new Set();

let lastActivePageId = "page-home";

let timerInterval;
let seconds = 0;
let recognition;
let fullTranscript = "";
let isRecording = false;

let recognitionRestartTimer = null;
let recognitionEndFailCount = 0;
let lastInterim = "";

let quizHistory =
  JSON.parse(localStorage.getItem("president_quiz_history")) || [];

function saveQuizRecord(record) {
  quizHistory.push({
    ...record,
    timestamp: Date.now(),
  });
  localStorage.setItem("president_quiz_history", JSON.stringify(quizHistory));
}

// main.js
let wrongQuestions =
  JSON.parse(localStorage.getItem("president_wrong_questions")) || [];

// 艾賓浩斯複習間隔 (毫秒)
const EB_INTERVALS = [
  0, // Level 0: 初始
  86400000, // Level 1: 1天後
  259200000, // Level 2: 3天後
  604800000, // Level 3: 7天後
  1209600000, // Level 4: 14天後 (進入長期記憶)
];

function saveWrongQuestions() {
  localStorage.setItem(
    "president_wrong_questions",
    JSON.stringify(wrongQuestions),
  );
}
/**
 * Notes / Settings
 */
let notesLibrary = JSON.parse(localStorage.getItem("president_notes")) || [
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
        text: "所以皮皮建議，教學者要先建立溫暖的環境，這就是滿足基礎需求的過程。",
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
        text: "這就是為什麼皮皮強調要分段錄音、分段整理的原因，這符合訊息處理的心理規則。",
      },
    ],
    isFavorite: false,
    isDeleted: false,
  },
];

let currentNoteData = notesLibrary?.[0] || null;

let appSettings = JSON.parse(localStorage.getItem("president_settings")) || {
  nickname: "皮皮",
  avatarSeed: "Fox",
  noteStyle: "standard",
};

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

/**
 * =========================================================
 * 1) Utils（小工具）
 * =========================================================
 */
// main.js

/**
 * 🚀 自動調整標題字體大小
 */
function adjustTitleFontSize() {
  const titleEl = safeEl("content-title");
  if (!titleEl) return;

  // 1. 先重置為基礎大小，以便重新計算
  titleEl.style.fontSize = "14px";

  // 2. 設定縮放參數
  let currentSize = 14;
  const minSize = 10; // 最低字體限制，避免字太小看不見

  // 3. 核心偵測邏輯：當內容寬度大於容器寬度時，持續縮小字體
  // 增加迴圈檢查，直到寬度符合或達到最小值為止
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
  const previewImg = document.querySelector("#settings-avatar-preview img");

  if (nickInput) nickInput.value = appSettings.nickname;

  if (previewImg) {
    previewImg.src = `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${appSettings.avatarSeed}`;
  }

  tempSelectedAvatar = appSettings.avatarSeed;
}

function saveSettingsFromUI() {
  appSettings.nickname = safeEl("settings-nickname")?.value || "皮皮";
  appSettings.avatarSeed = tempSelectedAvatar;

  localStorage.setItem("president_settings", JSON.stringify(appSettings));
  updateHomeGreeting();
  alert("皮皮，您的個人檔案已同步更新 ✨");
  window.navigateTo("page-home");
}

/**
 * =========================================================
 * 2) Storage（資料存取）
 * =========================================================
 */

function saveNotesToDisk() {
  localStorage.setItem("president_notes", JSON.stringify(notesLibrary));
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

// main.js
function initRecognition() {
  if (!("webkitSpeechRecognition" in window)) {
    console.warn("此瀏覽器不支援語音辨識");
    return;
  }

  recognition = new window.webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "zh-TW";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const piece = event.results[i][0]?.transcript || "";
      if (event.results[i].isFinal) {
        if (!fullTranscript.endsWith(piece.trim())) {
          fullTranscript += piece;
        }
      } else {
        interim += piece;
      }
    }

    lastInterim = interim;
    const finalDisplay = (fullTranscript + interim).trim();

    localStorage.setItem("temp_transcript", finalDisplay || "");
    const el = safeEl("live-transcript");
    if (el) el.innerText = finalDisplay || "皮皮正在聽課...";
  };

  recognition.onend = () => {
    if (!isRecording) return;

    if (recognitionRestartTimer) clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = setTimeout(() => {
      try {
        recognition.start();
        recognitionEndFailCount = 0;
      } catch (e) {}
    }, 400); // 縮短重啟延遲
  };
}

function startRecordPage() {
  fullTranscript = "";
  lastInterim = "";
  seconds = 0;
  isRecording = true;

  const timerEl = safeEl("record-timer");
  const liveEl = safeEl("live-transcript");
  if (timerEl) timerEl.innerText = "00:00";
  if (liveEl) liveEl.innerText = "皮皮正在聽課...";

  window.navigateTo("page-record");

  if (recognition) {
    try {
      recognition.start();
    } catch (_) {}
  }

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    seconds++;
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
  if (recognition) recognition.stop();
  clearInterval(timerInterval);
  window.navigateTo("page-list");
}

async function stopRecording() {
  isRecording = false;
  if (recognition) recognition.stop();
  clearInterval(timerInterval);

  localStorage.setItem("temp_transcript", fullTranscript + lastInterim || "");

  const durationText = safeEl("record-timer")?.innerText || "00:00";
  window.navigateTo("page-loading");

  const prompt = `你是一位專業筆記助手「皮皮」。請將這段錄音逐字稿整理成高品質繁體中文筆記 JSON。逐字稿：${
    fullTranscript + lastInterim || "模擬內容"
  }`;

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
      segments: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { time: { type: "STRING" }, text: { type: "STRING" } },
        },
      },
    },
  };

  try {
    const data = await callGemini(prompt, schema);

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = String(raw)
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const result = JSON.parse(clean);

    const newNote = {
      ...result,
      id: Date.now().toString(),
      title: result?.title?.trim() ? result.title.trim() : "新筆記",
      intro: result?.intro || "尚無摘要",
      category: "未分類",
      date: `${new Date().getMonth() + 1} / ${new Date().getDate()}`,
      duration: durationText,
      isFavorite: false,
      isDeleted: false,
    };

    notesLibrary.unshift(newNote);
    saveNotesToDisk();

    window.loadNoteDetails(newNote.id);
    localStorage.removeItem("temp_transcript");
  } catch (err) {
    console.error("處理失敗:", err);
    alert("生成失敗，但逐字稿已為您暫存。");
    window.navigateTo("page-list");
  }
}

/**
 * =========================================================
 * 4) AI / API（Gemini 互動）
 * =========================================================
 */

// 改為呼叫中間層api/gemini.js
async function callGemini(prompt, responseSchema = null, retryCount = 0) {
  try {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: prompt,
        schema: responseSchema,
      }),
    });

    if (!response.ok) throw new Error("middle return Failed");
    return await response.json();
  } catch (err) {
    if (retryCount < 5) {
      const base = Math.pow(2, retryCount) * 1000;
      const jitter = base * (0.7 + Math.random() * 0.6);
      await new Promise((r) => setTimeout(r, jitter));
      return callGemini(prompt, responseSchema, retryCount + 1);
    }
    throw err;
  }
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
        `<option value="${cat}" ${
          currentFilterCategory === cat ? "selected" : ""
        }>分類: ${cat}</option>`,
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
        <div class="font-black text-[#13B5B1] text-xs mb-3 uppercase tracking-wider">${sec.category || ""}</div>
        <ul class="space-y-3">
          ${(sec.items || [])
            .map(
              (i) => `
              <li class="text-[12px] text-gray-700 font-bold">• ${String(
                i,
              ).replace(
                /\*\*(.*?)\*\*/g,
                '<span class="text-[#13B5B1] font-black">$1</span>',
              )}</li>
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
        } font-black mb-1 tracking-wider">${seg.time || ""}</div>
        <div class="text-xs ${
          idx === 0
            ? "text-gray-800 font-black bg-[#F0F9F9] -mx-4 px-4 py-2 rounded-2xl shadow-sm border border-[#13B5B1]/5"
            : "text-gray-400 font-bold"
        } leading-relaxed">${seg.text || ""}</div>
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
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-20 text-gray-300 opacity-60">
        <i class="fas fa-file-invoice-alt text-4xl mb-4"></i>
        <p class="text-sm font-black">${msg}</p>
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

    wrapper.innerHTML = `
      <div class="card-visual-slot">
        <div class="active-date shadow-sm">
          <div class="text-[9px] font-bold opacity-80 uppercase">${month}月</div>
          <div class="text-lg font-black leading-tight">${day}</div>
        </div>
      </div>

      <div class="note-card-main" data-action="open-note" data-note-id="${note.id}">
        <div class="flex justify-between items-start mb-2">
          <div class="font-black text-gray-800 text-sm leading-snug flex-1">
            ${note.title || "未命名筆記"}${starHtml}
          </div>
          <span class="ml-2 px-2 py-0.5 bg-[#13B5B1]/10 text-[#13B5B1] text-[8px] rounded-full font-black">
            ${note.category || "未分類"}
          </span>
        </div>

        <p class="card-intro-text line-clamp-2">
          ${note.intro || "尚無摘要內容..."}
        </p>

        <div class="flex justify-between items-center">
          <div class="flex items-center gap-1.5 text-gray-300 font-black tracking-widest">
            <i class="far fa-clock text-[9px]"></i>
            <span class="text-[8px]">${note.duration || "00:00"}</span>
          </div>

          <div class="flex gap-2">
            <button type="button"
              class="w-8 h-8 ${
                note.isFavorite
                  ? "bg-yellow-400 text-white"
                  : "bg-yellow-50 text-yellow-400"
              } rounded-xl flex items-center justify-center active:scale-95 transition-all"
              data-action="list-toggle-favorite"
              data-note-id="${note.id}">
              <i class="${note.isFavorite ? "fas" : "far"} fa-star text-[10px]"></i>
            </button>

            <button type="button"
              class="w-8 h-8 bg-red-50 text-red-400 rounded-xl flex items-center justify-center active:scale-95 transition-all"
              data-action="delete-note"
              data-note-id="${note.id}">
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
        (note) => `
        <div class="flex gap-4 items-start mb-6 w-full group opacity-85">
          <div class="card-visual-slot pt-4">
            <div data-action="trash-toggle-note" data-id="${note.id}"
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
              <div class="font-black text-gray-800 text-sm leading-snug flex-1">${note.title || "未命名筆記"}</div>
              <span class="ml-2 px-2 py-0.5 bg-gray-50 text-gray-400 text-[8px] rounded-full font-black border border-gray-100">${
                note.category || "未分類"
              }</span>
            </div>

            <p class="card-intro-text line-clamp-2">${note.intro || "已刪除的筆記摘要..."}</p>

            <div class="flex justify-between items-center mt-2">
              <div class="flex flex-1 items-center gap-4 flex-wrap">
                <div class="flex items-center gap-1.5 text-gray-300 font-black tracking-widest uppercase">
                  <i class="far fa-clock text-[9px]"></i>
                  <span class="text-[8px]">${note.duration || "00:00"}</span>
                </div>
                <span class="text-[8px] text-gray-300 font-black tracking-widest uppercase">${note.date || ""}</span>
                <div class="text-[8px] text-gray-300 font-black tracking-widest uppercase">
                  <i class="fas fa-history mr-1"></i> 刪除於: ${
                    note.deletedAt
                      ? new Date(note.deletedAt).toLocaleDateString()
                      : "未知"
                  }
                </div>
              </div>

              <div class="flex gap-2 flex-shrink-0">
                <button type="button"
                  class="w-8 h-8 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                  data-action="open-note" data-note-id="${note.id}">
                  <i class="fas fa-external-link-alt text-[10px]"></i>
                </button>

                <button type="button"
                  class="w-8 h-8 bg-[#13B5B1]/10 text-[#13B5B1] rounded-xl flex items-center justify-center active:scale-95 transition-all"
                  data-action="trash-restore" data-note-id="${note.id}">
                  <i class="fas fa-undo-alt text-[10px]"></i>
                </button>

                <button type="button"
                  class="w-8 h-8 bg-red-50 text-red-400 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                  data-action="trash-permadelete" data-note-id="${note.id}">
                  <i class="fas fa-times text-[10px]"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `,
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
      (note) => `
        <div class="flex gap-4 items-start mb-6 w-full group">
          <div class="card-visual-slot pt-4">
            <div data-action="review-toggle-note" data-id="${note.id}"
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

          <div class="note-card-main" data-action="review-toggle-note" data-id="${note.id}">
            <div class="flex justify-between items-start mb-2">
              <div class="font-black text-gray-800 text-sm leading-snug flex-1">
                ${note.title || "未命名筆記"}
                ${note.isFavorite ? '<i class="fas fa-star text-yellow-400 text-[10px] ml-1"></i>' : ""}
              </div>
              <span class="ml-2 px-2 py-0.5 bg-[#13B5B1]/10 text-[#13B5B1] text-[8px] rounded-full font-black whitespace-nowrap">
                ${note.category || "未分類"}
              </span>
            </div>

            <p class="card-intro-text line-clamp-2">${note.intro || "尚無摘要內容..."}</p>

            <div class="flex justify-between items-center mt-2">
              <div class="flex justify-start items-center gap-4">
                <div class="flex items-center gap-1.5 text-gray-300 font-black tracking-widest uppercase">
                  <i class="far fa-clock text-[9px]"></i>
                  <span class="text-[8px]">${note.duration || "00:00"}</span>
                </div>
                <span class="text-[8px] text-gray-300 font-black tracking-widest uppercase">${note.date || ""}</span>
              </div>

              <button type="button"
                class="w-8 h-8 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                data-action="open-note"
                data-note-id="${note.id}">
                <i class="fas fa-external-link-alt text-[10px]"></i>
              </button>
            </div>
          </div>
        </div>
      `,
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
      <p class="text-sm font-black text-gray-400">${text}</p>
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
    html += `
      <button type="button"
        data-action="set-category"
        data-category="${cat}"
        class="py-2.5 px-1 text-center font-bold text-[11px] rounded-2xl border transition-all leading-tight
        ${
          isActive
            ? "bg-[#13B5B1] text-white border-[#13B5B1]"
            : "bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100"
        }">
        ${cat}
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
// main.js
function checkAnswer(btn, selected, correct) {
  const allBtns = btn.parentElement.querySelectorAll("button");
  const corrIdx = Number(correct);
  const isCorrect = Number(selected) === corrIdx;

  // 1. 紀錄到長期看板（原有功能）
  saveQuizRecord({
    noteId: currentNoteData?.id || "smart-review",
    category: currentNoteData?.category || "綜合複習",
    type: selectedQuizType,
    isCorrect: isCorrect,
  });

  // 2. 累計本次測驗分數（原有功能）
  currentSessionScore.total++;
  if (isCorrect) currentSessionScore.correct++;

  // 🚀 3. 新增：艾賓浩斯錯題重測邏輯
  // 透過 DOM 找到該題目文字（並過濾掉前面的序號，如 "1. "）
  const questionContainer = btn.closest(".mb-8");
  const questionText = questionContainer
    .querySelector("p")
    .innerText.replace(/^\d+\.\s/, "");

  if (isCorrect) {
    // 答對：如果是之前錯過的題目，就提升其記憶等級
    promoteWrongQuestion(questionText);
  } else {
    // 答錯：將題目、選項與正確答案存入錯題庫，並啟動艾賓浩斯排程
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

  // 4. UI 顯示對錯（原有功能）
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

  // 5. 檢查是否全部答完（原有功能）
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
        : "別灰心，皮皮陪你再看一次筆記 🍎";

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
        <button onclick="navigateTo('page-settings'); closeModal();" 
          class="w-full py-4 bg-[#13B5B1] text-white rounded-2xl text-xs font-black shadow-lg">
          查看長期學習進度
        </button>
        <button onclick="closeModal()" 
          class="w-full py-4 bg-gray-50 text-gray-400 rounded-2xl text-xs font-black">
          返回筆記
        </button>
      </div>
    </div>
  `;
}
// 修改 main.js 中的 openQuizSettings

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

  // 如果是複習模式，檢查是否有選取筆記
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
  bindQuizSettingsEvents(isReviewMode); // 傳遞模式給事件綁定
}

function bindQuizSettingsEvents(isReviewMode) {
  // 重置預設值
  selectedQuizCount = 3;
  selectedQuizType = "mc";

  // 處理題數切換邏輯
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

  // 處理題型切換邏輯
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

  // 點擊確認按鈕，帶入正確的參數呼叫 API
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
  currentSessionScore = { correct: 0, total: 0 }; // 🚀 每次新測驗都要歸零！
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
    loadingMsg = `✨ 皮皮正在整合 ${notesToReview.length} 份筆記，產出 ${count} 題跨領域挑戰...`;
  } else {
    // 單篇筆記模式
    if (!currentNoteData) return;
    contentData = `標題: ${currentNoteData.title}\n內容: ${JSON.stringify(currentNoteData.sections)}`;
    loadingMsg = `✨ 皮皮正在針對本篇筆記，精選 ${count} 題考題...`;
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
  const prompt = `你是一位專業教授「認知破壞終結者」。請根據以下提供的學習內容，出一份高品質的測驗。
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
        <p class="text-sm font-black text-gray-500">哎呀！皮皮斷線了，請再試一次。</p>
        <button type="button" onclick="closeModal()" class="mt-4 text-xs text-[#13B5B1] font-black underline">關閉視窗</button>
      </div>
    `;
  }
}

// 新增渲染函數
function renderQuizUI(result, type, count) {
  let html = `<h3 class="text-lg font-black mb-6 text-gray-800">🧠 認知挑戰：${type === "fib" ? "填空測驗" : "智能小考"}</h3>`;

  result.questions.forEach((q, qIdx) => {
    html += `
      <div class="mb-8 border-b border-gray-50 pb-6">
        <p class="text-sm font-bold mb-4 text-gray-700">${qIdx + 1}. ${q.question}</p>
        <div class="space-y-3">`;

    if (type === "fib") {
      // 填空題渲染：輸入框 + 確認按鈕
      html += `
        <div class="flex gap-2">
          <input type="text" id="fib-input-${qIdx}" placeholder="請輸入答案..."
            class="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-[#13B5B1]">
          <button type="button" data-action="check-fib" data-idx="${qIdx}" data-answer="${q.answer}"
            class="px-4 bg-[#13B5B1] text-white rounded-xl text-xs font-black shadow-md active:scale-95 transition-all">
            檢查
          </button>
        </div>
        <div id="fib-feedback-${qIdx}" class="hidden mt-2 text-[10px] font-black"></div>
      `;
    } else {
      // 單選/是非題渲染：原本的按鈕模式
      html += (q.options || [])
        .map(
          (opt, oIdx) => `
        <button type="button" class="quiz-option" data-action="quiz-answer"
          data-selected="${oIdx}" data-correct="${q.answer}">${opt}</button>
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

  showModal("✨ 皮皮正在查閱知識庫...");
  const prompt = `針對主題「${currentNoteData.title}」提供 3 個延伸學習建議。請用繁體中文。`;

  try {
    const data = await callGemini(prompt);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    safeEl("modal-content").innerHTML = `
      <div class="text-left">
        <h3 class="text-lg font-black mb-4 text-[#13B5B1]">📚 皮皮的延伸筆記</h3>
        <div class="text-sm leading-relaxed text-gray-600 whitespace-pre-wrap">${String(
          text,
        )
          .replace(/\n/g, "<br>")
          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div>
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

  showModal("✨ 皮皮正在為您裝訂 PDF...");

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

  showModal("✨ 皮皮正在進行出題...");

  const prompt = `你是一位嚴謹的教授「認知破壞終結者」。請針對以下提供的多篇筆記內容，出一份具備「深度聯繫」的 5 題單選題測驗。
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

    let html = `<h3 class="text-lg font-black mb-6 text-gray-800">🧠 認知破壞挑戰：跨領域戰役</h3>`;
    result.questions.forEach((q, qIdx) => {
      html += `
        <div class="mb-8 border-b border-gray-50 pb-6">
          <p class="text-sm font-bold mb-4 text-gray-700">${qIdx + 1}. ${q.question}</p>
          <div class="space-y-2">
            ${q.options
              .map(
                (opt, oIdx) => `
                  <button type="button"
                    class="quiz-option"
                    data-action="quiz-answer"
                    data-selected="${oIdx}"
                    data-correct="${q.answer}"
                  >${opt}</button>
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
    container.innerHTML = `<p class="text-xs text-gray-400 text-center py-8 font-bold">✨ 開始您的第一次測驗，<br>皮皮將為您生成數據報告！</p>`;
    return;
  }

  const total = quizHistory.length;
  const correct = quizHistory.filter((h) => h.isCorrect).length;
  const accuracy = Math.round((correct / total) * 100);

  // 決定主顏色
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
            <span class="text-[11px] font-black text-gray-700">${cat.name}</span>
            <span class="text-[10px] font-black text-orange-500">${cat.score}%</span>
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
      level: 1, // 第一次答錯從 Level 1 開始
      nextReviewTime: Date.now() + EB_INTERVALS[1],
    });
  } else {
    // 若再次答錯，重置複習時間
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
    wrongQuestions.splice(idx, 1); // 進入長期記憶，移出清單
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

    // 🚀 新增：根據列表頁的選取狀態，決定內容頁要顯示哪一個 View
    const isTranscript = activeListTab === "transcript";

    // 1. 切換顯示區塊 (使用 hidden 控制)
    safeEl("view-note")?.classList.toggle("hidden", isTranscript);
    safeEl("view-transcript")?.classList.toggle("hidden", !isTranscript);

    // 2. 同步更新內容頁上方的 Tab 按鈕樣式，確保視覺統一
    const activeClass =
      "tab-btn flex-1 py-2.5 bg-[#13B5B1] text-white rounded-full text-xs font-black shadow-md";
    const inactiveClass =
      "tab-btn flex-1 py-2.5 text-gray-400 rounded-full text-xs font-black";

    safeEl("tab-note").className = !isTranscript ? activeClass : inactiveClass;
    safeEl("tab-transcript").className = isTranscript
      ? activeClass
      : inactiveClass;

    // 3. 執行導覽跳轉
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
      activeListTab = el.dataset.listView; // 👈 關鍵：記住現在是哪個 Tab

      // 原本的 UI 切換邏輯
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
        // 篩選出今天到期的錯題
        const dueQuestions = wrongQuestions.filter(
          (q) => q.nextReviewTime <= Date.now(),
        );
        if (dueQuestions.length > 0) {
          // 呼叫我們之前的渲染函數，並傳入題型
          renderQuizUI({ questions: dueQuestions }, "srs", dueQuestions.length);
          // 開啟 Modal 顯示題目
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
      // 在 main.js 的事件委派中加入
      case "check-fib": {
        const idx = el.dataset.idx;
        const correctAnswer = el.dataset.answer;
        const inputEl = safeEl(`fib-input-${idx}`);
        const feedbackEl = safeEl(`fib-feedback-${idx}`);
        const userInput = inputEl.value.trim().toLowerCase();
        const target = correctAnswer.trim().toLowerCase();

        const isCorrect = userInput === target; // 🚀 只在這裡宣告一次！

        inputEl.disabled = true;
        el.disabled = true;
        el.style.opacity = "0.5";

        if (isCorrect) {
          inputEl.classList.add("border-green-500", "bg-green-50");
          feedbackEl.innerHTML = `<span class="text-green-600 font-black">✅ 太棒了！答案完全正確。</span>`;
        } else {
          inputEl.classList.add("border-red-500", "bg-red-50");
          feedbackEl.innerHTML = `<span class="text-red-600 font-black">❌ 可惜了，正確答案是：${correctAnswer}</span>`;
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
          // 1. 清空記憶體中的陣列
          quizHistory = [];

          // 2. 移除 LocalStorage 裡的紀錄
          localStorage.removeItem("president_quiz_history");

          // 3. 立即重新渲染看板
          renderLearningDashboard();

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

      case "export-data": {
        const backup = {
          exportedAt: new Date().toISOString(),
          app: "認知破壞終結者 3.0",
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
          localStorage.clear();
          location.reload();
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

window.addEventListener("load", () => {
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
    adjustTitleFontSize(); // 🚀 新增：螢幕旋轉或縮放時重新計算
  });
}
