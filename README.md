# Health Dashboard（健康ダッシュボード）

TANITA の体組成データと、iPhone「Streaks」アプリからエクスポートした食事記録を
取り込み、AI が栄養推定・健康アドバイスを行う個人用の健康ダッシュボード Web アプリ。
iPhone のホーム画面ウィジェット（Scriptable）で体重・PFC の推移も確認できる。

- 本番URL: https://health-dashboard-dusky-xi.vercel.app
- リポジトリ: https://github.com/hikaruqq-sys/health-dashboard-
- ホスティング: Vercel（プロジェクト名 `health-dashboard`）

---

## 技術構成

| 領域 | 使用技術 |
|------|----------|
| フレームワーク | Next.js 16（App Router） / React 19 / TypeScript |
| スタイル | Tailwind CSS v4（CSS変数でダークモード対応） |
| グラフ | Recharts |
| 体組成データ | TANITA Health Planet API（OAuth 2.0） |
| AI（栄養推定・健康アドバイス） | Groq API（モデル `openai/gpt-oss-120b`） |
| データ保存（ウィジェット用） | Upstash Redis |
| iPhoneウィジェット | Scriptable（`scriptable/` 配下の JS） |
| ホスティング / デプロイ | Vercel |

> ⚠️ **注意:** `lib/anthropic.ts` というファイル名だが、中身は **Groq SDK** を使用している
> （開発初期の名残りで名前がAnthropicのまま）。AI処理はすべて Groq 経由。
> `package.json` の `@anthropic-ai/sdk` は現在どこからも import されておらず未使用。

---

## 外部サービス（3つ）と役割

| サービス | 何のために使うか |
|----------|------------------|
| **TANITA Health Planet** | 体重・体脂肪率などの体組成データを OAuth 経由で取得（`lib/healthplanet.ts`）。エンドポイントは `/status/innerscan.json`、1リクエスト最大3ヶ月。 |
| **Groq（AI）** | ①食事名リストからの栄養推定（カロリー/PFC）②体組成＋食事データからの健康アドバイス生成（`lib/anthropic.ts`）。Groqの無料枠モデルは廃止が頻繁なので、廃止時は `lib/anthropic.ts` のモデル名を差し替える。 |
| **Upstash Redis** | iPhone ウィジェット用に体重＋PFCの最新スナップショットをサーバー保存（`lib/store.ts`）。ダッシュボードを開くと `/api/widget-sync` が書き込み、`/api/widget` がウィジェットへ返す。 |

---

## デプロイ方法

**`git push` するだけで本番に自動デプロイされる**（Vercel の GitHub 連携が有効）。

```bash
git add -A
git commit -m "変更内容"
git push            # → Vercel が自動でビルド & 本番反映
```

デプロイ状況は Vercel ダッシュボード、または `npx vercel ls` で確認できる。

<details>
<summary>もし自動デプロイが再び動かなくなった場合</summary>

過去に GitHub↔Vercel の連携が外れて自動デプロイが止まったことがある。その場合：

1. 連携を再接続する:
   ```bash
   npx vercel git connect
   ```
2. それでも直らなければ手動デプロイで暫定対応:
   ```bash
   npx vercel --prod --yes
   ```
3. Vercel ダッシュボード → プロジェクト → Settings → Git で
   リポジトリ紐付けと Production Branch（`main`）を確認。

</details>

---

## 環境変数（キー名のみ・値は記載しない）

値は Vercel のプロジェクト設定（Settings → Environment Variables）に暗号化保存されている。
ローカルで動かす場合は `.env.local` に同じキーを設定する（`npx vercel env pull` で取得可能）。

| キー名 | 用途 |
|--------|------|
| `HEALTHPLANET_CLIENT_ID` | TANITA Health Planet OAuth のクライアントID |
| `HEALTHPLANET_CLIENT_SECRET` | 同 クライアントシークレット |
| `HEALTHPLANET_REDIRECT_URI` | OAuth 認可後のリダイレクト先URL |
| `GROQ_API_KEY` | Groq API の認証キー（AI栄養推定・健康アドバイス） |
| `WIDGET_SECRET` | ウィジェット用API（`/api/widget`）を保護する共有シークレット。Scriptable 側の `SECRET` と一致させる |
| `KV_REST_API_URL` | Upstash Redis の REST エンドポイントURL（`lib/store.ts` が参照） |
| `KV_REST_API_TOKEN` | Upstash Redis の REST 書き込みトークン（同上） |
| `KV_URL` / `REDIS_URL` | Upstash が自動生成する接続文字列（Vercel連携時に自動追加。コードでは未使用だが残しておく） |
| `KV_REST_API_READ_ONLY_TOKEN` | Upstash の読み取り専用トークン（自動追加・未使用） |

> `lib/store.ts` は `KV_REST_API_URL` / `KV_REST_API_TOKEN` を優先し、
> 無ければ `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` にフォールバックする。

### 秘密情報の分散登録について（引き継ぎ時に注意）

同じ秘密情報が複数箇所に登録されている場合があるので、値を変更するときは全箇所を更新すること：

- **Vercel**（本番/プレビュー）: 上記すべての環境変数の正本。
- **ローカル Mac**: `.env.local`（gitignore 済み。ローカル開発用のコピー）。
- **Scriptable ウィジェット**: `scriptable/*.js` の `SECRET` 定数に `WIDGET_SECRET` の値が**ハードコード**されている。`WIDGET_SECRET` を変えたらウィジェット側も手で書き換える。
- **GitHub Secrets**: 現状 GitHub Actions は使っていないため未使用（Vercel が直接ビルドする）。

---

## ローカル開発

```bash
npm install
npx vercel env pull        # .env.local に環境変数を取得（要 vercel login）
npm run dev                # http://localhost:3000
```

---

## ディレクトリ構成

```
app/
  page.tsx            画面本体（体重/栄養グラフ、AIアドバイス）
  api/
    health/           TANITAからデータ取得
    auth/             TANITA OAuth（認可・コールバック・状態）
    meals/            食事CSV → 栄養推定
    advice/           AI健康アドバイス生成
    widget/           ウィジェットへデータ返却（GET, WIDGET_SECRETで保護）
    widget-sync/      ダッシュボードからウィジェット用データ保存（POST）
lib/
  healthplanet.ts     TANITA Health Planet API 連携
  anthropic.ts        AI処理（※中身はGroq SDK）
  store.ts            Upstash Redis ラッパー
components/           グラフ等のUIパーツ
scriptable/
  HealthWidget.js     中サイズ用ウィジェット（体重＋PFC 直近）
  HealthWidget3M.js   大サイズ用ウィジェット（体重/カロリー/PFC 3ヶ月・目標線つき）
types/                型定義
```

---

## 引き継ぎメモ（人・AI 問わず）

- **Claude Code 固有の依存はなし。** Cursor など他の AI/エディタでもそのまま開発可能。
  リポジトリ内に `.claude/` 等の専用設定ファイルは無く、コードは標準の Next.js プロジェクト。
- AI 処理は Groq に依存。**Groq の無料枠モデルは廃止が頻繁**なので、
  栄養推定が急に失敗しだしたら `lib/anthropic.ts` の `model` を
  [Groq の現行モデル一覧](https://console.groq.com/docs/models)の値へ差し替える。
- `openai/gpt-oss-120b` は推論（reasoning）モデルのため、`reasoning_effort: 'low'` を
  指定しないと本文が空で返る点に注意（`lib/anthropic.ts` で対応済み）。
