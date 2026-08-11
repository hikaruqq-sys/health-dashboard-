'use client';

export default function Card({
  title,
  badge,
  action,
  children,
}: {
  title?: string;
  badge?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border p-5 flex flex-col gap-3"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {title && (
              <h2
                className="text-sm font-semibold tracking-wide truncate"
                style={{ color: 'var(--text-sub)' }}
              >
                {title}
              </h2>
            )}
            {badge && <span className="text-xs font-medium text-amber-400 flex-shrink-0">● {badge}</span>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
