
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

  const message = document.createElement("p");

  if (!db) {
    message.textContent = "Chua ket noi Supabase.";
  } else if (!currentUser) {
    message.textContent =
      "Vui long dang nhap Google de tao quiz.";
  } else {
    message.textContent =
      "Ban da dang nhap. Bieu mau tao quiz se duoc bo sung.";
  }

  area.appendChild(message);
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
