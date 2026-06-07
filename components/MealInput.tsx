'use client';

import { useState } from 'react';
import { DailyNutrition, MealEntry } from '@/types';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEAL_LABELS: Record<MealType, string> = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' };

export default function MealInput({ onLoaded }: { onLoaded: (entries: MealEntry[], daily: DailyNutrition[]) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [inputs, setInputs] = useState<Record<MealType, string>>({ breakfast: '', lunch: '', dinner: '', snack: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleEstimate = async () => {
    const foods: { mealType: string; name: string }[] = [];
    for (const [type, raw] of Object.entries(inputs)) {
      if (!raw.trim()) continue;
      raw.split(/[,、\n]/).map((s) => s.trim()).filter(Boolean).forEach((name) => foods.push({ mealType: type, name }));
    }
    if (!foods.length) { setError('食品名を入力してください'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await fetch('/api/meals/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foods, date }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'エラー');
      onLoaded(json.entries, json.daily);
      setInputs({ breakfast: '', lunch: '', dinner: '', snack: '' });
      setSuccess('栄養情報を推定しました！');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>食事入力（AI栄養推定）</h2>
        <input
          type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="text-xs rounded-lg px-2 py-1 border outline-none"
          style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)', color: 'var(--text)' }}
        />
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>食べたものを入力するとAIが栄養を自動推定。複数の場合はカンマ区切り。</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((type) => (
          <div key={type} className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>{MEAL_LABELS[type]}</label>
            <input
              type="text"
              placeholder={type === 'breakfast' ? 'ご飯、納豆、味噌汁' : type === 'lunch' ? '鶏胸肉定食' : type === 'dinner' ? 'サラダ、豆腐' : ''}
              value={inputs[type]}
              onChange={(e) => setInputs((p) => ({ ...p, [type]: e.target.value }))}
              className="text-sm rounded-xl px-3 py-2 border outline-none focus:ring-2 transition-all"
              style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {success && <p className="text-xs text-emerald-500">{success}</p>}

      <button
        onClick={handleEstimate} disabled={loading}
        className="self-end text-sm px-5 py-2.5 rounded-full disabled:opacity-50 transition-colors font-medium"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        {loading ? 'AIが推定中...' : '栄養を推定する'}
      </button>
    </div>
  );
}
