
"use strict";

// Cấu hình Supabase
const SUPABASE_URL = "https://tdekbojbftntitllftl.supabase.co"";
const SUPABASE_ANON_KEY = "sb_publishable_GnRVaCZsV43UDnJHNon9ng_GSvUe6YT";

let db = null;

// Chuyển trang
function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.hidden = page.id !== pageId;
  });

  if (pageId === "library") loadQuizzes();
  if (pageId === "create") showCreatePage();
  if (pageId === "history") showHistory();
}

// Kết nối Supabase
function connectSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("Chưa cấu hình Supabase.");
    return;
  }

  if (!window.supabase) {
    console.error("Không tải được thư viện Supabase.");
    return;
  }

  db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
}

// Đăng nhập Google
async function loginGoogle() {
  if (!db) {
    alert("Chưa cấu hình kết nối Supabase.");
    return;
  }

  const redirectTo =
    "https://miinquaan.github.io/10diemcungquiz/";

  const { error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo }
  });

  if (error) alert("Lỗi đăng nhập: " + error.message);
}

// Kiểm tra người dùng
async function checkUser() {
  if (!db) return;

  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return;

  const btn = document.getElementById("loginBtn");
  if (btn) btn.textContent = "Đã đăng nhập";
}

// Kho quiz
async function loadQuizzes() {
  const area = document.getElementById("quizList");
  if (!area) return;

  if (!db) {
    area.textContent = "Chưa kết nối cơ sở dữ liệu.";
    return;
  }

  const { data, error } = await db
    .from("quizzes")
    .select("id, title, description")
    .eq("visibility", "public")
    .eq("status", "published");

  if (error) {
    area.textContent = "Không tải được quiz: " + error.message;
    return;
  }

  area.replaceChildren();

  if (!data.length) {
    area.textContent = "Chưa có quiz công khai.";
    return;
  }

  data.forEach(quiz => {
    const card = document.createElement("div");
    card.className = "quiz-card";

    const title = document.createElement("h3");
    title.textContent = quiz.title;

    const desc = document.createElement("p");
    desc.textContent = quiz.description || "";

    card.append(title, desc);
    area.appendChild(card);
  });
}

// Trang tạo quiz
async function showCreatePage() {
  const area = document.getElementById("createQuizForm");
  if (!area) return;

  if (!db) {
    area.textContent = "Chưa kết nối Supabase.";
    return;
  }

  const { data } = await db.auth.getUser();

  area.textContent = data.user
    ? "Đã đăng nhập. Biểu mẫu tạo quiz sẽ được bổ sung."
    : "Vui lòng đăng nhập Google để tạo quiz.";
}

// Lịch sử
function showHistory() {
  const area = document.getElementById("historyList");
  if (area) {
    area.textContent =
      "Chức năng lịch sử sẽ được bổ sung.";
  }
}

// Khởi động
document.addEventListener("DOMContentLoaded", async () => {
  connectSupabase();
  showPage("home");
  await checkUser();
});
