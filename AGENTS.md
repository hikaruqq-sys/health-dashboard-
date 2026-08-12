# AGENTS.md — 2026 Life Dashboard

このファイルはAIコーディングエージェント（Antigravity等）向けのエントリーポイント。
詳細は [README.md](README.md) を参照。人間向けの説明・全体像はそちらが正本。

## これは何か

個人用の生活管理ダッシュボード（年間目標・習慣・体組成・食事・本&映画）。
Next.js 16 + React 19 + TypeScript + Tailwind v4 + Recharts。Vercelに `git push` で自動デプロイ。

- 本番URL: https://health-dashboard-dusky-xi.vercel.app
- リポジトリ: https://github.com/hikaruqq-sys/health-dashboard-（デフォルトブランチ `main`）
- 開発経緯: 元々「健康ダッシュボード」（体組成+食事のみ）だったものを2026-08に拡張し、
  Notionで管理していた年間目標・習慣（Streaksアプリ由来）・読書記録を統合した。
  それまでの開発はClaude Codeで行っていたが、以後はAntigravityに引き継ぐ。

## 最初に読むべきファイル

1. `README.md` — アーキテクチャ・データフロー・環境変数・デプロイ手順の全体像
2. `app/page.tsx` — 画面のエントリーポイント。`TABS` 配列がナビ構成、下部に `BodyTab`/`NutritionTab`/`HealthTab` の定義
3. `components/tabs/*.tsx` — 各タブの本体（Home / Habits / Target / Library）
4. `lib/lifeStore.ts` — 習慣・目標・本データの永続化ロジック（Supabase優先、localStorageフォールバック）
5. `supabase/schema.sql` — DBスキーマ（既に本番Supabaseに適用済み。再実行しても壊れない設計）

## 変更前に必ず確認すること

- **Supabaseは3つの自作アプリ（このアプリ / money-dashboard / rio-rankings）で共有しているプロジェクト**
  （`xoyupzvqmokopurwzrdy`）。このアプリのテーブルは全部 `life_` 接頭辞。新しいテーブルを足すときも
  必ず `life_` を付け、他アプリのテーブル（`rio_rankings`, `companies`, `holdings`, `budget_months` など）
  には触れない。詳細はREADMEの「習慣・目標・本のデータ保存」節。
- **tennis-score は別のSupabaseプロジェクト**（`pjbozqejnrdfntahjnlr`）なので無関係。
- **グラフの配色（`lib/vizPalette.ts`）の並び順を変えない。** 色覚多様性検証済みの順序。
  系列を増やすときは9色目を足すのではなく「その他」に畳むかスモールマルチプルにする。
- **家計簿機能は追加しない。** money-dashboardに一本化する方針（ホームのリンクカードから飛ばすだけ）。
- npm installは `npm install --legacy-peer-deps --cache /tmp/npmcache-health` を使う
  （このMac固有の権限問題を避けるため）。素の`npm install`だとrechartsの依存`react-is`が
  外れてビルドが壊れることがあるので、ビルドエラーが出たら`npm install react-is`を疑う。
- `next.config.ts` は空 `{}` のまま。`turbopack.root`等を足すとビルドが壊れる。

## よくある作業

- **UIの見た目/グラフを変える** → 各 `components/tabs/*.tsx` を編集。配色は `lib/vizPalette.ts` から取る。
- **データの持ち方を変える**（新しいフィールド追加など） → `types/index.ts` の型 → `supabase/schema.sql`
  にカラム追加のALTER文を書く → `lib/lifeStore.ts` の変換関数（`toXxx`/`fromXxx`）を更新。
  スキーマ変更はSupabase SQL Editorで手動実行が必要（自動マイグレーションの仕組みはない）。
- **デプロイ確認** → `npm run build` → ローカルなら `npm run dev`（http://localhost:3000）→
  問題なければ `git push`（Vercelが自動ビルド）。

## 動作確認の仕方

ブラウザでの確認が必要な変更（UI/グラフ/レイアウト）は、実際に `npm run dev` で立ち上げて
目視確認すること。特にPC用サイドバーとモバイル用ボトムナビは別々のDOMツリーなので
（`app/page.tsx` の `isDesktop` 分岐）、両方で確認する。
