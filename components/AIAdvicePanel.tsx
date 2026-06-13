'use client';

import { useEffect, useState } from 'react';
import { BodyMetric, DailyNutrition } from '@/types';

interface AdviceRecord {
  text: string;
  createdAt: string; // ISO timestamp
}

const STORAGE_KEY = 'ai_advice_history';
const UPDATE_EVENT = 'ai-advice-updated';

function loadHistory(): AdviceRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function AIAdvicePanel({ metrics, nutrition }: { metrics: BodyMetric[]; nutrition: DailyNutrition[] }) {
  const [history, setHistory] = useState<AdviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Restore saved advice on mount and keep multiple panel instances in sync
  useEffect(() => {
    setHistory(loadHistory());
    const sync = () => setHistory(loadHistory());
    window.addEventListener(UPDATE_EVENT, sync);
    return () => window.removeEventListener(UPDATE_EVENT, sync);
  }, []);

  const fetchAdvice = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics, nutrition }),
      });
      const json = await res.json();
      const text = json.advice ?? json.error ?? 'エラーが発生しました';
      const record: AdviceRecord = { text, createdAt: new Date().toISOString() };
      const next = [record, ...loadHistory()].slice(0, 30); // keep last 30
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable — keep in memory only
      }
      setHistory(next);
      window.dispatchEvent(new Event(UPDATE_EVENT));
    } finally {
      setLoading(false);
    }
  };

  const latest = history[0];
  const past = history.slice(1);

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
          {loading ? '分析中...' : latest ? '再分析' : '分析する'}
        </button>
      </div>

      {latest ? (
        <>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            🕒 前回の分析: {formatDate(latest.createdAt)}
          </p>
          <AdviceMarkdown text={latest.text} />

          {past.length > 0 && (
            <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="text-xs font-medium"
                style={{ color: 'var(--accent)' }}
              >
                {showHistory ? '▼' : '▶'} 過去の分析履歴（{past.length}件）
              </button>
              {showHistory && (
                <div className="flex flex-col gap-3 mt-3">
                  {past.map((rec, i) => (
                    <div key={i} className="rounded-xl p-3" style={{ background: 'var(--bg-card2)' }}>
                      <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>🕒 {formatDate(rec.createdAt)}</p>
                      <AdviceMarkdown text={rec.text} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
          「分析する」を押すとAIが体組成と食事データを分析します
        </p>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
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
