/**
 * 自作アプリへのランチャー。
 * URL はアプリ内で編集でき、上書き値は localStorage('life_link_urls') に入る。
 * ここの defaultUrl は初期値。
 */

export interface AppLink {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  defaultUrl: string;
}

export const APP_LINKS: AppLink[] = [
  {
    id: 'rio',
    name: 'RIOのランキング',
    description: 'りお君のパン・おもちゃ・お菓子ランキング',
    icon: '🏆',
    color: '#f472b6',
    defaultUrl: 'https://rio-rankings.vercel.app',
  },
  {
    id: 'money',
    name: '資産管理',
    description: '資産運用・家計簿・経済指標・企業分析・ライフプラン',
    icon: '💰',
    color: '#34d399',
    defaultUrl: 'https://money-dashboard-iota-three.vercel.app',
  },
  {
    id: 'tennis',
    name: 'テニス分析',
    description: 'スコア記録とショット分析',
    icon: '🎾',
    color: '#facc15',
    defaultUrl: 'https://tennis-score-pi.vercel.app',
  },
  {
    id: 'spanish',
    name: 'スペイン語学習',
    description: 'DELE B1 に向けた学習',
    icon: '🇪🇸',
    color: '#fb923c',
    defaultUrl: 'https://spanish-app-kappa-mauve.vercel.app',
  },
];

const LS_KEY = 'life_link_urls';

export function loadLinkUrls(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveLinkUrl(id: string, url: string): void {
  try {
    const all = loadLinkUrls();
    if (url) all[id] = url;
    else delete all[id];
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    // localStorage が使えない環境ではデフォルトURLのまま動く
  }
}
