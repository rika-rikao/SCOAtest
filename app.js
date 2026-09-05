import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// === Firebase 初期設定 (自分のプロジェクトの値に書き換えてください) ===
  const firebaseConfig = {
    apiKey: "AIzaSyC1ihCISzvkFNzTnhkr_Nm7OgqL_LRIIKo",
    authDomain: "scoatest-8402c.firebaseapp.com",
    projectId: "scoatest-8402c",
    storageBucket: "scoatest-8402c.firebasestorage.app",
    messagingSenderId: "372101169652",
    appId: "1:372101169652:web:216495fd18c8d6a3b779a1",
    measurementId: "G-YM05ZEJESC"
  };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// === グローバル状態 ===
window.navigate = (screenId) => {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(`screen-${screenId}`).classList.add('active');
};

window.saveApiKey = () => {
    const key = document.getElementById('api-key-input').value;
    localStorage.setItem('gemini_api_key', key);
    alert('API Keyを保存しました。');
};

// 初期化
window.onload = () => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) document.getElementById('api-key-input').value = savedKey;
};

// === 問題生成 (Gemini API) ===
let pendingQuestion = null;

window.generateQuestion = async () => {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return alert("API Keyが設定されていません。ホーム画面で設定してください。");

    const genre = document.getElementById('gen-genre').value;
    const btn = document.getElementById('gen-btn');
    btn.innerText = "生成中...";
    btn.disabled = true;

    const prompt = `あなたは就職試験(SCOA)のプロ作成者です。ジャンル「${genre}」の対策問題を1問作成してください。
    実際のSCOAのように、少し思考力が必要な問題にしてください。
    必ず以下のJSON形式で出力し、マークダウンやJSON以外の文章は一切含めないでください。
    {
      "genre": "${genre}",
      "question": "問題文",
      "correct": "正解の選択肢",
      "incorrect": ["誤答1", "誤答2", "誤答3", "誤答4", "誤答5", "誤答6", "誤答7", "誤答8", "誤答9", "誤答10"]
    }`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        let rawText = data.candidates[0].content.parts[0].text;
        
        // Markdownブロックを取り除く処理
        rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        pendingQuestion = JSON.parse(rawText);

        document.getElementById('preview-q').innerText = pendingQuestion.question;
        document.getElementById('preview-correct').innerText = pendingQuestion.correct;
        document.getElementById('preview-incorrect').innerText = pendingQuestion.incorrect.join(', ');
        document.getElementById('gen-result').classList.remove('hidden');

    } catch (e) {
        console.error(e);
        alert("生成に失敗しました。API Keyや制限を確認してください。");
    } finally {
        btn.innerText = "問題を生成する";
        btn.disabled = false;
    }
};

window.saveQuestionToFirebase = async () => {
    if (!pendingQuestion) return;
    try {
        await addDoc(collection(db, "scoa_questions"), pendingQuestion);
        alert("Firebaseに保存しました！");
        document.getElementById('gen-result').classList.add('hidden');
        pendingQuestion = null;
    } catch (e) {
        console.error("Error adding document: ", e);
        alert("保存に失敗しました。Firebaseの権限(ルール)を確認してください。");
    }
};

// === テスト実行ロジック ===
let testQuestions = [];
let currentIndex = 0;
let score = 0;
let timer = null;
let timeLeft = 30; // 1問30秒

window.startTest = async () => {
    const genre = document.getElementById('prac-genre').value;
    const limitNum = parseInt(document.getElementById('prac-limit').value);
    
    // Firestoreから取得 (本番アプリならサーバー側でランダム取得する工夫が必要ですが、SPA向けに全件orクエリ取得)
    let qQuery = collection(db, "scoa_questions");
    if (genre !== "all") {
        qQuery = query(qQuery, where("genre", "==", genre));
    }
    
    const snapshot = await getDocs(qQuery);
    let allQ = [];
    snapshot.forEach(doc => allQ.push(doc.data()));

    if (allQ.length === 0) {
        return alert("このジャンルの問題がまだFirebaseにありません。先に生成してください。");
    }

    // シャッフルして指定数抽出
    allQ.sort(() => Math.random() - 0.5);
    testQuestions = allQ.slice(0, limitNum);
    
    currentIndex = 0;
    score = 0;
    navigate('test');
    showQuestion();
};

function showQuestion() {
    if (currentIndex >= testQuestions.length) {
        endTest();
        return;
    }

    const q = testQuestions[currentIndex];
    document.getElementById('test-progress').innerText = `${currentIndex + 1} / ${testQuestions.length}`;
    document.getElementById('test-genre').innerText = q.genre;
    document.getElementById('test-question-text').innerText = q.question;

    // 選択肢の生成 (正解1 + 誤答4 = 計5択。SCOAの標準)
    let options = [q.correct];
    let shuffledIncorrect = [...q.incorrect].sort(() => Math.random() - 0.5).slice(0, 4);
    options = options.concat(shuffledIncorrect);
    options.sort(() => Math.random() - 0.5); // 選択肢をシャッフル

    const optionsContainer = document.getElementById('test-options');
    optionsContainer.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;
        btn.onclick = () => answerQuestion(opt === q.correct);
        optionsContainer.appendChild(btn);
    });

    startTimer();
}

function startTimer() {
    clearInterval(timer);
    timeLeft = 30; // 制限時間
    document.getElementById('test-timer').innerText = `残り: ${timeLeft}秒`;
    timer = setInterval(() => {
        timeLeft--;
        document.getElementById('test-timer').innerText = `残り: ${timeLeft}秒`;
        if (timeLeft <= 0) {
            clearInterval(timer);
            answerQuestion(false); // タイムオーバーは不正解扱い
        }
    }, 1000);
}

function answerQuestion(isCorrect) {
    clearInterval(timer);
    if (isCorrect) score++;
    currentIndex++;
    showQuestion();
}

function endTest() {
    document.getElementById('result-score').innerText = score;
    document.getElementById('result-total').innerText = testQuestions.length;
    navigate('result');
}
