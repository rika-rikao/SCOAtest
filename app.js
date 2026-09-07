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

// === 問題の一括生成＆保存 (Gemini API) ===
window.generateBulkQuestions = async () => {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return alert("API Keyが設定されていません。ホーム画面で設定してください。");

    const genre = document.getElementById('gen-genre').value;
    const totalNum = parseInt(document.getElementById('gen-count').value);
    
    // ★ 画面から選択されたモデル名を取得 ★
    const selectedModel = document.getElementById('gen-model').value;
    
    if (totalNum < 1 || totalNum > 100) return alert("生成数は1〜100の間で指定してください。");

    const btn = document.getElementById('gen-btn');
    const logArea = document.getElementById('gen-result');
    const logText = document.getElementById('gen-log');
    
    btn.disabled = true;
    logArea.classList.remove('hidden');
    logText.innerText = `生成を開始します... (目標: ${totalNum}問)\n使用モデル: ${selectedModel}\n※数分かかる場合があります。この画面を閉じないでください。`;

    let successCount = 0;
    const batchSize = 20; // 1回のお願いで作らせる数

    for (let i = 0; i < totalNum; i += batchSize) {
        const currentBatch = Math.min(batchSize, totalNum - i);
        btn.innerText = `生成＆保存中... (${successCount}/${totalNum})`;

        const prompt = `あなたは就職試験(SCOA)のプロ作成者です。ジャンル「${genre}」の対策問題を ${currentBatch}問 作成してください。存在しない熟語や歴史、条約などを創作してはいけません。必ず事実に基づいたもので作成してください。
        必ず以下のJSON配列(Array)形式で出力し、マークダウンや前後の挨拶などの文章は一切含めないでください。
        [
          {
            "genre": "${genre}",
            "question": "問題文",
            "correct": "正解の選択肢",
            "incorrect": ["誤答1", "誤答2", "誤答3", "誤答4", "誤答5", "誤答6", "誤答7", "誤答8", "最新の誤答9", "誤答10"]
          }
        ]`;

        try {
            // ★ URLの部分を selectedModel 変数に置き換え ★
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(`API通信エラー: ${response.status}\n${err.error?.message || ''}`);
            }

            const data = await response.json();
            if (!data.candidates) throw new Error("AIが回答を生成しませんでした。");

            let rawText = data.candidates[0].content.parts[0].text;
            rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
            
            const questions = JSON.parse(rawText);

            for (const q of questions) {
                await addDoc(collection(db, "scoa_questions"), q);
                successCount++;
            }

            logText.innerText = `進捗: ${successCount} / ${totalNum} 問 保存完了...\n使用モデル: ${selectedModel}\n(※API制限を避けるため数秒待機中)`;

            if (successCount < totalNum) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

        } catch (e) {
            console.error("詳細なエラー:", e);
            logText.innerText += `\n\n⚠️ エラーが発生したため ${successCount}問 で中断しました。\n詳細: ${e.message}\n(※混雑によるエラーの場合はモデルを変更して再度お試しください)`;
            break; 
        }
    }

    btn.innerText = "一括生成して保存する";
    btn.disabled = false;
    alert(`${successCount}問の生成とFirebaseへの保存が完了しました！\n対策テスト画面からプレイできます。`);
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
let timeLeft = 20; // 1問20秒
let userAnswers = []; // ★ ユーザーの回答記録用

// === テスト実行ロジック（詳細診断機能付き） ===
window.startTest = async () => {
    const selectedGenre = document.getElementById('prac-genre').value;
    const limitNum = parseInt(document.getElementById('prac-limit').value) || 10;
    
    let currentStep = "1. Firestoreへの接続開始";

    try {
        currentStep = "2. コレクション 'scoa_questions' の読み込み";
        // まずジャンル条件をつけずに全件取得を試みる
        const colRef = collection(db, "scoa_questions");
        const snapshot = await getDocs(colRef);
        
        currentStep = "3. ドキュメントの解析";
        let allQ = [];
        snapshot.forEach(doc => {
            allQ.push({ id: doc.id, ...doc.data() });
        });

        // 【診断①】データがそもそも0件届いていない場合
        if (allQ.length === 0) {
            alert(
                `【診断結果: データが0件です】\n\n` +
                `Firestoreとの通信には成功しましたが、コレクション「scoa_questions」の中にドキュメントが1件も存在しません。\n\n` +
                `▼考えられる原因:\n` +
                `1. Firebaseコンソールでコレクション名が完全に「scoa_questions」になっているか確認してください（大文字やスペルミス、sの有無など）。\n` +
                `2. app.js の projectId (${firebaseConfig.projectId}) が、データを入れたプロジェクトと一致しているか確認してください。`
            );
            return;
        }

        // 【診断②】ジャンルの絞り込み
        currentStep = "4. ジャンル一致の判定";
        let filteredQ = allQ;
        if (selectedGenre !== "all") {
            filteredQ = allQ.filter(q => {
                const g = String(q.genre || "").trim();
                return g.includes(selectedGenre) || 
                       (selectedGenre === "数理" && g.includes("数学")) || 
                       (selectedGenre === "言語" && g.includes("国語"));
            });
        }

        // 【診断③】全体にはあるが、選んだジャンルと一致しない場合
        if (filteredQ.length === 0) {
            // 保存されているジャンル名をすべて抽出
            const actualGenres = [...new Set(allQ.map(q => `「${q.genre}」`))].join(', ');
            alert(
                `【診断結果: ジャンル名が一致しません】\n\n` +
                `データベース全体には ${allQ.length}件 の問題が存在しますが、選択された「${selectedGenre}」に該当するものがありません。\n\n` +
                `▼Firebaseに実際に保存されているジャンル名:\n` +
                `${actualGenres || '(未設定)'}\n\n` +
                `※ジャンルを「全ジャンル」にするか、上記の名前に合わせて問題を出題してください。`
            );
            return;
        }

        // 正常に取得できた場合
        filteredQ.sort(() => Math.random() - 0.5);
        testQuestions = filteredQ.slice(0, limitNum);
        
        currentIndex = 0;
        score = 0;
        userAnswers = [];
        window.navigate('test');
        showQuestion();

    } catch (e) {
        console.error("テスト開始エラー詳細:", e);

        // 【診断④】通信エラーや権限エラーの場合
        let errorDetail = "";
        if (e.code === "permission-denied") {
            errorDetail = "【セキュリティルール拒否】\nFirestoreの読み取り権限がありません。\nFirebaseコンソールの「ルール」タブで `allow read, write: if true;` になっているか確認してください。";
        } else if (e.code === "unavailable") {
            errorDetail = "【通信不通】\nインターネットに接続されていないか、Firebaseのサーバーに接続できません。";
        } else {
            errorDetail = `【エラーコード: ${e.code || '不明'}】\n${e.message}`;
        }

        alert(
            `【通信/実行エラーが発生しました】\n\n` +
            `停止したステップ: ${currentStep}\n\n` +
            `原因:\n${errorDetail}`
        );
    }
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

    let options = [q.correct];
    let shuffledIncorrect = [...q.incorrect].sort(() => Math.random() - 0.5).slice(0, 4);
    options = options.concat(shuffledIncorrect);
    options.sort(() => Math.random() - 0.5);

    const optionsContainer = document.getElementById('test-options');
    optionsContainer.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;
        // ★ 押した選択肢と正誤判定を渡す
        btn.onclick = () => answerQuestion(opt, opt === q.correct);
        optionsContainer.appendChild(btn);
    });

    startTimer();
}

function startTimer() {
    clearInterval(timer);
    timeLeft = 20;
    document.getElementById('test-timer').innerText = `残り: ${timeLeft}秒`;
    timer = setInterval(() => {
        timeLeft--;
        document.getElementById('test-timer').innerText = `残り: ${timeLeft}秒`;
        if (timeLeft <= 0) {
            clearInterval(timer);
            // ★ 時間切れ時は「時間切れ」として記録
            answerQuestion("（時間切れ）", false);
        }
    }, 1000);
}

function answerQuestion(selectedOpt, isCorrect) {
    clearInterval(timer);
    
    const currentQ = testQuestions[currentIndex];
    // 回答データを記録
    userAnswers.push({
        question: currentQ.question,
        genre: currentQ.genre,
        selected: selectedOpt,
        correct: currentQ.correct,
        isCorrect: isCorrect
    });

    if (isCorrect) score++;
    currentIndex++;
    showQuestion();
}

function endTest() {
    document.getElementById('result-score').innerText = score;
    document.getElementById('result-total').innerText = testQuestions.length;

    // ★ 間違えた問題（ミス）の表示処理
    const reviewContainer = document.getElementById('result-review');
    reviewContainer.innerHTML = '';

    const wrongAnswers = userAnswers.filter(a => !a.isCorrect);

    if (wrongAnswers.length === 0) {
        reviewContainer.innerHTML = '<p class="perfect-msg">🎉 全問正解です！パーフェクト！</p>';
    } else {
        let html = `<h3>❌ 間違えた問題の復習 (${wrongAnswers.length}問)</h3>`;
        wrongAnswers.forEach((item, index) => {
            html += `
            <div class="review-card">
                <p class="review-q"><strong>[${item.genre}]</strong> ${item.question}</p>
                <p class="review-your-ans">あなたの回答: <span class="wrong-text">❌ ${item.selected}</span></p>
                <p class="review-correct-ans">正解: <span class="correct-text">⭕ ${item.correct}</span></p>
            </div>
            `;
        });
        reviewContainer.innerHTML = html;
    }

    navigate('result');
}
