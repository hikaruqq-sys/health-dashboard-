'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// money-dashboard / rio-rankings と同じ Supabase プロジェクトに相乗りする。
// publishable キーはブラウザに露出する前提の公開キー（rio-rankings の index.html にも
// そのまま埋め込まれている）なので、環境変数が無いときのフォールバックとして直書きする。
// Vercel 側で NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY を
// 設定すれば、そちらが優先される。
const FALLBACK_URL = 'https://xoyupzvqmokopurwzrdy.supabase.co';
const FALLBACK_KEY = 'sb_publishable_cPsk4-kDfLzjB5UezcIFaA_sWcU4idY';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? FALLBACK_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  FALLBACK_KEY;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export const isSupabaseEnabled = supabase !== null;
