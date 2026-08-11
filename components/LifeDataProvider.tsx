'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  loadHabitLogs, loadHabitMeta, loadLibrary, loadTargets, saveTargets,
} from '@/lib/lifeStore';
import { TARGETS_2026 } from '@/data/targets2026';
import type { HabitLog, HabitMeta, LibraryItem, TargetRow } from '@/types';

/**
 * 習慣・目標・本&映画をまとめて1回だけ読み、全タブで共有する。
 * Home タブが各タブのサマリを出すため、タブごとに読み直すと無駄が多い。
 */

interface LifeData {
  logs: HabitLog[];
  meta: HabitMeta[];
  targets: TargetRow[];
  library: LibraryItem[];
  loading: boolean;
  setLogs: (logs: HabitLog[]) => void;
  setMeta: (meta: HabitMeta[]) => void;
  setTargets: (targets: TargetRow[]) => void;
  setLibrary: (items: LibraryItem[]) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<LifeData>({
  logs: [], meta: [], targets: [], library: [], loading: true,
  setLogs: () => {}, setMeta: () => {}, setTargets: () => {}, setLibrary: () => {},
  reload: async () => {},
});

export function LifeDataProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [meta, setMeta] = useState<HabitMeta[]>([]);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [l, m, t, lib] = await Promise.all([
        loadHabitLogs(), loadHabitMeta(), loadTargets(), loadLibrary(),
      ]);
      setLogs(l);
      setMeta(m);
      setLibrary(lib);

      // 一度も保存していなければ Notion からの初期データを流し込む
      if (t === null) {
        setTargets(TARGETS_2026);
        saveTargets(TARGETS_2026).catch(() => { /* 保存失敗時もUIは動く */ });
      } else {
        setTargets(t);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <Ctx.Provider
      value={{ logs, meta, targets, library, loading, setLogs, setMeta, setTargets, setLibrary, reload }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useLifeData() { return useContext(Ctx); }
