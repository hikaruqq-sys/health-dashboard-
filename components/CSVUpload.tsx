'use client';

import { useRef, useState } from 'react';
import { MealEntry, DailyNutrition } from '@/types';

export default function CSVUpload({ onLoaded }: { onLoaded: (entries: MealEntry[], daily: DailyNutrition[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) { setError('CSVファイルを選択してください'); return; }
    setLoading(true); setError('');
    const form = new FormData();
    form.append('file', file);
    // すでに栄養推定済みの日付を渡し、サーバー側で再推定をスキップさせる
    try {
      const saved = localStorage.getItem('meal_nutrition');
      if (saved) {
        const known = (JSON.parse(saved) as DailyNutrition[])
          .filter((d) => d.totalCalories > 0)
          .map((d) => d.date);
        if (known.length) form.append('knownDates', JSON.stringify(known));
      }
    } catch {
      // localStorage が読めなくても通常アップロードにフォールバック
    }
    try {
      const res = await fetch('/api/meals', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      onLoaded(json.entries, json.daily);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-colors"
      style={{ borderColor: 'var(--border)' }}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
    >
      <input ref={inputRef} type="file" accept=".csv" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      <div className="text-3xl">{loading ? '⏳' : '📂'}</div>
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          {loading ? 'AIが栄養を推定中...' : 'CSVファイルをアップロード'}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>クリックまたはドラッグ＆ドロップ</p>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
