"use strict";

const SUPABASE_URL = "https://tdekbojbfnttitllfltl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_GnRVaCZsV43UDnJHNon9ng_GSvUe6YT";
const WEBSITE_URL = "https://miinquaan.github.io/10diemcungquiz/";
const BIOLOGY_IMAGE_BUCKET = "biology-question-images";

const BLOCKS = ["10", "11", "12"];
const CLASSES_PER_BLOCK = 12;
const SUBJECTS = [
  { id: "english", name: "Tiếng Anh", icon: "Aa", ready: true },
  { id: "biology", name: "Sinh", icon: "🧬", ready: true },
  { id: "informatics", name: "Tin", icon: "⌨", ready: true },
  { id: "history", name: "Sử", icon: "⌛", ready: true },
  { id: "geography", name: "Địa lí", icon: "🌍", ready: true },
  { id: "physics", name: "Lý", icon: "⚛", ready: true },
  { id: "chemistry", name: "Hóa", icon: "⚗", ready: true },
  { id: "economics-law", name: "KT-PL", icon: "⚖", ready: true }
];

const SUBJECT_DESIGN = {
  physics: ["#173B75", "#347FC4", "#EEF4FC", "#F2B544", "◉"],
  chemistry: ["#1769AA", "#36A9C9", "#EDF7FC", "#F2B544", "⬡"],
  biology: ["#287A3D", "#65A84A", "#F0F7EC", "#E6A23C", "✿"],
  informatics: ["#E4AC20", "#305D86", "#FFF8E5", "#207C91", "⌘"],
  geography: ["#087DB5", "#31A3C5", "#EDF8FC", "#5C9C55", "◎"],
  history: ["#AE3038", "#C78746", "#FCF2EB", "#8A623E", "◷"],
  "economics-law": ["#714595", "#9A78B5", "#F5EFFA", "#D5AB46", "⚖"],
  english: ["#254F91", "#5686C1", "#EEF4FC", "#F2B544", "Aa"]
};
let selectedDirection = "computer";

function applySubjectDesign(element, id) {
  const colors = SUBJECT_DESIGN[id] || SUBJECT_DESIGN.english;
  ["--subject-main", "--subject-secondary", "--subject-light", "--subject-accent"]
    .forEach((name, index) => element.style.setProperty(name, colors[index]));
  element.classList.toggle("subject-yellow", id === "informatics");
}

function sectionParts(title) {
  const withoutDirection = title.replace(/\s*\(Định hướng (?:Khoa học máy tính|Tin học ứng dụng)\)\s*$/, "");
  const match = withoutDirection.match(/^(Chương|Chủ đề|Phần)\s+([IVXLCDM]+)\s*:\s*(.+)$/iu);
  return match ? { label: `${match[1]} ${match[2]}`, title: match[3] } : { label: "", title: withoutDirection };
}

function sectionSymbol(title, subject) {
  const value = title.toLocaleLowerCase("vi");
  const symbols = [[/điện|mạch|pin/, "⊕"], [/sóng|dao động/, "∿"], [/di truyền|dna|nhiễm sắc/, "⌁"], [/tế bào/, "◉"], [/sinh thái|sinh vật|virus/, "✿"], [/bản đồ|vùng|địa lí/, "◎"], [/dữ liệu|cơ sở/, "▦"], [/lập trình|máy tính/, "⌘"], [/pháp luật|quyền|hiến pháp/, "⚖"], [/kinh tế|thị trường|tài chính/, "▥"], [/văn minh|lịch sử|cách mạng/, "◷"], [/nguyên tử|phân tử|liên kết/, "⬡"]];
  return symbols.find(([pattern]) => pattern.test(value))?.[1] || (SUBJECT_DESIGN[subject] || SUBJECT_DESIGN.english)[4];
}

let db = null;
let currentUser = null;
let currentProfile = null;
let isTeacher = false;
let isQuizAdmin = false;
let activeAssignment = null;
let teacherResults = [];
let creatingQuiz = false;
let selectedBlock = "";
let selectedGrade = "";
let selectedSubject = "";
let selectedSectionId = "";
let selectedSectionTitle = "";
let catalogClasses = [];
let catalogSubjects = [];
let scannedVocabulary = [];
let scannedDocumentTitle = "";
let scannedBiologyLessons = [];
let selectedBiologyLesson = null;
let activeQuiz = null;
let activeQuestions = [];
let questionResponses = [];
let latestReview = [];
let questionIndex = 0;
let correctAnswers = 0;
let skippedQuestions = 0;
let startedAt = 0;
let timerInterval = null;
let answeredCurrent = false;
let previewMode = false;
let metafileRendererPromise = null;

function showPage(pageId) {
  if (pageId === "home" && currentUser && selectedGrade) pageId = "subjects";
  if (currentUser && !selectedGrade && !["profile", "home"].includes(pageId)) pageId = "profile";
  const target = document.getElementById(pageId);
  if (!target) return;
  if (pageId !== "play") stopTimer();

  document.querySelectorAll(".page").forEach(page => {
    page.hidden = page.id !== pageId;
  });
  document.querySelectorAll(".admin-nav-item").forEach(button => {
    const active = button.dataset.adminPage === pageId ||
      (button.dataset.adminPage === "teacher" && pageId === "teacherResults");
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.body.classList.remove("admin-menu-open");
  const menuToggle = document.getElementById("adminMenuToggle");
  if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");

  if (pageId === "profile") renderProfile();
  if (pageId === "classes") renderClasses();
  if (pageId === "subjects") renderSubjects();
  if (pageId === "sections") renderSections();
  if (pageId === "library") loadQuizzes();
  if (pageId === "create") renderCreateForm();
  if (pageId === "myQuizzes") loadMyQuizzes();
  if (pageId === "history") loadHistory();
  if (pageId === "aiAdmin") loadAiAdminStats();
  if (pageId === "teacher") renderTeacher();
  if (pageId === "homework") renderHomework();
}

async function loadCatalog() {
  if (!db) return;

  try {
    const [classesResult, subjectsResult] = await Promise.all([
      db.from("classes").select("code,block,name").eq("is_active", true)
        .order("block").order("class_number"),
      db.from("subjects").select("code,name").eq("is_active", true)
        .order("name")
    ]);

    if (classesResult.error) throw classesResult.error;
    if (subjectsResult.error) throw subjectsResult.error;

    catalogClasses = classesResult.data || [];
    catalogSubjects = subjectsResult.data || [];
  } catch (error) {
    console.warn("Không tải được catalog lớp và môn:", error.message);
  }
}

async function renderBlocks() {
  await loadCatalog();
  const area = document.getElementById("blockList");
  area.replaceChildren();

  const blocks = catalogClasses.length
    ? [...new Set(catalogClasses.map(item => String(item.block)))]
    : BLOCKS;

  blocks.forEach(block => {
    const button = makeButton(`Khối ${block}`, () => {
      selectedBlock = block;
      selectedGrade = "";
      selectedSubject = "";
      selectedSectionId = "";
      selectedSectionTitle = "";
      showPage("classes");
    });
    button.className = "selection-card";
    area.appendChild(button);
  });
}

async function renderClasses() {
  if (!selectedBlock) {
    showPage("home");
    return;
  }

  await loadCatalog();

  document.getElementById("classHeading").textContent =
    `Chọn lớp khối ${selectedBlock}`;

  const area = document.getElementById("classList");
  area.replaceChildren();

  const classes = catalogClasses.length
    ? catalogClasses.filter(item => String(item.block) === selectedBlock)
    : Array.from({ length: CLASSES_PER_BLOCK }, (_value, index) => ({
      code: `${selectedBlock}A${index + 1}`
    }));

  classes.forEach(classItem => {
    const className = classItem.code;
    const button = makeButton(className, () => {
      selectedGrade = className;
      selectedSubject = "";
      selectedSectionId = "";
      selectedSectionTitle = "";
      showPage("subjects");
    });
    button.className = "selection-card";
    area.appendChild(button);
  });
}

async function renderSubjects() {
  if (!selectedGrade) {
    showPage(currentUser ? "profile" : "home");
    return;
  }

  await loadCatalog();

  document.getElementById("subjectHeading").textContent =
    `Lớp ${selectedGrade}: chọn môn học`;
  document.getElementById("subjectIntro").textContent =
    creatingQuiz ? "Chọn môn để tạo quiz." : "Chọn môn học để xem quiz.";

  const area = document.getElementById("subjectList");
  area.replaceChildren();

  const subjects = catalogSubjects.length
    ? catalogSubjects.map(subject => ({
      id: subject.code,
      name: subject.name,
      icon: SUBJECTS.find(item => item.id === subject.code)?.icon || "•",
      ready: true
    }))
    : SUBJECTS;

  subjects.forEach(subject => {
    const button = makeButton("", () => {
      selectedSubject = subject.id;
      selectedSectionId = "";
      selectedSectionTitle = "";
      showPage("sections");
    });

    button.className = "selection-card subject-card";
    applySubjectDesign(button, subject.id);
    const symbol = document.createElement("span");
    symbol.className = "subject-card-icon";
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = (SUBJECT_DESIGN[subject.id] || SUBJECT_DESIGN.english)[4];
    const name = document.createElement("span");
    name.textContent = subject.name;
    button.append(symbol, name);
    area.appendChild(button);
  });
}

async function renderSections() {
  if (!selectedGrade || !selectedSubject) {
    showPage(selectedGrade ? "subjects" : "classes");
    return;
  }

  const area = document.getElementById("sectionList");
  const heading = document.getElementById("sectionHeading");
  const intro = document.getElementById("sectionIntro");
  applySubjectDesign(document.getElementById("sections"), selectedSubject);
  document.getElementById("sectionClass").textContent = `Lớp ${selectedGrade}`;
  const blockSelector = document.getElementById("blockSelector");
  blockSelector.replaceChildren();
  BLOCKS.forEach(block => {
    const button = makeButton(`Khối ${block}`, () => {
      if (block !== selectedGrade.slice(0, 2)) showProfile();
    });
    button.setAttribute("aria-pressed", String(block === selectedGrade.slice(0, 2)));
    if (block === selectedGrade.slice(0, 2)) button.setAttribute("aria-current", "true");
    blockSelector.appendChild(button);
  });
  document.getElementById("subjectIllustration").textContent = (SUBJECT_DESIGN[selectedSubject] || SUBJECT_DESIGN.english)[4];
  heading.textContent = subjectName();
  intro.textContent = "Đang tải danh mục...";
  area.textContent = "Đang tải phần học...";

  if (!db) {
    area.textContent = "Chưa kết nối được danh mục phần học.";
    return;
  }

  try {
    const { data, error } = await db.from("course_sections")
      .select("id,title,sort_order")
      .eq("class_code", selectedGrade)
      .eq("subject", selectedSubject)
      .eq("is_active", true)
      .order("sort_order");

    if (error) throw error;
    area.replaceChildren();

    if (!data?.length) {
      area.textContent = "Chưa có phần học cho lớp và môn này.";
      return;
    }

    const selector = document.getElementById("directionSelector");
    const hasDirections = selectedSubject === "informatics" && data.some(item => /\(Định hướng /.test(item.title));
    selector.hidden = !hasDirections;
    selector.replaceChildren();
    const draw = () => {
      area.replaceChildren();
      const visible = data.filter(item => !/\(Định hướng /.test(item.title) ||
        (selectedDirection === "computer" ? item.title.includes("(Định hướng Khoa học máy tính)") : item.title.includes("(Định hướng Tin học ứng dụng)")));
      intro.textContent = `${visible.length} phần học • Chọn nội dung để tiếp tục`;
      if (hasDirections) {
        selector.replaceChildren();
        const note = document.createElement("p");
        note.className = "direction-note";
        note.textContent = "Kiến thức chung luôn được hiển thị. Chọn một định hướng:";
        selector.appendChild(note);
        [["computer", "Khoa học máy tính"], ["applied", "Tin học ứng dụng"]].forEach(([value, label]) => {
          const choice = makeButton(label, () => { selectedDirection = value; draw(); });
          choice.setAttribute("aria-pressed", String(selectedDirection === value));
          selector.appendChild(choice);
        });
      }
      visible.forEach(section => {
      const button = makeButton("", () => {
        selectedSectionId = section.id;
        selectedSectionTitle = section.title;
        if (creatingQuiz) {
          showPage("create");
        } else showPage("library");
      });
      button.className = "section-card";
      const parts = sectionParts(section.title);
      const icon = document.createElement("span");
      icon.className = "section-card-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = sectionSymbol(section.title, selectedSubject);
      const label = document.createElement("span");
      label.className = "section-card-label";
      label.textContent = parts.label;
      const name = document.createElement("span");
      name.className = "section-card-title";
      name.textContent = parts.title;
      const action = document.createElement("span");
      action.className = "section-card-action";
      action.textContent = "Xem nội dung →";
      button.append(icon, label, name, action);
      area.appendChild(button);
      });
    };
    draw();
  } catch (error) {
    area.textContent = `Không tải được phần học: ${error.message}`;
  }
}

function openCreate() {
  creatingQuiz = true;
  selectedSubject = "";
  selectedSectionId = "";
  showPage(currentUser ? (selectedGrade ? "subjects" : "profile") : "home");
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
  if (currentUser) {
    await loadUserProfile();
    const [teacher, admin] = await Promise.all([
      db.from("quiz_teachers").select("user_id").eq("user_id", currentUser.id).maybeSingle(),
      db.from("quiz_admins").select("user_id").eq("user_id", currentUser.id).maybeSingle()
    ]);
    isTeacher = Boolean(teacher.data);
    isQuizAdmin = Boolean(admin.data);
    document.getElementById("teacherNav").hidden = !isTeacher || isQuizAdmin;
    document.getElementById("teacherAdminNav").hidden = !isQuizAdmin;
    document.getElementById("aiAdminNav").hidden = !isQuizAdmin;
    document.getElementById("adminSidebar").hidden = !isQuizAdmin;
    document.getElementById("adminMenuToggle").hidden = !isQuizAdmin;
    document.getElementById("adminTeacherGroup").hidden = !isQuizAdmin || !isTeacher;
    document.body.classList.toggle("has-admin-sidebar", isQuizAdmin);
    document.getElementById("homeworkNav").hidden = false;
  }
  updateLoginButton();
}

async function loadUserProfile() {
  await loadCatalog();
  const { data, error } = await db.from("profiles")
    .select("display_name,class_name,setup_complete").eq("id", currentUser.id).maybeSingle();
  if (error) throw error;
  currentProfile = data;
  selectedGrade = data?.setup_complete && data.display_name?.trim() && catalogClasses.some(item => item.code === data?.class_name)
    ? data.class_name : "";
}

function showProfile() { showPage(currentUser ? "profile" : "home"); }

async function renderProfile() {
  await loadCatalog();
  document.getElementById("profileUserId").textContent = currentUser?.id || "";
  const select = document.getElementById("profileClass");
  select.replaceChildren(new Option("Chọn lớp", ""));
  catalogClasses.forEach(item => select.add(new Option(item.name || item.code, item.code)));
  select.value = selectedGrade;
  document.getElementById("displayName").value = currentProfile?.setup_complete
    ? (currentProfile.display_name || "") : "";
}

async function saveProfile(event) {
  event.preventDefault();
  const message = document.getElementById("profileMessage");
  const displayName = document.getElementById("displayName").value.trim();
  const className = document.getElementById("profileClass").value;
  if (!currentUser || !displayName || !catalogClasses.some(item => item.code === className)) {
    message.textContent = "Hãy nhập tên và chọn lớp hợp lệ.";
    return;
  }
  const { error } = await db.from("profiles").upsert({ id: currentUser.id, display_name: displayName, class_name: className, setup_complete: true });
  if (error) { message.textContent = `Không lưu được thông tin: ${error.message}`; return; }
  currentProfile = { display_name: displayName, class_name: className, setup_complete: true };
  selectedGrade = className;
  message.textContent = "";
  showPage("subjects");
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
    currentProfile = null;
    isTeacher = false;
    isQuizAdmin = false;
    ["teacherNav", "teacherAdminNav", "aiAdminNav", "homeworkNav", "adminSidebar", "adminMenuToggle", "adminTeacherGroup"].forEach(id => document.getElementById(id).hidden = true);
    document.body.classList.remove("has-admin-sidebar", "admin-menu-open");
    selectedGrade = "";
    creatingQuiz = false;
    updateLoginButton();
    showPage("home");
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

  heading.textContent = `Kho quiz ${subjectName()} - ${selectedGrade} - ${selectedSectionTitle}`;
  intro.textContent = "Quiz của lớp và quiz chung cùng khối được hiển thị riêng.";
  area.textContent = "Đang tải danh sách quiz...";

  if (!db) {
    area.textContent = "Chưa kết nối được kho quiz.";
    return;
  }

  try {
    const { data: sections, error: sectionError } = await db.from("course_sections")
      .select("id,class_code").eq("subject", selectedSubject).eq("title", selectedSectionTitle)
      .eq("is_active", true);
    if (sectionError) throw sectionError;
    const sameBlock = (sections || []).filter(item => item.class_code.startsWith(selectedGrade.slice(0, 2)));
    const sectionIds = sameBlock.map(item => item.id);
    const { data, error } = await db
      .from("quizzes")
      .select("id,title,description,question_count,question_types,class_code,share_scope")
      .eq("visibility", "public")
      .eq("status", "published")
      .eq("subject", selectedSubject)
      .in("section_id", sectionIds.length ? sectionIds : [selectedSectionId])
      .order("created_at", { ascending: false });

    if (error) throw error;

    const quizzes = (data || []).filter(quiz =>
      (quiz.class_code === selectedGrade && quiz.share_scope === "class") || quiz.share_scope === "shared");

    area.replaceChildren();

    if (!quizzes.length) {
      area.textContent = "Chưa có quiz công khai cho lớp và môn này.";
      return;
    }

    ["class", "shared"].forEach(scope => {
      const group = quizzes.filter(quiz => quiz.share_scope === scope);
      const groupHeading = document.createElement("h3");
      groupHeading.textContent = scope === "class" ? `Quiz lớp ${selectedGrade}` : "Quiz chung";
      area.appendChild(groupHeading);
      if (!group.length) {
        const empty = document.createElement("p");
        empty.textContent = "Chưa có quiz.";
        area.appendChild(empty);
      }
      group.forEach(quiz => {
      const card = document.createElement("article");
      card.className = "quiz-card";

      const title = document.createElement("h3");
      title.textContent = quiz.title;

      const description = document.createElement("p");
      description.textContent = quiz.description || "";

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
    });
  } catch (error) {
    area.textContent = `Không tải được quiz: ${error.message}`;
  }
}

function renderCreateForm() {
  if (selectedSubject === "biology") {
    renderBiologyCreateForm();
    return;
  }
  if (selectedSubject !== "english") {
    renderTheoryCreateForm();
    return;
  }

  const area = document.getElementById("createQuizForm");

  document.getElementById("createContext").textContent =
    `Lớp ${selectedGrade} • ${subjectName()} • ${selectedSectionTitle} • Tải tệp .docx có bảng từ vựng theo mẫu.`;

  area.innerHTML = `
    <form id="newQuizForm" class="quiz-form">
      <label for="newQuizTitle">Tên quiz</label>
      <input id="newQuizTitle" maxlength="150" required
        placeholder="Ví dụ: Từ vựng Unit 4 - Test 1">

      <label for="outlineFile">Tệp đề cương Word</label>
      <input id="outlineFile" type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        required>
      <p class="form-help">Nhận bảng có cột Từ vựng và Nghĩa tiếng Việt, hoặc Keyword / Collocation và Định nghĩa tiếng Việt. Loại từ và IPA là tùy chọn; dạng vận dụng cần thêm cột ví dụ.</p>
      <div id="vocabularyTestChoice" hidden>
        <label for="vocabularyTest">Chọn Test</label>
        <select id="vocabularyTest"></select>
      </div>
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
        <option value="class">Quiz của lớp</option>
        <option value="shared">Quiz chung</option>
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

let generatedTheoryQuestions = [];

function renderTheoryCreateForm() {
  const area = document.getElementById("createQuizForm");
  document.getElementById("createContext").textContent = `Lớp ${selectedGrade} • ${subjectName()} • ${selectedSectionTitle}`;
  area.innerHTML = `
    <form id="theoryForm" class="quiz-form">
      <label for="theoryTitle">Tên quiz</label><input id="theoryTitle" maxlength="150" required>
      <label for="theoryFile">Đề cương lý thuyết (.docx hoặc PDF có chữ)</label>
      <input id="theoryFile" type="file" accept=".docx,.pdf" required>
      <p class="form-help">Nội dung chữ sẽ được gửi tới Gemini để tạo câu hỏi. Không tải tài liệu chứa thông tin cá nhân; ảnh và PDF scan chưa được đọc.</p>
      <label for="theoryCount">Số câu hỏi</label><input id="theoryCount" type="number" min="1" max="20" value="10" required>
      <label><input id="theoryConsent" type="checkbox" required> Tôi đồng ý gửi nội dung đề cương tới Gemini.</label>
      <button type="button" id="theoryGenerate">Tạo câu hỏi</button>
      <p id="theoryMessage" aria-live="polite"></p>
      <div id="theoryQuestions"></div>
      <label for="theoryVisibility">Chia sẻ</label><select id="theoryVisibility"><option value="private">Riêng tư</option><option value="class">Quiz của lớp</option><option value="shared">Quiz chung</option></select>
      <button id="theorySave" type="submit" disabled>Lưu quiz</button>
    </form>`;
  generatedTheoryQuestions = [];
  document.getElementById("theoryGenerate").addEventListener("click", generateTheoryQuiz);
  document.getElementById("theoryForm").addEventListener("submit", saveTheoryQuiz);
  document.getElementById("theoryFile").addEventListener("change", () => {
    generatedTheoryQuestions = [];
    document.getElementById("theoryQuestions").replaceChildren();
    document.getElementById("theorySave").disabled = true;
    document.getElementById("theoryMessage").textContent = "";
  });
}

async function readTheoryText(file) {
  if (!file || file.size > 10 * 1024 * 1024) throw new Error("Chọn tệp .docx hoặc .pdf không quá 10 MB.");
  if (/\.docx$/i.test(file.name)) {
    if (!window.JSZip) throw new Error("Không tải được bộ đọc Word.");
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const source = zip.file("word/document.xml");
    if (!source) throw new Error("Tệp Word không hợp lệ.");
    const xml = new DOMParser().parseFromString(await source.async("text"), "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("Không đọc được tệp Word.");
    const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    return Array.from(xml.getElementsByTagNameNS(ns, "p")).map(cellText).filter(Boolean).join("\n");
  }
  if (/\.pdf$/i.test(file.name)) {
    if (!window.pdfjsLib) throw new Error("Không tải được bộ đọc PDF.");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str || "").join(" "));
    }
    return pages.join("\n");
  }
  throw new Error("Hãy chọn tệp .docx hoặc .pdf; tệp .doc cần lưu lại thành .docx.");
}

async function generateTheoryQuiz() {
  const message = document.getElementById("theoryMessage");
  const button = document.getElementById("theoryGenerate");
  const save = document.getElementById("theorySave");
  const file = document.getElementById("theoryFile").files?.[0];
  const count = Number(document.getElementById("theoryCount").value);
  if (!currentUser || !db) { message.textContent = "Hãy đăng nhập trước khi tạo câu hỏi."; return; }
  if (!document.getElementById("theoryConsent").checked) { message.textContent = "Hãy xác nhận đồng ý gửi nội dung tới Gemini."; return; }
  if (!Number.isInteger(count) || count < 1 || count > 20) { message.textContent = "Chọn từ 1 đến 20 câu."; return; }
  button.disabled = true; save.disabled = true; generatedTheoryQuestions = [];
  document.getElementById("theoryQuestions").replaceChildren();
  try {
    message.textContent = "Đang đọc đề cương...";
    const text = (await readTheoryText(file)).trim();
    if (text.length < 100) throw new Error("Không đủ chữ để tạo quiz. PDF ảnh cần chuyển sang PDF có chữ trước.");
    if (text.length > 40000) throw new Error("Đề cương quá dài. Hãy chia thành phần ngắn hơn (tối đa 40.000 ký tự).");
    message.textContent = "Đang tạo câu hỏi, vui lòng chờ...";
    const { data, error } = await db.functions.invoke("generate-theory-quiz", { body: { text, count, subject: subjectName(), section: selectedSectionTitle } });
    if (error) {
      let detail = "Không thể kết nối dịch vụ AI. Kiểm tra cấu hình hoặc hạn mức rồi thử lại.";
      try { const body = await error.context?.json(); if (body?.error) detail = body.error; } catch { /* network error */ }
      throw new Error(detail);
    }
    if (!Array.isArray(data?.questions) || !data.questions.length) throw new Error(data?.error || "AI chưa tạo được câu hỏi hợp lệ.");
    generatedTheoryQuestions = data.questions.filter(q => typeof q.prompt === "string" && Array.isArray(q.options) && q.options.length === 4 && q.options.every(o => typeof o === "string") && ["A", "B", "C", "D"].includes(q.answer));
    if (!generatedTheoryQuestions.length) throw new Error("AI trả về câu hỏi không hợp lệ. Hãy thử lại.");
    renderTheoryQuestions();
    save.disabled = false;
    message.textContent = `Đã tạo ${generatedTheoryQuestions.length} câu. Hãy kiểm tra và chỉnh sửa trước khi lưu.`;
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
}

function renderTheoryQuestions() {
  const area = document.getElementById("theoryQuestions");
  area.replaceChildren();
  generatedTheoryQuestions.forEach((question, index) => {
    const card = document.createElement("fieldset");
    const legend = document.createElement("legend"); legend.textContent = `Câu ${index + 1}`; card.appendChild(legend);
    const prompt = document.createElement("textarea"); prompt.value = question.prompt; prompt.required = true;
    prompt.setAttribute("aria-label", `Nội dung câu ${index + 1}`);
    prompt.addEventListener("input", () => { question.prompt = prompt.value; }); card.appendChild(prompt);
    question.options.forEach((option, i) => {
      const label = document.createElement("label"); label.textContent = `${"ABCD"[i]}. `;
      const input = document.createElement("input"); input.value = option; input.required = true;
      input.addEventListener("input", () => { question.options[i] = input.value; }); label.appendChild(input); card.appendChild(label);
    });
    const label = document.createElement("label"); label.textContent = "Đáp án đúng";
    const select = document.createElement("select");
    ["A", "B", "C", "D"].forEach(value => select.add(new Option(value, value)));
    select.value = question.answer;
    select.addEventListener("change", () => { question.answer = select.value; });
    label.appendChild(select); card.appendChild(label); area.appendChild(card);
  });
}

async function saveTheoryQuiz(event) {
  event.preventDefault();
  const message = document.getElementById("theoryMessage");
  const button = document.getElementById("theorySave");
  if (!currentUser || !generatedTheoryQuestions.length) { message.textContent = "Hãy đăng nhập và tạo câu hỏi trước."; return; }
  if (generatedTheoryQuestions.some(q => !q.prompt.trim() || q.options.length !== 4 || q.options.some(o => !o.trim()) || !["A","B","C","D"].includes(q.answer))) {
    message.textContent = "Hãy điền đủ câu hỏi, bốn đáp án và đáp án đúng."; return;
  }
  if (generatedTheoryQuestions.some(q => new Set(q.options.map(o => o.trim().toLocaleLowerCase("vi"))).size !== 4)) {
    message.textContent = "Mỗi câu phải có bốn lựa chọn khác nhau."; return;
  }
  const scope = document.getElementById("theoryVisibility").value;
  const visibility = scope === "private" ? "private" : "public";
  button.disabled = true;
  try {
    const { data: quiz, error } = await db.from("quizzes").insert({ owner_id: currentUser.id, title: document.getElementById("theoryTitle").value.trim(), description: selectedSectionTitle, subject: selectedSubject, class_code: selectedGrade, section_id: selectedSectionId, visibility, share_scope: scope === "shared" ? "shared" : "class", status: visibility === "private" ? "private" : "published", question_count: generatedTheoryQuestions.length, question_types: ["multiple_choice"] }).select("id").single();
    if (error) throw error;
    const rows = generatedTheoryQuestions.map((q, i) => ({ quiz_id: quiz.id, question_type: "multiple_choice", prompt: q.prompt.trim(), options: q.options.map((o, n) => ({ key: "ABCD"[n], text: o.trim() })), correct_answers: [q.answer], sort_order: i + 1 }));
    const { error: questionError } = await db.from("quiz_questions").insert(rows);
    if (questionError) throw new Error(`Đã tạo quiz nhưng chưa lưu được câu hỏi: ${questionError.message}. Hãy kiểm tra Quiz của tôi.`);
    message.textContent = "Đã lưu quiz.";
    generatedTheoryQuestions = [];
  } catch (error) { message.textContent = `Không thể lưu quiz: ${error.message}`; }
  finally { button.disabled = !generatedTheoryQuestions.length; }
}

function normalizeHeader(value) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function renderBiologyCreateForm() {
  const area = document.getElementById("createQuizForm");
  document.getElementById("createContext").textContent =
    `Lớp ${selectedGrade} • Sinh • ${selectedSectionTitle} • Mỗi quiz dùng toàn bộ câu hỏi của một bài.`;

  area.innerHTML = `
    <form id="biologyQuizForm" class="quiz-form">
      <button type="button" id="openTheoryGenerator">Tạo câu hỏi từ lý thuyết bằng AI</button>
      <label for="biologyQuizTitle">Tên quiz</label>
      <input id="biologyQuizTitle" maxlength="150" required
        placeholder="Ví dụ: Bài 4 - Sinh học 10">

      <label for="biologyOutlineFile">Tệp đề cương Sinh học</label>
      <input id="biologyOutlineFile" type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required>
      <p class="form-help">Nhận .docx và .pdf. Với Word, ảnh đi kèm từng câu được giữ lại trong quiz; ảnh EMF/WMF được chuyển sang PNG chỉ để trình duyệt hiển thị, đồng thời vẫn lưu bản gốc. Tệp .doc cũ cần được lưu lại thành .docx trước khi tải.</p>

      <div id="biologyScanSummary" class="scan-summary" hidden></div>
      <label for="biologyLessonSelect">Tạo quiz cho bài</label>
      <select id="biologyLessonSelect" disabled required>
        <option value="">Tải đề cương để chọn bài</option>
      </select>
      <p id="biologyLessonHint" class="form-help">Quiz gồm toàn bộ câu trắc nghiệm và đúng/sai của bài đã chọn.</p>

      <label for="biologyQuizVisibility">Chia sẻ</label>
      <select id="biologyQuizVisibility">
        <option value="private">Riêng tư</option>
        <option value="class">Quiz của lớp</option>
        <option value="shared">Quiz chung</option>
      </select>

      <div class="form-actions">
        <button type="button" id="previewBiologyBtn" disabled>Làm thử toàn bộ bài</button>
        <button type="submit" id="saveBiologyBtn" disabled>Lưu quiz</button>
      </div>
      <p id="biologySaveMessage" aria-live="polite"></p>
    </form>
  `;

  scannedBiologyLessons = [];
  selectedBiologyLesson = null;
  document.getElementById("biologyOutlineFile")
    .addEventListener("change", readBiologyOutlineFile);
  document.getElementById("openTheoryGenerator").addEventListener("click", renderTheoryCreateForm);
  document.getElementById("biologyLessonSelect")
    .addEventListener("change", selectBiologyLesson);
  document.getElementById("biologyQuizForm")
    .addEventListener("submit", saveNewQuiz);
  document.getElementById("previewBiologyBtn")
    .addEventListener("click", startBiologyPreview);
}

function markedParagraph(paragraph) {
  const namespace =
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const runs = directChildren(paragraph, "r");
  return runs.map((run, index) => {
    const text = Array.from(run.getElementsByTagNameNS(namespace, "t"))
      .map(node => node.textContent).join("");
    if (!text) {
      const embeddedEquation = Array.from(run.getElementsByTagName("*"))
        .some(node => node.localName === "OLEObject" && /^Equation\./i.test(node.getAttribute("ProgID") || ""));
      const before = runs[index - 1]?.textContent || "";
      const after = runs[index + 1]?.textContent || "";
      // In the supplied outline Word stores the arrow between 5′ and 3′ as
      // an embedded equation. Preserve its meaning inline, not as a figure.
      if (embeddedEquation && /[35][′’']\s*$/.test(before) && /^\s*[35][′’']/.test(after)) return "→";
      return "";
    }
    const underlined = Boolean(
      run.querySelector("u") ||
      run.getElementsByTagNameNS(namespace, "u").length
    );
    return underlined ? `[[U]]${text}[[/U]]` : text;
  }).join("").replace(/\s+/g, " ").trim();
}

function paragraphImageIds(paragraph) {
  const relationshipNamespace =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const drawingNamespace =
    "http://schemas.openxmlformats.org/drawingml/2006/main";
  const vmlNamespace = "urn:schemas-microsoft-com:vml";
  const imageNodes = [
    ...Array.from(paragraph.getElementsByTagNameNS(drawingNamespace, "blip")),
    ...Array.from(paragraph.getElementsByTagNameNS(vmlNamespace, "imagedata")),
    ...Array.from(paragraph.getElementsByTagName("imagedata"))
  ];
  const runs = directChildren(paragraph, "r");
  return imageNodes
    .filter(node => {
      let run = node.parentNode;
      while (run && run.parentNode !== paragraph) run = run.parentNode;
      const index = runs.indexOf(run);
      if (index < 0) return true;
      const equation = Array.from(run.getElementsByTagName("*"))
        .some(child => child.localName === "OLEObject" && /^Equation\./i.test(child.getAttribute("ProgID") || ""));
      const before = runs[index - 1]?.textContent || "";
      const after = runs[index + 1]?.textContent || "";
      return !(equation && /[35][′’']\s*$/.test(before) && /^\s*[35][′’']/.test(after));
    })
    .map(node => node.getAttributeNS(relationshipNamespace, "embed") ||
      node.getAttributeNS(relationshipNamespace, "id") ||
      node.getAttribute("r:embed") || node.getAttribute("r:id"))
    .filter(Boolean);
}

function withoutMarks(text) {
  return text.replace(/\[\[\/?U\]\]/g, "").replace(/\s+/g, " ").trim();
}

function lessonTitle(text) {
  const match = withoutMarks(text).match(/^BÀI\s*(\d+)\b/i);
  return match ? `Bài ${match[1]}` : "";
}

function questionTypeFromHeading(text) {
  const clean = withoutMarks(text).toUpperCase();
  if (/(?:PHẦN\s*)?(?:II|2)\s*[.):]?\s*TRẮC\s*NGHIỆM\s*ĐÚNG\s*SAI/.test(clean)) {
    return "true_false";
  }
  if (/(?:PHẦN\s*)?(?:I|1)\s*[.):]?\s*TRẮC\s*NGHIỆM(?:\s*NHIỀU)?\s*LỰA\s*CHỌN/.test(clean)) {
    return "multiple_choice";
  }
  return "";
}

function splitInlineQuestions(paragraph) {
  const marked = typeof paragraph === "string" ? paragraph : paragraph.marked;
  const imageIds = typeof paragraph === "string" ? [] : paragraph.imageIds;
  const starts = [...marked.matchAll(/Câu\s*\d+\s*[.:]/gi)]
    .map(match => match.index).filter(index => index > 0);
  if (!starts.length) return [paragraph];
  const boundaries = [0, ...starts, marked.length];
  return boundaries.slice(0, -1).map((start, index) => ({
    marked: marked.slice(start, boundaries[index + 1]).trim(),
    // A Word paragraph has one drawing anchor; when it contains several
    // questions, that drawing belongs to the first question in the paragraph.
    imageIds: index === 0 ? imageIds : []
  }));
}

function parseBiologyBlocks(paragraphs) {
  const lessons = new Map();
  let lesson = "";
  let type = "";
  let block = null;

  const finish = () => {
    if (!block || !lesson || !type) return;
    const question = type === "multiple_choice"
      ? parseBiologyChoice(block.marked)
      : parseBiologyTrueFalse(block.lines);
    if (question) {
      question.lesson = lesson;
      question.imageIds = [...new Set(block.imageIds || [])];
      if (!lessons.has(lesson)) lessons.set(lesson, []);
      lessons.get(lesson).push(question);
    }
  };

  paragraphs.flatMap(splitInlineQuestions).forEach(paragraph => {
    const marked = typeof paragraph === "string" ? paragraph : paragraph.marked;
    const imageIds = typeof paragraph === "string" ? [] : paragraph.imageIds;
    const clean = withoutMarks(marked);
    const headingType = questionTypeFromHeading(marked);
    if (headingType) {
      finish();
      block = null;
      type = headingType;
      return;
    }

    const newLesson = lessonTitle(marked);
    if (newLesson) {
      finish();
      block = null;
      lesson = newLesson;
      return;
    }

    if (/^Câu\s*\d+/i.test(clean)) {
      finish();
      block = { marked, lines: [marked], imageIds: [...imageIds] };
      return;
    }

    if (block) {
      block.marked += "\n" + marked;
      block.lines.push(marked);
      block.imageIds.push(...imageIds);
    }
  });

  finish();

  return [...lessons.entries()].map(([title, questions]) => ({
    title,
    questions
  })).filter(lessonItem => lessonItem.questions.length);
}

function markedTextState(marked) {
  let plain = "";
  const underlined = [];
  let isUnderlined = false;
  const tokens = marked.split(/(\[\[U\]\]|\[\[\/U\]\])/);
  tokens.forEach(token => {
    if (token === "[[U]]") {
      isUnderlined = true;
    } else if (token === "[[/U]]") {
      isUnderlined = false;
    } else {
      plain += token;
      underlined.push(...Array.from(token, () => isUnderlined));
    }
  });
  return { plain, underlined };
}

function parseBiologyChoice(marked) {
  const state = markedTextState(marked);
  const clean = state.plain;
  const matches = [...clean.matchAll(/(^|[^A-ZÀ-Ỹ])([A-D])\s*[.)]/g)];
  if (matches.length < 4) return null;
  const labelOffset = match => match.index + match[1].length;
  const first = labelOffset(matches[0]);
  const prompt = clean.slice(0, first)
    .replace(/^Câu\s*\d+\s*[.:]?\s*/i, "").trim();
  const options = matches.slice(0, 4).map((match, index) => {
    const start = labelOffset(match);
    const end = index < 3
      ? labelOffset(matches[index + 1])
      : clean.length;
    const key = match[2];
    const text = clean.slice(start, end)
      .replace(/^[A-D]\s*[.)]\s*/i, "").trim();
    const hasUnderline = state.underlined.slice(start, end).some(Boolean);
    return { key, text, correct: hasUnderline || /\*\s*$/.test(text) };
  });
  const correct = options.filter(option => option.correct).map(option => option.key);
  return prompt && options.length === 4 && correct.length
    ? { type: "multiple_choice", prompt, options, correct_answers: correct }
    : null;
}

function parseBiologyTrueFalse(lines) {
  const first = withoutMarks(lines[0] || "")
    .replace(/^Câu\s*\d+\s*[.:]?\s*/i, "").trim();
  const assertions = [];

  lines.slice(1).forEach(line => {
    const clean = withoutMarks(line);
    const match = clean.match(/^([a-d])\s*[.)]\s*(.+)/i);
    if (!match) return;
    assertions.push({
      key: match[1].toLowerCase(),
      text: match[2].trim(),
      correct: line.includes("[[U]]") || /\*\s*$/.test(clean)
    });
  });

  return first && assertions.length
    ? {
      type: "true_false",
      prompt: first,
      options: assertions,
      correct_answers: assertions.map(item => item.correct ? "true" : "false")
    }
    : null;
}

async function parseBiologyDocx(file) {
  if (!window.JSZip) throw new Error("Không tải được bộ đọc Word.");
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("Tệp Word không hợp lệ.");
  const xml = new DOMParser().parseFromString(
    await documentFile.async("text"), "application/xml"
  );
  const namespace =
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paragraphs = Array.from(xml.getElementsByTagNameNS(namespace, "p"))
    .map(paragraph => ({
      marked: markedParagraph(paragraph),
      imageIds: paragraphImageIds(paragraph)
    }))
    .filter(paragraph => paragraph.marked || paragraph.imageIds.length);
  const lessons = parseBiologyBlocks(paragraphs);
  await attachDocxImages(zip, lessons);
  return lessons;
}

function imageMimeType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  return {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", emf: "image/x-emf", wmf: "image/x-wmf",
    bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff"
  }[ext] || "application/octet-stream";
}

function sanitizeStorageName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function loadMetafileRenderer() {
  if (!metafileRendererPromise) {
    metafileRendererPromise = import(
      "https://cdn.jsdelivr.net/npm/emf-renderer@0.1.0/+esm"
    );
  }
  return metafileRendererPromise;
}

async function makeBiologyImage(sourceBlob, name) {
  const extension = name.split(".").pop().toLowerCase();
  const isMetafile = extension === "emf" || extension === "wmf";
  let displayBlob = sourceBlob;
  if (isMetafile) {
    const renderer = await loadMetafileRenderer();
    const binary = await sourceBlob.arrayBuffer();
    displayBlob = extension === "emf"
      ? await renderer.renderEmfToBlob(binary, { trimTransparentBounds: true })
      : await renderer.renderWmfToBlob(binary, { trimTransparentBounds: true });
    if (!displayBlob) throw new Error(`Không thể chuyển ảnh ${name} để hiển thị.`);
  }
  return {
    name,
    originalBlob: sourceBlob,
    displayBlob,
    converted: isMetafile,
    previewUrl: URL.createObjectURL(displayBlob)
  };
}

async function attachDocxImages(zip, lessons) {
  const relsFile = zip.file("word/_rels/document.xml.rels");
  if (!relsFile) return;
  const rels = new DOMParser().parseFromString(
    await relsFile.async("text"), "application/xml"
  );
  const targets = new Map(Array.from(rels.getElementsByTagName("Relationship"))
    .filter(item => /\/image$/.test(item.getAttribute("Type") || ""))
    .map(item => [item.getAttribute("Id"), item.getAttribute("Target")]));
  const ids = [...new Set(lessons.flatMap(item => item.questions)
    .flatMap(question => question.imageIds || []))];
  const imagesById = new Map();
  await Promise.all(ids.map(async id => {
    const target = targets.get(id);
    if (!target) return;
    const path = target.startsWith("/")
      ? target.slice(1) : `word/${target.replace(/^\.\//, "")}`;
    const source = zip.file(path);
    if (!source) return;
    const name = path.split("/").pop();
    const blob = await source.async("blob");
    const typedBlob = new Blob([blob], { type: imageMimeType(name) });
    imagesById.set(id, await makeBiologyImage(typedBlob, name));
  }));
  lessons.forEach(item => item.questions.forEach(question => {
    question.images = (question.imageIds || [])
      .map(id => imagesById.get(id)).filter(Boolean);
    delete question.imageIds;
  }));
}

async function parseBiologyPdf(file) {
  if (!window.pdfjsLib) throw new Error("Không tải được bộ đọc PDF.");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const paragraphs = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const lines = new Map();
    content.items.filter(item => item.str).forEach(item => {
      const y = Math.round(item.transform[5]);
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y).push(item);
    });
    [...lines.entries()]
      .sort((first, second) => second[0] - first[0])
      .forEach(([, items]) => {
        paragraphs.push(items
          .sort((first, second) => first.transform[4] - second.transform[4])
          .map(item => item.str).join(" ").replace(/\s+/g, " ").trim());
      });
  }
  return parseBiologyBlocks(paragraphs);
}

async function readBiologyOutlineFile(event) {
  const message = document.getElementById("biologySaveMessage");
  const summary = document.getElementById("biologyScanSummary");
  const select = document.getElementById("biologyLessonSelect");
  const preview = document.getElementById("previewBiologyBtn");
  const save = document.getElementById("saveBiologyBtn");
  const file = event.target.files?.[0];
  scannedBiologyLessons = [];
  selectedBiologyLesson = null;
  select.disabled = true;
  preview.disabled = true;
  save.disabled = true;
  summary.hidden = true;
  if (!file) return;
  if (/\.doc$/i.test(file.name)) {
    message.textContent = "Hãy lưu tệp .doc thành .docx trước khi tải.";
    return;
  }
  if (!/\.(docx|pdf)$/i.test(file.name)) {
    message.textContent = "Chỉ nhận tệp .docx hoặc .pdf.";
    return;
  }
  message.textContent = "Đang quét đề cương...";
  try {
    scannedBiologyLessons = /\.pdf$/i.test(file.name)
      ? await parseBiologyPdf(file)
      : await parseBiologyDocx(file);
    if (!scannedBiologyLessons.length) throw new Error("Không tìm thấy câu hỏi có đáp án. Với PDF, hãy dùng dấu * để đánh dấu đáp án đúng.");
    select.replaceChildren(new Option("Chọn bài", ""));
    scannedBiologyLessons.forEach(item => {
      const multiple = item.questions.filter(q => q.type === "multiple_choice").length;
      const tf = item.questions.filter(q => q.type === "true_false").length;
      select.add(new Option(`${item.title} — ${multiple} trắc nghiệm, ${tf} đúng/sai`, item.title));
    });
    select.disabled = false;
    summary.textContent = `Đã quét ${scannedBiologyLessons.length} bài. Chọn một bài để tạo quiz toàn bộ câu hỏi.`;
    summary.hidden = false;
    message.textContent = "";
  } catch (error) {
    message.textContent = error.message;
  }
}

function selectBiologyLesson(event) {
  selectedBiologyLesson = scannedBiologyLessons
    .find(item => item.title === event.target.value) || null;
  const enabled = Boolean(selectedBiologyLesson?.questions.length);
  document.getElementById("previewBiologyBtn").disabled = !enabled;
  document.getElementById("saveBiologyBtn").disabled = !enabled;
  if (enabled && !document.getElementById("biologyQuizTitle").value.trim()) {
    document.getElementById("biologyQuizTitle").value =
      `${selectedBiologyLesson.title} - Sinh học 10`;
  }
}

async function uploadBiologyQuestionImages(quizId, question, questionIndex) {
  const images = question.images || [];
  return Promise.all(images.map(async (image, imageIndex) => {
    const prefix = `${currentUser.id}/${quizId}/${questionIndex + 1}-${imageIndex + 1}`;
    const originalPath = `${prefix}-${sanitizeStorageName(image.name)}`;
    const { error: originalError } = await db.storage
      .from(BIOLOGY_IMAGE_BUCKET)
      .upload(originalPath, image.originalBlob, {
        contentType: image.originalBlob.type,
        upsert: false
      });
    if (originalError) throw originalError;
    const originalUrl = db.storage.from(BIOLOGY_IMAGE_BUCKET)
      .getPublicUrl(originalPath).data.publicUrl;
    let url = originalUrl;
    if (image.converted) {
      const displayPath = `${prefix}-${sanitizeStorageName(image.name.replace(/\.(emf|wmf)$/i, ".png"))}`;
      const { error: displayError } = await db.storage
        .from(BIOLOGY_IMAGE_BUCKET)
        .upload(displayPath, image.displayBlob, { contentType: "image/png", upsert: false });
      if (displayError) throw displayError;
      url = db.storage.from(BIOLOGY_IMAGE_BUCKET).getPublicUrl(displayPath).data.publicUrl;
    }
    return { name: image.name, url, original_url: originalUrl, converted: image.converted };
  }));
}

async function biologyQuestionRows(quizId) {
  return Promise.all(selectedBiologyLesson.questions.map(async (question, index) => ({
    quiz_id: quizId,
    question_type: question.type,
    prompt: question.prompt,
    options: question.options,
    correct_answers: question.correct_answers,
    image_data: await uploadBiologyQuestionImages(quizId, question, index),
    sort_order: index + 1
  })));
}

function startBiologyPreview() {
  const title = document.getElementById("biologyQuizTitle").value.trim();
  if (!title || !selectedBiologyLesson) {
    document.getElementById("biologySaveMessage").textContent = "Hãy nhập tên quiz và chọn bài.";
    return;
  }
  previewMode = true;
  activeQuiz = { id: null, title: `${title} (bản thử)` };
  activeQuestions = selectedBiologyLesson.questions.map(question => ({
    ...question,
    answer: question.correct_answers
  }));
  beginQuiz();
}

async function saveBiologyQuiz(event) {
  event.preventDefault();
  const message = document.getElementById("biologySaveMessage");
  const button = document.getElementById("saveBiologyBtn");
  const title = document.getElementById("biologyQuizTitle").value.trim();
  if (!title || !selectedBiologyLesson) {
    message.textContent = "Hãy nhập tên quiz và chọn bài.";
    return;
  }
  if (!db || !currentUser) {
    message.textContent = "Hãy đăng nhập Google trước khi lưu quiz.";
    return;
  }
  try {
    button.disabled = true;
    message.textContent = "Đang lưu quiz...";
    const scope = document.getElementById("biologyQuizVisibility").value;
    const visibility = scope === "private" ? "private" : "public";
    const { data: quiz, error } = await db.from("quizzes").insert({
      owner_id: currentUser.id,
      title,
      description: selectedBiologyLesson.title,
      subject: "biology",
      class_code: selectedGrade,
      section_id: selectedSectionId,
      visibility,
      share_scope: scope === "shared" ? "shared" : "class",
      status: visibility === "private" ? "private" : "published",
      question_count: selectedBiologyLesson.questions.length,
      question_types: ["multiple_choice", "true_false"]
    }).select("id").single();
    if (error) throw error;
    message.textContent = "Đang lưu câu hỏi và hình ảnh...";
    const { error: questionsError } = await db.from("quiz_questions")
      .insert(await biologyQuestionRows(quiz.id));
    if (questionsError) throw questionsError;
    message.textContent = visibility === "public" ? "Đã tạo quiz công khai." : "Đã lưu quiz riêng tư.";
  } catch (error) {
    message.textContent = `Không thể lưu quiz: ${error.message}`;
  } finally {
    button.disabled = !selectedBiologyLesson;
  }
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

  const body = xml.getElementsByTagNameNS(namespace, "body")[0];
  const groups = [];
  let currentTest = "";
  let currentUnit = "";
  let columns = null;
  let tableNumber = 0;
  let recognized = false;

  function heading(text) {
    if (text.length > 150) return false;
    const test = text.match(/\btest\s*[:.\-]?\s*(\d+)\b/i);
    const unit = text.match(/\bunit\s*(\d+)\b/i);
    if (unit) currentUnit = `Unit ${unit[1]}`;
    if (test) {
      currentTest = `Test ${test[1]}`;
      columns = null;
    } else if (unit) {
      currentTest = "";
      columns = null;
    }
    return Boolean(test || unit);
  }

  function group() {
    const label = [currentUnit, currentTest].filter(Boolean).join(" — ") || "Tất cả từ vựng";
    let result = groups.find(item => item.label === label);
    if (!result) {
      result = { label, words: [], errors: [], missingExamples: 0 };
      groups.push(result);
    }
    return result;
  }

  for (const element of Array.from(body?.childNodes || [])) {
    if (element.nodeType !== 1) continue;
    if (element.localName === "p") {
      heading(cellText(element));
      continue;
    }
    if (element.localName !== "tbl") continue;
    tableNumber++;
    const rows = directChildren(element, "tr");
    rows.forEach((row, index) => {
      const cells = directChildren(row, "tc").map(cellText);
      const nonempty = cells.filter(cell => cell.trim());
      if (!nonempty.length) return;
      if (nonempty.length === 1 && heading(nonempty[0])) return;
      const headers = cells.map(normalizeHeader);
      const keyword = headers.findIndex(value =>
        value.includes("keyword") || value.includes("collocation") ||
        value === "tu vung" || value.startsWith("tu vung ") ||
        value.includes("tu tieng anh")
      );
      const definition = headers.findIndex(value =>
        value.includes("dinh nghia") || value.includes("nghia tieng viet")
      );
      if (keyword >= 0 && definition >= 0) {
        columns = {
          keyword, definition,
          ipa: headers.findIndex(value => value === "ipa" || value.includes("phien am") || value.includes("phat am") || /\bipa\b/.test(value)),
          example: headers.findIndex(value => value.includes("vi du"))
        };
        recognized = true;
        return;
      }
      if (!columns) return;
      const word = {
        english: (cells[columns.keyword] || "").trim(),
        vietnamese: (cells[columns.definition] || "").trim(),
        ipa: columns.ipa >= 0 ? (cells[columns.ipa] || "").trim() : "",
        example: columns.example >= 0 ? (cells[columns.example] || "").trim() : ""
      };
      const target = group();
      if (!word.english || !word.vietnamese) {
        target.errors.push(`Bảng ${tableNumber}, dòng ${index + 1}: thiếu từ tiếng Anh hoặc nghĩa tiếng Việt.`);
      } else {
        target.words.push(word);
        if (!word.example) target.missingExamples++;
      }
    });
  }

  if (!recognized || !groups.length) {
    throw new Error("Không tìm thấy bảng từ vựng đúng mẫu. Tệp cần có cột Từ vựng hoặc Keyword / Collocation và cột Nghĩa tiếng Việt.");
  }
  return { title, groups };
}

async function readOutlineFile(event) {
  const message = document.getElementById("quizSaveMessage");
  const summary = document.getElementById("scanSummary");
  const count = document.getElementById("newQuizCount");
  const preview = document.getElementById("previewQuizBtn");
  const save = document.getElementById("saveQuizBtn");
  const choice = document.getElementById("vocabularyTestChoice");
  const select = document.getElementById("vocabularyTest");
  const file = event.target.files?.[0];
  scannedVocabulary = [];
  preview.disabled = save.disabled = count.disabled = true;
  summary.hidden = choice.hidden = true;
  select.replaceChildren();
  message.textContent = "";
  if (!file) return;
  if (!/\.docx$/i.test(file.name)) {
    message.textContent = "Chỉ nhận tệp Word định dạng .docx.";
    return;
  }
  message.textContent = "Đang quét đề cương...";
  try {
    const parsed = await parseVocabularyDocx(file);
    // Ignore the result if the user selected another file while parsing.
    if (event.target.files?.[0] !== file) return;
    scannedDocumentTitle = parsed.title;
    const titleInput = document.getElementById("newQuizTitle");
    if (!titleInput.value.trim()) titleInput.value = parsed.title;

    function showGroup(index) {
      scannedVocabulary = [];
      preview.disabled = save.disabled = count.disabled = true;
      summary.hidden = true;
      message.textContent = "";
      const selected = parsed.groups[index];
      if (!selected) return;
      summary.replaceChildren();
      const scanCount = document.createElement("strong");
      scanCount.textContent = `${selected.label}: đã đọc ${selected.words.length} từ vựng.`;
      summary.appendChild(scanCount);
      if (selected.words.length) {
        const sample = document.createElement("p");
        sample.textContent = `Ví dụ: ${selected.words[0].english} — ${selected.words[0].vietnamese}`;
        summary.appendChild(sample);
      }
      if (selected.missingExamples) {
        const note = document.createElement("p");
        note.textContent = `${selected.missingExamples} từ chưa có ví dụ; không dùng được dạng vận dụng.`;
        summary.appendChild(note);
      }
      if (selected.errors.length) {
        const details = document.createElement("details");
        details.open = true;
        const heading = document.createElement("summary");
        heading.textContent = `${selected.errors.length} dòng thiếu dữ liệu cần sửa trong tệp`;
        const list = document.createElement("ul");
        selected.errors.forEach(issue => {
          const item = document.createElement("li");
          item.textContent = issue;
          list.appendChild(item);
        });
        details.append(heading, list);
        summary.appendChild(details);
        message.textContent = "Hãy bổ sung các dòng thiếu dữ liệu rồi tải lại tệp để tránh bỏ sót từ.";
      } else if (selected.words.length < 4) {
        message.textContent = "Cần ít nhất 4 từ vựng để tạo câu hỏi trắc nghiệm.";
      } else {
        scannedVocabulary = selected.words;
        count.disabled = false;
        count.min = "4";
        count.max = String(selected.words.length);
        count.value = String(selected.words.length);
        document.getElementById("countHint").textContent = `Bạn có thể chọn từ 4 đến ${selected.words.length} câu hỏi.`;
        preview.disabled = save.disabled = false;
      }
      summary.hidden = false;
    }
    if (parsed.groups.length > 1) {
      choice.hidden = false;
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Chọn Test";
      select.appendChild(placeholder);
      parsed.groups.forEach((item, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `${item.label} — ${item.words.length} từ${item.errors.length ? ` (${item.errors.length} dòng cần sửa)` : ""}`;
        select.appendChild(option);
      });
      select.onchange = () => showGroup(select.value === "" ? -1 : Number(select.value));
      message.textContent = "Hãy chọn Test để tạo quiz.";
    } else {
      select.onchange = null;
      showGroup(0);
    }
  } catch (error) {
    if (event.target.files?.[0] === file) message.textContent = error.message;
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

  if (selectedSubject === "biology") {
    await saveBiologyQuiz(event);
    return;
  }
  const message = document.getElementById("quizSaveMessage");
  const button = document.getElementById("saveQuizBtn");

  try {
    const { title, count, types } = validateCreation();

    if (!db || !currentUser) {
      throw new Error("Hãy đăng nhập Google trước khi lưu quiz.");
    }

    button.disabled = true;
    message.textContent = "Đang lưu quiz...";

    const scope = document.getElementById("newQuizVisibility").value;
    const visibility = scope === "private" ? "private" : "public";
    const { data: quiz, error: quizError } = await db
      .from("quizzes")
      .insert({
        owner_id: currentUser.id,
        title,
        description: scannedDocumentTitle,
        subject: selectedSubject,
        class_code: selectedGrade,
        section_id: selectedSectionId,
        visibility,
        share_scope: scope === "shared" ? "shared" : "class",
        status: visibility === "private" ? "private" : "published",
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
      ? "Đã tạo quiz công khai."
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

async function startQuiz(quizId, assignment = null) {
  activeAssignment = null;
  if (assignment) {
    if (!currentUser) { alert("Hãy đăng nhập để làm bài tập."); return; }
    let studentNumber = null;
    if (assignment.require_student_number) {
      studentNumber = await requestStudentNumber();
      if (studentNumber === null) return;
    }
    activeAssignment = { id: assignment.id, studentNumber };
  }
  showPage("play");
  document.getElementById("questionArea").textContent = "Đang tải câu hỏi...";

  try {
    const { data: quiz, error: quizError } = await db
      .from("quizzes")
      .select(
        "id,title,subject,question_count,question_types,visibility,status,owner_id"
      )
      .eq("id", quizId)
      .single();

    if (quizError) throw quizError;

    const isPublic =
      quiz.visibility === "public" && quiz.status === "published";

    if (!isPublic && currentUser?.id !== quiz.owner_id) {
      throw new Error("Bạn không có quyền truy cập quiz này.");
    }

    previewMode = false;
    activeQuiz = quiz;

    if (quiz.subject !== "english") {
      const { data: rows, error: questionsError } = await db
        .from("quiz_questions")
        .select("question_type,prompt,options,correct_answers,image_data,sort_order")
        .eq("quiz_id", quizId)
        .order("sort_order");
      if (questionsError) throw questionsError;
      activeQuestions = (rows || []).map(row => ({
        type: row.question_type,
        prompt: row.prompt,
        options: row.options,
        answer: row.correct_answers,
        images: row.image_data || []
      }));
    } else {
      const { data: words, error: wordsError } = await db
        .from("vocabulary")
        .select("english,vietnamese,example")
        .eq("quiz_id", quizId);
      if (wordsError) throw wordsError;
      activeQuestions = makeQuestions(words || [], quiz);
    }

    if (!activeQuestions.length) throw new Error("Quiz chưa có câu hỏi.");
    beginQuiz();
  } catch (error) {
    document.getElementById("questionArea").textContent =
      `Không mở được quiz: ${error.message}`;
  }
}

function requestStudentNumber() {
  const dialog = document.getElementById("studentNumberDialog");
  const form = document.getElementById("studentNumberForm");
  const input = document.getElementById("studentNumberInput");
  const error = document.getElementById("studentNumberError");
  const cancel = document.getElementById("studentNumberCancel");
  input.value = "";
  error.textContent = "";
  return new Promise(resolve => {
    let result = null;
    const submit = event => {
      event.preventDefault();
      const value = input.value.trim();
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 999) {
        error.textContent = "Vui lòng nhập số nguyên từ 1 đến 999.";
        input.focus();
        return;
      }
      result = Number(value);
      dialog.close();
    };
    const close = () => {
      form.removeEventListener("submit", submit);
      cancel.removeEventListener("click", cancelClick);
      dialog.removeEventListener("close", close);
      resolve(result);
    };
    const cancelClick = () => dialog.close();
    form.addEventListener("submit", submit);
    cancel.addEventListener("click", cancelClick);
    dialog.addEventListener("close", close);
    dialog.showModal();
    input.focus();
  });
}

function beginQuiz() {
  showPage("play");
  questionIndex = 0;
  correctAnswers = 0;
  skippedQuestions = 0;
  questionResponses = activeQuestions.map(() => null);
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
  next.hidden = false;
  next.textContent = questionIndex === activeQuestions.length - 1
    ? "Nộp bài" : "Bỏ qua câu này";
  answeredCurrent = false;

  const heading = document.createElement("h3");
  heading.textContent = `Câu ${questionIndex + 1}/${activeQuestions.length}`;

  const guide = document.createElement("p");
  guide.textContent = question.type === "multiple_choice"
    ? "Chọn một đáp án đúng:"
    : question.type === "true_false"
      ? "Chọn Đúng hoặc Sai cho từng ý:"
      : question.type === "en_vi"
    ? "Chọn nghĩa tiếng Việt:"
    : question.type === "vi_en"
      ? "Chọn từ tiếng Anh:"
      : "Chọn từ phù hợp để hoàn thành câu:";

  const prompt = document.createElement("h3");
  prompt.textContent = question.prompt;
  area.append(heading, guide, prompt);

  renderQuestionImages(question.images, area);

  if (question.type === "true_false") {
    renderTrueFalseQuestion(question, area);
    return;
  }

  question.options.forEach(option => {
    const value = typeof option === "string"
      ? option
      : `${option.key}. ${option.text}`;
    const button = makeButton(
      value,
      () => answerQuestion(value, button)
    );
    button.className = "answer-option";
    area.appendChild(button);
  });
}

function renderQuestionImages(images, area) {
  (images || []).forEach((image, index) => {
    const src = image.previewUrl || image.url;
    if (!src) return;
    const figure = document.createElement("figure");
    figure.className = "question-image";
    const element = document.createElement("img");
    element.src = src;
    element.alt = `Hình minh họa ${index + 1} của câu hỏi`;
    element.loading = "lazy";
    figure.appendChild(element);
    area.appendChild(figure);
  });
}

function renderTrueFalseQuestion(question, area) {
  const selections = {};

  question.options.forEach(assertion => {
    const row = document.createElement("div");
    row.className = "true-false-row";
    const text = document.createElement("p");
    text.textContent = `${assertion.key}. ${assertion.text}`;
    const controls = document.createElement("div");
    controls.className = "true-false-controls";

    ["true", "false"].forEach(value => {
      const button = makeButton(value === "true" ? "Đúng" : "Sai", () => {
        if (answeredCurrent) return;
        selections[assertion.key] = value;
        questionResponses[questionIndex] = { ...selections };
        controls.querySelectorAll("button").forEach(item => {
          item.classList.toggle("selected-answer", item === button);
        });
      });
      controls.appendChild(button);
    });

    row.append(text, controls);
    area.appendChild(row);
  });

  const check = makeButton("Kiểm tra", () => {
    if (Object.keys(selections).length !== question.options.length) {
      document.getElementById("answerFeedback").textContent =
        "Hãy chọn Đúng hoặc Sai cho tất cả các ý.";
      return;
    }

    answeredCurrent = true;
    const allCorrect = question.options.every((assertion, index) =>
      selections[assertion.key] === question.answer[index]
    );
    if (allCorrect) correctAnswers++;

    area.querySelectorAll("button").forEach(button => {
      button.disabled = true;
    });
    area.querySelectorAll(".true-false-row").forEach((row, index) => {
      const expected = question.answer[index] === "true" ? "Đúng" : "Sai";
      const chosen = selections[question.options[index].key] === "true"
        ? "Đúng" : "Sai";
      row.classList.add(chosen === expected ? "correct" : "incorrect");
      const note = document.createElement("small");
      note.textContent = `Đáp án: ${expected}`;
      row.appendChild(note);
    });

    document.getElementById("answerFeedback").textContent = allCorrect
      ? "Chính xác!"
      : "Có ý chưa đúng. Xem đáp án bên dưới mỗi ý.";

    const next = document.getElementById("nextBtn");
    next.textContent = questionIndex === activeQuestions.length - 1
      ? "Xem kết quả" : "Câu tiếp theo";
    next.hidden = false;
  });
  check.className = "check-true-false";
  area.appendChild(check);
}

function answerQuestion(option, button) {
  if (answeredCurrent) return;
  answeredCurrent = true;

  const question = activeQuestions[questionIndex];
  const correct = Array.isArray(question.answer)
    ? question.options.find(item => `${item.key}. ${item.text}` === option)?.key === question.answer[0]
    : option === question.answer;

  questionResponses[questionIndex] = option;

  if (correct) correctAnswers++;

  document.getElementById("answerFeedback").textContent = correct
    ? "Chính xác!"
    : `Chưa đúng. Đáp án: ${Array.isArray(question.answer) ? question.answer.join(", ") : question.answer}`;

  document.querySelectorAll(".answer-option").forEach(answer => {
    answer.disabled = true;
    if (answer.textContent === question.answer ||
        (Array.isArray(question.answer) &&
          answer.textContent.startsWith(`${question.answer[0]}.`))) {
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
  if (questionIndex === activeQuestions.length - 1 &&
      !confirm(`Bạn muốn nộp bài? Có ${skippedQuestions + (answeredCurrent ? 0 : 1)} câu đã bỏ qua.`)) return;
  if (!answeredCurrent) skippedQuestions++;

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
    `${activeQuiz.title}: ${correctAnswers}/${activeQuestions.length} câu đúng, ${skippedQuestions} câu bỏ qua. Thời gian: ${formatDuration(seconds)}.`;
  latestReview = activeQuestions.map((question, index) => ({
    type: question.type, prompt: question.prompt, options: question.options,
    answer: question.answer, response: questionResponses[index],
    images: (question.images || []).filter(image => image.url || image.previewUrl)
      .map(image => ({ url: image.url || image.previewUrl }))
  }));
  document.getElementById("reviewCurrentBtn").hidden = false;

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
      assignment_id: activeAssignment?.id || null,
      student_number: activeAssignment?.studentNumber || null,
      review_data: latestReview,
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

async function loadAiAdminStats() {
  const summary = document.getElementById("aiAdminSummary");
  const area = document.getElementById("aiAdminList");
  const historyArea = document.getElementById("aiAdminHistory");
  area.replaceChildren();
  historyArea.replaceChildren();
  document.getElementById("aiAdminTotal").textContent = "—";
  drawAiUsageChart([]);
  if (!currentUser || !isQuizAdmin || !db) {
    summary.textContent = "Chỉ quản trị viên được xem thống kê này.";
    return;
  }
  summary.textContent = "Đang tải thống kê...";
  const { data, error } = await db.rpc("admin_ai_quiz_usage");
  if (error) {
    summary.textContent = `Không tải được thống kê: ${error.message}`;
    return;
  }
  const rows = data || [];
  const total = rows.reduce((sum, row) => sum + Number(row.requests || 0), 0);
  document.getElementById("aiAdminTotal").textContent = String(total);
  summary.textContent = `${rows.length} tài khoản đã dùng • Không có trần chung do web đặt.`;
  drawAiUsageChart(rows);
  if (!rows.length) area.textContent = "Chưa có lượt tạo quiz AI hôm nay.";
  rows.forEach((row, index) => {
    const card = document.createElement("article"); card.className = "quiz-card";
    const heading = document.createElement("h3"); heading.textContent = row.display_name || "Chưa có tên";
    const marker = document.createElement("span"); marker.className = "ai-stats-marker";
    marker.style.backgroundColor = aiChartColor(index);
    marker.setAttribute("aria-hidden", "true"); heading.prepend(marker);
    const info = document.createElement("p");
    info.textContent = `Lớp: ${row.class_name || "—"} • Đã dùng: ${row.requests}/5 • Còn: ${Math.max(0, 5 - Number(row.requests || 0))} lượt`;
    card.append(heading, info); area.appendChild(card);
  });
  historyArea.textContent = "Đang tải lịch sử...";
  const history = await db.rpc("admin_ai_quiz_history");
  if (history.error) {
    historyArea.textContent = "Chưa tải được lịch sử. Hãy kiểm tra migration thống kê AI đã được cài trên Supabase.";
    return;
  }
  historyArea.replaceChildren();
  if (!history.data?.length) { historyArea.textContent = "Chưa có lượt nào được ghi trong lịch sử."; return; }
  history.data.forEach(row => {
    const card = document.createElement("article"); card.className = "quiz-card";
    const heading = document.createElement("h3"); heading.textContent = row.display_name || "Chưa có tên";
    const info = document.createElement("p");
    info.textContent = `Lớp: ${row.class_name || "—"} • ${new Date(row.requested_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`;
    card.append(heading, info); historyArea.appendChild(card);
  });
}

function aiChartColor(index) {
  return ["#1d4ed8", "#0e7490", "#7c3aed", "#b45309", "#047857", "#be185d", "#475569", "#b91c1c"][index % 8];
}

function drawAiUsageChart(rows) {
  const chart = document.getElementById("aiAdminChart");
  const namespace = "http://www.w3.org/2000/svg";
  chart.replaceChildren();
  const track = document.createElementNS(namespace, "circle");
  [ ["cx", "60"], ["cy", "60"], ["r", "46"], ["fill", "none"], ["stroke", "#e2e8f0"], ["stroke-width", "14"] ].forEach(([key, value]) => track.setAttribute(key, value));
  chart.appendChild(track);
  const total = rows.reduce((sum, row) => sum + Number(row.requests || 0), 0);
  if (!total) { chart.setAttribute("aria-label", "Chưa có lượt tạo quiz AI hôm nay"); return; }
  const circumference = 2 * Math.PI * 46;
  let offset = 0;
  rows.forEach((row, index) => {
    const length = circumference * Number(row.requests || 0) / total;
    const circle = document.createElementNS(namespace, "circle");
    [["cx", "60"], ["cy", "60"], ["r", "46"], ["fill", "none"], ["stroke", aiChartColor(index)], ["stroke-width", "14"], ["stroke-dasharray", `${length} ${circumference - length}`], ["stroke-dashoffset", String(-offset)], ["transform", "rotate(-90 60 60)"]].forEach(([key, value]) => circle.setAttribute(key, value));
    chart.appendChild(circle);
    offset += length;
  });
  chart.setAttribute("aria-label", `Biểu đồ phân bố ${total} lượt yêu cầu giữa ${rows.length} tài khoản; danh sách chi tiết ở bên dưới.`);
}

async function loadHistory() {
  const area = document.getElementById("historyList");
  if (!currentUser || !db) { area.textContent = "Hãy đăng nhập để xem lịch sử."; return; }
  area.textContent = "Đang tải lịch sử...";
  const { data, error } = await db.from("quiz_attempts")
    .select("id,quiz_id,correct_count,total_questions,duration_seconds,created_at,quizzes(title)")
    .eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(100);
  if (error) { area.textContent = `Không tải được lịch sử: ${error.message}`; return; }
  area.replaceChildren();
  if (!data?.length) { area.textContent = "Bạn chưa có lượt làm nào được lưu."; return; }
  data.forEach(attempt => {
    const card = document.createElement("article"); card.className = "quiz-card";
    const heading = document.createElement("h3");
    heading.textContent = attempt.quizzes?.title || "Quiz không còn khả dụng";
    const info = document.createElement("p");
    info.textContent = `${attempt.correct_count}/${attempt.total_questions} câu đúng • ${formatDuration(attempt.duration_seconds)} • ${new Date(attempt.created_at).toLocaleString("vi-VN")}`;
    card.append(heading, info, makeButton("Xem lại", () => openHistoryReview(attempt.id)));
    area.appendChild(card);
  });
}

async function openHistoryReview(attemptId) {
  if (!currentUser) { showPage("home"); return; }
  showPage("historyReview");
  const area = document.getElementById("historyReviewList");
  area.textContent = "Đang tải bài làm...";
  const { data, error } = await db.from("quiz_attempts")
    .select("review_data,correct_count,total_questions,created_at")
    .eq("id", attemptId).eq("user_id", currentUser.id).single();
  if (error) { area.textContent = `Không tải được bài làm: ${error.message}`; return; }
  document.getElementById("historyReviewSummary").textContent =
    `${data.correct_count}/${data.total_questions} câu đúng • ${new Date(data.created_at).toLocaleString("vi-VN")}`;
  renderReview(data.review_data);
}

function renderReview(review) {
  const area = document.getElementById("historyReviewList");
  area.replaceChildren();
  if (!Array.isArray(review) || !review.length) {
    area.textContent = "Lượt làm này được lưu trước khi có chức năng xem lại nên không có đáp án chi tiết.";
    return;
  }
  review.forEach((item, index) => {
    const card = document.createElement("article"); card.className = "quiz-card";
    const heading = document.createElement("h3"); heading.textContent = `Câu ${index + 1}: ${item.prompt}`;
    card.appendChild(heading);
    renderQuestionImages(item.images, card);
    if (item.type === "true_false") {
      (item.options || []).forEach((assertion, i) => {
        const text = document.createElement("p");
        const selected = item.response?.[assertion.key];
        const correct = item.answer?.[i];
        text.textContent = `${assertion.key}. ${assertion.text} — ${selected == null ? "Bỏ trống" : selected === correct ? "Chính xác" : "Chưa đúng"}; bạn chọn: ${selected == null ? "—" : selected === "true" ? "Đúng" : "Sai"}; đáp án: ${correct === "true" ? "Đúng" : "Sai"}`;
        card.appendChild(text);
      });
    } else {
      const selected = document.createElement("p");
      const chosenKey = Array.isArray(item.answer)
        ? (item.options || []).find(option => `${option.key}. ${option.text}` === item.response)?.key : null;
      const isCorrect = item.response != null && (Array.isArray(item.answer)
        ? chosenKey === item.answer[0] : item.response === item.answer);
      selected.textContent = `${item.response == null ? "Bỏ trống" : isCorrect ? "Chính xác" : "Chưa đúng"} • Bạn chọn: ${item.response ?? "—"}`;
      const answer = document.createElement("p");
      const correct = Array.isArray(item.answer)
        ? item.options.filter(option => item.answer.includes(option.key)).map(option => `${option.key}. ${option.text}`).join(", ")
        : item.answer;
      answer.textContent = `Đáp án đúng: ${correct || "Không có dữ liệu"}`;
      card.append(selected, answer);
    }
    area.appendChild(card);
  });
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
          ? "Công khai"
          : "Riêng tư"}</p>`;
      card.appendChild(makeButton("Làm thử", () => startQuiz(quiz.id)));
      area.appendChild(card);
    });
  } catch (error) {
    area.textContent = `Không tải được quiz: ${error.message}`;
  }
}

async function renderTeacher() {
  if (!isTeacher) { showPage("home"); return; }
  await loadCatalog();
  const classes = document.getElementById("assignmentClass");
  classes.replaceChildren(new Option("Chọn lớp", ""));
  catalogClasses.forEach(item => classes.add(new Option(item.name || item.code, item.code)));
  const picker = document.getElementById("teacherClassPicker");
  picker.replaceChildren(new Option("Chọn lớp", ""));
  catalogClasses.forEach(item => picker.add(new Option(item.name || item.code, item.code)));
  const quizzes = document.getElementById("assignmentQuiz");
  quizzes.replaceChildren(new Option("Đang tải quiz...", ""));
  const { data, error } = await db.from("quizzes").select("id,title,subject,class_code")
    .eq("visibility", "public").eq("status", "published").order("title");
  quizzes.replaceChildren(new Option("Chọn quiz", ""));
  if (error) document.getElementById("assignmentMessage").textContent = error.message;
  else (data || []).forEach(q => quizzes.add(new Option(`${q.title} • ${q.class_code || "Chung"}`, q.id)));
  const result = await db.from("quiz_assignments").select("id,title,class_code,due_at,quiz_id,require_student_number")
    .eq("teacher_id", currentUser.id).order("created_at", { ascending: false });
  renderAssignmentCards(document.getElementById("teacherAssignments"), result, false);
}

function renderAssignmentCards(area, result, playable) {
  area.replaceChildren();
  if (result.error) { area.textContent = `Không tải được bài tập: ${result.error.message}`; return; }
  if (!result.data?.length) { area.textContent = "Chưa có bài tập."; return; }
  result.data.forEach(item => {
    const card = document.createElement("article"); card.className = "quiz-card";
    const title = document.createElement("h3"); title.textContent = item.title;
    const info = document.createElement("p");
    info.textContent = `Lớp ${item.class_code} • ${item.due_at ? `Hạn: ${new Date(item.due_at).toLocaleString("vi-VN")}` : "Không có hạn"}`;
    card.append(title, info);
    if (playable) card.appendChild(makeButton("Làm bài", () => startQuiz(item.quiz_id, item)));
    else card.appendChild(makeButton("Xem bảng xếp hạng", () => showTeacherResults(item)));
    area.appendChild(card);
  });
}

async function renderHomework() {
  const area = document.getElementById("homeworkList");
  if (!currentUser || !selectedGrade) { area.textContent = "Hãy đăng nhập và chọn lớp."; return; }
  area.textContent = "Đang tải bài tập...";
  const result = await db.from("quiz_assignments").select("id,title,class_code,due_at,quiz_id,require_student_number")
    .eq("class_code", selectedGrade).order("created_at", { ascending: false });
  renderAssignmentCards(area, result, true);
}

async function showTeacherResults(assignment) {
  showPage("teacherResults");
  document.getElementById("teacherResultsTitle").textContent = `Bảng xếp hạng: ${assignment.title} • ${assignment.class_code}`;
  document.getElementById("teacherResultsList").textContent = "Đang tải kết quả...";
  const { data, error } = await db.rpc("teacher_assignment_results", { p_assignment_id: assignment.id });
  if (error) { document.getElementById("teacherResultsList").textContent = `Không tải được kết quả: ${error.message}`; return; }
  teacherResults = data || [];
  document.getElementById("teacherResultsSearch").value = "";
  document.getElementById("teacherResultsSort").value = "score";
  drawTeacherResults();
}

function drawTeacherResults() {
  const search = document.getElementById("teacherResultsSearch").value.trim().toLocaleLowerCase("vi");
  const sort = document.getElementById("teacherResultsSort").value;
  const area = document.getElementById("teacherResultsList");
  document.getElementById("teacherResultsCount").textContent = `${teacherResults.length} học sinh đã làm • mỗi học sinh tính một lần, lấy kết quả cao nhất.`;
  const filtered = teacherResults.filter(row => (row.display_name || "").toLocaleLowerCase("vi").includes(search));
  filtered.sort((a, b) => sort === "name" ? (a.display_name || "").localeCompare(b.display_name || "", "vi") :
    sort === "number" ? (a.student_number ?? Infinity) - (b.student_number ?? Infinity) || (a.display_name || "").localeCompare(b.display_name || "", "vi") :
    b.score - a.score || a.duration_seconds - b.duration_seconds);
  area.replaceChildren();
  if (!filtered.length) { area.textContent = "Không có học sinh đã làm phù hợp."; return; }
  filtered.forEach((row, index) => {
    const card = document.createElement("article"); card.className = "quiz-card";
    const title = document.createElement("h3"); title.textContent = `${sort === "score" ? `${index + 1}. ` : ""}${row.display_name || "Chưa có tên"}`;
    const info = document.createElement("p"); info.textContent = `STT: ${row.student_number ?? "—"} • ${row.correct_count}/${row.total_questions} câu đúng • ${formatDuration(row.duration_seconds)}`;
    card.append(title, info); area.appendChild(card);
  });
}

async function submitAssignment(event) {
  event.preventDefault();
  const message = document.getElementById("assignmentMessage");
  const due = document.getElementById("assignmentDue").value;
  const { error } = await db.from("quiz_assignments").insert({
    teacher_id: currentUser.id, title: document.getElementById("assignmentTitle").value.trim(),
    quiz_id: document.getElementById("assignmentQuiz").value,
    class_code: document.getElementById("assignmentClass").value,
    due_at: due ? new Date(due).toISOString() : null,
    require_student_number: document.getElementById("assignmentRequireNumber").checked
  });
  if (error) { message.textContent = `Không giao được bài: ${error.message}`; return; }
  event.target.reset();
  await renderTeacher();
  message.textContent = "Đã giao bài tập.";
}

async function grantTeacher(event) {
  event.preventDefault();
  const message = document.getElementById("teacherGrantMessage");
  const { error } = await db.from("quiz_teachers").insert({
    user_id: document.getElementById("teacherUserId").value.trim(), granted_by: currentUser.id
  });
  message.textContent = error ? `Không cấp được quyền: ${error.message}` : "Đã cấp quyền giáo viên.";
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("adminMenuToggle").addEventListener("click", event => {
    const open = document.body.classList.toggle("admin-menu-open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  if (connectSupabase()) {
    db.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      updateLoginButton();
    });
    try { await checkUser(); } catch (error) { console.error(error); }
  }

  document.getElementById("nextBtn").addEventListener("click", nextQuestion);
  document.getElementById("reviewCurrentBtn").addEventListener("click", () => {
    showPage("historyReview");
    document.getElementById("historyReviewSummary").textContent = `${correctAnswers}/${activeQuestions.length} câu đúng`;
    renderReview(latestReview);
  });
  document.getElementById("profileForm").addEventListener("submit", saveProfile);
  document.getElementById("assignmentForm").addEventListener("submit", submitAssignment);
  document.getElementById("teacherGrantForm").addEventListener("submit", grantTeacher);
  document.getElementById("teacherResultsSearch").addEventListener("input", drawTeacherResults);
  document.getElementById("teacherResultsSort").addEventListener("change", drawTeacherResults);
  document.getElementById("teacherClassCreate").addEventListener("click", () => {
    const classCode = document.getElementById("teacherClassPicker").value;
    if (!isTeacher || !classCode) { alert("Hãy chọn lớp."); return; }
    selectedGrade = classCode;
    openCreate();
  });
  showPage(currentUser ? (selectedGrade ? "subjects" : "profile") : "home");
});
