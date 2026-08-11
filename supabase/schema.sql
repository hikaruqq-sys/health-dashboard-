-- 2026 Life Dashboard 用テーブル
-- money-dashboard / rio-rankings と同じ Supabase プロジェクトに相乗りするため、
-- テーブル名はすべて life_ プレフィックスで衝突を避ける。
--
-- 実行方法: Supabase ダッシュボード → SQL Editor にこのファイルを貼って Run。

-- ── 習慣の日次ログ（Streaks CSV から取り込む） ──────────────────
create table if not exists life_habit_logs (
  id      bigserial primary key,
  habit   text    not null,
  date    date    not null,
  count   integer not null default 1,
  unique (habit, date)
);
create index if not exists life_habit_logs_date_idx on life_habit_logs (date);

-- ── 習慣ごとの設定（アイコン・月間目標回数・並び順） ────────────
create table if not exists life_habit_meta (
  habit        text primary key,
  icon         text,
  monthly_goal integer,
  color        text,
  sort_order   integer default 0,
  archived     boolean default false
);

-- ── 年間目標（Notion の Target 表） ────────────────────────────
create table if not exists life_targets (
  id         text primary key,
  category   text not null,
  item       text not null,
  q1 text, q2 text, q3 text, q4 text,
  -- {"q1":"done"|"miss","q2":...} 形式。未設定の四半期はキー自体を持たない。
  status     jsonb not null default '{}'::jsonb,
  sort_order integer default 0
);

-- ── 本・映画（Notion の book&movies DB） ───────────────────────
create table if not exists life_library (
  id          text primary key,
  title       text not null,
  url         text,
  type        text,           -- book | movie | drama | anime | other
  status      text,           -- want | doing | done
  started_on  date,
  finished_on date,
  recommender text,
  note        text,
  cover_url   text,
  created_at  timestamptz default now()
);
create index if not exists life_library_type_idx on life_library (type);

-- ── RLS: URL を知っている人は読み書きできる（既存テーブルと同じ方針） ──
-- ⚠️ 認証は入れていないため、URL が漏れると誰でも編集できる。
--    家族以外にも公開する段階になったら Supabase Auth に移行すること。
alter table life_habit_logs enable row level security;
alter table life_habit_meta enable row level security;
alter table life_targets    enable row level security;
alter table life_library    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['life_habit_logs','life_habit_meta','life_targets','life_library']
  loop
    execute format('drop policy if exists %I on %I', t || '_anon_all', t);
    execute format(
      'create policy %I on %I for all to anon using (true) with check (true)',
      t || '_anon_all', t
    );
  end loop;
end $$;
