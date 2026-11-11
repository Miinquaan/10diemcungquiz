
"use strict";

// =====================================
// 1. CAU HINH SUPABASE
// =====================================

const SUPABASE_URL =
  "https://tdekbojbfnttitllfltl.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_GnRVaCZsV43UDnJHNon9ng_GSvUe6YT";

const WEBSITE_URL =
  "https://miinquaan.github.io/10diemcungquiz/";

let db = null;
let currentUser = null;
let editingQuizId = null;
let savingQuiz = false;

let activeQuiz = null;
let activeQuestions = [];
let questionIndex = 0;
let correctAnswers = 0;
let startedAt = 0;
let timerInterval = null;
let answeredCurrent = false;

// =====================================
// 2. CHUYEN TRANG
// =====================================

function showPage(pageId, options = {}) {
  const target = document.getElementById(pageId);

  if (!target) {
    console.error("Không tìm thấy trang:", pageId);
    return;
  }

  if (pageId !== "play") stopTimer();

  if (
    pageId === "create" &&
    !options.preserveEditing
  ) {
    editingQuizId = null;
  }

  document.querySelectorAll(".page").forEach(page => {
    page.hidden = page.id !== pageId;
  });

  if (pageId === "library") loadQuizzes();
  if (pageId === "myQuizzes") loadMyQuizzes();
  if (pageId === "history") showHistory();
  if (pageId === "admin") {
  loadPendingQuizzes();
}

  if (pageId === "create") showCreatePage();
}

function openNewQuiz() {
  editingQuizId = null;
  showPage("create");
}

function cancelQuizEdit() {
  editingQuizId = null;
  showPage("myQuizzes");
}

// =====================================
// 3. KET NOI SUPABASE
// =====================================

function connectSupabase() {
  if (!window.supabase) {
    console.error("Không tải được Supabase JS.");
    return false;
  }

  try {
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
  } catch (error) {
    console.error("Lỗi kết nối:", error);
    return false;
  }
}

// =====================================
// 4. DANG NHAP / DANG XUAT
// =====================================

async function loginGoogle() {
  if (!db) {
    alert("Chưa kết nối Supabase.");
    return;
  }

  if (currentUser) {
    if (confirm("Bạn muốn đăng xuất?")) {
      await logoutGoogle();
    }
    return;
  }

  try {
    const { error } = await db.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: WEBSITE_URL
      }
    });

    if (error) throw error;
  } catch (error) {
    alert("Lỗi đăng nhập: " + error.message);
  }
}

async function logoutGoogle() {
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;

    currentUser = null;
    editingQuizId = null;

    updateLoginButton();
    showPage("home");
  } catch (error) {
    alert("Lỗi đăng xuất: " + error.message);
  }
}

function updateLoginButton() {
  const button = document.getElementById("loginBtn");
  if (!button) return;

  button.textContent = currentUser
    ? "Đăng xuất"
    : "Đăng nhập Google";

  button.title = currentUser?.email || "";
}

async function checkUser() {
  if (!db) return;

  try {
    const { data, error } = await db.auth.getUser();

    if (error) {
      console.warn(error.message);
    }

    currentUser = data?.user || null;
    
await checkQuizAdmin();

    updateLoginButton();
  } catch (error) {
    console.error(error);
  }
}

// =====================================
// 5. CAC HAM HO TRO
// =====================================

function shuffle(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] =
      [result[j], result[i]];
  }

  return result;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(remaining).padStart(2, "0")
  );
}

function stopTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function makeButton(text, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.addEventListener("click", action);
  return button;
}

// =====================================
// 6. KHO QUIZ CONG KHAI
// =====================================

async function loadQuizzes() {
  const area = document.getElementById("quizList");
  if (!area) return;

  area.textContent = "Đang tải danh sách quiz...";

  if (!db) {
    area.textContent = "Chưa kết nối Supabase.";
    return;
  }

  try {
    const { data, error } = await db
      .from("quizzes")
      .select(
        "id,title,description,question_count,question_types"
      )
      .eq("visibility", "public")
      .eq("status", "published")
      .order("created_at", {
        ascending: false
      });

    if (error) throw error;

    area.replaceChildren();

    if (!data?.length) {
      area.textContent = "Chưa có quiz công khai.";
      return;
    }

    data.forEach(quiz => {
      const card = document.createElement("div");
      card.className = "quiz-card";

      const title = document.createElement("h3");
      title.textContent = quiz.title || "Quiz";

      const description = document.createElement("p");
      description.textContent = quiz.description || "";

      const count = document.createElement("p");
      count.textContent =
        "Số câu hỏi: " + quiz.question_count;

      const button = makeButton(
        "Bắt đầu làm quiz",
        () => startQuiz(quiz.id)
      );

      card.append(title, description, count, button);
      area.appendChild(card);
    });
  } catch (error) {
    console.error(error);
    area.textContent =
      "Không tải được quiz: " + error.message;
  }
}

// =====================================
// 7. TAO CAU HOI TRAC NGHIEM
// =====================================

function makeQuestions(words, quiz) {
  const available = words.filter(
    w => w.english?.trim() && w.vietnamese?.trim()
  );

  if (available.length < 4) {
    throw new Error("Quiz cần ít nhất 4 từ vựng.");
  }

  const types = (quiz.question_types || ["en_vi"])
    .map(type => {
      if (type === "en-vi") return "en_vi";
      if (type === "vi-en") return "vi_en";
      return type;
    })
    .filter(type =>
      ["en_vi", "vi_en", "cloze"].includes(type)
    );

  if (!types.length) types.push("en_vi");

  const count = Math.min(
    Math.max(1, quiz.question_count || available.length),
    available.length
  );

  const chosen = shuffle(available).slice(0, count);

  return chosen.map((word, index) => {
    let type = types[index % types.length];
    let prompt;
    let answer;
    let pool;

    if (type === "cloze") {
      const example = word.example || "";
      const position = example.toLowerCase()
        .indexOf(word.english.toLowerCase());

      if (position >= 0) {
        prompt =
          example.slice(0, position) +
          "_____" +
          example.slice(position + word.english.length);

        answer = word.english;
        pool = available.map(w => w.english);
      } else {
        type = "en_vi";
      }
    }

    if (type === "vi_en") {
      prompt = word.vietnamese;
      answer = word.english;
      pool = available.map(w => w.english);
    } else if (type === "en_vi") {
      prompt = word.english;
      answer = word.vietnamese;
      pool = available.map(w => w.vietnamese);
    }

    const distractors = shuffle(
      [...new Set(pool.filter(x => x !== answer))]
    ).slice(0, 3);

    if (distractors.length < 3) {
      throw new Error(
        "Cần ít nhất 4 đáp án khác nhau cho mỗi dạng câu hỏi."
      );
    }

    return {
      type,
      prompt,
      answer,
      options: shuffle([answer, ...distractors])
    };
  });
}

// =====================================
// 8. BAT DAU LAM QUIZ
// =====================================

async function startQuiz(quizId) {
  showPage("play");

  const area = document.getElementById("questionArea");
  area.textContent = "Đang tải câu hỏi...";

  document.getElementById("answerFeedback")
    .textContent = "";

  document.getElementById("nextBtn").hidden = true;

  if (!db) {
    area.textContent = "Chưa kết nối Supabase.";
    return;
  }

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
      quiz.visibility === "public" &&
      quiz.status === "published";

    const isOwner =
      currentUser?.id === quiz.owner_id;

    if (!isPublic && !isOwner) {
      throw new Error(
        "Bạn không có quyền truy cập quiz này."
      );
    }

    const { data: words, error: wordsError } = await db
      .from("vocabulary")
      .select("english,vietnamese,example")
      .eq("quiz_id", quizId);

    if (wordsError) throw wordsError;

    activeQuestions = makeQuestions(words || [], quiz);
    activeQuiz = quiz;
    questionIndex = 0;
    correctAnswers = 0;
    answeredCurrent = false;

    document.getElementById("quizTitle")
      .textContent = quiz.title;

    startedAt = Date.now();

    document.getElementById("timer")
      .textContent = "00:00";

    stopTimer();

    timerInterval = setInterval(() => {
      const seconds = Math.floor(
        (Date.now() - startedAt) / 1000
      );

      document.getElementById("timer")
        .textContent = formatDuration(seconds);
    }, 1000);

    renderQuestion();
  } catch (error) {
    console.error(error);
    area.textContent =
      "Không mở được quiz: " + error.message;
  }
}

// =====================================
// 9. HIEN THI CAU HOI
// =====================================

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
  heading.textContent =
    `Câu ${questionIndex + 1}/${activeQuestions.length}`;

  const instruction = document.createElement("p");

  instruction.textContent =
    question.type === "en_vi"
      ? "Chọn nghĩa tiếng Việt:"
      : question.type === "vi_en"
        ? "Chọn từ tiếng Anh:"
        : "Chọn từ còn thiếu:";

  const prompt = document.createElement("h3");
  prompt.textContent = question.prompt;

  area.append(heading, instruction, prompt);

  question.options.forEach(option => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "answer-option";
    button.textContent = option;

    button.style.display = "block";
    button.style.width = "100%";
    button.style.margin = "10px 0";
    button.style.textAlign = "left";

    button.addEventListener("click", () => {
      if (answeredCurrent) return;

      answeredCurrent = true;

      const correct = option === question.answer;

      if (correct) correctAnswers++;

      feedback.textContent = correct
        ? "Chính xác!"
        : "Chưa đúng. Đáp án: " + question.answer;

      area.querySelectorAll(".answer-option")
        .forEach(answerButton => {
          answerButton.disabled = true;

          if (
            answerButton.textContent === question.answer
          ) {
            answerButton.style.background = "#dcfce7";
            answerButton.style.color = "#166534";
          } else if (
            answerButton === button && !correct
          ) {
            answerButton.style.background = "#fee2e2";
            answerButton.style.color = "#991b1b";
          }
        });

      next.hidden = false;

      next.textContent =
        questionIndex === activeQuestions.length - 1
          ? "Xem kết quả"
          : "Câu tiếp theo";
    });

    area.appendChild(button);
  });
}

async function nextQuestion() {
  if (!answeredCurrent) return;

  if (questionIndex + 1 < activeQuestions.length) {
    questionIndex++;
    renderQuestion();
  } else {
    await finishQuiz();
  }
}

// =====================================
// 10. KET QUA
// =====================================

async function finishQuiz() {
  stopTimer();

  const seconds = Math.max(
    1,
    Math.floor((Date.now() - startedAt) / 1000)
  );

  const quiz = activeQuiz;

  showPage("results");

  const area = document.getElementById("resultContent");
  area.replaceChildren();

  const summary = document.createElement("p");

  summary.textContent =
    `${quiz.title}: ${correctAnswers}/${activeQuestions.length} câu đúng, ` +
    `${activeQuestions.length - correctAnswers} câu sai. ` +
    `Thời gian: ${formatDuration(seconds)}.`;

  area.appendChild(summary);

  const note = document.createElement("p");
  area.appendChild(note);

  if (currentUser) {
    try {
      const { error } = await db
        .from("quiz_attempts")
        
.insert({
  quiz_id: quiz.id,
  user_id: currentUser.id,
  score: correctAnswers,
  correct_count: correctAnswers,
  wrong_count: activeQuestions.length - correctAnswers,
  total_questions: activeQuestions.length,
  duration_seconds: seconds
});



      if (error) throw error;

      note.textContent = "Đã lưu kết quả.";
    } catch (error) {
      note.textContent =
        "Chưa lưu được kết quả: " + error.message;
    }
  } else {
    note.textContent =
      "Bạn đang làm bài với tư cách khách; kết quả chưa được lưu.";
  }

  await loadLeaderboard(quiz.id);
}

// =====================================
// 11. BANG XEP HANG
// =====================================

async function loadLeaderboard(quizId) {
  const area = document.getElementById("leaderboard");
  if (!area) return;

  area.textContent = "Đang tải bảng xếp hạng...";

  try {
    const { data, error } = await db
      .from("leaderboard")
      .select("*")
      .eq("quiz_id", quizId)
      .order("score", { ascending: false })
      .order("duration_seconds", { ascending: true })
      .limit(20);

    if (error) throw error;

    area.replaceChildren();

    if (!data?.length) {
      area.textContent = "Chưa có kết quả xếp hạng.";
      return;
    }

    data.forEach((row, index) => {
      const p = document.createElement("p");

      p.textContent =
        `${index + 1}. ${row.display_name || "Người chơi"} — ` +
        `${row.score} điểm — ` +
        `${formatDuration(row.duration_seconds || 0)}`;

      area.appendChild(p);
    });
 

  } catch (error) {
    console.error("Lỗi bảng xếp hạng:", error);
    area.textContent =
      "Không tải được bảng xếp hạng: " + error.message;
  }
}



// =====================================
// 12. BIEU MAU TAO / CHINH SUA QUIZ
// =====================================

function showCreatePage() {
  const area = document.getElementById("createQuizForm");
  if (!area) return;

  area.replaceChildren();

  if (!currentUser) {
    area.textContent =
      "Vui lòng đăng nhập Google để tạo quiz.";
    return;
  }

  const isEditing = editingQuizId !== null;

  area.innerHTML = `
    <form id="newQuizForm" class="quiz-form">
      <h3 id="quizFormHeading">
        ${isEditing ? "Chỉnh sửa quiz" : "Tạo quiz mới"}
      </h3>

      <label>Tiêu đề quiz</label>
      <input
        id="newQuizTitle"
        required
        maxlength="150"
        placeholder="Ví dụ: Từ vựng Unit 4"
      >

      <label>Mô tả</label>
      <textarea
        id="newQuizDescription"
        placeholder="Giới thiệu nội dung quiz"
      ></textarea>

      <label>Chế độ chia sẻ</label>
      <select id="newQuizVisibility">
        <option value="private">Riêng tư</option>
        <option value="public">
          Công khai (chờ duyệt)
        </option>
      </select>

      <h3>Dạng câu hỏi</h3>

      <label>
        <input
          type="checkbox"
          name="questionType"
          value="en_vi"
          checked
        >
        Tiếng Anh → Tiếng Việt
      </label>

      <label>
        <input
          type="checkbox"
          name="questionType"
          value="vi_en"
        >
        Tiếng Việt → Tiếng Anh
      </label>

      <label>
        <input
          type="checkbox"
          name="questionType"
          value="cloze"
        >
        Điền từ vào câu
      </label>

      <label>Số lượng câu hỏi</label>
      <input
        id="newQuizCount"
        type="number"
        min="1"
        value="10"
        required
      >

      <h3>Danh sách từ vựng</h3>

      <p>Mỗi dòng nhập theo định dạng:</p>
      <p>
        <strong>
          Tiếng Anh | Nghĩa tiếng Việt | Câu ví dụ
        </strong>
      </p>

      <textarea
        id="newQuizWords"
        rows="10"
        required
        placeholder="achieve | đạt được | She achieved her goal.
benefit | lợi ích | Reading has many benefits.
develop | phát triển | We develop new skills."
      ></textarea>

      <p id="quizSaveMessage"></p>

      <button type="submit" id="saveQuizBtn">
        ${isEditing ? "Lưu thay đổi" : "Lưu bài quiz"}
      </button>

      <button
        type="button"
        id="cancelQuizBtn"
      >
        Hủy
      </button>
    </form>
  `;

  document.getElementById("newQuizForm")
    .addEventListener("submit", saveNewQuiz);

  document.getElementById("cancelQuizBtn")
    .addEventListener("click", cancelQuizEdit);
}

// =====================================
// 13. DOC DANH SACH TU VUNG
// =====================================

function parseVocabulary(text) {
  const lines = text.split(/\r?\n/);
  const words = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split("|").map(x => x.trim());

    if (
      parts.length < 2 ||
      parts.length > 3 ||
      !parts[0] ||
      !parts[1]
    ) {
      throw new Error(
        `Dòng ${i + 1} không đúng định dạng.`
      );
    }

    words.push({
      english: parts[0],
      vietnamese: parts[1],
      example: parts[2] || ""
    });
  }

  return words;
}

// =====================================
// 14. LUU QUIZ MOI HOAC CHINH SUA
// =====================================

async function saveNewQuiz(event) {
  event.preventDefault();

  if (savingQuiz) return;

  const message = document.getElementById("quizSaveMessage");
  const button = document.getElementById("saveQuizBtn");

  if (!db || !currentUser) {
    message.textContent = "Vui lòng đăng nhập lại.";
    return;
  }

  savingQuiz = true;
  button.disabled = true;

  let createdQuizId = null;

  // Lưu lại ID ngay từ đầu để không bị thay đổi.
  const quizIdToEdit = editingQuizId;

  try {
    const title = document
      .getElementById("newQuizTitle")
      .value.trim();

    const description = document
      .getElementById("newQuizDescription")
      .value.trim();

    const visibility = document
      .getElementById("newQuizVisibility")
      .value;

    const count = Number(
      document.getElementById("newQuizCount").value
    );

    const questionTypes = Array.from(
      document.querySelectorAll(
        'input[name="questionType"]:checked'
      )
    ).map(input => input.value);

    const words = parseVocabulary(
      document.getElementById("newQuizWords").value
    );

    if (!title) {
      throw new Error("Bạn chưa nhập tiêu đề.");
    }

    if (!questionTypes.length) {
      throw new Error(
        "Hãy chọn ít nhất một dạng câu hỏi."
      );
    }

    if (words.length < 4) {
      throw new Error(
        "Cần ít nhất 4 từ vựng để tạo quiz."
      );
    }

    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > words.length
    ) {
      throw new Error(
        "Số câu hỏi phải từ 1 đến số từ vựng đã nhập."
      );
    }

    if (
      questionTypes.includes("cloze") &&
      words.some(word => !word.example)
    ) {
      throw new Error(
        "Dạng điền từ yêu cầu mỗi từ có câu ví dụ."
      );
    }

    const englishCount = new Set(
      words.map(w => w.english.toLowerCase())
    ).size;

    const vietnameseCount = new Set(
      words.map(w => w.vietnamese.toLowerCase())
    ).size;

    if (
      questionTypes.some(t =>
        t === "vi_en" || t === "cloze"
      ) &&
      englishCount < 4
    ) {
      throw new Error(
        "Cần ít nhất 4 từ tiếng Anh khác nhau."
      );
    }

    if (
      questionTypes.includes("en_vi") &&
      vietnameseCount < 4
    ) {
      throw new Error(
        "Cần ít nhất 4 nghĩa tiếng Việt khác nhau."
      );
    }

    // ================================
    // CHINH SUA QUIZ CU
    // ================================

    if (quizIdToEdit !== null) {
      message.textContent =
        "Đang cập nhật quiz cũ...";

      const { error } = await db.rpc(
        "update_my_quiz",
        {
          p_quiz_id: quizIdToEdit,
          p_title: title,
          p_description: description,
          p_visibility: visibility,
          p_question_count: count,
          p_question_types: questionTypes,
          p_words: words
        }
      );

      if (error) throw error;

      editingQuizId = null;

      message.textContent =
        visibility === "public"
          ? "Đã cập nhật! Quiz đang chờ duyệt lại."
          : "Đã cập nhật quiz thành công!";

      setTimeout(() => {
        showPage("myQuizzes");
      }, 1000);

      return;
    }

    // ================================
    // TAO QUIZ MOI
    // ================================

    message.textContent =
      "Đang tạo quiz mới...";

    const status =
      visibility === "public"
        ? "pending"
        : "published";

    const { data: quiz, error: quizError } = await db
      .from("quizzes")
      .insert({
        owner_id: currentUser.id,
        title,
        description,
        subject: "english",
        visibility,
        status,
        question_count: count,
        question_types: questionTypes
      })
      .select("id")
      .single();

    if (quizError) throw quizError;

    createdQuizId = quiz.id;

    const vocabularyRows = words.map(word => ({
      quiz_id: createdQuizId,
      english: word.english,
      vietnamese: word.vietnamese,
      example: word.example
    }));

    const { error: wordsError } = await db
      .from("vocabulary")
      .insert(vocabularyRows);

    if (wordsError) throw wordsError;

    message.textContent =
      visibility === "public"
        ? "Đã tạo quiz! Đang chờ duyệt."
        : "Đã tạo quiz riêng tư thành công!";

    setTimeout(() => {
      showPage("myQuizzes");
    }, 1000);

  } catch (error) {
    console.error("Lỗi lưu quiz:", error);

    message.textContent =
      "Không thể lưu quiz: " + error.message;

    // Chỉ dọn bản ghi khi tạo mới thất bại.
    // Tuyệt đối không xóa quiz đang chỉnh sửa.
    if (createdQuizId && quizIdToEdit === null) {
      const { error: cleanupError } = await db
        .from("quizzes")
        .delete()
        .eq("id", createdQuizId)
        .eq("owner_id", currentUser.id);

      if (cleanupError) {
        console.error("Lỗi dọn quiz:", cleanupError);
        message.textContent +=
          " Có thể còn quiz chưa hoàn chỉnh.";
      }
    }

  } finally {
    savingQuiz = false;
    button.disabled = false;
  }
}

// =====================================
// 15. QUIZ CUA TOI
// =====================================

async function loadMyQuizzes() {
  const area = document.getElementById("myQuizList");
  if (!area) return;

  area.replaceChildren();

  if (!currentUser) {
    area.textContent =
      "Vui lòng đăng nhập Google để xem quiz.";
    return;
  }

  if (!db) {
    area.textContent = "Chưa kết nối Supabase.";
    return;
  }

  area.textContent = "Đang tải quiz của bạn...";

  try {
    const { data, error } = await db
      .from("quizzes")
      .select(
        "id,title,description,visibility,status,question_count,created_at"
      )
      .eq("owner_id", currentUser.id)
      .order("created_at", {
        ascending: false
      });

    if (error) throw error;

    area.replaceChildren();

    if (!data?.length) {
      area.textContent =
        "Bạn chưa tạo quiz nào.";
      return;
    }

    data.forEach(quiz => {
      const card = document.createElement("div");
      card.className = "quiz-card";

      const title = document.createElement("h3");
      title.textContent = quiz.title || "Quiz";

      const description = document.createElement("p");
      description.textContent = quiz.description || "";

      const visibility = document.createElement("p");
      visibility.textContent =
        quiz.visibility === "public"
          ? "Chế độ: Công khai"
          : "Chế độ: Riêng tư";

      const status = document.createElement("p");

      if (quiz.status === "pending") {
        status.textContent =
          "Trạng thái: Đang chờ duyệt";
      } else if (quiz.visibility === "private") {
        status.textContent =
          "Trạng thái: Riêng tư";
      } else if (quiz.status === "published") {
        status.textContent =
          "Trạng thái: Đã xuất bản";
      } else {
        status.textContent =
          "Trạng thái: " + quiz.status;
      }

      const count = document.createElement("p");
      count.textContent =
        "Số câu hỏi: " + quiz.question_count;

      const editButton = makeButton(
        "Chỉnh sửa",
        () => editQuiz(quiz.id)
      );

      const playButton = makeButton(
        "Làm thử",
        () => startQuiz(quiz.id)
      );
      
      const deleteButton = makeButton(
        "Xóa",
        () => deleteQuiz(quiz.id, quiz.title)
      );

    deleteButton.classList.add("delete-quiz-btn");


      card.append(
        title,
        description,
        visibility,
        status,
        count,
        editButton,
        playButton,
        deleteButton
      );

      area.appendChild(card);
    });

  } catch (error) {
    console.error(error);
    area.textContent =
      "Không tải được quiz: " + error.message;
  }
}

// =====================================
// 16. MO QUIZ DE CHINH SUA
// =====================================

async function deleteQuiz(quizId, quizTitle) {
  if (!db || !currentUser) {
    alert("Vui lòng đăng nhập Google.");
    return;
  }

  const confirmed = confirm(
    `Bạn có chắc muốn xóa quiz "${quizTitle}"?\n` +
    "Thao tác này không thể hoàn tác."
  );

  if (!confirmed) return;

  try {
    const { error } = await db.rpc(
      "delete_my_quiz",
      { p_quiz_id: quizId }
    );

    if (error) throw error;

    alert("Đã xóa quiz thành công!");
    await loadMyQuizzes();

  } catch (error) {
    console.error("Lỗi xóa quiz:", error);
    alert("Không thể xóa quiz: " + error.message);
  }
}

async function editQuiz(quizId) {
  if (!db || !currentUser) {
    alert("Vui lòng đăng nhập Google.");
    return;
  }

  try {
    const { data: quiz, error: quizError } = await db
      .from("quizzes")
      .select("*")
      .eq("id", quizId)
      .eq("owner_id", currentUser.id)
      .single();

    if (quizError) throw quizError;

    const { data: words, error: wordsError } = await db
      .from("vocabulary")
      .select("english,vietnamese,example")
      .eq("quiz_id", quizId);

    if (wordsError) throw wordsError;

    // Quan trọng: gán ID trước khi mở form.
    editingQuizId = quizId;

    // Không được xóa ID trong showPage.
    showPage("create", {
      preserveEditing: true
    });

    const titleInput =
      document.getElementById("newQuizTitle");

    if (!titleInput) {
      throw new Error("Không tìm thấy biểu mẫu.");
    }

    titleInput.value = quiz.title || "";

    document.getElementById("newQuizDescription")
      .value = quiz.description || "";

    document.getElementById("newQuizVisibility")
      .value = quiz.visibility || "private";

    document.getElementById("newQuizCount")
      .value = quiz.question_count || words.length;

    document.getElementById("newQuizWords")
      .value = (words || []).map(word =>
        [
          word.english,
          word.vietnamese,
          word.example || ""
        ].join(" | ")
      ).join("\n");

    const types = quiz.question_types || ["en_vi"];

    document.querySelectorAll(
      'input[name="questionType"]'
    ).forEach(input => {
      input.checked = types.includes(input.value);
    });

    document.getElementById("saveQuizBtn")
      .textContent = "Lưu thay đổi";

    document.getElementById("quizFormHeading")
      .textContent = "Chỉnh sửa quiz";

  } catch (error) {
    console.error(error);
    editingQuizId = null;
    alert("Không mở được quiz: " + error.message);
  }
}

// =====================================
// 17. LICH SU
// =====================================



async function showHistory() {
  const area = document.getElementById("historyList");
  if (!area) return;

  if (!currentUser) {
    area.textContent = "Vui lòng đăng nhập để xem lịch sử.";
    return;
  }

  area.textContent = "Đang tải lịch sử...";

  try {
    const { data, error } = await db
      .from("quiz_attempts")
      .select(
        "quiz_id,score,correct_count,total_questions,duration_seconds,created_at"
      )
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    area.replaceChildren();

    if (!data || data.length === 0) {
      area.textContent = "Bạn chưa có lịch sử làm bài.";
      return;
    }

    const quizIds = [...new Set(data.map(a => a.quiz_id))];

    const { data: quizzes, error: quizError } = await db
      .from("quizzes")
      .select("id,title")
      .in("id", quizIds);

    if (quizError) throw quizError;

    const quizMap = new Map(
      (quizzes || []).map(q => [q.id, q.title])
    );

    data.forEach(attempt => {
      const card = document.createElement("div");
      card.className = "quiz-card";

      const title = document.createElement("h3");
      title.textContent =
        quizMap.get(attempt.quiz_id) || "Quiz đã xóa";

      const result = document.createElement("p");
      const correct = attempt.correct_count ?? attempt.score;

      result.textContent = attempt.total_questions
        ? `Kết quả: ${correct}/${attempt.total_questions} câu đúng`
        : `Số câu đúng: ${correct}`;

      const duration = document.createElement("p");
      duration.textContent =
        "Thời gian: " +
        formatDuration(attempt.duration_seconds || 0);

      const date = document.createElement("p");
      date.textContent =
        "Ngày làm: " +
        new Date(attempt.created_at).toLocaleString("vi-VN");

      card.append(title, result, duration, date);
      area.appendChild(card);
    });

  } catch (error) {
    console.error("Lỗi lịch sử:", error);
    area.textContent =
      "Không tải được lịch sử: " + error.message;
  }
}


  


// =====================================
// 18. KHOI DONG WEBSITE
// =====================================

// =====================================
// QUAN TRI VIEN - DUYET QUIZ
// =====================================

let isQuizAdmin = false;

async function checkQuizAdmin() {
  isQuizAdmin = false;

  const navButton = document.getElementById("adminNavBtn");

  if (navButton) navButton.hidden = true;

  if (!db || !currentUser) return false;

  try {
    const { data, error } = await db
      .from("quiz_admins")
      .select("user_id")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    isQuizAdmin = Boolean(data);

    if (navButton) {
      navButton.hidden = !isQuizAdmin;
    }

    return isQuizAdmin;

  } catch (error) {
    console.error("Lỗi kiểm tra quản trị viên:", error);
    return false;
  }
}

async function loadPendingQuizzes() {
  const area = document.getElementById("pendingQuizList");
  if (!area) return;

  area.textContent = "Đang tải quiz chờ duyệt...";

  if (!db || !currentUser) {
    area.textContent = "Vui lòng đăng nhập.";
    return;
  }

  try {
    const { data: quizzes, error } = await db.rpc(
      "get_pending_quizzes"
    );

    if (error) throw error;

    area.replaceChildren();

    if (!quizzes?.length) {
      area.textContent =
        "Hiện không có quiz nào đang chờ duyệt.";
      return;
    }

    quizzes.forEach(quiz => {
      const card = document.createElement("div");
      card.className = "quiz-card admin-quiz-card";

      const title = document.createElement("h3");
      title.textContent = quiz.title || "Quiz";

      const description = document.createElement("p");
      description.textContent =
        quiz.description || "Không có mô tả.";

      const count = document.createElement("p");
      count.textContent =
        "Số câu hỏi: " + quiz.question_count;

      const date = document.createElement("p");
      date.textContent =
        "Ngày gửi: " +
        new Date(quiz.created_at).toLocaleString("vi-VN");

      const buttons = document.createElement("div");
      buttons.className = "quiz-actions";

      const approve = document.createElement("button");
      approve.type = "button";
      approve.textContent = "Duyệt";
      approve.className = "approve-quiz-btn";

      approve.addEventListener("click", () => {
        reviewQuiz(quiz.id, true);
      });

      const reject = document.createElement("button");
      reject.type = "button";
      reject.textContent = "Từ chối";
      reject.className = "reject-quiz-btn";

      reject.addEventListener("click", () => {
        reviewQuiz(quiz.id, false);
      });

      buttons.append(approve, reject);

      card.append(
        title,
        description,
        count,
        date,
        buttons
      );

      area.appendChild(card);
    });

  } catch (error) {
    console.error("Lỗi tải quiz chờ duyệt:", error);
    area.textContent =
      "Không tải được danh sách: " + error.message;
  }
}

async function reviewQuiz(quizId, approve) {
  if (!db || !currentUser) {
    alert("Vui lòng đăng nhập.");
    return;
  }

  const action = approve ? "duyệt" : "từ chối";

  if (!confirm(`Bạn có chắc muốn ${action} quiz này?`)) {
    return;
  }

  try {
    const { error } = await db.rpc(
      "review_public_quiz",
      {
        p_quiz_id: quizId,
        p_approve: approve
      }
    );

    if (error) throw error;

    alert(
      approve
        ? "Đã duyệt và xuất bản quiz!"
        : "Đã từ chối quiz."
    );

    await loadPendingQuizzes();

  } catch (error) {
    console.error("Lỗi duyệt quiz:", error);
    alert("Không thể xử lý quiz: " + error.message);
  }
}


document.addEventListener("DOMContentLoaded", async () => {
  console.log("VOCAB QUIZ đang khởi động...");

  const connected = connectSupabase();

  if (connected) {
    db.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      updateLoginButton();

      setTimeout(() => {
        checkQuizAdmin();
      }, 0);
    });

    await checkUser();
  }

  document.getElementById("nextBtn")
    ?.addEventListener("click", nextQuestion);

  // Đảm bảo nút Tạo quiz mở biểu mẫu mới
  document.querySelectorAll(
    'button[onclick="showPage(\'create\')"]'
  ).forEach(button => {
    button.setAttribute(
      "onclick",
      "openNewQuiz()"
    );
  });

  showPage("home");

  console.log("VOCAB QUIZ đã sẵn sàng.");
});
