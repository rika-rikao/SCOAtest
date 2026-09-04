import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- 設定 ---
  const firebaseConfig = {
    apiKey: "AIzaSyC1ihCISzvkFNzTnhkr_Nm7OgqL_LRIIKo",
    authDomain: "scoatest-8402c.firebaseapp.com",
    projectId: "scoatest-8402c",
    storageBucket: "scoatest-8402c.firebasestorage.app",
    messagingSenderId: "372101169652",
    appId: "1:372101169652:web:216495fd18c8d6a3b779a1",
    measurementId: "G-YM05ZEJESC"
  };
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- SPAルーティング ---
window.navigate = (pageId) => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
};

// --- Gemini APIによる問題生成とFirebase保存 ---
document.getElementById('btn-generate').addEventListener('click', async () => {
  const genre = document.getElementById('gen-genre').value;
  const status = document.getElementById('gen-status');
  status.textContent = "Geminiで問題生成中...";

  const prompt = `SCOA（総合適性検査）の「${genre}」ジャンルの問題を1問作成してください。
  以下のJSONフォーマットのみを出力してください。バッククォートなどの修飾は不要です。
  {
    "genre": "${genre}",
    "question": "問題文",
    "correct": "正解の選択肢",
    "incorrect": ["誤りの選択肢1", "誤りの選択肢2", "誤りの選択肢3", "誤りの選択肢4", "誤りの選択肢5", "誤りの選択肢6", "誤りの選択肢7", "誤りの選択肢8", "誤りの選択肢9", "誤りの選択肢10"]
  }`;

  try {
const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwu8Sg3a9GtryzfvrUhgYOtAokk15t3GvAkvB8PYLW15-a5WietKIr4Jfuuj2MduSBx/exec";

const response = await fetch(GAS_WEBAPP_URL, {
  method: "POST",
  // GASのWebアプリへPOSTする場合、no-corsモードにするか、Content-Typeをtext/plainにする必要があります（CORSエラー回避のため）
  headers: { "Content-Type": "text/plain" },
  body: JSON.stringify({ prompt: prompt })
});
    const data = await response.json();
    let jsonText = data.candidates[0].content.parts[0].text;
    // Markdownのコードブロックタグを除去
    jsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const questionData = JSON.parse(jsonText);
    
    await addDoc(collection(db, "scoa_questions"), questionData);
    status.textContent = "Firebaseへの保存が完了しました！";
  } catch (error) {
    console.error(error);
    status.textContent = "エラーが発生しました。コンソールを確認してください。";
  }
});

// --- テスト実行ロジック ---
let currentQuestions = [];
let currentIndex = 0;
let score = 0;
let timerInterval;

window.startTest = async (mode) => {
  navigate('page-test');
  document.getElementById('question-text').textContent = "問題を読み込み中...";
  document.getElementById('choices-container').innerHTML = "";
  
  let q;
  if (mode === 'all') {
    q = query(collection(db, "scoa_questions"));
  } else {
    // modeが genre に一致する場合（'math'などの判定は適宜日本語にマッピング）
    const genreMap = { 'math': '数理', 'language': '言語' };
    q = query(collection(db, "scoa_questions"), where("genre", "==", genreMap[mode] || mode));
  }

  const querySnapshot = await getDocs(q);
  currentQuestions = [];
  querySnapshot.forEach((doc) => {
    currentQuestions.push(doc.data());
  });

  if (currentQuestions.length === 0) {
    alert("問題が登録されていません。");
    navigate('page-menu');
    return;
  }

  // シャッフル
  currentQuestions.sort(() => Math.random() - 0.5);
  currentIndex = 0;
  score = 0;

  // タイマー設定 (SCOA本番を意識して120問60分=3600秒など。ここではテスト用に短縮可能)
  let timeLeft = 3600; 
  document.getElementById('timer').textContent = "60:00";
  timerInterval = setInterval(() => {
    timeLeft--;
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    document.getElementById('timer').textContent = `${m}:${s}`;
    if (timeLeft <= 0) finishTest();
  }, 1000);

  showQuestion();
};

function showQuestion() {
  if (currentIndex >= currentQuestions.length) {
    finishTest();
    return;
  }

  const qData = currentQuestions[currentIndex];
  document.getElementById('test-progress').textContent = `問題 ${currentIndex + 1} / ${currentQuestions.length}`;
  document.getElementById('question-text').textContent = qData.question;

  // SCOAは通常5択程度なので、誤答から4つランダムに選ぶ
  let incorrectChoices = qData.incorrect.sort(() => Math.random() - 0.5).slice(0, 4);
  let allChoices = [...incorrectChoices, qData.correct].sort(() => Math.random() - 0.5);

  const container = document.getElementById('choices-container');
  container.innerHTML = "";
  
  allChoices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = "choice-btn";
    btn.textContent = choice;
    btn.onclick = () => {
      if (choice === qData.correct) score++;
      currentIndex++;
      showQuestion();
    };
    container.appendChild(btn);
  });
}

function finishTest() {
  clearInterval(timerInterval);
  navigate('page-result');
  document.getElementById('score-display').textContent = `正答数: ${score} / ${currentQuestions.length}`;
}
