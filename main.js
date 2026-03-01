/**
 * =========================================================
 * 0) Config & State（設定與狀態）
 * =========================================================
 */

// filters
let currentFilterCategory = "全部";
let currentFilter = "all"; // 'all' | 'fav'

// env
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// speech / recording
let timerInterval;
let seconds = 0;
let recognition;
let fullTranscript = "";
let isRecording = false;

let recognitionRestartTimer = null;
let recognitionEndFailCount = 0;
let lastInterim = "";

// db
let notesLibrary = JSON.parse(localStorage.getItem("president_notes")) || [
  {
    id: "note-2-1",
    title: "2.1 腦部睡眠中樞的研究與定位",
    intro:
      "總裁已經為您整理好了關於睡眠中樞定位的關鍵實驗。這堂課介紹了 Jouvet 如何透過腦幹切斷術找出 REM 睡眠的核心區域。",
    date: "12 / 26",
    duration: "05:40",
    category: "未分類",
    sections: [
      {
        category: "核心概念",
        items: ["睡眠並非單一開關，而是由**睡眠中樞**與**清醒中樞**並存且交互影響決定狀態。"],
      },
      {
        category: "Jouvet 研究 (1959-1962)",
        items: ["對象：鼠、貓。", "方法：**腦幹切斷術**。觀察切斷後大腦前後段的睡眠現象來推斷位置。"],
      },
      {
        category: "核心結論",
        items: ["REM 睡眠的主要中樞確定位於**腦幹橋腦 (Pons)**。", "橋腦向上活化大腦皮質，向下抑制動作輸出，形成「大腦活化 x 身體抑制」。"],
      },
    ],
    segments: [
      { time: "00:00", text: "所以似乎我們的大腦當中，原來在思考的，如果我睡覺好像是有一個開關把它關掉，好像並不是這樣子的。" },
      { time: "00:15", text: "我們大腦裡面好像有它睡的中樞跟醒的中樞，睡跟醒的中樞它們可能會交互影響，來影響我們的睡眠的狀態。" },
      { time: "00:30", text: "後來大概比較多的一些技術開始發展出來，能夠對於腦部的活動有多一些瞭解。腦波能夠分辨不同睡眠的階段。" },
      { time: "01:30", text: "在大概 1959 年到 62 年，有一位法國的學者 Jouvet，他開始透過更進一步、更侵入的腦幹切斷術技術。" },
      { time: "02:15", text: "他透過切斷我們大腦的不同部位，來找尋睡眠中樞在哪。邏輯是觀測後半部是否仍有睡眠現象來推斷位置。" },
      { time: "03:00", text: "若切斷在中腦跟橋腦界限（A跟B），發現會出現週期性的快速眼動跟肌肉張力降低，表示周邊機轉仍作用。" },
      { time: "03:45", text: "若在橋腦跟延腦交界（C）切斷，身體看不到 REM 活動，但腦波與 PGO 銳波顯示大腦內部仍有 REM。" },
      { time: "04:30", text: "這顯示在 C 點切斷時中樞 REM 存在但周邊輸出被阻斷。由此推論 A B C 之間這段橋腦就是最重要的 REM 睡眠中樞。" },
      { time: "05:15", text: "發現睡眠中樞的確是在腦幹橋腦。它會往上活化大腦部分，往下去抑制動作輸出，形成大腦活化但身體被抑制的狀態。" },
    ],
  },
];

let currentNoteData = notesLibrary[0];

/**
 * =========================================================
 * 1) Utils（小工具）
 * =========================================================
 */

function debounce(fn, delay = 150) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function safeEl(id) {
  return document.getElementById(id);
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

/**
 * =========================================================
 * 2) Storage（資料存取）
 * =========================================================
 */

function saveNotesToDisk() {
  localStorage.setItem("president_notes", JSON.stringify(notesLibrary));
  const pageList = safeEl("page-list");
  if (pageList && pageList.classList.contains("hidden") === false) {
    renderCategoryFilters();
  }
}

function markNoteDeleted(noteId) {
  const note = notesLibrary.find((n) => n.id === noteId);
  if (note) {
    note.isDeleted = true;
    note.deletedAt = new Date().getTime();
    saveNotesToDisk();
  }
}

/**
 * =========================================================
 * 3) Speech / Recording（語音與錄音流程）
 * =========================================================
 */

function initRecognition() {
  if (!("webkitSpeechRecognition" in window)) return;

  recognition = new window.webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "zh-TW";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) fullTranscript += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }

    lastInterim = interim;

    localStorage.setItem("temp_transcript", (fullTranscript + interim) || "");

    const el = safeEl("live-transcript");
    if (el) el.innerText = (fullTranscript + interim) || "總裁正在聽課...";
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
  if (liveEl) liveEl.innerText = "總裁正在聽課...";

  window.navigateTo("page-record");
  if (recognition) {
    try { recognition.start(); } catch (_) {}
  }

  timerInterval = setInterval(() => {
    seconds++;
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
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

  localStorage.setItem("temp_transcript", (fullTranscript + lastInterim) || "");

  const durationText = safeEl("record-timer")?.innerText || "00:00";
  window.navigateTo("page-loading");

  const prompt = `你是一位專業筆記助手「總裁」。請將這段錄音逐字稿整理成高品質繁體中文筆記 JSON。逐字稿：${
    (fullTranscript + lastInterim) || "模擬內容"
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
        items: { type: "OBJECT", properties: { time: { type: "STRING" }, text: { type: "STRING" } } },
      },
    },
  };

  try {
    const data = await callGemini(prompt, schema);

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const result = JSON.parse(clean);

    const newNote = {
      ...result,
      id: Date.now().toString(),
      title: "新筆記",
      category: "未分類",
      date: new Date().getMonth() + 1 + " / " + new Date().getDate(),
      duration: durationText,
      isFavorite: false,
      isDeleted: false,
    };

    notesLibrary.unshift(newNote);
    saveNotesToDisk();

    window.loadNoteDetails(newNote.id);
    localStorage.removeItem("temp_transcript");
  } catch (err) {
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
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: responseSchema ? { responseMimeType: "application/json", responseSchema } : {},
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
      throw new Error("API Error");
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

function renderCategoryFilters() {
  const container = safeEl("category-filter-container");
  if (!container) return;

  const allCategories = [
    "全部",
    ...new Set(notesLibrary.filter((n) => !n.isDeleted).map((n) => n.category || "未分類")),
  ];

  container.innerHTML = `
    <select
      class="bg-gray-50 border-none outline-none text-[10px] font-black text-gray-500 py-1.5 px-3 rounded-xl cursor-pointer shadow-sm"
    >
      ${allCategories
        .map(
          (cat) => `
          <option value="${cat}" ${currentFilterCategory === cat ? "selected" : ""}>
            分類: ${cat}
          </option>
        `
        )
        .join("")}
    </select>
  `;
}

function renderNoteUI(data) {
  safeEl("content-title").innerText = data.title;
  safeEl("ai-intro-text").innerText = data.intro;
  safeEl("content-duration").innerText = `00:00 / ${data.duration}`;

  syncFavoriteUI(data);

  const noteContainer = safeEl("note-cards-container");
  noteContainer.innerHTML = "";
  (data.sections || []).forEach((sec) => {
    const card = document.createElement("div");
    card.className = "note-highlight";
    card.innerHTML = `
      <div class="font-black text-[#13B5B1] text-xs mb-3 uppercase tracking-wider">${sec.category}</div>
      <ul class="space-y-3">
        ${(sec.items || [])
          .map(
            (i) => `
            <li class="text-[12px] text-gray-700 font-bold">• ${String(i).replace(
              /\*\*(.*?)\*\*/g,
              '<span class="text-[#13B5B1] font-black">$1</span>'
            )}</li>
          `
          )
          .join("")}
      </ul>
    `;
    noteContainer.appendChild(card);
  });

  const transcriptContainer = safeEl("transcript-container");
  transcriptContainer.innerHTML = '<div class="timeline-line"></div>';
  (data.segments || []).forEach((seg, idx) => {
    const item = document.createElement("div");
    item.className = "relative mb-10 pl-8";
    item.innerHTML = `
      <div class="timeline-dot ${idx === 0 ? "active" : ""}"></div>
      <div class="text-[9px] ${idx === 0 ? "text-[#13B5B1]" : "text-gray-300"} font-black mb-1 tracking-wider">${seg.time}</div>
      <div class="text-xs ${
        idx === 0
          ? "text-gray-800 font-black bg-[#F0F9F9] -mx-4 px-4 py-2 rounded-2xl shadow-sm border border-[#13B5B1]/5"
          : "text-gray-400 font-bold"
      } leading-relaxed">${seg.text}</div>
    `;
    transcriptContainer.appendChild(item);
  });
}

function renderNotesList() {
  const container = safeEl("list-container");
  const searchTerm = safeEl("search-input")?.value.toLowerCase() || "";
  if (!container) return;
  container.innerHTML = "";

  const filteredNotes = notesLibrary.filter((note) => {
    const matchesSearch = (note.title || "").toLowerCase().includes(searchTerm);
    const noteCat = note.category || "未分類";
    const matchesCategory = currentFilterCategory === "全部" || noteCat === currentFilterCategory;
    const matchesFavorite = currentFilter === "fav" ? !!note.isFavorite : true;
    return matchesSearch && matchesCategory && matchesFavorite && !note.isDeleted;
  });

  if (filteredNotes.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-gray-300 text-xs font-bold">目前沒有筆記項目 😮‍💨</div>`;
    return;
  }

  filteredNotes.forEach((note) => {
    const wrapper = document.createElement("div");
    wrapper.className = "flex gap-4 items-start mb-6 w-full";

    const starHtml = note.isFavorite ? `<i class="fas fa-star text-yellow-400 text-[10px] ml-1"></i>` : "";
    const dateParts = (note.date || "1 / 1").split("/");
    const month = dateParts[0] ? dateParts[0].trim() : "1";
    const day = dateParts[1] ? dateParts[1].trim() : "1";

    wrapper.innerHTML = `
      <div class="w-12 flex-shrink-0">
        <div class="active-date py-3 rounded-2xl text-center shadow-sm">
          <div class="text-[9px] font-bold opacity-80 uppercase">${month}月</div>
          <div class="text-lg font-black leading-tight">${day}</div>
        </div>
      </div>

      <div class="flex-1 bg-white border border-gray-50 p-5 rounded-[2.2rem] shadow-sm relative cursor-pointer active:scale-[0.98] transition-all"
        data-action="open-note"
        data-note-id="${note.id}"
        role="button"
        tabindex="0"
      >
        <div class="flex justify-between items-start mb-1">
          <div class="font-black text-gray-800 text-sm leading-snug flex-1">
            ${note.title}${starHtml}
          </div>
          <span class="ml-2 px-2 py-0.5 bg-[#13B5B1]/10 text-[#13B5B1] text-[8px] rounded-full font-black whitespace-nowrap">
            ${note.category || "未分類"}
          </span>
        </div>

        <div class="flex justify-between items-center mt-6">
          <span class="text-[8px] text-gray-300 font-black tracking-widest uppercase">ID: ${(note.id || "").slice(-4)}</span>

          <button type="button"
            class="w-8 h-8 bg-red-50 text-red-400 rounded-xl flex items-center justify-center"
            data-action="delete-note"
            data-note-id="${note.id}"
            aria-label="Delete note"
          >
            <i class="fas fa-trash-alt text-[10px]"></i>
          </button>
        </div>
      </div>
    `;

    container.appendChild(wrapper);
  });
}

function renderTrashList() {
  const container = safeEl("trash-container");
  const emptyState = safeEl("trash-empty-state");
  if (!container || !emptyState) return;

  const trashNotes = notesLibrary.filter((n) => n.isDeleted);

  if (trashNotes.length === 0) {
    container.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  container.innerHTML = trashNotes
    .map(
      (note) => `
      <div class="bg-white p-4 rounded-[24px] shadow-sm border border-gray-100 flex items-center justify-between">
        <div class="flex-1">
          <h3 class="font-bold text-gray-800 text-sm mb-1">${note.title}</h3>
          <p class="text-[10px] text-gray-400">刪除於: ${new Date(note.deletedAt).toLocaleDateString()}</p>
        </div>
        <div class="flex gap-2">
          <button type="button"
            class="w-8 h-8 bg-[#13B5B1]/10 text-[#13B5B1] rounded-full flex items-center justify-center active:scale-95"
            data-action="trash-restore"
            data-note-id="${note.id}"
          >
            <i class="fas fa-undo-alt text-xs"></i>
          </button>

          <button type="button"
            class="w-8 h-8 bg-red-50 text-red-400 rounded-full flex items-center justify-center active:scale-95"
            data-action="trash-permadelete"
            data-note-id="${note.id}"
          >
            <i class="fas fa-times text-xs"></i>
          </button>
        </div>
      </div>
    `
    )
    .join("");
}

function updateNavUI(pageId) {
  const navItems = {
    "page-home": "nav-home",
    "page-list": "nav-notes",
    "page-trash": "nav-trash",
  };

  Object.values(navItems).forEach((id) => {
    const el = safeEl(id);
    if (el) {
      el.classList.remove("nav-item-active", "text-[#13B5B1]");
      el.classList.add("nav-item-inactive", "text-gray-300");
    }
  });

  const activeId = navItems[pageId];
  if (activeId) {
    const activeEl = safeEl(activeId);
    activeEl.classList.remove("nav-item-inactive", "text-gray-300");
    activeEl.classList.add("nav-item-active", "text-[#13B5B1]");
  }
}

/**
 * =========================================================
 * 6) Actions（功能）
 * =========================================================
 */

function toggleFavorite() {
  const note = notesLibrary.find((n) => n.id === currentNoteData.id);
  if (note) {
    note.isFavorite = !note.isFavorite;
    saveNotesToDisk();
    renderNoteUI(note);
  }
}

function filterNotes(type) {
  currentFilter = type;

  const allTab = safeEl("filter-all");
  const favTab = safeEl("filter-fav");

  if (allTab && favTab) {
    if (type === "fav") {
      favTab.className = "text-xs font-bold text-[#13B5B1] cursor-pointer border-b-2 border-[#13B5B1] pb-1 transition-all";
      allTab.className = "text-xs font-bold text-gray-300 cursor-pointer pb-1 transition-all";
    } else {
      allTab.className = "text-xs font-bold text-[#13B5B1] cursor-pointer border-b-2 border-[#13B5B1] pb-1 transition-all";
      favTab.className = "text-xs font-bold text-gray-300 cursor-pointer pb-1 transition-all";
    }
  }

  renderNotesList();
}

function editNoteTitle() {
  const newTitle = prompt("請輸入新的筆記標題：", currentNoteData.title);
  if (newTitle && newTitle.trim() !== "") {
    currentNoteData.title = newTitle.trim();
    safeEl("content-title").innerText = newTitle.trim();

    const noteIndex = notesLibrary.findIndex((n) => n.id === currentNoteData.id);
    if (noteIndex !== -1) {
      notesLibrary[noteIndex].title = newTitle.trim();
      saveNotesToDisk();
      renderNotesList();
    }
  }
}

function showModal(text) {
  safeEl("ai-modal").style.display = "flex";
  safeEl("modal-content").innerHTML = `
    <div class="flex flex-col items-center py-12">
      <i class="fas fa-magic text-[#13B5B1] text-4xl animate-bounce mb-6"></i>
      <p class="text-sm font-black text-gray-400">${text}</p>
    </div>
  `;
}

function closeModal() {
  safeEl("ai-modal").style.display = "none";
}

function closeConfirmModal() {
  safeEl("confirm-modal").style.display = "none";
}

function openConfirmModal() {
  safeEl("confirm-modal").style.display = "flex";
}

function changeCategory() {
  const dynamicCats = [...new Set(notesLibrary.filter((n) => !n.isDeleted).map((n) => n.category || "未分類"))];
  const presets = ["心理學", "生物學", "通識課", "待處理"];
  const finalCategories = [...new Set([...dynamicCats, ...presets])];

  let html = `
    <h3 class="text-lg font-black mb-4 text-gray-800 flex items-center gap-2">
      <i class="fas fa-tag text-[#13B5B1]"></i> 選擇分類
    </h3>
    <div class="grid grid-cols-2 gap-2 mb-6">
  `;

  finalCategories.forEach((cat) => {
    const isActive = currentNoteData.category === cat;
    html += `
      <button type="button"
        data-action="set-category"
        data-category="${cat}"
        class="py-2.5 px-1 text-center font-bold text-[11px] rounded-2xl border transition-all leading-tight
        ${isActive ? "bg-[#13B5B1] text-white border-[#13B5B1]" : "bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100"}">
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

  safeEl("modal-content").innerHTML = html;
  safeEl("ai-modal").style.display = "flex";
}

function setCategory(cat) {
  if (!cat || cat.trim() === "") {
    alert("請輸入有效的分類名稱！");
    return;
  }
  const v = cat.trim();

  currentNoteData.category = v;

  const noteIndex = notesLibrary.findIndex((n) => n.id === currentNoteData.id);
  if (noteIndex !== -1) {
    notesLibrary[noteIndex].category = v;
  }

  saveNotesToDisk();
  renderNotesList();
  renderNoteUI(currentNoteData);
  closeModal();
}

// soft delete
function softDeleteNote(noteId) {
  const note = notesLibrary.find((n) => n.id === noteId);
  if (!note) return;

  if (confirm("確定要將此筆記移至回收站嗎？")) {
    markNoteDeleted(noteId);

    const pageContent = safeEl("page-content");
    if (pageContent && !pageContent.classList.contains("hidden")) {
      window.navigateTo("page-list");
    } else {
      renderNotesList();
    }
  }
}

// restore
function restoreNote(noteId) {
  const note = notesLibrary.find((n) => n.id === noteId);
  if (note) {
    note.isDeleted = false;
    delete note.deletedAt;
    saveNotesToDisk();
    renderTrashList();
    alert("筆記已還原 ✨");
  }
}

// perm delete single
function permanentDeleteNote(noteId) {
  if (confirm("此動作無法復原，確定永久刪除？")) {
    notesLibrary = notesLibrary.filter((n) => n.id !== noteId);
    saveNotesToDisk();
    renderTrashList();
  }
}

// clear all
function permanentClearAll() {
  const hasDeletedItems = notesLibrary.some((n) => n.isDeleted);
  if (!hasDeletedItems) return;

  if (confirm("確定要永久刪除回收站內的所有內容嗎？此操作不可逆！")) {
    notesLibrary = notesLibrary.filter((n) => !n.isDeleted);
    saveNotesToDisk();
    renderTrashList();
  }
}

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
  showModal("✨ 總裁正在為您精選考題...");

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
    const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const result = JSON.parse(cleanJson);

    let html = `<h3 class="text-lg font-black mb-6 text-gray-800">🧠 總裁的小考時間</h3>`;
    result.questions.forEach((q, qIdx) => {
      html += `
        <div class="mb-8 border-b border-gray-50 pb-6">
          <p class="text-sm font-bold mb-4 text-gray-700">${qIdx + 1}. ${q.question}</p>
          <div class="space-y-2">
            ${q.options
              .map(
                (opt, oIdx) => `
                  <button
                    type="button"
                    class="quiz-option"
                    data-action="quiz-answer"
                    data-selected="${oIdx}"
                    data-correct="${q.answer}"
                  >${opt}</button>
                `
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
  showModal("✨ 總裁正在查閱知識庫...");
  const prompt = `針對主題「${currentNoteData.title}」提供 3 個延伸學習建議。請用繁體中文。`;
  try {
    const data = await callGemini(prompt);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    safeEl("modal-content").innerHTML = `
      <div class="text-left">
        <h3 class="text-lg font-black mb-4 text-[#13B5B1]">📚 總裁的延伸筆記</h3>
        <div class="text-sm leading-relaxed text-gray-600 whitespace-pre-wrap">${text
          .replace(/\n/g, "<br>")
          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div>
      </div>
    `;
  } catch (err) {
    safeEl("modal-content").innerHTML = "獲取失敗。";
  }
}

async function exportToPDF() {
  const element = safeEl("view-note");
  const title = safeEl("content-title")?.innerText || "note";

  const opt = {
    margin: 10,
    filename: `${title}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };

  showModal("✨ 總裁正在為您裝訂 PDF...");

  try {
    await html2pdf().set(opt).from(element).save();
    closeModal();
  } catch (err) {
    alert("匯出失敗，請再試一次。");
    closeModal();
  }
}

/**
 * =========================================================
 * 7) Global bindings（給少量 window 存取）
 * =========================================================
 */

Object.assign(window, {
  navigateTo: (pageId) => {
    document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
    safeEl(pageId).classList.remove("hidden");

    const nav = safeEl("main-nav");
    if (pageId === "page-record" || pageId === "page-loading") nav.classList.add("hidden");
    else nav.classList.remove("hidden");

    if (pageId === "page-list") {
      renderCategoryFilters();
      renderNotesList();
    }
    if (pageId === "page-trash") {
      renderTrashList();
    }

    updateNavUI(pageId);
  },

  loadNoteDetails: (id) => {
    const note = notesLibrary.find((n) => n.id === id);
    if (note) {
      currentNoteData = note;
      renderNoteUI(note);
      window.navigateTo("page-content");
    }
  },

  // expose a few
  closeModal,
  closeConfirmModal,
});

/**
 * =========================================================
 * 8) UI Event Wiring（事件委派）
 * =========================================================
 */

(function bindUIEvents() {
  const call = (fn, ...args) => (typeof fn === "function" ? fn(...args) : undefined);

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action], [data-page], [data-filter], [data-list-view], [data-content-view]");
    if (!el) return;

    // page
    if (el.dataset.page) {
      window.navigateTo(el.dataset.page);
      return;
    }

    // list filter
    if (el.dataset.filter) {
      filterNotes(el.dataset.filter);
      return;
    }

    // list view tabs
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

    // content view tabs
    if (el.dataset.contentView) {
      const isNote = el.dataset.contentView === "note";
      safeEl("view-note").classList.toggle("hidden", !isNote);
      safeEl("view-transcript").classList.toggle("hidden", isNote);
      safeEl("tab-note").className = isNote
        ? "tab-btn flex-1 py-2.5 bg-[#13B5B1] text-white rounded-full text-xs font-black shadow-md"
        : "tab-btn flex-1 py-2.5 text-gray-400 rounded-full text-xs font-black";
      safeEl("tab-transcript").className = !isNote
        ? "tab-btn flex-1 py-2.5 bg-[#13B5B1] text-white rounded-full text-xs font-black shadow-md"
        : "tab-btn flex-1 py-2.5 text-gray-400 rounded-full text-xs font-black";
      return;
    }

    // actions
    const action = el.dataset.action;

    switch (action) {
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
      case "delete-current":
        call(() => {
          const id = currentNoteData.id;
          openConfirmModal();
          safeEl("btn-real-delete").onclick = () => {
            markNoteDeleted(id);
            closeConfirmModal();
            window.navigateTo("page-list");
            alert("已移至回收站 🗑️");
          };
        });
        break;

      case "export-pdf":
        call(exportToPDF);
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

      case "change-category":
        call(changeCategory);
        break;

      case "set-category":
        call(setCategory, el.dataset.category);
        break;

      case "set-category-from-input":
        call(setCategory, safeEl("new-cat-input")?.value ?? "");
        break;

      case "open-note":
        call(() => window.loadNoteDetails(el.dataset.noteId));
        break;

      case "delete-note":
        e.stopPropagation();
        openConfirmModal();
        safeEl("btn-real-delete").onclick = () => {
          markNoteDeleted(el.dataset.noteId);
          renderNotesList();
          closeConfirmModal();
        };
        break;

      case "trash-restore":
        call(restoreNote, el.dataset.noteId);
        break;

      case "trash-permadelete":
        call(permanentDeleteNote, el.dataset.noteId);
        break;

      case "trash-clear-all":
        call(permanentClearAll);
        break;

      case "modal-close":
        call(closeModal);
        break;

      case "confirm-cancel":
        call(closeConfirmModal);
        break;

      default:
        break;
    }
  });

  // keyboard accessibility: Enter triggers click for buttons with role=button/tabindex
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const el = e.target.closest("[data-page], [data-filter], [data-action], [data-list-view], [data-content-view]");
    if (el) el.click();
  });

  // category dropdown change
  document.addEventListener("change", (e) => {
    const sel = e.target.closest("#category-filter-container select");
    if (!sel) return;
    currentFilterCategory = sel.value;
    renderNotesList();
  });

  // backdrop close
  const confirmModal = safeEl("confirm-modal");
  if (confirmModal) {
    confirmModal.addEventListener("click", (e) => {
      if (e.target === confirmModal) closeConfirmModal();
    });
  }

  const aiModal = safeEl("ai-modal");
  if (aiModal) {
    aiModal.addEventListener("click", (e) => {
      if (e.target === aiModal) closeModal();
    });
  }
})();

/**
 * =========================================================
 * 9) Boot（初始化）
 * =========================================================
 */

window.onload = () => {
  initRecognition();

  const timeEl = safeEl("status-time");
  if (timeEl) {
    timeEl.innerText = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  safeEl("search-input")?.addEventListener("input", debounce(renderNotesList, 150));

  const savedData = localStorage.getItem("temp_transcript");
  if (savedData && savedData.length > 0) {
    if (confirm("偵測到上次有未完成的錄音，總裁要為您恢復並整理成筆記嗎？")) {
      fullTranscript = savedData;
      lastInterim = "";
      window.navigateTo("page-loading");
      stopRecording();
      return;
    } else {
      localStorage.removeItem("temp_transcript");
    }
  }

  window.navigateTo("page-home");
};