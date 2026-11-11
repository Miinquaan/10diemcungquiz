
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
    console.error("Khong tim thay trang:", pageId);
    return;
  }

  document.querySelectorAll(".page").forEach(page => {
    page.hidden = page.id !== pageId;
  });

  if (pageId === "library") {
    loadQuizzes();
  }

  if (pageId === "create") {
    showCreatePage();
  }

  if (pageId === "history") {
    showHistory();
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

async function loadQuizzes() {
  const area = document.getElementById("quizList");

  if (!area) return;

  area.textContent = "Dang tai danh sach quiz...";

  if (!db) {
    area.textContent = "Chua ket noi Supabase.";
    return;
  }

  try {
    const { data, error } = await db
      .from("quizzes")
      .select("id, title, description")
      .eq("visibility", "public")
      .eq("status", "published");

    if (error) throw error;

    area.replaceChildren();

    if (!data || data.length === 0) {
      area.textContent = "Chua co quiz cong khai.";
      return;
    }

    data.forEach(quiz => {
      const card = document.createElement("div");
      card.className = "quiz-card";

      const title = document.createElement("h3");
      title.textContent = quiz.title || "Quiz";

      const desc = document.createElement("p");
      desc.textContent = quiz.description || "";

      const note = document.createElement("p");
      note.textContent =
        "Chuc nang lam quiz dang duoc phat trien.";

      card.append(title, desc, note);
      area.appendChild(card);
    });

  } catch (error) {
    console.error("Loi tai quiz:", error);
    area.textContent =
      "Khong tai duoc quiz: " + error.message;
  }
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

  console.log("VOCAB QUIZ da san sang.");
});
