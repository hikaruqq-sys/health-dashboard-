'use client';

import { useState } from 'react';
import { BodyMetric, DailyNutrition } from '@/types';

export default function AIAdvicePanel({ metrics, nutrition }: { metrics: BodyMetric[]; nutrition: DailyNutrition[] }) {
  const [advice, setAdvice] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchAdvice = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics, nutrition }),
      });
      const json = await res.json();
      setAdvice(json.advice ?? json.error ?? 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>AI 健康アドバイス</h2>
        <button
          onClick={fetchAdvice}
          disabled={loading}
          className="text-xs px-4 py-1.5 rounded-full disabled:opacity-50 transition-colors font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {loading ? '分析中...' : advice ? '再分析' : '分析する'}
        </button>
      </div>
      {advice ? (
        <AdviceMarkdown text={advice} />
      ) : (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
          「分析する」を押すとAIが体組成と食事データを分析します
        </p>
      )}
    </div>
  );
}

function AdviceMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-sm" style={{ color: 'var(--text)' }}>
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <h3 key={i} className="font-bold mt-3 mb-1" style={{ color: 'var(--text)' }}>{line.slice(4)}</h3>;
        if (line.startsWith('## ')) return <h2 key={i} className="font-bold text-base mt-4 mb-1" style={{ color: 'var(--text)' }}>{line.slice(3)}</h2>;
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc" style={{ color: 'var(--text-sub)' }}>{parseBold(line.slice(2))}</li>;
        if (/^\d+\./.test(line)) return <li key={i} className="ml-4 list-decimal" style={{ color: 'var(--text-sub)' }}>{parseBold(line.replace(/^\d+\.\s*/, ''))}</li>;
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i} style={{ color: 'var(--text-sub)' }}>{parseBold(line)}</p>;
      })}
    </div>
  );
}

function parseBold(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? <strong key={i} style={{ color: 'var(--text)' }}>{p}</strong> : p
  );
}
