# 基本設計書

## 1. アーキテクチャ概要

### 1.1 システム構成
* **フロントエンド**: HTML + vanilla JavaScript (SPA, ビルドツール不使用)
* **データストア**: ブラウザ IndexedDB
* **グラフ描画**: Chart.js v4 (CDN)
* **デプロイ**: Docker (ローカル開発), Vercel (テスト配布)

### 1.2 ディレクトリ構成
```
semr/
├── local_app/              # アプリ本体（HTML + vanilla JS）
│   ├── index.html          # SPA エントリポイント
│   ├── style.css           # スタイルシート
│   ├── script.js           # メインロジック（IndexedDB・UI・PWA）
│   ├── emr.calc.js         # 計算・ユーティリティロジック（純粋関数）
│   ├── emr.calc.test.js    # 単体テスト
│   ├── e2e.test.js         # E2Eテスト（Puppeteer）
│   ├── version.js          # ビルド時自動生成
│   ├── manifest.json       # PWA Web App Manifest
│   ├── sw.js               # PWA Service Worker
│   ├── api/
│   │   └── openai.js       # OpenAI APIプロキシ（Vercel Root Directory対応）
│   └── icons/
│       ├── icon-192.svg
│       ├── icon-512.svg
│       └── icon-maskable.svg
├── api/                    # Vercel Serverless Functions
│   ├── openai.js           # OpenAI reverse proxy (query param方式)
│   └── openai/[...path].js # OpenAI reverse proxy (catch-all, fallback)
├── docs/                   # ドキュメント駆動開発用
│   ├── requirements_definition.md
│   ├── basic_design.md
│   ├── detailed_design.md
│   ├── algorithm_logic.md
│   ├── test_specification.md
│   └── test_expected.md
├── scripts/
│   ├── build.sh
│   ├── rebuild.sh
│   └── generate_version.sh
├── nginx/
│   └── default.conf
├── docker-compose.yml
├── Dockerfile
├── Dockerfile.test
├── package.json
├── vercel.json
├── .cursorrules
├── .cursor/rules/
│   └── build-and-deploy.mdc
├── .gitignore
└── README.md
```

## 2. データモデル

### 2.1 IndexedDB構成
* **データベース名**: `emr_db`
* **バージョン**: 1

| オブジェクトストア | keyPath | インデックス | 用途 |
|-----------------|---------|------------|------|
| `patients` | `id` (UUID) | `name`, `nameKana`, `patientCode` | 患者基本情報 |
| `records` | `id` (UUID) | `patientId`, `visitedAt` | 診療記録（SOAP + バイタル） |
| `prescriptions` | `id` (UUID) | `patientId`, `recordId`, `prescribedAt` | 処方箋 |
| `lab_results` | `id` (UUID) | `patientId`, `examinedAt`, `category` | 検査結果 |

### 2.2 レコード構造

#### patients（患者情報）
```json
{
  "id": "uuid-v4-string",
  "patientCode": "P0001",
  "name": "山田 太郎",
  "nameKana": "やまだ たろう",
  "birthDate": "1975-04-15",
  "gender": "male",
  "phone": "090-1234-5678",
  "email": "yamada@example.com",
  "address": "東京都渋谷区...",
  "insuranceNumber": "12345678",
  "emergencyContact": {
    "name": "山田 花子",
    "relationship": "配偶者",
    "phone": "090-8765-4321"
  },
  "firstVisitDate": "2024-01-10",
  "practitioner": "田中 先生",
  "memo": "高血圧の既往あり",
  "allergies": [
    {
      "id": "uuid-v4-string",
      "allergen": "ペニシリン",
      "type": "薬物アレルギー",
      "symptoms": "発疹・蕁麻疹",
      "severity": "中度",
      "confirmedDate": "2023-05-10",
      "memo": ""
    }
  ],
  "medicalHistory": [
    {
      "id": "uuid-v4-string",
      "disease": "高血圧",
      "diagnosedDate": "2020-03-01",
      "outcome": "継続中",
      "hospital": "○○クリニック",
      "memo": "降圧剤服用中"
    }
  ],
  "createdAt": "2024-01-10T09:00:00.000Z",
  "updatedAt": "2024-01-10T09:00:00.000Z"
}
```

* **gender**: `"male"` / `"female"` / `"other"`

#### records（診療記録）
```json
{
  "id": "uuid-v4-string",
  "patientId": "uuid-v4-string",
  "visitedAt": "2026-02-17T10:30:00.000Z",
  "soap": {
    "subjective": "右膝の痛みが強くなってきた。階段の昇降が辛い。",
    "objective": "右膝関節に腫脹・圧痛あり。ROM制限（屈曲110°）。",
    "assessment": "右変形性膝関節症（中等度）",
    "plan": "超音波治療・電気治療を継続。次回2週間後。"
  },
  "vitals": {
    "temperature": 36.5,
    "systolic": 128,
    "diastolic": 82,
    "pulse": 72,
    "spo2": 98,
    "respiratoryRate": 16,
    "weight": 65.5,
    "height": 168
  },
  "treatmentMemo": "超音波5分、干渉波10分施術",
  "createdAt": "2026-02-17T10:30:00.000Z",
  "updatedAt": "2026-02-17T10:30:00.000Z"
}
```

#### prescriptions（処方箋）
```json
{
  "id": "uuid-v4-string",
  "patientId": "uuid-v4-string",
  "recordId": "uuid-v4-string",
  "prescribedAt": "2026-02-17T10:30:00.000Z",
  "medicine": "ロキソプロフェン錠60mg",
  "dosage": "1回1錠",
  "frequency": "毎食後",
  "days": 7,
  "memo": "胃腸薬と併用",
  "createdAt": "2026-02-17T10:30:00.000Z",
  "updatedAt": "2026-02-17T10:30:00.000Z"
}
```

#### lab_results（検査結果）
```json
{
  "id": "uuid-v4-string",
  "patientId": "uuid-v4-string",
  "examinedAt": "2026-02-17T10:00:00.000Z",
  "category": "blood",
  "itemName": "白血球数",
  "value": "5800",
  "unit": "/μL",
  "referenceMin": "3500",
  "referenceMax": "9700",
  "judgment": "normal",
  "memo": "",
  "createdAt": "2026-02-17T10:05:00.000Z",
  "updatedAt": "2026-02-17T10:05:00.000Z"
}
```

* **category**: `"blood"` / `"urine"` / `"image"` / `"other"`
* **judgment**: `"normal"` / `"caution"` / `"abnormal"` / `null`

## 3. 画面設計

### 3.1 画面一覧（タブ構成）
1. **患者タブ**: 患者一覧・検索・新規登録フォーム
2. **カルテタブ**: 選択患者のSOAP診療記録入力フォーム + バイタルサイン入力
3. **処方タブ**: 処方箋管理（一覧・新規登録）
4. **検査タブ**: 検査結果入力・一覧・推移グラフ
5. **履歴タブ**: タイムライン形式の診療履歴（全記録一覧）
6. **設定タブ**: データ管理（エクスポート/インポート）・AI設定・アプリ情報

### 3.2 患者タブ
* **上部**: 患者検索バー（氏名・ふりがな・患者コード）
* **中部**: 患者一覧（カード形式）
    * 各カード: 患者コード、氏名、ふりがな、年齢、性別、最終受診日、アレルギー有無バッジ
    * カードクリックで患者選択→カルテタブへ遷移
* **下部**: 新規患者登録ボタン → モーダルまたはインライン展開フォーム

### 3.3 カルテタブ
* **上部**: 選択中の患者情報バー（患者コード・氏名・年齢）+ 患者切替ボタン
* **アレルギー警告**: アレルギー情報がある場合は上部に赤色バナーで表示
* **SOAP入力フォーム**: S/O/A/P 各フィールドをカード形式で縦に配置
* **バイタルサイン入力**: SOAP入力フォームの下部にバイタル入力グリッド
* **保存ボタン**: フォーム下部に固定
* **直近記録サマリー**: 保存後・ページ下部に直近3件を表示

### 3.4 処方タブ
* **上部**: 選択中の患者情報バー
* **新規処方フォーム**: 薬剤名・用量・用法・処方日数・備考
* **処方履歴一覧**: 処方日降順で表示（編集・削除ボタン付き）

### 3.5 検査タブ
* **上部**: 選択中の患者情報バー
* **検査種別フィルタ**: 血液検査・尿検査・画像検査・その他
* **グラフエリア**: 数値項目の推移グラフ（Chart.js）
* **新規検査入力フォーム**: 検査日・種別・項目・値・単位・基準値・判定
* **検査結果一覧**: 検査日降順で表示（編集・削除ボタン付き）

### 3.6 履歴タブ
* **上部**: 選択中の患者情報バー + 並び順切替（新しい順/古い順）
* **タイムライン**: 月別グルーピングで診療記録を縦に並べる
    * 各エントリ: 受診日時、主訴（先頭50文字）、バイタルサマリー、処方・検査の有無バッジ
    * エントリクリックで詳細展開（SOAP全文・バイタル全項目）
* **ページネーション**: 20件単位

### 3.7 設定タブ
* **データ管理**: エクスポート・インポートボタン
* **AI診断設定**: APIキー入力・AI向け備考・モデル選択
* **アプリ情報**: バージョン・ビルド日時・更新確認ボタン

### 3.8 固定UI要素
* **左上: ページ先頭へ戻るボタン** (`position: fixed`): 上矢印SVGアイコン、クリックでスムーズスクロールによりページ先頭へ移動
* **右上: バージョン情報表示** (`position: fixed`): `Ver: X.X.X` と `Build: YYYY-MM-DD HH:MM:SS JST` を2行で表示（`version.js` から取得）
* 両要素とも `no-print` クラスにより印刷時は非表示

### 3.9 レスポンシブ対応
* モバイルファースト設計
* ブレークポイント: 768px (タブレット), 480px (スマートフォン)
* タブナビゲーション: PC・タブレットでは上部水平ナビ、スマートフォンでは下部固定ナビ
* バイタル入力グリッド: PC 4カラム、タブレット 2カラム、スマートフォン 1カラム

## 4. 外部ライブラリ
* **Chart.js** (v4.x): グラフ描画 (CDN経由)
* **Chart.js date-fns adapter**: 日付軸対応

## 5. PWA構成

### 5.1 ファイル構成
* `manifest.json` - Web App Manifest（アプリ名、テーマカラー、アイコン定義）
* `sw.js` - Service Worker（アセットキャッシュ、オフライン対応）
* `icons/icon-192.svg` - アプリアイコン 192x192
* `icons/icon-512.svg` - アプリアイコン 512x512
* `icons/icon-maskable.svg` - マスカブルアイコン（セーフゾーン考慮）

### 5.2 Service Worker キャッシュ戦略
* **戦略**: Cache First + Network Fallback
* **プリキャッシュ対象**: index.html, style.css, script.js, emr.calc.js, version.js, manifest.json, アイコン, Chart.js CDN
* **除外**: OpenAI API リクエスト（/openai/）
* **更新**: `CACHE_NAME` のバージョンを変更することでキャッシュを刷新

### 5.3 Badge API
* アプリ起動時・記録保存時・記録削除時にバッジ状態を更新
* 当日（ローカル日付）に診療記録がない患者がいる場合、バッジに「1」を表示
* 全患者が当日受診済みの場合、バッジをクリア
* Badge API非対応ブラウザでは何もしない
