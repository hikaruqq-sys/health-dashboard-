'use client';

import { useEffect, useState, useCallback } from 'react';
import MetricCard from '@/components/MetricCard';
import WeightChart from '@/components/WeightChart';
import BodyChart from '@/components/BodyChart';
import NutritionChart from '@/components/NutritionChart';
import MacroBar from '@/components/MacroBar';
import MealLog from '@/components/MealLog';
import CSVUpload from '@/components/CSVUpload';
import MealInput from '@/components/MealInput';
import AIAdvicePanel from '@/components/AIAdvicePanel';
import { useTheme } from '@/components/ThemeProvider';
import { BodyMetric, DailyNutrition, MealEntry } from '@/types';

const PERIOD_OPTIONS = [
  { label: '1ヶ月', days: 30 },
  { label: '3ヶ月', days: 90 },
  { label: '6ヶ月', days: 180 },
];

const TABS = [
  { id: 'body', label: '体組成', icon: '⚖️' },
  { id: 'nutrition', label: '食事・栄養', icon: '🥗' },
] as const;
type Tab = typeof TABS[number]['id'];

export default function Dashboard() {
  const { theme, toggle } = useTheme();
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [nutrition, setNutrition] = useState<DailyNutrition[]>([]);
  const [, setMealEntries] = useState<MealEntry[]>([]);
  const [period, setPeriod] = useState(90);
  const [isMock, setIsMock] = useState(false);
  const [isMealMock, setIsMealMock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('body');
  const [selectedDay, setSelectedDay] = useState<DailyNutrition | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/health?days=${period}`);
      const json = await res.json();
      setMetrics(json.data ?? []);
      setIsMock(json.mock ?? false);
      setSyncedAt(new Date());
    } finally {
      setLoading(false);
    }
  }, [period]);

  const loadMeals = useCallback(async () => {
    const res = await fetch('/api/meals?days=14');
    const json = await res.json();
    setNutrition(json.daily ?? []);
    setMealEntries(json.entries ?? []);
    setIsMealMock(json.mock ?? false);
    setSelectedDay(json.daily?.[json.daily.length - 1] ?? null);
  }, []);

  useEffect(() => { loadHealth(); }, [loadHealth]);
  useEffect(() => { loadMeals(); }, [loadMeals]);

  const latest = metrics[metrics.length - 1];
  const prev = metrics[metrics.length - 3];

  const trend = (key: keyof BodyMetric): 'up' | 'down' | 'flat' => {
    if (!latest || !prev) return 'flat';
    const a = latest[key] as number | undefined;
    const b = prev[key] as number | undefined;
    if (a == null || b == null) return 'flat';
    return a > b ? 'up' : a < b ? 'down' : 'flat';
  };

  const todayNutrition = selectedDay ?? nutrition[nutrition.length - 1];

  const onMealLoaded = (entries: MealEntry[], daily: DailyNutrition[]) => {
    setMealEntries((prev) => [...prev, ...entries]);
    setNutrition((prev) => {
      const map = new Map(prev.map((d) => [d.date, d]));
      daily.forEach((d) => map.set(d.date, d));
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    });
    setIsMealMock(false);
    setSelectedDay(daily[daily.length - 1] ?? null);
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── PC: サイドバー + メインエリア ── */}
      <div className="hidden md:flex min-h-screen">

        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 flex flex-col border-r" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="px-5 py-6">
            <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>🏃 健康ダッシュボード</h1>
            {syncedAt && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {syncedAt.toLocaleTimeString('ja-JP')}
                {isMock && <span className="ml-1 text-amber-400">● デモ</span>}
              </p>
            )}
          </div>

          <nav className="flex-1 px-3 flex flex-col gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors"
                style={{
                  background: activeTab === tab.id ? 'var(--accent)' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : 'var(--text-sub)',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Period selector */}
          <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>表示期間</p>
            <div className="flex flex-col gap-1">
              {PERIOD_OPTIONS.map((o) => (
                <button
                  key={o.days}
                  onClick={() => setPeriod(o.days)}
                  className="text-xs px-3 py-1.5 rounded-lg text-left transition-colors"
                  style={{
                    background: period === o.days ? 'var(--accent)' : 'var(--bg-card2)',
                    color: period === o.days ? '#fff' : 'var(--text-sub)',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Theme + sync */}
          <div className="px-4 py-4 flex gap-2">
            <button
              onClick={toggle}
              className="flex-1 text-xs py-2 rounded-lg transition-colors"
              style={{ background: 'var(--bg-card2)', color: 'var(--text-sub)' }}
            >
              {theme === 'dark' ? '☀️ ライト' : '🌙 ダーク'}
            </button>
            <button
              onClick={loadHealth}
              className="text-xs px-3 py-2 rounded-lg transition-colors"
              style={{ background: 'var(--bg-card2)', color: 'var(--text-sub)' }}
            >↻</button>
          </div>
        </aside>

        {/* PC main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-48" style={{ color: 'var(--text-muted)' }}>読み込み中...</div>
          ) : activeTab === 'body' ? (
            <BodyTab metrics={metrics} nutrition={nutrition} latest={latest} prev={prev} trend={trend} />
          ) : (
            <NutritionTab
              nutrition={nutrition}
              todayNutrition={todayNutrition}
              selectedDay={selectedDay}
              isMealMock={isMealMock}
              metrics={metrics}
              setSelectedDay={setSelectedDay}
              onMealLoaded={onMealLoaded}
            />
          )}
        </main>
      </div>

      {/* ── Mobile: ヘッダー + コンテンツ + ボトムナビ ── */}
      <div className="flex flex-col flex-1 md:hidden">

        {/* Mobile header */}
        <header className="flex items-center justify-between px-4 py-3 border-b sticky top-0 z-10"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div>
            <h1 className="text-sm font-bold" style={{ color: 'var(--text)' }}>🏃 健康ダッシュボード</h1>
            {syncedAt && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {syncedAt.toLocaleTimeString('ja-JP')}
                {isMock && <span className="ml-1 text-amber-400">● デモ</span>}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={loadHealth} className="text-xs px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--bg-card2)', color: 'var(--text-sub)' }}>↻</button>
            <button onClick={toggle} className="text-xs px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--bg-card2)', color: 'var(--text-sub)' }}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        {/* Period selector - horizontal scroll */}
        <div className="flex gap-2 px-4 py-2 overflow-x-auto" style={{ background: 'var(--bg-card)', borderBottom: `1px solid var(--border)` }}>
          {PERIOD_OPTIONS.map((o) => (
            <button
              key={o.days}
              onClick={() => setPeriod(o.days)}
              className="text-xs px-3 py-1 rounded-full whitespace-nowrap flex-shrink-0 transition-colors"
              style={{
                background: period === o.days ? 'var(--accent)' : 'var(--bg-card2)',
                color: period === o.days ? '#fff' : 'var(--text-sub)',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Mobile content */}
        <main className="flex-1 overflow-y-auto px-4 py-4 pb-24">
          {loading ? (
            <div className="flex items-center justify-center h-48" style={{ color: 'var(--text-muted)' }}>読み込み中...</div>
          ) : activeTab === 'body' ? (
            <BodyTab metrics={metrics} nutrition={nutrition} latest={latest} prev={prev} trend={trend} />
          ) : (
            <NutritionTab
              nutrition={nutrition}
              todayNutrition={todayNutrition}
              selectedDay={selectedDay}
              isMealMock={isMealMock}
              metrics={metrics}
              setSelectedDay={setSelectedDay}
              onMealLoaded={onMealLoaded}
            />
          )}
        </main>

        {/* Bottom navigation */}
        <nav className="fixed bottom-0 left-0 right-0 flex border-t z-20"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-3 text-xs font-medium transition-colors"
              style={{ color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              <span className="text-xl">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

/* ── Body composition tab ── */
function BodyTab({ metrics, nutrition, latest, prev, trend }: {
  metrics: BodyMetric[];
  nutrition: DailyNutrition[];
  latest: BodyMetric | undefined;
  prev: BodyMetric | undefined;
  trend: (key: keyof BodyMetric) => 'up' | 'down' | 'flat';
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="体重" value={latest?.weight} unit="kg" trend={trend('weight')} trendGood="down"
          sub={prev?.weight ? `前回比 ${((latest?.weight ?? 0) - prev.weight).toFixed(1)} kg` : undefined} />
        <MetricCard label="体脂肪率" value={latest?.bodyFat} unit="%" trend={trend('bodyFat')} trendGood="down" />
        <MetricCard label="筋肉量" value={latest?.muscleMass} unit="kg" trend={trend('muscleMass')} trendGood="up" />
        <MetricCard label="基礎代謝" value={latest?.bmr} unit="kcal" trend={trend('bmr')} trendGood="up" />
      </div>
      <WeightChart data={metrics} />
      <BodyChart data={metrics} />
      <AIAdvicePanel metrics={metrics} nutrition={nutrition} />
    </div>
  );
}

/* ── Nutrition tab ── */
function NutritionTab({ nutrition, todayNutrition, selectedDay, isMealMock, metrics, setSelectedDay, onMealLoaded }: {
  nutrition: DailyNutrition[];
  todayNutrition: DailyNutrition | null | undefined;
  selectedDay: DailyNutrition | null;
  isMealMock: boolean;
  metrics: BodyMetric[];
  setSelectedDay: (d: DailyNutrition) => void;
  onMealLoaded: (entries: MealEntry[], daily: DailyNutrition[]) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {todayNutrition && (
        <MacroBar
          calories={todayNutrition.totalCalories}
          protein={todayNutrition.totalProtein}
          fat={todayNutrition.totalFat}
          carbs={todayNutrition.totalCarbs}
        />
      )}
      <NutritionChart data={nutrition} />
      <MealInput onLoaded={onMealLoaded} />

      {/* CSV upload */}
      <Card title="CSVインポート" badge={isMealMock ? 'デモデータ' : undefined}>
        <CSVUpload onLoaded={onMealLoaded} />
        <div className="text-xs rounded-xl p-3 mt-1" style={{ background: 'var(--bg-card2)', color: 'var(--text-muted)' }}>
          <p className="font-medium mb-1" style={{ color: 'var(--text-sub)' }}>Streaks CSVフォーマット対応</p>
          <code className="block font-mono">2026/02/01 18:33, 夜ご飯, ハンバーグ定食,</code>
          <code className="block font-mono">2026/02/02 7:17, 朝ご飯, オートミール, コーヒー</code>
          <p className="mt-1">栄養情報がない場合はAIが自動推定します</p>
        </div>
      </Card>

      {/* Day selector */}
      {nutrition.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {nutrition.slice(-7).map((d) => (
            <button
              key={d.date}
              onClick={() => setSelectedDay(d)}
              className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 transition-colors border"
              style={{
                background: selectedDay?.date === d.date ? 'var(--accent)' : 'var(--bg-card)',
                color: selectedDay?.date === d.date ? '#fff' : 'var(--text-sub)',
                borderColor: selectedDay?.date === d.date ? 'var(--accent)' : 'var(--border)',
              }}
            >
              {d.date.slice(5)} ({Math.round(d.totalCalories)}kcal)
            </button>
          ))}
        </div>
      )}

      {selectedDay && <MealLog day={selectedDay} />}
      <AIAdvicePanel metrics={metrics} nutrition={nutrition} />
    </div>
  );
}

function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>{title}</h2>
        {badge && <span className="text-xs font-medium text-amber-400">● {badge}</span>}
      </div>
      {children}
    </div>
  );
}
