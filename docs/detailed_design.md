# 詳細設計書

## 0. 固定UI要素

### 0.1 ページ先頭へ戻るボタン / ヘッダータップ
* **配置**: `position: fixed; top: 8px; left: 8px; z-index: 9999`
* **HTML**: `<button id="scroll-to-top-btn">` にSVG上矢印アイコンを内包
* **動作**: クリック時に `window.scrollTo({ top: 0, behavior: 'smooth' })` を実行
* **初期化**: `initScrollToTop()` で `click` イベントリスナーを登録
* **印刷対応**: `no-print` クラスにより `@media print` で非表示
* **ヘッダータップ**: `<header class="app-header">` 全体をクリック/タップしてもページ先頭へスムーズスクロールを行う
  * `cursor: pointer` でクリック可能であることを視覚的に表現
  * `user-select: none` でテキスト選択を防止
  * `-webkit-tap-highlight-color: transparent` でモバイルタップ時のハイライトを抑制
* **内部スクロールコンテナのリセット**: ページ先頭への移動時に `.ai-chat-messages`（AIチャット領域）のスクロール位置も先頭にリセットする

### 0.2 バージョン情報表示
* **配置**: `position: fixed; top: 6px; right: 10px; z-index: 9999`
* **HTML**: `<div id="app-info-display" class="app-info-display no-print">`
* **表示内容**: `Ver: X.X.X` と `Build: YYYY-MM-DD HH:MM:SS JST` の2行
* **データソース**: `window.APP_INFO`（`version.js` からロード、ビルド時自動生成）
* **初期化**: `initVersionInfo()` で `innerHTML` を設定
* **印刷対応**: `no-print` クラスにより `@media print` で非表示
* **`pointer-events: none`**: テキスト選択やクリック対象にならないようにする

## 1. IndexedDB操作

### 1.1 データベース初期化
```javascript
// DB名: emr_db, バージョン: 1
// オブジェクトストア:
//   patients:      keyPath: "id", インデックス: name, nameKana, patientCode
//   records:       keyPath: "id", インデックス: patientId, visitedAt
//   prescriptions: keyPath: "id", インデックス: patientId, recordId, prescribedAt
//   lab_results:   keyPath: "id", インデックス: patientId, examinedAt, category
```

### 1.2 CRUD操作一覧

#### patients
* **Create**: `addPatient(patient)` - 新規患者登録
* **Read**: `getAllPatients()` - 全患者取得（name昇順）
* **Read**: `getPatient(id)` - 単一患者取得
* **Read**: `searchPatients(query)` - 名前・ふりがな・患者コードでの検索
* **Update**: `updatePatient(patient)` - 患者情報更新
* **Delete**: `deletePatient(id)` - 患者削除（関連records・prescriptions・lab_resultsも削除）

#### records
* **Create**: `addRecord(record)` - 新規診療記録追加
* **Read**: `getRecordsByPatient(patientId)` - 患者の診療記録全件取得（visitedAt降順）
* **Read**: `getRecord(id)` - 単一診療記録取得
* **Read**: `getRecentRecords(patientId, limit)` - 直近N件取得
* **Update**: `updateRecord(record)` - 診療記録更新
* **Delete**: `deleteRecord(id)` - 単一診療記録削除

#### prescriptions
* **Create**: `addPrescription(prescription)` - 新規処方追加
* **Read**: `getPrescriptionsByPatient(patientId)` - 患者の処方全件取得（prescribedAt降順）
* **Read**: `getPrescriptionsByRecord(recordId)` - 診療記録に紐付く処方取得
* **Update**: `updatePrescription(prescription)` - 処方更新
* **Delete**: `deletePrescription(id)` - 処方削除

#### lab_results
* **Create**: `addLabResult(labResult)` - 新規検査結果追加
* **Read**: `getLabResultsByPatient(patientId)` - 患者の検査結果全件取得（examinedAt降順）
* **Read**: `getLabResultsByCategory(patientId, category)` - カテゴリ別取得
* **Update**: `updateLabResult(labResult)` - 検査結果更新
* **Delete**: `deleteLabResult(id)` - 検査結果削除

## 2. レコード構造とバリデーション仕様

### 2.1 patients バリデーション

| フィールド | 型 | 必須 | バリデーションルール |
|-----------|-----|------|-------------------|
| name | string | 必須 | 1〜100文字 |
| nameKana | string | 任意 | 0〜100文字、ひらがな・スペースのみ |
| birthDate | string | 必須 | ISO 8601 (YYYY-MM-DD)、過去日付、0〜150歳 |
| gender | string | 必須 | "male" / "female" / "other" |
| phone | string | 任意 | 半角数字・ハイフンのみ、7〜15文字 |
| email | string | 任意 | RFC準拠メールアドレス形式 |

### 2.2 records（診療記録）バリデーション

| フィールド | 型 | 必須 | バリデーションルール |
|-----------|-----|------|-------------------|
| visitedAt | string | 必須 | ISO 8601 日時 |
| soap.subjective | string | 条件付き | S/O/A/Pいずれか1つ以上必須、各最大2000文字 |
| soap.objective | string | 条件付き | 同上 |
| soap.assessment | string | 条件付き | 同上 |
| soap.plan | string | 条件付き | 同上 |
| vitals.temperature | number | 任意 | 34.0〜42.0 ℃ |
| vitals.systolic | number | 任意 | 50〜300 mmHg（整数） |
| vitals.diastolic | number | 任意 | 30〜200 mmHg（整数）、systolic > diastolic |
| vitals.pulse | number | 任意 | 20〜300 bpm（整数） |
| vitals.spo2 | number | 任意 | 50〜100 %（整数） |
| vitals.respiratoryRate | number | 任意 | 1〜60 回/分（整数） |
| vitals.weight | number | 任意 | 1.0〜300.0 kg（小数点1桁まで） |
| vitals.height | number | 任意 | 30〜250 cm（整数） |

### 2.3 prescriptions バリデーション

| フィールド | 型 | 必須 | バリデーションルール |
|-----------|-----|------|-------------------|
| prescribedAt | string | 必須 | ISO 8601 日付 |
| medicine | string | 必須 | 1〜200文字 |
| days | number | 任意 | 1〜365（整数） |

### 2.4 lab_results バリデーション

| フィールド | 型 | 必須 | バリデーションルール |
|-----------|-----|------|-------------------|
| examinedAt | string | 必須 | ISO 8601 日付 |
| category | string | 必須 | "blood" / "urine" / "image" / "other" |
| itemName | string | 必須 | 1〜200文字 |
| value | string | 必須 | 1〜100文字 |
| judgment | string | 任意 | "normal" / "caution" / "abnormal" / null |

## 3. 計算ロジック (emr.calc.js)

### 3.1 年齢計算
* `calcAge(birthDate)` - 生年月日から現在の年齢を計算
* 引数: `"1975-04-15"` (YYYY-MM-DD)
* 戻り値: 整数（歳）

### 3.2 バイタルサイン評価
* `classifyBP(systolic, diastolic)` - 家庭血圧基準（JSH2019）による血圧分類
* `classifyBMI(weight, height)` - BMIカテゴリ分類
* `classifySpo2(spo2)` - SpO2リスク分類

### 3.3 統計計算
* `calcVitalStats(records)` - バイタルサイン統計（平均・最大・最小）
* `calcAverageVitals(records)` - バイタル平均値
* `calcMinMaxVitals(records)` - バイタル最大・最小値

### 3.4 患者コード自動生成
* `generatePatientCode(existingCodes)` - 既存患者コードから次の患者コードを生成
* フォーマット: `P` + ゼロ埋め4桁（例: `P0001`, `P0002`）

## 4. エクスポート/インポート

### 4.1 エクスポート形式
```json
{
  "version": "1.0.0",
  "appName": "emr",
  "exportedAt": "2026-02-17T12:00:00.000Z",
  "patientCount": 10,
  "recordCount": 150,
  "patients": [ ... ],
  "records": [ ... ],
  "prescriptions": [ ... ],
  "labResults": [ ... ],
  "aiMemo": "整骨院での施術記録です。"
}
```

#### フィールド説明
| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| version | string | 必須 | アプリバージョン |
| appName | string | 必須 | 固定値 "emr" |
| exportedAt | string | 必須 | エクスポート日時（ISO 8601） |
| patientCount | number | 必須 | 患者数 |
| recordCount | number | 必須 | 診療記録件数 |
| patients | array | 必須 | 患者情報の配列 |
| records | array | 必須 | 診療記録の配列 |
| prescriptions | array | 必須 | 処方箋の配列 |
| labResults | array | 必須 | 検査結果の配列 |
| aiMemo | string | 任意 | AIに伝えたい備考 |

### 4.2 インポート処理
1. ファイル読み込み (FileReader API)
2. JSON パース
3. バリデーション（appName が "emr" であること、必須フィールドの存在確認）
4. 既存データとのマージ（IDベースで重複排除）
5. IndexedDBへ一括書き込み（patients → records → prescriptions → labResults の順）
6. `aiMemo` が存在すればlocalStorageのAI備考を上書き復元
7. 復元後、UIを再描画

## 5. 入力フォームUX

### 5.1 前回入力値のプリフィル
新規診療記録入力時、直近の診療記録がある場合、バイタルサインの前回値を参考表示する。
* SOAPフィールド: プリフィルしない（空で開始）
* バイタルフォーム: 直近値をプレースホルダーとして表示（値の代わりにヒント表示）

### 5.2 フォーカス時の全選択
入力テキストフィールドにフォーカスが当たると内容が選択状態になり、そのまま入力すると値が置換される。
* 対象: 数値入力フィールド全般（バイタルサイン・処方日数・検査値）

### 5.3 患者切替時のフォーム初期化
* 別の患者を選択した場合、全タブの入力フォームをリセット
* 編集中フォームがある場合は「変更が破棄されます」確認ダイアログを表示

### 5.4 アレルギー警告表示
* カルテタブ・処方タブでアレルギー情報が登録されている患者を選択した場合、赤色バナーで警告
* バナー表示内容: アレルゲン名、反応の種類、重症度

## 6. グラフ描画

### 6.1 バイタルサイングラフ（カルテタブ・検査タブ）
* タイプ: line
* データセット:
    * 収縮期血圧（赤系、実線）
    * 拡張期血圧（青系、実線）
    * 脈拍（緑系、破線）
    * 体温（橙系、破線）
    * SpO2（紫系、点線）
    * 体重（グレー系、点線）
* X軸: 受診日時（時系列）
* Y軸: mmHg / bpm / ℃ / % / kg（多軸 or トグル切替）
* 基準線: 収縮期血圧 135mmHg、拡張期血圧 85mmHg
* トグルボタンでデータセットの表示/非表示を切替

### 6.2 検査結果グラフ
* タイプ: line
* 選択した検査項目の時系列推移
* 基準値範囲をシェーディング表示（referenceMin〜referenceMax）
* 判定に応じたポイントの色分け（normal:緑、caution:黄、abnormal:赤）

## 7. PWA更新メカニズム

### 7.1 ビルド時キャッシュバージョニング
* `generate_version.sh` が `sw.js` の `CACHE_NAME` をビルドごとに動的に書き換える
* フォーマット: `emr-v{VERSION}-{UNIX_TIMESTAMP}`（例: `emr-v1.0.0-1739800000`）
* `sw.js` 自体のバイト内容が変わるため、全ブラウザ（iOS Safari含む）で確実に更新検知される

### 7.2 Service Worker 更新フロー
1. ブラウザが `sw.js` の変更を検知（起動時 / フォアグラウンド復帰時 / 手動チェック時）
2. 新しい SW が `install` イベントで新しい `CACHE_NAME` のキャッシュにアセットをプリキャッシュ
3. `skipWaiting()` で即座にアクティベート
4. `activate` イベントで旧キャッシュを削除、`clients.claim()` でページを制御下に置く
5. ページ側で `controllerchange` イベントを受信し、更新バナーを表示
6. ユーザーがバナーをタップすると `location.reload()` で最新版を読み込む

### 7.3 フォアグラウンド復帰時の自動チェック（iOS対策）
* `visibilitychange` イベントで `document.visibilityState === 'visible'` を検知
* `registration.update()` を呼び出してサーバー上の `sw.js` をチェック
* 連続呼出し抑止: 最低30秒間隔のスロットル制御

### 7.4 更新バナー
* **配置**: ヘッダー直下、`position: sticky; top: 44px; z-index: 99`
* **表示条件**: `controllerchange` イベント発火時（初回ロード時は除外）
* **構成要素**: テキスト「新しいバージョンが利用可能です」、「今すぐ更新」ボタン、閉じるボタン

### 7.5 手動更新チェック（設定タブ）
* 設定タブの「アプリ情報」カード内に「更新を確認」ボタンを配置
* クリック時に `registration.update()` を呼び出し
* 結果を `#update-check-status` に表示

## 8. AI診断機能

### 8.1 API通信（OpenAI reverse proxy）

ブラウザから `api.openai.com` を直接呼び出すとCORSでブロックされるため、
同一オリジンのプロキシ経由で中継する。

#### 経路
| 環境 | クライアント → | → upstream |
|------|---------------|------------|
| ローカル (nginx) | `/openai/*` | `api.openai.com/*` |
| Vercel (rewrite) | `/openai/:path*` → `/api/openai?path=:path*` | `api.openai.com/:path*` |

#### クライアント側フォールバック
1. `/openai/v1/chat/completions`（vercel.json rewrite経由）
2. 404の場合 → `/api/openai?path=v1/chat/completions`（Function直接呼び出し）

#### プロキシ実装（3ファイル構成）
| ファイル | 用途 |
|---------|------|
| `api/openai.js` | Vercel Function（クエリパラメータ `?path=` 方式） |
| `api/openai/[...path].js` | Vercel Function（catch-all route方式、フォールバック用） |
| `local_app/api/openai.js` | Vercel Root Directory が `local_app` の場合用 |

#### モデル選択
* 設定タブの「利用モデル」セレクトボックスでユーザーが選択可能
* デフォルト: `gpt-4o-mini`（コスト効率重視）
* 選択値は `localStorage` キー `emr_ai_model` に自動保存

| model id | 表示名 | コンテキスト上限 | 入力単価/1M | 出力単価/1M |
|----------|--------|-----------------|------------|------------|
| `gpt-4o-mini` | GPT-4o mini（低コスト） | 128,000 | $0.15 | $0.60 |
| `gpt-4.1-mini` | GPT-4.1 mini | 1,047,576 | $0.40 | $1.60 |
| `gpt-4.1` | GPT-4.1（1Mコンテキスト） | 1,047,576 | $2.00 | $8.00 |
| `gpt-4o` | GPT-4o | 128,000 | $2.50 | $10.00 |

#### ストリーミング
* SSE（Server-Sent Events）でリアルタイム表示

### 8.2 プロンプト構築

#### プライバシー配慮
AI APIへ送信するデータは、患者の個人特定情報（氏名・電話番号・住所・保険証番号等）を含まない。
送信可能な情報:
* 年齢（生年月日から計算した値）
* 性別
* 既往歴・アレルギー情報（匿名化）
* SOAP記録（匿名化）
* バイタルサイン
* 検査結果

```
システムプロンプト:
あなたは臨床支援AIアシスタントです。
施術者が患者の診療記録・検査結果に基づいて、
臨床的な考察や施術方針の参考情報を得るためのサポートをします。
医療行為・施術行為の最終判断は必ず施術者が行うことを前提とした
参考情報として回答してください。
回答には必ず「この情報は参考情報であり、専門的な医療判断の代替ではありません」という注意書きを含めてください。

ユーザープロンプト:
【患者基本情報】
年齢: {calcAge(birthDate)}歳、性別: {gender}

【既往歴】
{medicalHistory（各疾患名・転帰）}

【アレルギー情報】
{allergies（各アレルゲン・重症度）}

【直近の診療記録（最大10件）】
{SOAPレコードを日時順にフォーマット}

【バイタルサイン推移（最大20件）】
{バイタルデータを日時順にフォーマット}

【最新の検査結果】
{lab_resultsを日時順にフォーマット（最大20件）}

【施術者備考】
{emr_ai_memo}

上記に基づいて、臨床的な考察と推奨事項をお願いします。
```

### 8.3 会話継続
* messages配列にassistant/userのロールで会話を蓄積
* 追加質問時は全履歴をコンテキストとして送信
* UIはチャット形式で表示

### 8.4 提案質問（サジェスト）機能
* AIレスポンスの末尾に `{{SUGGEST:質問テキスト}}` 形式で質問候補を3つ含める
* `parseSuggestions(content)` で本文と質問候補を分離
    * 戻り値: `{ mainContent: string, suggestions: string[] }`
* ストリーミング中は候補マーカーを非表示にし、完了後にボタンとして描画
* ボタンクリック時は `sendSuggestion(text)` で該当テキストをフォローアップ送信

### 8.5 設定データ保存（localStorage）
* `emr_openai_api_key`: APIキー
* `emr_ai_model`: 利用モデルID（デフォルト: `gpt-4o-mini`）
* `emr_ai_memo`: AI向け備考

### 8.6 AI API 使用量・コスト見積もり

#### 料金体系（2026年2月時点）
| 項目 | 料金 |
|------|------|
| 入力トークン (gpt-4o-mini) | $0.150 / 100万トークン |
| 出力トークン (gpt-4o-mini) | $0.600 / 100万トークン |

> **出典**: [OpenAI API Pricing](https://platform.openai.com/docs/pricing)（2026年2月確認）

#### 本アプリのプロンプト構成とトークン数

| 記録件数 | プロンプトサイズ（概算） | トークン数（概算） |
|----------|--------------------------|---------------------|
| 患者1名・記録5件 | 約2,000文字 | 約2,200トークン |
| 患者1名・記録10件 | 約3,500文字 | 約3,850トークン |
| 患者1名・記録10件+検査20件 | 約5,000文字 | 約5,500トークン |

#### 1セッション（10回のやりとり）あたりのコスト
| 項目 | トークン数 | コスト (USD) | コスト (JPY) |
|------|------------|-------------|-------------|
| 入力 | 約80,000 | 約$0.012 | 約1.8円 |
| 出力 | 約10,000 | 約$0.006 | 約0.9円 |
| **合計** | **約90,000** | **約$0.018** | **約2.7円** |

※ 為替レート: 1 USD = 150 JPY で計算

#### まとめ
* **gpt-4o-mini は極めて低コスト**: 1回のAIセッション（10往復）で約2.7円
* **毎日使っても月額約81円**: 個人利用では実質的なコスト負担はほぼゼロ
* **ユーザー自身のAPIキーを使用**: Vercel側の課金は発生しない（プロキシのみ）
