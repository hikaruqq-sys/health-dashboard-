'use client';

import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import MetricCard from '@/components/MetricCard';
import WeightChart from '@/components/WeightChart';
import BodyChart from '@/components/BodyChart';
import NutritionChart from '@/components/NutritionChart';
import MacroBar from '@/components/MacroBar';
import MealLog from '@/components/MealLog';
import CSVUpload from '@/components/CSVUpload';
import AIAdvicePanel from '@/components/AIAdvicePanel';
import HomeTab from '@/components/tabs/HomeTab';
import HabitsTab from '@/components/tabs/HabitsTab';
import TargetTab from '@/components/tabs/TargetTab';
import LibraryTab from '@/components/tabs/LibraryTab';
import { useTheme } from '@/components/ThemeProvider';
import { BodyMetric, DailyNutrition, MealEntry } from '@/types';

const PERIOD_OPTIONS = [
  { label: '1ヶ月', days: 30 },
  { label: '3ヶ月', days: 90 },
  { label: '6ヶ月', days: 180 },
];

const TABS = [
  { id: 'home', label: 'ホーム', icon: '🏠' },
  { id: 'habits', label: '習慣', icon: '🔥' },
  { id: 'target', label: '目標', icon: '🎯' },
  { id: 'health', label: '健康', icon: '🏃' },
  { id: 'library', label: '本・映画', icon: '📚' },
] as const;
type Tab = typeof TABS[number]['id'];

/** 表示期間の切り替えが意味を持つのは健康タブ（体組成・食事）だけ */
const PERIOD_TABS: Tab[] = ['health'];

/** Tailwind の md ブレークポイントと揃える */
const DESKTOP_QUERY = '(min-width: 768px)';

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
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [selectedDay, setSelectedDay] = useState<DailyNutrition | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('hp_access_token');
      const refresh = localStorage.getItem('hp_refresh_token');
      const params = new URLSearchParams({ days: String(period) });
      if (token) params.set('access_token', token);
      if (refresh) params.set('refresh_token', refresh);
      const res = await fetch(`/api/health?${params}`);
      const json = await res.json();
      setMetrics(json.data ?? []);
      setIsMock(json.mock ?? false);
      setSyncedAt(new Date());
    } finally {
      setLoading(false);
    }
  }, [period]);

  const loadMeals = useCallback(async () => {
    // Restore previously imported meal data from localStorage first
    try {
      const stored = localStorage.getItem('meal_nutrition');
      if (stored) {
        const parsed: DailyNutrition[] = JSON.parse(stored);
        if (parsed.length > 0) {
          setNutrition(parsed);
          setIsMealMock(false);
          setSelectedDay(parsed[parsed.length - 1]);
          return;
        }
      }
    } catch {
      // ignore corrupt storage and fall through to mock
    }
    // No saved data yet → show mock sample from server
    const res = await fetch('/api/meals?days=14');
    const json = await res.json();
    setNutrition(json.daily ?? []);
    setMealEntries(json.entries ?? []);
    setIsMealMock(json.mock ?? false);
    setSelectedDay(json.daily?.[json.daily.length - 1] ?? null);
  }, []);

  // PC用とモバイル用のレイアウトは常に両方DOMに存在する（CSSで片方を隠している）。
  // ヒートマップや本の一覧のように要素数が多いタブでは二重描画が効くので、
  // 実際に表示されている側にだけ中身を入れる。
  const isDesktop = useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DESKTOP_QUERY);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true // サーバー描画時はPC想定（マウント直後に実際の幅で置き換わる）
  );

  // Read OAuth tokens from URL params (Safari ITP workaround) and save to localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('hp_token');
    const refresh = params.get('hp_refresh');
    if (token) {
      localStorage.setItem('hp_access_token', token);
      localStorage.setItem('hp_refresh_token', refresh ?? '');
      window.history.replaceState({}, '', '/');
    }
  }, []);

  useEffect(() => { loadHealth(); }, [loadHealth]);
  useEffect(() => { loadMeals(); }, [loadMeals]);

  // Push latest real data to the server so the Scriptable widget can read it
  useEffect(() => {
    const weight = isMock
      ? []
      : metrics.filter((m) => m.weight != null).map((m) => ({ date: m.date, weight: m.weight as number }));
    const pfc = isMealMock
      ? []
      : nutrition.map((d) => ({
          date: d.date,
          protein: Math.round(d.totalProtein),
          fat: Math.round(d.totalFat),
          carbs: Math.round(d.totalCarbs),
          calories: Math.round(d.totalCalories),
        }));
    if (weight.length === 0 && pfc.length === 0) return;
    fetch('/api/widget-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight, pfc }),
    }).catch(() => { /* best-effort sync */ });
  }, [metrics, nutrition, isMock, isMealMock]);

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
      // If we're currently showing mock sample data, replace it; otherwise merge
      const base = isMealMock ? [] : prev;
      const map = new Map(base.map((d) => [d.date, d]));
      daily.forEach((d) => map.set(d.date, d)); // newer import wins per date
      const merged = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
      try {
        localStorage.setItem('meal_nutrition', JSON.stringify(merged));
      } catch {
        // storage full / unavailable — keep in-memory at least
      }
      return merged;
    });
    setIsMealMock(false);
    setSelectedDay(daily[daily.length - 1] ?? null);
  };

  // PC・モバイルで同じものを出すので、一度だけ組み立てて両方から使う
  const content =
    loading && PERIOD_TABS.includes(activeTab) ? (
      <div className="flex items-center justify-center h-48" style={{ color: 'var(--text-muted)' }}>読み込み中...</div>
    ) : activeTab === 'home' ? (
      <HomeTab metrics={metrics} nutrition={nutrition} onNavigate={(t) => setActiveTab(t as Tab)} />
    ) : activeTab === 'habits' ? (
      <HabitsTab />
    ) : activeTab === 'target' ? (
      <TargetTab />
    ) : activeTab === 'library' ? (
      <LibraryTab />
    ) : (
      <HealthTab
        metrics={metrics} nutrition={nutrition} latest={latest} prev={prev} trend={trend} isMock={isMock}
        todayNutrition={todayNutrition}
        selectedDay={selectedDay}
        isMealMock={isMealMock}
        setSelectedDay={setSelectedDay}
        onMealLoaded={onMealLoaded}
      />
    );

  const showPeriod = PERIOD_TABS.includes(activeTab);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── PC: サイドバー + メインエリア ── */}
      <div className="hidden md:flex min-h-screen">

        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 flex flex-col border-r" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="px-5 py-6">
            <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>🐎 2026 Life Dashboard</h1>
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
          <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--border)', display: showPeriod ? undefined : 'none' }}>
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
        <main className="flex-1 overflow-y-auto p-6">{isDesktop && content}</main>
      </div>

      {/* ── Mobile: ヘッダー + コンテンツ + ボトムナビ ── */}
      <div className="flex flex-col flex-1 md:hidden">

        {/* Mobile header */}
        <header className="flex items-center justify-between px-4 py-3 border-b sticky top-0 z-10"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div>
            <h1 className="text-sm font-bold" style={{ color: 'var(--text)' }}>🐎 2026 Life Dashboard</h1>
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
        <div
          className="flex gap-2 px-4 py-2 overflow-x-auto"
          style={{ background: 'var(--bg-card)', borderBottom: `1px solid var(--border)`, display: showPeriod ? undefined : 'none' }}
        >
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
        <main className="flex-1 overflow-y-auto px-4 py-4 pb-24">{!isDesktop && content}</main>

        {/* Bottom navigation */}
        <nav className="fixed bottom-0 left-0 right-0 flex border-t z-20"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors min-w-0"
              style={{ color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="truncate w-full text-center">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

/* Returns true if any record has a value for the given metric key */
function has(metrics: BodyMetric[], key: keyof BodyMetric): boolean {
  return metrics.some((m) => m[key] != null);
}

/* ── 健康タブ（体組成・食事をサブ切り替えでまとめる） ── */
const HEALTH_SUBTABS = [
  { id: 'body', label: '体組成', icon: '⚖️' },
  { id: 'nutrition', label: '食事', icon: '🥗' },
] as const;
type HealthSubTab = typeof HEALTH_SUBTABS[number]['id'];

function HealthTab(props: {
  metrics: BodyMetric[];
  nutrition: DailyNutrition[];
  latest: BodyMetric | undefined;
  prev: BodyMetric | undefined;
  trend: (key: keyof BodyMetric) => 'up' | 'down' | 'flat';
  isMock: boolean;
  todayNutrition: DailyNutrition | null | undefined;
  selectedDay: DailyNutrition | null;
  isMealMock: boolean;
  setSelectedDay: (d: DailyNutrition) => void;
  onMealLoaded: (entries: MealEntry[], daily: DailyNutrition[]) => void;
}) {
  const [sub, setSub] = useState<HealthSubTab>('body');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {HEALTH_SUBTABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors"
            style={{
              background: sub === t.id ? 'var(--accent)' : 'var(--bg-card)',
              color: sub === t.id ? '#fff' : 'var(--text-sub)',
              border: `1px solid ${sub === t.id ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
      {sub === 'body' ? (
        <BodyTab
          metrics={props.metrics} nutrition={props.nutrition}
          latest={props.latest} prev={props.prev} trend={props.trend} isMock={props.isMock}
        />
      ) : (
        <NutritionTab
          nutrition={props.nutrition}
          todayNutrition={props.todayNutrition}
          selectedDay={props.selectedDay}
          isMealMock={props.isMealMock}
          metrics={props.metrics}
          setSelectedDay={props.setSelectedDay}
          onMealLoaded={props.onMealLoaded}
        />
      )}
    </div>
  );
}

/* ── Body composition tab ── */
function BodyTab({ metrics, nutrition, latest, prev, trend, isMock }: {
  metrics: BodyMetric[];
  nutrition: DailyNutrition[];
  latest: BodyMetric | undefined;
  prev: BodyMetric | undefined;
  trend: (key: keyof BodyMetric) => 'up' | 'down' | 'flat';
  isMock: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Tanita connect banner */}
      {(isMock || metrics.length === 0) && (
        <div className="rounded-2xl border p-4 flex items-center justify-between gap-3"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>⚖️ タニタ体組成計を連携する</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>現在はデモデータを表示中。連携すると実際の計測データが同期されます。</p>
          </div>
          <a
            href="/api/auth/start"
            className="text-xs px-4 py-2 rounded-full font-medium whitespace-nowrap flex-shrink-0"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            連携する
          </a>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {has(metrics, 'weight') && (
          <MetricCard label="体重" value={latest?.weight} unit="kg" trend={trend('weight')} trendGood="down"
            sub={prev?.weight ? `前回比 ${((latest?.weight ?? 0) - prev.weight).toFixed(1)} kg` : undefined} />
        )}
        {has(metrics, 'bodyFat') && (
          <MetricCard label="体脂肪率" value={latest?.bodyFat} unit="%" trend={trend('bodyFat')} trendGood="down" />
        )}
        {has(metrics, 'muscleMass') && (
          <MetricCard label="筋肉量" value={latest?.muscleMass} unit="kg" trend={trend('muscleMass')} trendGood="up" />
        )}
        {has(metrics, 'bmr') && (
          <MetricCard label="基礎代謝" value={latest?.bmr} unit="kcal" trend={trend('bmr')} trendGood="up" />
        )}
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
      <NutritionChart data={nutrition} selectedDate={selectedDay?.date} onSelectDay={setSelectedDay} />

      {/* Selected day meals (also shown lower) */}
      {selectedDay && (
        <div className="rounded-2xl border p-5 flex flex-col gap-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-sub)' }}>
            🍽 {selectedDay.date} の食事（{Math.round(selectedDay.totalCalories)} kcal）
          </h2>
          <MealLog day={selectedDay} />
        </div>
      )}

      {/* CSV upload - primary import method */}
      <Card title="📱 iPhoneから食事データをインポート" badge={isMealMock ? 'デモデータ' : undefined}>
        <CSVUpload onLoaded={onMealLoaded} />
        <div className="text-xs rounded-xl p-3 mt-1" style={{ background: 'var(--bg-card2)', color: 'var(--text-muted)' }}>
          <p className="font-medium mb-1" style={{ color: 'var(--text-sub)' }}>📱 Streaksのエクスポート手順</p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Streaksアプリ → 該当ログを開く</li>
            <li>右上メニュー → 「Export」→「CSV」</li>
            <li>書き出したファイルをここにアップロード</li>
          </ol>
          <p className="mt-2">✨ 栄養情報がない場合はAIが自動推定します</p>
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
