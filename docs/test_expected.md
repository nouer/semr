# テスト期待結果

## 1. 単体テスト期待結果

### 1.1 血圧分類
* classifyBP(110, 70) → "正常血圧"
* classifyBP(120, 70) → "正常高値血圧"
* classifyBP(130, 70) → "高値血圧"
* classifyBP(110, 80) → "高値血圧"
* classifyBP(135, 85) → "I度高血圧"
* classifyBP(145, 90) → "II度高血圧"
* classifyBP(160, 80) → "III度高血圧"
* classifyBP(130, 100) → "III度高血圧"
* classifyBP(114, 74) → "正常血圧"
* classifyBP(115, 74) → "正常高値血圧"

### 1.2 BMI計算・分類
* classifyBMI(45, 170) → "低体重（やせ）"（BMI≒15.6）
* classifyBMI(65, 170) → "普通体重"（BMI≒22.5）
* classifyBMI(80, 170) → "肥満（1度）"（BMI≒27.7）
* classifyBMI(95, 170) → "肥満（2度）"（BMI≒32.9）
* classifyBMI(null, 170) → null
* classifyBMI(70, 175) → "普通体重"（BMI≒22.9）

### 1.3 SpO2分類
* classifySpo2(98) → { label: "正常", level: "normal" }
* classifySpo2(93) → { label: "軽度低下", level: "caution" }
* classifySpo2(88) → { label: "中等度低下", level: "warning" }
* classifySpo2(82) → { label: "重度低下", level: "danger" }
* classifySpo2(null) → null
* classifySpo2(96) → { label: "正常", level: "normal" }
* classifySpo2(91) → { label: "軽度低下", level: "caution" }

### 1.4 年齢計算（2026-02-17時点）
* calcAge("1975-04-15") → 50（誕生日前）
* calcAge("1975-02-17") → 51（誕生日当日）
* calcAge("1975-02-18") → 50（誕生日翌日）

### 1.5 患者コード生成
* generatePatientCode([]) → "P0001"
* generatePatientCode(["P0001", "P0002"]) → "P0003"
* generatePatientCode(["P0001", "P0003"]) → "P0004"（最大値+1）
* generatePatientCode(["P0009"]) → "P0010"

### 1.6 バイタルサイン統計
* calcVitalStats([{vitals:{systolic:120,diastolic:80}}, {vitals:{systolic:130,diastolic:85}}])
  → { systolic: {avg: 125, min: 120, max: 130}, diastolic: {avg: 82.5, min: 80, max: 85}, ... }
* calcVitalStats([]) → 全フィールド { avg: null, min: null, max: null }
* calcVitalStats([{vitals:{systolic:120,diastolic:null}}, {vitals:{systolic:130,diastolic:85}}])
  → diastolic: {avg: 85, min: 85, max: 85}（nullは除外）

### 1.7 バリデーション
* validateVitals({systolic:120, diastolic:80}) → { valid: true }
* validateVitals({systolic:40, diastolic:80}) → { valid: false, error: "収縮期血圧は50〜300の範囲で入力してください" }
* validateVitals({systolic:310, diastolic:80}) → { valid: false }
* validateVitals({systolic:80, diastolic:80}) → { valid: false, error: "収縮期血圧は拡張期血圧より大きい値を入力してください" }
* validateVitals({temperature:33.9}) → { valid: false }
* validateVitals({temperature:42.1}) → { valid: false }
* validateVitals({temperature:36.5}) → { valid: true }
* validateVitals({spo2:101}) → { valid: false }
* validateVitals({pulse:null}) → { valid: true }
* validatePatient({name:""}) → { valid: false }
* validatePatient({birthDate:"2099-01-01"}) → { valid: false }
* validateImportData({appName:"emr", patients:[], records:[], prescriptions:[], labResults:[]}) → { valid: true }
* validateImportData({appName:"sbpr", ...}) → { valid: false }

### 1.8 検査値判定
* judgeLabValue("5800", "3500", "9700") → "normal"
* judgeLabValue("3000", "3500", "9700") → "abnormal"
* judgeLabValue("10000", "3500", "9700") → "abnormal"
* judgeLabValue("陽性", null, null) → null
* judgeLabValue("5.0", null, null) → null

### 1.9 提案質問パース
* parseSuggestions("本文\n{{SUGGEST:質問1}}\n{{SUGGEST:質問2}}")
  → { mainContent: "本文", suggestions: ["質問1", "質問2"] }
* parseSuggestions("本文のみ")
  → { mainContent: "本文のみ", suggestions: [] }
* parseSuggestions("本文{{SUGGEST:Q1}}{{SUGGEST:Q2}}{{SUGGEST:Q3}}")
  → { mainContent: "本文", suggestions: ["Q1", "Q2", "Q3"] }

## 2. E2Eテスト期待結果

### 2.1 基本操作
* ページタイトル: "電子カルテ - emr"
* 初期表示で患者タブがアクティブ状態になっている
* 患者登録後、患者一覧にカード形式で新しい患者が表示される
* 氏名「山田」で検索すると、「山田」を含む患者のみ表示される
* SOAP入力・保存後、履歴タブのタイムラインに新しいエントリが追加される
* バイタルサイン保存後、バイタルグラフに新しいデータポイントが追加される
* 処方登録後、処方タブの一覧に新しい処方が表示される
* 検査結果登録後、検査タブの一覧に新しい結果が表示される
* 全操作中にpageerrorが発生しない

### 2.2 固定UI要素
* スクロールトップボタン（↑）クリックでページ最上部（scrollY ≒ 0）にスクロールする
* ヘッダー（`.app-header`）クリックでもページ最上部（scrollY ≒ 0）にスクロールする
* ヘッダーに `cursor: pointer` が設定されている
* 右上にVer: X.X.X が2行で表示されている

### 2.3 入力フォームUX
* number型の入力フィールドにフォーカスすると値が全選択状態になる
* アレルギー登録済み患者を選択したとき、カルテタブ上部に赤色の警告バナーが表示される
* アレルギー情報のない患者を選択したとき、警告バナーは表示されない
* 患者切替時に入力中のフォームがリセットされる

### 2.4 データ管理
* エクスポートJSONに `appName: "emr"` が含まれる
* エクスポートJSONに `patients`、`records`、`prescriptions`、`labResults` の4配列が含まれる
* エクスポートJSONに `aiMemo` 文字列が含まれる
* インポート実行前に「X件の患者、Y件の記録を読み込みます」確認ダイアログが表示される
* インポート後、患者一覧に復元されたデータが表示される
* 旧形式（aiMemoなし）のJSONインポートでもエラーにならない

### 2.5 AI診断機能
* APIキー未設定ではAI診断タブがナビゲーションに表示されない
* APIキー設定後、AI診断タブがナビゲーションに追加表示される
* localStorageの `emr_ai_memo` キーにAI備考が保存される
* parseSuggestions で `{{SUGGEST:...}}` マーカーが正しくパースされる
* 提案ボタン(.ai-suggestion-btn)がAIメッセージの後に表示される
* 設定タブに `<select id="ai-model-select">` が表示される
* 初期状態（localStorageに値なし）では `gpt-4o-mini` がデフォルト選択される
* モデルを変更すると `localStorage` の `emr_ai_model` キーに自動保存される

### 2.6 グラフ表示
* バイタルデータがある患者選択後、カルテタブにChart.jsキャンバスが描画される
* 数値検査結果がある患者選択後、検査タブにChart.jsキャンバスが描画される
* 期間選択ボタン「直近30日」クリックでグラフの表示範囲が変更される

### 2.7 PWA機能
* link[rel="manifest"]のhref属性が"/manifest.json"である
* Service Worker の registration が取得可能である
* meta[name="theme-color"]のcontent属性が"#0f766e"である
* meta[name="apple-mobile-web-app-capable"]のcontent属性が"yes"である
* PWA関連のスクリプト追加後もpageerrorが発生しない
* #update-banner 要素が存在し、初期状態では `display: none` である
* 設定タブに #check-update-btn ボタンが表示される

### 2.8 レスポンシブデザイン
* viewport 375x667（モバイル）でもレイアウトが崩れず全タブが操作可能
* viewport 768x1024（タブレット）でもレイアウトが崩れず全タブが操作可能
* モバイルビューポートで患者登録フォームが正常に送信できる

## 3. テスト実行結果（最新）
* 実行日時: 未実施（実装前）
* 単体テスト: 未実施（目標: 全件PASS、カバレッジ97%以上）
* E2Eテスト: 未実施（目標: 全件PASS）

※ 実装完了後にこのセクションを更新すること。
