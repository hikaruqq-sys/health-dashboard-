# 2026 Life Dashboard

年間目標・習慣・体組成・食事・本&映画を1つにまとめた個人用ダッシュボード。
もともと健康（TANITA + Streaks の食事ログ + AI 栄養推定）だけだったものに、
Notion で管理していた 2026 年の目標・習慣カウント・読書リストを取り込んだ。
iPhone のホーム画面ウィジェット（Scriptable）で体重・PFC の推移も確認できる。

- 本番URL: https://health-dashboard-dusky-xi.vercel.app
- リポジトリ: https://github.com/hikaruqq-sys/health-dashboard-
- ホスティング: Vercel（プロジェクト名 `health-dashboard`）

## タブ構成

ナビは5つ（`app/page.tsx` の `TABS` 配列）。体組成と食事は別アプリだった頃の名残で
機能は独立しているが、ナビを増やしすぎないよう「健康」1タブの中でサブ切り替えにしている
（`HealthTab` コンポーネント、`app/page.tsx` 末尾）。

| タブ | 中身 | データの入り方 |
|------|------|----------------|
| 🏠 ホーム | 年/四半期/月の経過バー、各タブのサマリ、体重・カロリーのミニグラフ、自作アプリへのリンクカード | 他タブから自動集計（`components/tabs/HomeTab.tsx`） |
| 🔥 習慣 | 年間ヒートマップ、月別カウント表、連続日数、月別グラフ | Streaks の CSV を取り込み／その場でタップ記録（`components/tabs/HabitsTab.tsx`） |
| 🎯 目標 | 2026 Target（カテゴリ×項目×Q1-Q4）、四半期ごとの達成リング | 初回に `data/targets2026.ts` から投入、以後はアプリ上で編集（`components/tabs/TargetTab.tsx`） |
| 🏃 健康 | サブタブ「体組成」（体重・体脂肪・筋肉量の推移、AIアドバイス）／「食事」（カロリー・PFCの推移、食事ログ） | 体組成: TANITA Health Planet API／食事: Streaks の食事CSV → AI が栄養推定（`app/page.tsx` 内 `BodyTab`/`NutritionTab`） |
| 📚 本・映画 | 一覧・フィルタ・検索、年間読了カウンタ（目標24冊） | Notion の book&movies CSV を取り込み（`components/tabs/LibraryTab.tsx`） |

家計簿は別アプリ（money-dashboard）に一本化しているので、ホームのリンクカードから飛ぶだけ
（このアプリ内には家計簿機能を持たせない方針）。

## 習慣・目標・本のデータ保存（Supabase）

`lib/lifeStore.ts` が担当。**money-dashboard / rio-rankings と同じ Supabase プロジェクト**に
`life_` プレフィックスのテーブルを追加して相乗りしている。

**初回だけ手動セットアップが必要**： Supabase ダッシュボード → SQL Editor で
[`supabase/schema.sql`](supabase/schema.sql) を実行する。実行するまではブラウザの
localStorage にだけ保存され、端末をまたいで共有されない（アプリは落ちずに動く）。

- 接続情報は `lib/supabase.ts`。環境変数 `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` があればそれを使い、無ければ
  ファイル内のフォールバック値（publishable キー＝公開前提）を使う。
- 読み込みに成功すると localStorage にもキャッシュを書くので、オフラインでも直前の状態が出る。
- ⚠️ RLS は anon の読み書きを許可している（URLを知っていれば誰でも編集できる）。
  家族以外に公開する段階になったら Supabase Auth に移行すること。
- **この Supabase プロジェクト（`xoyupzvqmokopurwzrdy`）は他の自作アプリと共有**。
  スキーマを変更するときは他アプリのテーブルに触れないこと（テーブル名は全部 `life_` 接頭辞で分離済み）。
  同居しているテーブル: `rio_rankings`（rio-rankings）、`companies` / `holdings` / `asset_snapshots` /
  `budget_months` / `econ_indicators` / `macro_indicators` / `dreams` / `amex_spend` /
  `furusato_donations` / `furusato_kv` / `lifeplan_kv`（money-dashboard）。
  ※ tennis-score は**別の Supabase プロジェクト**（`pjbozqejnrdfntahjnlr`）なので無関係。

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
  page.tsx            画面本体。TABS配列でナビ定義、BodyTab/NutritionTab/HealthTabもここに定義
  layout.tsx          ThemeProvider・LifeDataProvider でラップ
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
  store.ts            Upstash Redis ラッパー（ウィジェット用）
  supabase.ts         Supabaseクライアント初期化
  lifeStore.ts        習慣/目標/本 の永続化（Supabase優先・localStorageフォールバック）
  habits.ts           Streaks CSV パーサ、連続日数などの集計
  library.ts          book&movies CSV パーサ
  period.ts           年/四半期/月の経過計算
  vizPalette.ts        グラフの配色（dataviz skillの検証済みパレット。並び順を変えない）
  meals.ts             食事CSVパーサ（既存）
components/
  tabs/               各タブの本体（HomeTab / HabitsTab / TargetTab / LibraryTab）
  LifeDataProvider.tsx 習慣/目標/本データを全タブで共有するContext
  HabitHeatmap.tsx      年間ヒートマップ（GitHub草風）
  HabitMonthlyChart.tsx 習慣の月別バーチャート
  ProgressRing.tsx      進捗リング
  Card.tsx / FileDropZone.tsx  汎用UIパーツ
  （既存）MetricCard/WeightChart/BodyChart/NutritionChart/MacroBar/MealLog/CSVUpload/AIAdvicePanel/ThemeProvider
data/
  targets2026.ts      2026 Target のシードデータ（Notionから移植）
  links.ts            自作アプリへのリンク一覧（デフォルトURL、上書きはlocalStorage）
supabase/
  schema.sql          life_* テーブルのDDL。Supabase SQL Editorで一度だけ実行する
scriptable/
  HealthWidget.js     中サイズ用ウィジェット（体重＋PFC 直近）
  HealthWidget3M.js   大サイズ用ウィジェット（体重/カロリー/PFC 3ヶ月・目標線つき）
types/                型定義（BodyMetric/MealEntry/HabitLog/TargetRow/LibraryItem など）
```

---

## 開発時の注意点（詰まりやすいポイント）

- **npm install**: このMacは `~/node_modules` と `~/.npm` に既存の何かがあり、素の
  `npm install` だと EACCES で失敗することがある。
  `npm install --legacy-peer-deps --cache /tmp/npmcache-health` を使うこと。
- **`next.config.ts` は空 `{}` のまま維持する。** `turbopack.root: __dirname` を足すと
  ビルドが壊れたことがある（親ディレクトリに `package-lock.json` が複数あるため
  Next.js がワークスペースルート推定で警告を出すが、無視してよい）。
- **recharts の依存 `react-is` が npm install で外れることがある。** ビルドが
  `Module not found: Can't resolve 'react-is'` で失敗したら `npm install react-is` を追加する。
- ローカルでの動作確認は `.claude/launch.json`（Claude Code固有、Antigravityには不要）ではなく
  素の `npm run dev` で問題ない。

---

## 引き継ぎメモ（人・AI 問わず）

**2026-08 時点、開発は Claude Code で行っていたが Antigravity に引き継ぐ。**
Claude Code 固有の依存は元々なし（`.claude/` 等の専用設定ファイルはリポジトリに含めていない）ので、
Cursor・Antigravity など他の AI/エディタでもそのまま開発できる。標準の Next.js プロジェクト。

- AI 処理は Groq に依存。**Groq の無料枠モデルは廃止が頻繁**なので、
  栄養推定が急に失敗しだしたら `lib/anthropic.ts` の `model` を
  [Groq の現行モデル一覧](https://console.groq.com/docs/models)の値へ差し替える。
- `openai/gpt-oss-120b` は推論（reasoning）モデルのため、`reasoning_effort: 'low'` を
  指定しないと本文が空で返る点に注意（`lib/anthropic.ts` で対応済み）。
- **グラフの配色（`lib/vizPalette.ts`）は色覚多様性・コントラストを検証済みの並び順。**
  入れ替えたり9色目を足したりしない。系列が増える場合は「その他」にまとめるかスモールマルチプルにする。
- **Supabaseは3アプリ共有プロジェクト。** 詳細は上記「習慣・目標・本のデータ保存」節。
  テーブルを追加・変更するときは `life_` 接頭辞を必ず付け、他アプリのテーブルには触らないこと。
- 現状の未対応・保留事項:
  - スペイン語学習アプリ以外の3リンク（RIO/資産管理/テニス）は動作確認済み。
  - Streaksの実CSVで`lib/habits.ts`のパーサを試していない（3形式に対応する設計にしてあるが、
    実ファイルで崩れる場合はフォーマットを見て調整する）。
  - 家計簿機能はこのアプリに追加しない方針（money-dashboardへ誘導する）。

エージェント向けの短い要約は [AGENTS.md](AGENTS.md) を参照。
