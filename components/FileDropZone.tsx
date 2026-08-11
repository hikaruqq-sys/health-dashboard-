'use client';

import { useRef, useState } from 'react';

/** 既存の食事CSVアップロードと同じ見た目のドロップゾーン。クリックでもD&Dでも受け取る。 */
export default function FileDropZone({
  label,
  hint,
  multiple = false,
  busyLabel = '読み込み中...',
  onFiles,
}: {
  label: string;
  hint?: string;
  multiple?: boolean;
  busyLabel?: string;
  onFiles: (files: File[]) => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handle = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      await onFiles(Array.from(files));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div
      className="border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors"
      style={{ borderColor: dragging ? 'var(--accent)' : 'var(--border)' }}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        multiple={multiple}
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      <div className="text-3xl">{busy ? '⏳' : '📂'}</div>
      <p className="text-sm font-medium text-center" style={{ color: 'var(--text)' }}>
        {busy ? busyLabel : label}
      </p>
      <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
        {hint ?? 'クリックまたはドラッグ＆ドロップ'}
      </p>
    </div>
  );
}
