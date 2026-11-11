
"use strict";

// ======================================
// 1. CAU HINH SUPABASE
// ======================================

// Kiem tra lai URL voi Supabase Project Settings
const SUPABASE_URL = "https://tdekbojbfnttitllfltl.supabase.co";

// Dan Publishable Key cua ban vao day
const SUPABASE_ANON_KEY = "sb_publishable_GnRVaCZsV43UDnJHNon9ng_GSvUe6YT";

const WEBSITE_URL =
  "https://miinquaan.github.io/10diemcungquiz/";

let db = null;
let currentUser = null;

// ======================================
// 2. CHUYEN TRANG
// ======================================


function showPage(pageId) {
  const target = document.getElementById(pageId);

  if (!target) {
    console.error("Không tìm thấy trang:", pageId);
    return;
  }

  document.querySelectorAll(".page").forEach(page => {
    page.hidden = page.id !== pageId;
  });

  if (pageId === "library") loadQuizzes();
  if (pageId === "history") showHistory();
  if (pageId === "myQuizzes") loadMyQuizzes();

  if (pageId === "create") {
    editingQuizId = null;
    showCreatePage();
  }
}


// ======================================
// 3. KET NOI SUPABASE
// ======================================

function connectSupabase() {
  const keyValid =
    SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY !== "DAN_PUBLISHABLE_KEY_VAO_DAY";

  if (!SUPABASE_URL || !keyValid) {
    console.warn("Chua cau hinh Supabase.");
    return false;
  }

  if (!window.supabase) {
    console.error("Khong tai duoc Supabase JS.");
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

    console.log("Supabase client da khoi tao.");
    return true;

  } catch (error) {
    console.error("Loi Supabase:", error);
    return false;
  }
}

// ======================================
// 4. DANG NHAP GOOGLE
// ======================================

async function loginGoogle() {
  if (!db) {
    alert("Chua cau hinh ket noi Supabase.");
    return;
  }

  if (currentUser) {
    const confirmLogout = confirm(
      "Ban muon dang xuat tai khoan?"
    );

    if (confirmLogout) {
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
    console.error(error);
    alert("Loi dang nhap: " + error.message);
  }
}

// ======================================
// 5. DANG XUAT
// ======================================

async function logoutGoogle() {
  if (!db) return;

  try {
    const { error } = await db.auth.signOut();

    if (error) throw error;

    currentUser = null;
    updateLoginButton();
    showPage("home");

  } catch (error) {
    alert("Loi dang xuat: " + error.message);
  }
}

// ======================================
// 6. CAP NHAT TRANG THAI DANG NHAP
// ======================================

function updateLoginButton() {
  const btn = document.getElementById("loginBtn");

  if (!btn) return;

  if (currentUser) {
    btn.textContent = "Đăng xuất";
    btn.title = currentUser.email || "";
  } else {
    btn.textContent = "Đăng nhập Google";
    btn.title = "";
  }
}


async function checkUser() {
  if (!db) return;

  try {
    const { data, error } = await db.auth.getUser();

    if (error) {
      console.warn("Khong lay duoc user:", error.message);
    }

    currentUser = data?.user || null;
    updateLoginButton();

  } catch (error) {
    console.error("Loi kiem tra user:", error);
  }
}

// ======================================
// 7. KHO QUIZ CONG KHAI
// ======================================


let activeQuiz = null;
let activeQuestions = [];
let questionIndex = 0;
let correctAnswers = 0;
let startedAt = 0;
let timerInterval = null;
let answeredCurrent = false;

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function stopTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
  }
  timerInterval = null;
}

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
      .select("id, title, description, question_count, question_types")
      .eq("visibility", "public")
      .eq("status", "published")
      .order("created_at", { ascending: false });

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

      const desc = document.createElement("p");
      desc.textContent = quiz.description || "";

      const button = document.createElement("button");
      button.textContent = "Bắt đầu làm quiz";
      button.addEventListener("click", () => startQuiz(quiz.id));

     card.append(title, desc, button);
      area.appendChild(card);
    });
  } catch (error) {
    console.error("Lỗi tải quiz:", error);
    area.textContent = "Không tải được quiz: " + error.message;
  }
}

function makeQuestions(words, quiz) {
  const available = words.filter(
    w => w.english?.trim() && w.vietnamese?.trim()
  );

  if (available.length < 4) {
    throw new Error("Quiz cần ít nhất 4 từ vựng hợp lệ.");
  }

  const types = (quiz.question_types || ["en_vi"]).map(t => {
    if (t === "en-vi") return "en_vi";
    if (t === "vi-en") return "vi_en";
    return t;
  });

  const allowed = types.filter(
    t => ["en_vi", "vi_en", "cloze"].includes(t)
  );

  if (!allowed.length) allowed.push("en_vi");

  const count = Math.min(
    Math.max(1, quiz.question_count || available.length),
    available.length
  );

  const chosen = shuffle(available).slice(0, count);

  return chosen.map((word, index) => {
    let type = allowed[index % allowed.length];
    let prompt;
    let answer;
    let pool;

    if (type === "cloze") {
      const example = word.example || "";
      const position = example.toLocaleLowerCase()
        .indexOf(word.english.toLocaleLowerCase());

      if (position >= 0) {
        prompt = example.slice(0, position) +
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

    const distractors = shuffle([
      ...new Set(pool.filter(x => x !== answer))
    ]).slice(0, 3);

    if (distractors.length < 3) {
      throw new Error(
        "Cần ít nhất 4 đáp án phân biệt để tạo trắc nghiệm."
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

async function startQuiz(quizId) {
  stopTimer();
  showPage("play");

  const area = document.getElementById("questionArea");
  area.textContent = "Đang tải câu hỏi...";

  document.getElementById("answerFeedback").textContent = "";
  document.getElementById("nextBtn").hidden = true;

  try {
    const { data: quiz, error: quizError } = await db
      .from("quizzes")
      .select("id, title, question_count, question_types, visibility, status, owner_id")
      .eq("id", quizId)
      .single();

    if (quizError) throw quizError;

    if (
      !(quiz.visibility === "public" && quiz.status === "published") &&
      quiz.owner_id !== currentUser?.id
    ) {
      throw new Error("Bạn không có quyền truy cập quiz này.");
    }

    const { data: words, error: wordsError } = await db
      .from("vocabulary")
      .select("english, vietnamese, example")
      .eq("quiz_id", quizId);

    if (wordsError) throw wordsError;

    activeQuestions = makeQuestions(words || [], quiz);
    activeQuiz = quiz;
    questionIndex = 0;
    correctAnswers = 0;
    answeredCurrent = false;

    document.getElementById("quizTitle").textContent = quiz.title;

    startedAt = Date.now();
    document.getElementById("timer").textContent = "00:00";

    timerInterval = setInterval(() => {
      const seconds = Math.floor(
        (Date.now() - startedAt) / 1000
      );

      document.getElementById("timer").textContent =
        formatDuration(seconds);
    }, 1000);

    renderQuestion();
  } catch (error) {
    console.error("Lỗi mở quiz:", error);
    area.textContent = "Không mở được quiz: " + error.message;
  }
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
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "answer-option";
    btn.textContent = option;

    btn.style.display = "block";
    btn.style.margin = "10px 0";
    btn.style.width = "100%";
    btn.style.textAlign = "left";

    btn.addEventListener("click", () => {
      if (answeredCurrent) return;

      answeredCurrent = true;

      const correct = option === question.answer;

      if (correct) correctAnswers++;

      feedback.textContent = correct
        ? "Chính xác!"
        : `Chưa đúng. Đáp án: ${question.answer}`;

      area.querySelectorAll(".answer-option").forEach(b => {
        b.disabled = true;

        if (b.textContent === question.answer) {
          b.style.background = "#dcfce7";
          b.style.color = "#166534";
        } else if (b === btn && !correct) {
          b.style.background = "#fee2e2";
          b.style.color = "#991b1b";
        }
      });

      next.hidden = false;
      next.textContent =
        questionIndex === activeQuestions.length - 1
          ? "Xem kết quả"
          : "Câu tiếp theo";
    });

    area.appendChild(btn);
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
    const { error } = await db
      .from("quiz_attempts")
      .insert({
        quiz_id: quiz.id,
        user_id: currentUser.id,
        score: correctAnswers,
        duration_seconds: seconds
      });

    note.textContent = error
      ? "Chưa lưu được kết quả: " + error.message
      : "Đã lưu kết quả.";
  } else {
    note.textContent =
      "Bạn đang làm bài với tư cách khách; kết quả chưa được lưu.";
  }

  await loadLeaderboard(quiz.id);
}

async function loadLeaderboard(quizId) {
  const area = document.getElementById("leaderboard");
  area.textContent = "Đang tải bảng xếp hạng...";

  const { data, error } = await db
    .from("leaderboard")
    .select("*")
    .eq("quiz_id", quizId)
    .order("score", { ascending: false })
    .order("duration_seconds", { ascending: true })
    .limit(20);

  if (error) {
    console.warn("Lỗi bảng xếp hạng:", error.message);
    area.textContent =
      "Bảng xếp hạng chưa được cấu hình đầy đủ.";
    return;
  }

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
}


// ======================================
// 8. TRANG TAO QUIZ
// ======================================


function showCreatePage() {
  const area = document.getElementById("createQuizForm");
  if (!area) return;

  area.replaceChildren();

  if (!currentUser) {
    area.textContent = "Vui lòng đăng nhập Google để tạo quiz.";
    return;
  }

  area.innerHTML = `
    <form id="newQuizForm" class="quiz-form">
      <h3>Thông tin bài quiz</h3>

      <label>Tiêu đề quiz</label>
      <input id="newQuizTitle" required
        maxlength="150"
        placeholder="Ví dụ: Từ vựng Unit 4">

      <label>Mô tả</label>
      <textarea id="newQuizDescription"
        placeholder="Giới thiệu nội dung quiz"></textarea>

      <label>Chế độ chia sẻ</label>
      <select id="newQuizVisibility">
        <option value="private">Riêng tư</option>
        <option value="public">Công khai (chờ duyệt)</option>
      </select>

      <h3>Dạng câu hỏi</h3>

      <label>
        <input type="checkbox" name="questionType"
          value="en_vi" checked>
        Tiếng Anh → Tiếng Việt
      </label>

      <label>
        <input type="checkbox" name="questionType"
          value="vi_en">
        Tiếng Việt → Tiếng Anh
      </label>

      <label>
        <input type="checkbox" name="questionType"
          value="cloze">
        Điền từ vào câu
      </label>

      <label>Số lượng câu hỏi</label>
      <input id="newQuizCount" type="number"
        min="1" value="10" required>

      <h3>Danh sách từ vựng</h3>
      <p>Mỗi dòng nhập theo định dạng:</p>
      <p><strong>Tiếng Anh | Nghĩa tiếng Việt | Câu ví dụ</strong></p>

      <textarea id="newQuizWords" rows="10" required
        placeholder="achieve | đạt được | She achieved her goal.
benefit | lợi ích | Reading has many benefits.
develop | phát triển | We develop new skills."></textarea>

      <p id="quizSaveMessage"></p>

      <button type="submit" id="saveQuizBtn">
        Lưu bài quiz
      </button>
    </form>
  `;

  document.getElementById("newQuizForm")
    .addEventListener("submit", saveNewQuiz);
}

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

async function saveNewQuiz(event) {
  event.preventDefault();

  const message = document.getElementById("quizSaveMessage");
  const button = document.getElementById("saveQuizBtn");

  if (!db || !currentUser) {
    message.textContent = "Vui lòng đăng nhập lại.";
    return;
  }

  let createdQuizId = null;
  button.disabled = true;
  message.textContent = "Đang kiểm tra dữ liệu...";

  try {
    const title =
      document.getElementById("newQuizTitle").value.trim();

    const description =
      document.getElementById("newQuizDescription").value.trim();

    const visibility =
      document.getElementById("newQuizVisibility").value;

    const count = Number(
      document.getElementById("newQuizCount").value
    );

    const questionTypes = Array.from(
      document.querySelectorAll(
        'input[name="questionType"]:checked'
      )
    ).map(x => x.value);

    const words = parseVocabulary(
      document.getElementById("newQuizWords").value
    );

    if (!title) {
      throw new Error("Bạn chưa nhập tiêu đề quiz.");
    }

    if (questionTypes.length === 0) {
      throw new Error("Hãy chọn ít nhất một dạng câu hỏi.");
    }

    if (words.length < 4) {
      throw new Error(
        "Cần ít nhất 4 từ vựng để tạo câu hỏi trắc nghiệm."
      );
    }

    if (!Number.isInteger(count) ||
        count < 1 ||
        count > words.length) {
      throw new Error(
        "Số câu hỏi phải từ 1 đến số từ vựng đã nhập."
      );
    }

    if (
      questionTypes.includes("cloze") &&
      words.some(w => !w.example)
    ) {
      throw new Error(
        "Khi chọn điền từ, mỗi từ cần có câu ví dụ."
      );
    }

    message.textContent = "Đang lưu quiz...";
    if (editingQuizId) {
  const { error } = await db.rpc("update_my_quiz", {
    p_quiz_id: editingQuizId,
    p_title: title,
    p_description: description,
    p_visibility: visibility,
    p_question_count: count,
    p_question_types: questionTypes,
    p_words: words
  });

  if (error) throw error;

  editingQuizId = null;
  message.textContent = "Đã cập nhật quiz thành công!";

  setTimeout(() => {
    showPage("myQuizzes");
  }, 1000);

  return;
}
    // CHẾ ĐỘ CHỈNH SỬA QUIZ
    if (editingQuizId) {
      message.textContent = "Đang cập nhật quiz...";

      const { error: updateError } = await db.rpc(
        "update_my_quiz",
        {
          p_quiz_id: editingQuizId,
          p_title: title,
          p_description: description,
          p_visibility: visibility,
          p_question_count: count,
          p_question_types: questionTypes,
          p_words: words
        }
      );

      if (updateError) throw updateError;

      editingQuizId = null;

      message.textContent =
        visibility === "public"
          ? "Đã cập nhật! Quiz đang chờ duyệt lại."
          : "Đã cập nhật quiz riêng tư thành công!";

      setTimeout(() => {
        showPage("myQuizzes");
      }, 1000);

      return;
    }


    const status =
      visibility === "public" ? "pending" : "published";

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
        ? "Đã gửi quiz thành công! Đang chờ quản trị viên duyệt."
        : "Đã lưu quiz riêng tư thành công!";

    document.getElementById("newQuizForm").reset();

setTimeout(() => {
  showPage("myQuizzes");
}, 1000);

  } catch (error) {
    console.error("Lỗi lưu quiz:", error);

    message.textContent =
      "Không thể lưu quiz: " + error.message;

    // Chỉ xóa bản quiz chưa hoàn chỉnh nếu có quyền xóa.
    if (createdQuizId) {
      const { error: cleanupError } = await db
        .from("quizzes")
        .delete()
        .eq("id", createdQuizId)
        .eq("owner_id", currentUser.id);

      if (cleanupError) {
        console.error(
          "Không thể dọn quiz chưa hoàn chỉnh:",
          cleanupError
        );
        message.textContent +=
          " Có thể còn một quiz chưa hoàn chỉnh trong cơ sở dữ liệu.";
      }
    }

  } finally {
    button.disabled = false;
  }
}


// ======================================
// 9. LICH SU
// ======================================

function showHistory() {
  const area = document.getElementById("historyList");

  if (!area) return;

  area.textContent = currentUser
    ? "Chuc nang lich su dang duoc phat trien."
    : "Dang nhap de xem lich su lam quiz.";
}

async function loadMyQuizzes() {
  const area = document.getElementById("myQuizList");
  if (!area) return;

  area.replaceChildren();

  if (!currentUser) {
    area.textContent =
      "Vui lòng đăng nhập Google để xem quiz của bạn.";
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
        "id, title, description, visibility, status, question_count, created_at"
      )
      .eq("owner_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    area.replaceChildren();

    if (!data || data.length === 0) {
      area.textContent =
        "Bạn chưa tạo quiz nào. Nhấn Tạo quiz mới để bắt đầu.";
      return;
    }

    data.forEach(quiz => {
      const card = document.createElement("div");
      card.className = "quiz-card";

      const title = document.createElement("h3");
      title.textContent = quiz.title || "Quiz chưa đặt tên";

      const description = document.createElement("p");
      description.textContent = quiz.description || "";

      const visibility = document.createElement("p");
      visibility.textContent =
        quiz.visibility === "public"
          ? "Chế độ: Công khai"
          : "Chế độ: Riêng tư";

      const status = document.createElement("p");

      if (quiz.status === "pending") {
        status.textContent = "Trạng thái: Đang chờ duyệt";
      } else if (quiz.status === "published") {
        status.textContent = "Trạng thái: Đã xuất bản";
      } else {
        status.textContent =
          "Trạng thái: " + quiz.status;
      }

      const count = document.createElement("p");
      count.textContent =
        "Số câu hỏi: " + (quiz.question_count || "Chưa xác định");

      
const editButton = document.createElement("button");
editButton.type = "button";
editButton.textContent = "Chỉnh sửa";

editButton.addEventListener("click", () => {
  editQuiz(quiz.id);
});

card.append(
  title,
  description,
  visibility,
  status,
  count,
  editButton
);


      area.appendChild(card);
    });

  } catch (error) {
    console.error("Lỗi tải quiz cá nhân:", error);

    area.textContent =
      "Không tải được quiz: " + error.message;
  }
}

let editingQuizId = null;

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
      .select("english, vietnamese, example")
      .eq("quiz_id", quizId);

    if (wordsError) throw wordsError;

    showPage("create");
    editingQuizId = quizId;

    document.getElementById("newQuizTitle").value =
      quiz.title || "";

    document.getElementById("newQuizDescription").value =
      quiz.description || "";

    document.getElementById("newQuizVisibility").value =
      quiz.visibility;

    document.getElementById("newQuizCount").value =
      quiz.question_count || words.length;

    document.getElementById("newQuizWords").value =
      words.map(word =>
        `${word.english} | ${word.vietnamese} | ${word.example || ""}`
      ).join("\n");

    const types = quiz.question_types || ["en_vi"];

    document.querySelectorAll(
      'input[name="questionType"]'
    ).forEach(input => {
      input.checked = types.includes(input.value);
    });

    document.getElementById("saveQuizBtn").textContent =
      "Lưu thay đổi";

  } catch (error) {
    console.error(error);
    alert("Không mở được quiz: " + error.message);
  }
}

// ======================================
// 10. KHOI DONG WEBSITE
// ======================================

document.addEventListener("DOMContentLoaded", async () => {
  console.log("VOCAB QUIZ dang khoi dong...");

  showPage("home");

  const connected = connectSupabase();

  if (connected) {
    db.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      updateLoginButton();
    });

    await checkUser();
  }

  
document.getElementById("nextBtn")
  ?.addEventListener("click", nextQuestion);

  console.log("VOCAB QUIZ da san sang.");
});
