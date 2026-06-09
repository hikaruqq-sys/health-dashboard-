import { BodyMetric } from '@/types';

const HP_BASE = 'https://www.healthplanet.jp';

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.HEALTHPLANET_CLIENT_ID!,
    redirect_uri: process.env.HEALTHPLANET_REDIRECT_URI!,
    response_type: 'code',
    scope: 'innerscan',
  });
  return `${HP_BASE}/oauth/auth?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(`${HP_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.HEALTHPLANET_CLIENT_ID!,
      client_secret: process.env.HEALTHPLANET_CLIENT_SECRET!,
      redirect_uri: process.env.HEALTHPLANET_REDIRECT_URI!,
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${body}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(`${HP_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.HEALTHPLANET_CLIENT_ID!,
      client_secret: process.env.HEALTHPLANET_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error('Token refresh failed');
  return res.json();
}

// TAG IDs from Health Planet innerscan API docs
// 6021:体重 6022:体脂肪率 6023:筋肉量 6027:基礎代謝量 6028:体内年齢
const TAG_MAP: Record<string, keyof BodyMetric> = {
  '6021': 'weight',
  '6022': 'bodyFat',
  '6023': 'muscleMass',
  '6027': 'bmr',
  '6028': 'bodyAge',
};

export async function fetchHealthData(
  accessToken: string,
  from: string, // YYYYMMDDHHMMSS
  to: string,
): Promise<BodyMetric[]> {
  const params = new URLSearchParams({
    access_token: accessToken,
    date: '1',
    from,
    to,
    tag: Object.keys(TAG_MAP).join(','),
  });
  const res = await fetch(`${HP_BASE}/status/innerscan.json?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Health Planet API error: ${res.status} ${body}`);
  }
  const json = await res.json();

  // Group by date
  const map = new Map<string, BodyMetric>();
  for (const item of json.data ?? []) {
    const date = item.date.substring(0, 8); // YYYYMMDD
    const formatted = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    if (!map.has(formatted)) map.set(formatted, { date: formatted });
    const metric = map.get(formatted)!;
    const key = TAG_MAP[item.tag];
    if (key) (metric as unknown as Record<string, unknown>)[key] = parseFloat(item.keydata);
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Health Planet limits each request to 3 months, so split larger ranges
// into <=90-day windows and merge the results.
export async function fetchHealthDataRange(
  accessToken: string,
  fromDate: Date,
  toDate: Date,
): Promise<BodyMetric[]> {
  const fmt = (d: Date) => d.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const merged = new Map<string, BodyMetric>();
  const cursor = new Date(fromDate);

  while (cursor < toDate) {
    const windowEnd = new Date(cursor);
    windowEnd.setDate(windowEnd.getDate() + 88);
    const chunkTo = windowEnd < toDate ? windowEnd : toDate;
    const chunk = await fetchHealthData(accessToken, fmt(cursor), fmt(chunkTo));
    for (const m of chunk) merged.set(m.date, m);
    cursor.setDate(cursor.getDate() + 89);
  }

  return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Mock data for development (when API keys are not configured)
export function getMockData(days = 90): BodyMetric[] {
  const data: BodyMetric[] = [];
  const now = new Date();
  let weight = 72.5;
  let bodyFat = 22.0;

  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 3) {
      weight += (Math.random() - 0.52) * 0.4;
      bodyFat += (Math.random() - 0.51) * 0.3;
      const muscleMass = weight * (1 - bodyFat / 100) * 0.45;
      data.push({
        date: d.toISOString().slice(0, 10),
        weight: Math.round(weight * 10) / 10,
        bodyFat: Math.round(bodyFat * 10) / 10,
        muscleMass: Math.round(muscleMass * 10) / 10,
        bmr: Math.round(1400 + muscleMass * 13),
        bodyAge: 35,
      });
    }
  }
  return data;
}
