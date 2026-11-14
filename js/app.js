"use strict";

const SUPABASE_URL = "https://tdekbojbfnttitllfltl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_GnRVaCZsV43UDnJHNon9ng_GSvUe6YT";
const WEBSITE_URL = "https://miinquaan.github.io/10diemcungquiz/";

const BLOCKS = ["10", "11", "12"];
const CLASSES_PER_BLOCK = 12;
const SUBJECTS = [
  { id: "english", name: "Tiếng Anh", icon: "Aa", ready: true },
  { id: "biology", name: "Sinh", icon: "🧬", ready: false },
  { id: "informatics", name: "Tin", icon: "⌨", ready: false },
  { id: "history", name: "Sử", icon: "⌛", ready: false },
  { id: "physics", name: "Lý", icon: "⚛", ready: false },
  { id: "chemistry", name: "Hóa", icon: "⚗", ready: false },
  { id: "economics-law", name: "KT-PL", icon: "⚖", ready: false }
];

let db = null;
let currentUser = null;
let selectedBlock = "";
let selectedGrade = "";
let selectedSubject = "";
let scannedVocabulary = [];
let scannedDocumentTitle = "";
let activeQuiz = null;
let activeQuestions = [];
let questionIndex = 0;
let correctAnswers = 0;
let startedAt = 0;
let timerInterval = null;
let answeredCurrent = false;
let previewMode = false;

function showPage(pageId) {
  const target = document.getElementById(pageId);
  if (!target) return;
  if (pageId !== "play") stopTimer();

  document.querySelectorAll(".page").forEach(page => {
    page.hidden = page.id !== pageId;
  });

  if (pageId === "home") renderBlocks();
  if (pageId === "classes") renderClasses();
  if (pageId === "subjects") renderSubjects();
  if (pageId === "library") loadQuizzes();
  if (pageId === "create") renderCreateForm();
  if (pageId === "myQuizzes") loadMyQuizzes();
}

function renderBlocks() {
  const area = document.getElementById("blockList");
  area.replaceChildren();

  BLOCKS.forEach(block => {
    const button = makeButton(`Khối ${block}`, () => {
      selectedBlock = block;
      selectedGrade = "";
      selectedSubject = "";
      showPage("classes");
    });
    button.className = "selection-card";
    area.appendChild(button);
  });
}

function renderClasses() {
  if (!selectedBlock) {
    showPage("home");
    return;
  }

  document.getElementById("classHeading").textContent =
    `Chọn lớp khối ${selectedBlock}`;

  const area = document.getElementById("classList");
  area.replaceChildren();

  Array.from({ length: CLASSES_PER_BLOCK }, (_value, index) =>
    `${selectedBlock}A${index + 1}`
  ).forEach(className => {
    const button = makeButton(className, () => {
      selectedGrade = className;
      selectedSubject = "";
      showPage("subjects");
    });
    button.className = "selection-card";
    area.appendChild(button);
  });
}

function renderSubjects() {
  if (!selectedGrade) {
    showPage("classes");
    return;
  }

  document.getElementById("subjectHeading").textContent =
    `Lớp ${selectedGrade}: chọn môn học`;
  document.getElementById("subjectIntro").textContent =
    "Tiếng Anh đã hỗ trợ tạo quiz từ tệp đề cương Word. Các môn khác sẽ mở khi có mẫu đề cương tương ứng.";

  const area = document.getElementById("subjectList");
  area.replaceChildren();

  SUBJECTS.forEach(subject => {
    const button = makeButton(`${subject.icon}\n${subject.name}`, () => {
      if (!subject.ready) return;
      selectedSubject = subject.id;
      showPage("library");
    });

    button.className = "selection-card subject-card";
    button.disabled = !subject.ready;
    if (!subject.ready) {
      button.title = "Đang xây dựng mẫu đề cương cho môn này";
    }

    area.appendChild(button);
  });
}

function openCreate() {
  if (!selectedGrade || !selectedSubject) {
    alert("Hãy chọn lớp và môn học trước khi tạo quiz.");
    showPage("home");
    return;
  }

  showPage("create");
}

function connectSupabase() {
  if (!window.supabase) return false;

  db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  return true;
}

async function checkUser() {
  if (!db) return;
  const { data } = await db.auth.getUser();
  currentUser = data?.user || null;
  updateLoginButton();
}

function updateLoginButton() {
  const button = document.getElementById("loginBtn");
  button.textContent = currentUser ? "Đăng xuất" : "Đăng nhập Google";
  button.title = currentUser?.email || "";
}

async function loginGoogle() {
  if (!db) {
    alert("Không thể kết nối dịch vụ đăng nhập.");
    return;
  }

  if (currentUser) {
    await db.auth.signOut();
    currentUser = null;
    updateLoginButton();
    return;
  }

  const { error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: WEBSITE_URL }
  });

  if (error) alert(`Không thể đăng nhập: ${error.message}`);
}

function makeButton(text, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.addEventListener("click", action);
  return button;
}

function shuffle(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function formatDuration(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function subjectName() {
  return SUBJECTS.find(subject => subject.id === selectedSubject)?.name ||
    "Môn học";
}

async function loadQuizzes() {
  const heading = document.getElementById("libraryHeading");
  const intro = document.getElementById("libraryIntro");
  const area = document.getElementById("quizList");

  heading.textContent = `Kho quiz ${subjectName()} - Lớp ${selectedGrade}`;
  intro.textContent = "Chọn một quiz để bắt đầu làm bài.";
  area.textContent = "Đang tải danh sách quiz...";

  if (!db) {
    area.textContent = "Chưa kết nối được kho quiz.";
    return;
  }

  try {
    const { data, error } = await db
      .from("quizzes")
      .select("id,title,description,question_count,question_types")
      .eq("visibility", "public")
      .eq("status", "published")
      .eq("subject", selectedSubject)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const gradeMark = `[Lớp ${selectedGrade}]`;
    const quizzes = (data || []).filter(quiz =>
      !quiz.description?.startsWith("[Lớp") ||
      quiz.description.startsWith(gradeMark)
    );

    area.replaceChildren();

    if (!quizzes.length) {
      area.textContent = "Chưa có quiz công khai cho lớp và môn này.";
      return;
    }

    quizzes.forEach(quiz => {
      const card = document.createElement("article");
      card.className = "quiz-card";

      const title = document.createElement("h3");
      title.textContent = quiz.title;

      const description = document.createElement("p");
      description.textContent = (quiz.description || "")
        .replace(/^\[Lớp \d+\]\s*/, "");

      const count = document.createElement("p");
      count.textContent = `${quiz.question_count} câu hỏi`;

      card.append(
        title,
        description,
        count,
        makeButton("Bắt đầu làm quiz", () => startQuiz(quiz.id))
      );

      area.appendChild(card);
    });
  } catch (error) {
    area.textContent = `Không tải được quiz: ${error.message}`;
  }
}

function renderCreateForm() {
  const area = document.getElementById("createQuizForm");

  document.getElementById("createContext").textContent =
    `Lớp ${selectedGrade} • ${subjectName()} • Tải tệp .docx có bảng từ vựng theo mẫu.`;

  area.innerHTML = `
    <form id="newQuizForm" class="quiz-form">
      <label for="newQuizTitle">Tên quiz</label>
      <input id="newQuizTitle" maxlength="150" required
        placeholder="Ví dụ: Từ vựng Unit 4 - Test 1">

      <label for="outlineFile">Tệp đề cương Word</label>
      <input id="outlineFile" type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        required>
      <p class="form-help">Mẫu Tiếng Anh cần bảng có các cột: Keyword / Collocation, Định nghĩa tiếng Việt, IPA, Ví dụ nguyên văn trong bài.</p>
      <div id="scanSummary" class="scan-summary" hidden></div>

      <fieldset>
        <legend>Loại quiz</legend>
        <label><input type="checkbox" name="questionType" value="en_vi" checked> Anh - Việt</label>
        <label><input type="checkbox" name="questionType" value="vi_en"> Việt - Anh</label>
        <label><input type="checkbox" name="questionType" value="cloze"> Vận dụng: điền từ vào ví dụ</label>
      </fieldset>

      <label for="newQuizCount">Số lượng câu hỏi</label>
      <input id="newQuizCount" type="number" min="4" value="10" disabled required>
      <p id="countHint" class="form-help">Tải tệp để xác định số câu tối đa.</p>

      <label for="newQuizVisibility">Chia sẻ</label>
      <select id="newQuizVisibility">
        <option value="private">Riêng tư</option>
        <option value="public">Công khai (chờ duyệt)</option>
      </select>

      <div class="form-actions">
        <button type="button" id="previewQuizBtn" disabled>Làm thử từ tệp</button>
        <button type="submit" id="saveQuizBtn" disabled>Lưu quiz</button>
      </div>
      <p id="quizSaveMessage" aria-live="polite"></p>
    </form>
  `;

  scannedVocabulary = [];
  scannedDocumentTitle = "";

  document.getElementById("outlineFile")
    .addEventListener("change", readOutlineFile);
  document.getElementById("newQuizForm")
    .addEventListener("submit", saveNewQuiz);
  document.getElementById("previewQuizBtn")
    .addEventListener("click", startPreviewQuiz);
}

function normalizeHeader(value) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(cell) {
  return Array.from(
    cell.getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
      "t"
    )
  ).map(node => node.textContent)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function directChildren(element, name) {
  return Array.from(element.childNodes).filter(node =>
    node.nodeType === 1 && node.localName === name
  );
}

async function parseVocabularyDocx(file) {
  if (!window.JSZip) {
    throw new Error(
      "Không tải được bộ đọc tệp Word. Hãy kiểm tra kết nối mạng rồi thử lại."
    );
  }

  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const documentFile = zip.file("word/document.xml");

  if (!documentFile) {
    throw new Error("Tệp Word không có nội dung hợp lệ.");
  }

  const xml = new DOMParser().parseFromString(
    await documentFile.async("text"),
    "application/xml"
  );

  if (xml.querySelector("parsererror")) {
    throw new Error("Không thể đọc nội dung tệp Word.");
  }

  const namespace =
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

  const title = Array.from(xml.getElementsByTagNameNS(namespace, "p"))
    .map(paragraph => cellText(paragraph))
    .find(text => text) || file.name.replace(/\.docx$/i, "");

  const tables = Array.from(xml.getElementsByTagNameNS(namespace, "tbl"));

  for (const table of tables) {
    const rows = directChildren(table, "tr")
      .map(row => directChildren(row, "tc").map(cellText));

    if (rows.length < 2) continue;

    const headers = rows[0].map(normalizeHeader);
    const keywordIndex = headers.findIndex(header =>
      header.includes("keyword") || header.includes("collocation")
    );
    const definitionIndex = headers.findIndex(header =>
      header.includes("dinh nghia") ||
      header.includes("nghia tieng viet")
    );

    if (keywordIndex < 0 || definitionIndex < 0) continue;

    const ipaIndex = headers.findIndex(header =>
      header === "ipa" || header.includes("phien am")
    );
    const exampleIndex = headers.findIndex(header =>
      header.includes("vi du")
    );

    const words = rows.slice(1).map(cells => ({
      english: (cells[keywordIndex] || "").trim(),
      vietnamese: (cells[definitionIndex] || "").trim(),
      ipa: ipaIndex >= 0 ? (cells[ipaIndex] || "").trim() : "",
      example: exampleIndex >= 0 ? (cells[exampleIndex] || "").trim() : ""
    })).filter(word => word.english && word.vietnamese);

    if (words.length) return { title, words };
  }

  throw new Error(
    "Không tìm thấy bảng từ vựng đúng mẫu. Tệp cần có cột Keyword / Collocation và Định nghĩa tiếng Việt."
  );
}

async function readOutlineFile(event) {
  const message = document.getElementById("quizSaveMessage");
  const summary = document.getElementById("scanSummary");
  const count = document.getElementById("newQuizCount");
  const preview = document.getElementById("previewQuizBtn");
  const save = document.getElementById("saveQuizBtn");
  const file = event.target.files?.[0];

  scannedVocabulary = [];
  preview.disabled = true;
  save.disabled = true;
  count.disabled = true;
  summary.hidden = true;

  if (!file) return;

  if (!/\.docx$/i.test(file.name)) {
    message.textContent = "Chỉ nhận tệp Word định dạng .docx.";
    return;
  }

  message.textContent = "Đang quét đề cương...";

  try {
    const parsed = await parseVocabularyDocx(file);

    if (parsed.words.length < 4) {
      throw new Error("Cần ít nhất 4 từ vựng để tạo câu hỏi trắc nghiệm.");
    }

    scannedVocabulary = parsed.words;
    scannedDocumentTitle = parsed.title;

    const titleInput = document.getElementById("newQuizTitle");
    if (!titleInput.value.trim()) titleInput.value = parsed.title;

    count.disabled = false;
    count.min = "4";
    count.max = String(parsed.words.length);
    count.value = String(Math.min(10, parsed.words.length));

    document.getElementById("countHint").textContent =
      `Bạn có thể chọn từ 4 đến ${parsed.words.length} câu hỏi.`;

    summary.innerHTML =
      `<strong>Đã quét ${parsed.words.length} từ vựng.</strong><br>` +
      `Ví dụ: ${escapeHtml(parsed.words[0].english)} — ${escapeHtml(parsed.words[0].vietnamese)}`;

    summary.hidden = false;
    preview.disabled = false;
    save.disabled = false;
    message.textContent = "";
  } catch (error) {
    message.textContent = error.message;
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[char]);
}

function selectedQuestionTypes() {
  return Array.from(
    document.querySelectorAll('input[name="questionType"]:checked')
  ).map(input => input.value);
}

function validateCreation() {
  const title = document.getElementById("newQuizTitle").value.trim();
  const count = Number(document.getElementById("newQuizCount").value);
  const types = selectedQuestionTypes();

  if (!title) throw new Error("Hãy nhập tên quiz.");
  if (!scannedVocabulary.length) throw new Error("Hãy tải tệp đề cương trước.");
  if (!types.length) throw new Error("Hãy chọn ít nhất một loại quiz.");

  if (!Number.isInteger(count) || count < 4 ||
      count > scannedVocabulary.length) {
    throw new Error(`Số câu phải từ 4 đến ${scannedVocabulary.length}.`);
  }

  if (types.includes("cloze") &&
      scannedVocabulary.some(word => !word.example)) {
    throw new Error(
      "Dạng vận dụng cần câu ví dụ cho mọi từ được quét."
    );
  }

  const english = new Set(
    scannedVocabulary.map(word => word.english.toLowerCase())
  ).size;
  const vietnamese = new Set(
    scannedVocabulary.map(word => word.vietnamese.toLowerCase())
  ).size;

  if ((types.includes("vi_en") || types.includes("cloze")) &&
      english < 4) {
    throw new Error("Cần ít nhất 4 từ tiếng Anh khác nhau.");
  }

  if (types.includes("en_vi") && vietnamese < 4) {
    throw new Error("Cần ít nhất 4 nghĩa tiếng Việt khác nhau.");
  }

  return { title, count, types };
}

function startPreviewQuiz() {
  try {
    const { title, count, types } = validateCreation();
    previewMode = true;
    activeQuiz = {
      id: null,
      title: `${title} (bản thử)`,
      question_count: count,
      question_types: types
    };
    activeQuestions = makeQuestions(scannedVocabulary, activeQuiz);
    beginQuiz();
  } catch (error) {
    document.getElementById("quizSaveMessage").textContent = error.message;
  }
}

async function saveNewQuiz(event) {
  event.preventDefault();
  const message = document.getElementById("quizSaveMessage");
  const button = document.getElementById("saveQuizBtn");

  try {
    const { title, count, types } = validateCreation();

    if (!db || !currentUser) {
      throw new Error("Hãy đăng nhập Google trước khi lưu quiz.");
    }

    button.disabled = true;
    message.textContent = "Đang lưu quiz...";

    const visibility = document.getElementById("newQuizVisibility").value;
    const { data: quiz, error: quizError } = await db
      .from("quizzes")
      .insert({
        owner_id: currentUser.id,
        title,
        description: `[Lớp ${selectedGrade}] ${scannedDocumentTitle}`,
        subject: selectedSubject,
        visibility,
        status: visibility === "public" ? "pending" : "published",
        question_count: count,
        question_types: types
      })
      .select("id")
      .single();

    if (quizError) throw quizError;

    const rows = scannedVocabulary.map(word => ({
      quiz_id: quiz.id,
      english: word.english,
      vietnamese: word.vietnamese,
      example: word.example
    }));

    const { error: wordsError } = await db
      .from("vocabulary")
      .insert(rows);

    if (wordsError) throw wordsError;

    message.textContent = visibility === "public"
      ? "Đã tạo quiz và đang chờ duyệt."
      : "Đã lưu quiz riêng tư.";
  } catch (error) {
    message.textContent = `Không thể lưu quiz: ${error.message}`;
  } finally {
    button.disabled = !scannedVocabulary.length;
  }
}

function makeQuestions(words, quiz) {
  const available = words.filter(word =>
    word.english?.trim() && word.vietnamese?.trim()
  );

  if (available.length < 4) {
    throw new Error("Quiz cần ít nhất 4 mục hợp lệ.");
  }

  const types = (quiz.question_types || ["en_vi"])
    .filter(type => ["en_vi", "vi_en", "cloze"].includes(type));

  const chosen = shuffle(available)
    .slice(0, Math.min(quiz.question_count, available.length));

  return chosen.map((word, index) => {
    let type = types[index % types.length];
    let prompt;
    let answer;
    let pool;

    if (type === "cloze") {
      const position = word.example.toLowerCase()
        .indexOf(word.english.toLowerCase());

      if (position >= 0) {
        prompt =
          word.example.slice(0, position) +
          "_____" +
          word.example.slice(position + word.english.length);
        answer = word.english;
        pool = available.map(item => item.english);
      } else {
        type = "en_vi";
      }
    }

    if (type === "en_vi") {
      prompt = word.english;
      answer = word.vietnamese;
      pool = available.map(item => item.vietnamese);
    } else if (type === "vi_en") {
      prompt = word.vietnamese;
      answer = word.english;
      pool = available.map(item => item.english);
    }

    const distractors = shuffle([
      ...new Set(pool.filter(item => item !== answer))
    ]).slice(0, 3);

    if (distractors.length < 3) {
      throw new Error("Không đủ đáp án khác nhau để tạo câu hỏi.");
    }

    return {
      type,
      prompt,
      answer,
      options: shuffle([answer, ...distractors])
    };
  });
}

async function startQuiz(quizId) {
  showPage("play");
  document.getElementById("questionArea").textContent = "Đang tải câu hỏi...";

  try {
    const { data: quiz, error: quizError } = await db
      .from("quizzes")
      .select(
        "id,title,question_count,question_types,visibility,status,owner_id"
      )
      .eq("id", quizId)
      .single();

    if (quizError) throw quizError;

    const isPublic =
      quiz.visibility === "public" && quiz.status === "published";

    if (!isPublic && currentUser?.id !== quiz.owner_id) {
      throw new Error("Bạn không có quyền truy cập quiz này.");
    }

    const { data: words, error: wordsError } = await db
      .from("vocabulary")
      .select("english,vietnamese,example")
      .eq("quiz_id", quizId);

    if (wordsError) throw wordsError;

    previewMode = false;
    activeQuiz = quiz;
    activeQuestions = makeQuestions(words || [], quiz);
    beginQuiz();
  } catch (error) {
    document.getElementById("questionArea").textContent =
      `Không mở được quiz: ${error.message}`;
  }
}

function beginQuiz() {
  showPage("play");
  questionIndex = 0;
  correctAnswers = 0;
  startedAt = Date.now();

  document.getElementById("quizTitle").textContent = activeQuiz.title;
  document.getElementById("timer").textContent = "00:00";

  stopTimer();
  timerInterval = setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    document.getElementById("timer").textContent = formatDuration(seconds);
  }, 1000);

  renderQuestion();
}

function renderQuestion() {
  const question = activeQuestions[questionIndex];
  const area = document.getElementById("questionArea");
  const feedback = document.getElementById("answerFeedback");
  const next = document.getElementById("nextBtn");

  area.replaceChildren();
  feedback.textContent = "";
  next.hidden = true;
  answeredCurrent = false;

  const heading = document.createElement("h3");
  heading.textContent = `Câu ${questionIndex + 1}/${activeQuestions.length}`;

  const guide = document.createElement("p");
  guide.textContent = question.type === "en_vi"
    ? "Chọn nghĩa tiếng Việt:"
    : question.type === "vi_en"
      ? "Chọn từ tiếng Anh:"
      : "Chọn từ phù hợp để hoàn thành câu:";

  const prompt = document.createElement("h3");
  prompt.textContent = question.prompt;
  area.append(heading, guide, prompt);

  question.options.forEach(option => {
    const button = makeButton(
      option,
      () => answerQuestion(option, button)
    );
    button.className = "answer-option";
    area.appendChild(button);
  });
}

function answerQuestion(option, button) {
  if (answeredCurrent) return;
  answeredCurrent = true;

  const question = activeQuestions[questionIndex];
  const correct = option === question.answer;

  if (correct) correctAnswers++;

  document.getElementById("answerFeedback").textContent = correct
    ? "Chính xác!"
    : `Chưa đúng. Đáp án: ${question.answer}`;

  document.querySelectorAll(".answer-option").forEach(answer => {
    answer.disabled = true;
    if (answer.textContent === question.answer) {
      answer.classList.add("correct");
    }
  });

  if (!correct) button.classList.add("incorrect");

  const next = document.getElementById("nextBtn");
  next.textContent = questionIndex === activeQuestions.length - 1
    ? "Xem kết quả"
    : "Câu tiếp theo";
  next.hidden = false;
}

async function nextQuestion() {
  if (!answeredCurrent) return;

  if (questionIndex < activeQuestions.length - 1) {
    questionIndex++;
    renderQuestion();
  } else {
    await finishQuiz();
  }
}

async function finishQuiz() {
  stopTimer();

  const seconds = Math.max(
    1,
    Math.floor((Date.now() - startedAt) / 1000)
  );

  showPage("results");

  document.getElementById("resultContent").textContent =
    `${activeQuiz.title}: ${correctAnswers}/${activeQuestions.length} câu đúng. Thời gian: ${formatDuration(seconds)}.`;

  const leaderboard = document.getElementById("leaderboard");
  const wrap = document.getElementById("leaderboardWrap");

  if (previewMode) {
    wrap.hidden = true;
    return;
  }

  wrap.hidden = false;

  if (!currentUser) {
    leaderboard.textContent = "Đăng nhập để lưu kết quả.";
    return;
  }

  try {
    const { error } = await db.from("quiz_attempts").insert({
      quiz_id: activeQuiz.id,
      user_id: currentUser.id,
      score: correctAnswers,
      correct_count: correctAnswers,
      wrong_count: activeQuestions.length - correctAnswers,
      total_questions: activeQuestions.length,
      duration_seconds: seconds
    });

    if (error) throw error;
    leaderboard.textContent = "Đã lưu kết quả của bạn.";
  } catch (error) {
    leaderboard.textContent = `Chưa lưu được kết quả: ${error.message}`;
  }
}

async function loadMyQuizzes() {
  const area = document.getElementById("myQuizList");

  if (!currentUser) {
    area.textContent = "Hãy đăng nhập Google để xem các quiz đã tạo.";
    return;
  }

  area.textContent = "Đang tải quiz...";

  try {
    const { data, error } = await db
      .from("quizzes")
      .select("id,title,description,visibility,status,question_count")
      .eq("owner_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    area.replaceChildren();

    if (!data?.length) {
      area.textContent = "Bạn chưa tạo quiz nào.";
      return;
    }

    data.forEach(quiz => {
      const card = document.createElement("article");
      card.className = "quiz-card";
      card.innerHTML =
        `<h3>${escapeHtml(quiz.title)}</h3>` +
        `<p>${escapeHtml(quiz.description || "")}</p>` +
        `<p>${quiz.question_count} câu • ${quiz.visibility === "public"
          ? quiz.status === "pending" ? "Chờ duyệt" : "Công khai"
          : "Riêng tư"}</p>`;
      card.appendChild(makeButton("Làm thử", () => startQuiz(quiz.id)));
      area.appendChild(card);
    });
  } catch (error) {
    area.textContent = `Không tải được quiz: ${error.message}`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (connectSupabase()) {
    db.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      updateLoginButton();
    });
    await checkUser();
  }

  document.getElementById("nextBtn").addEventListener("click", nextQuestion);
  showPage("home");
});
