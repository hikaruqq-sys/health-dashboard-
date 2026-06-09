'use client';

import { useEffect, useState } from 'react';

export default function DebugPage() {
  const [out, setOut] = useState<string>('読み込み中...');

  useEffect(() => {
    const token = localStorage.getItem('hp_access_token') || '';
    const refresh = localStorage.getItem('hp_refresh_token') || '';
    const lines: string[] = [];
    lines.push(`localStorage hp_access_token: ${token ? token.slice(0, 12) + '… (len ' + token.length + ')' : '(なし)'}`);
    lines.push(`localStorage hp_refresh_token: ${refresh ? refresh.slice(0, 12) + '… (len ' + refresh.length + ')' : '(なし)'}`);
    lines.push('');

    const params = new URLSearchParams({ days: '90' });
    if (token) params.set('access_token', token);
    if (refresh) params.set('refresh_token', refresh);

    fetch(`/api/health?${params}`)
      .then(async (r) => {
        const text = await r.text();
        lines.push(`GET /api/health → HTTP ${r.status}`);
        lines.push('');
        lines.push(text);
        setOut(lines.join('\n'));
      })
      .catch((e) => {
        lines.push(`fetch error: ${String(e)}`);
        setOut(lines.join('\n'));
      });
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: 'monospace', fontSize: 13, background: '#0f172a', color: '#e2e8f0', minHeight: '100vh' }}>
      <h1 style={{ fontWeight: 'bold', marginBottom: 12 }}>🔍 Health Planet 診断</h1>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{out}</pre>
    </div>
  );
}
