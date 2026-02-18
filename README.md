# 電子カルテ (emr)

ブラウザベースの電子カルテシステムです。
小規模施術者（整骨院・鍼灸院・マッサージ等）向けに設計されており、IndexedDB でローカルデータ管理を行い、サーバーへのデータ送信は一切行いません。オフライン対応 PWA。

## 主な機能

- **患者管理**: 患者情報の登録・検索・編集
- **SOAP記録**: 主観・客観・評価・計画の構造化カルテ記録
- **バイタルサイン**: 体温・血圧・脈拍等のバイタル記録
- **処方管理**: 処方内容の記録・管理
- **検査結果管理**: 検査データの記録・閲覧
- **タイムライン履歴**: 患者ごとの診療履歴を時系列表示
- **グラフ表示**: Chart.js によるバイタル推移グラフ
- **エクスポート/インポート**: JSON形式でデータのバックアップ・復元
- **AI診断支援**: OpenAI API を利用した診断補助
- **PWA対応**: ホーム画面インストール、完全オフライン動作

## 技術スタック

| 項目 | 技術 |
|------|------|
| フロントエンド | HTML + vanilla JavaScript (SPA) |
| データストア | IndexedDB |
| グラフ描画 | [Chart.js](https://www.chartjs.org/) v4 (CDN) |
| PWA | Web App Manifest + Service Worker |
| コンテナ | Docker (nginx:alpine / node:alpine) |
| デプロイ | Vercel |

## ディレクトリ構成

```
semr/
├── local_app/              # アプリ本体（HTML + vanilla JS）
│   ├── index.html          # SPA エントリポイント
│   ├── style.css           # スタイルシート
│   ├── script.js           # メインロジック（IndexedDB・UI・グラフ・PWA）
│   ├── emr.calc.js         # 計算ロジック（純粋関数）
│   ├── version.js          # ビルド時自動生成
│   ├── manifest.json       # PWA Web App Manifest
│   ├── sw.js               # PWA Service Worker
│   ├── api/                # クライアント側 API ラッパー
│   └── icons/              # PWA アイコン
├── api/                    # Vercel Serverless Functions
│   ├── openai.js           # OpenAI reverse proxy
│   └── openai/[...path].js # OpenAI reverse proxy (catch-all)
├── docs/                   # ドキュメント駆動開発用
├── scripts/
│   ├── build.sh            # ビルド＆起動
│   ├── rebuild.sh          # クリーンビルド＆起動
│   └── generate_version.sh # バージョン情報生成
├── nginx/
│   └── default.conf        # ローカル開発用nginx設定
├── docker-compose.yml      # 3サービス構成
├── Dockerfile              # nginx:alpine（アプリ配信）
├── Dockerfile.test         # node:alpine + Chromium（テスト実行）
├── package.json
└── vercel.json             # Vercelデプロイ設定
```

## セットアップ

### 前提条件

- Docker / Docker Compose

### ビルド＆起動

```bash
bash scripts/build.sh
```

ブラウザで `http://localhost:8083` にアクセスしてください。

### クリーンビルド

```bash
bash scripts/rebuild.sh
```

## テスト

Docker コンテナ上でテストを実行します。

```bash
docker compose run --rm emr-test npm test
```

## Docker構成（3サービス体制）

| サービス | 用途 | ポート |
|----------|------|--------|
| `emr-app` | テスト/E2E用（内部ネットワークのみ） | 非公開 |
| `emr-app-public` | ブラウザ確認用 | 8083 (変更可) |
| `emr-test` | テスト実行（Node.js + Chromium） | — |

## ライセンス

Private
