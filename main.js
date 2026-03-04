/**
 * =========================================================
 * 0) Config & State（設定與狀態）
 * =========================================================
 */

let currentFilterCategory = "全部";
let currentFilter = "all";
let currentFilterDate = null;

let selectedTrashNotes = new Set();
let selectedReviewNotes = new Set();

let lastActivePageId = "page-home";
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

let timerInterval;
let seconds = 0;
let recognition;
let fullTranscript = "";
let isRecording = false;

let recognitionRestartTimer = null;
let recognitionEndFailCount = 0;
let lastInterim = "";

/**
 * Notes / Settings
 */
let notesLibrary = JSON.parse(localStorage.getItem("president_notes")) || [
  {
    id: "note-2-1",
    title: "2.1 腦部睡眠中樞的研究與定位",
    intro:
      "皮皮已經為您整理好了關於睡眠中樞定位的關鍵實驗。這堂課介紹了 Jouvet 如何透過腦幹切斷術找出 REM 睡眠的核心區域。",
    date: "12 / 26",
    duration: "05:40",
    category: "未分類",
    sections: [
      {
        category: "核心概念",
        items: [
          "睡眠並非單一開關，而是由**睡眠中樞**與**清醒中樞**並存且交互影響決定狀態。",
        ],
      },
      {
        category: "Jouvet 研究 (1959-1962)",
        items: [
          "對象：鼠、貓。",
          "方法：**腦幹切斷術**。觀察切斷後大腦前後段的睡眠現象來推斷位置。",
        ],
      },
      {
        category: "核心結論",
        items: [
          "REM 睡眠的主要中樞確定位於**腦幹橋腦 (Pons)**。",
          "橋腦向上活化大腦皮質，向下抑制動作輸出，形成「大腦活化 x 身體抑制」。",
        ],
      },
    ],
    segments: [
      {
        time: "00:00",
        text: "所以似乎我們的大腦當中，原來在思考的，如果我睡覺好像是有一個開關把它關掉，好像並不是這樣子的。",
      },
      {
        time: "00:15",
        text: "我們大腦裡面好像有它睡的中樞跟醒的中樞，睡跟醒的中樞它們可能會交互影響，來影響我們的睡眠的狀態。",
      },
      {
        time: "00:30",
        text: "後來大概比較多的一些技術開始發展出來，能夠對於腦部的活動有多一些瞭解。腦波能夠分辨不同睡眠的階段。",
      },
      {
        time: "01:30",
        text: "在大概 1959 年到 62 年，有一位法國的學者 Jouvet，他開始透過更進一步、更侵入的腦幹切斷術技術。",
      },
      {
        time: "02:15",
        text: "他透過切斷我們大腦的不同部位，來找尋睡眠中樞在哪。邏輯是觀測後半部是否仍有睡眠現象來推斷位置。",
      },
      {
        time: "03:00",
        text: "若切斷在中腦跟橋腦界限（A跟B），發現會出現週期性的快速眼動跟肌肉張力降低，表示周邊機轉仍作用。",
      },
      {
        time: "03:45",
        text: "若在橋腦跟延腦交界（C）切斷，身體看不到 REM 活動，但腦波與 PGO 銳波顯示大腦內部仍有 REM。",
      },
      {
        time: "04:30",
        text: "這顯示在 C 點切斷時中樞 REM 存在但周邊輸出被阻斷。由此推論 A B C 之間這段橋腦就是最重要的 REM 睡眠中樞。",
      },
      {
        time: "05:15",
        text: "發現睡眠中樞的確是在腦幹橋腦。它會往上活化大腦部分，往下去抑制動作輸出，形成大腦活化但身體被抑制的狀態。",
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

function initRecognition() {
  if (!("webkitSpeechRecognition" in window)) {
    console.warn("This browser does not support webkitSpeechRecognition.");
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
      if (event.results[i].isFinal) fullTranscript += piece;
      else interim += piece;
    }

    lastInterim = interim;

    localStorage.setItem("temp_transcript", fullTranscript + interim || "");

    const el = safeEl("live-transcript");
    if (el) el.innerText = fullTranscript + interim || "皮皮正在聽課...";
  };

  recognition.onend = () => {
    if (!isRecording) return;

    if (recognitionRestartTimer) clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = setTimeout(() => {
      try {
        recognition.start();
        recognitionEndFailCount = 0;
      } catch (e) {
        recognitionEndFailCount++;
        if (recognitionEndFailCount >= 5) {
          isRecording = false;
          alert("語音辨識連續失敗，已停止錄音。請重新開始錄音。");
        }
      }
    }, 600);
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
    console.error(err);
    alert("生成失敗，但逐字稿已為您暫存。");
    window.navigateTo("page-list");
  }
}

/**
 * =========================================================
 * 4) AI / API（Gemini 互動）
 * =========================================================
 */

async function callGemini(prompt, responseSchema = null, retryCount = 0) {
  if (!apiKey) {
    throw new Error("Missing VITE_GEMINI_API_KEY");
  }

  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: responseSchema
      ? { responseMimeType: "application/json", responseSchema }
      : {},
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Gemini API Error:", res.status, errText);
      throw new Error("Gemini API Error");
    }

    return await res.json();
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
  const cats = notesLibrary.map((n) => (n.category || "未分類").trim());
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
              <div class="font-black text-gray-800 text-sm leading-snug flex-1">${note.title || "未命名筆記"}${
                note.isFavorite ? " ★" : ""
              }</div>
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
function checkAnswer(btn, selected, correct) {
  const allBtns = btn.parentElement.querySelectorAll("button");
  if (selected === correct) {
    btn.classList.add("quiz-correct");
    btn.innerHTML += " ✅";
  } else {
    btn.classList.add("quiz-wrong");
    allBtns[correct]?.classList.add("quiz-correct");
  }
  allBtns.forEach((b) => (b.disabled = true));
}

async function generateQuiz() {
  if (!currentNoteData) return;

  showModal("✨ 皮皮正在為您精選考題...");

  const prompt = `你是一位專業教授。請根據以下筆記內容出 3 題單選題。
請嚴格遵守以下格式，只回傳純 JSON 字串，不要包含 \`\`\`json 等標籤：
{"questions": [{"question": "題目", "options": ["選項1","選項2","選項3","選項4"], "answer": 0}]}
注意：answer 是正確選項的索引(0-3)。
內容：${JSON.stringify(currentNoteData)}`;

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

    let html = `<h3 class="text-lg font-black mb-6 text-gray-800">🧠 皮皮的小考時間</h3>`;
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
    console.error("解析失敗：", err);
    safeEl("modal-content").innerHTML = `
      <div class="text-center py-10">
        <i class="fas fa-exclamation-triangle text-orange-400 text-3xl mb-4"></i>
        <p class="text-sm font-bold text-gray-500">出題稍有延誤，請再試一次。</p>
        <button type="button" data-action="quiz" class="mt-4 text-xs text-[#13B5B1] font-black underline">重新出題</button>
      </div>
    `;
  }
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
  } else if (pageId === "page-settings") {
    loadSettingsToUI();
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
      lastActivePageId = currentActivePage.id;
    }

    pages.forEach((p) => p.classList.add("hidden"));
    safeEl(pageId)?.classList.remove("hidden");

    const nav = safeEl("main-nav");
    if (nav) {
      if (pageId === "page-record" || pageId === "page-loading")
        nav.classList.add("hidden");
      else nav.classList.remove("hidden");
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
    window.navigateTo("page-content");
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
      safeEl("list-tab-note").className = isNote
        ? "tab-btn flex-1 py-2.5 bg-[#13B5B1] text-white rounded-full text-xs font-black shadow-md"
        : "tab-btn flex-1 py-2.5 text-gray-400 rounded-full text-xs font-black";
      safeEl("list-tab-transcript").className = !isNote
        ? "tab-btn flex-1 py-2.5 bg-[#13B5B1] text-white rounded-full text-xs font-black shadow-md"
        : "tab-btn flex-1 py-2.5 text-gray-400 rounded-full text-xs font-black";
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
        call(startSmartReviewQuiz);
        break;

      case "open-note":
        e.stopPropagation();
        call(() => window.loadNoteDetails(el.dataset.noteId));
        break;

      case "quiz":
        call(generateQuiz);
        break;

      case "quiz-answer": {
        const selected = Number(el.dataset.selected);
        const correct = Number(el.dataset.correct);
        checkAnswer(el, selected, correct);
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
  window.visualViewport.addEventListener("resize", syncLayoutHeights);
}
