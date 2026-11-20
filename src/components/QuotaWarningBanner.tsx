import { useEffect, useState } from 'react';

interface QuotaMetrics {
  notebook_id: string;
  total_card_count: number;
  total_media_bytes: number;
  warnings: string[];
  hard_limit_bytes: number;
}

/**
 * Warning banner shown when media usage approaches free-tier limits.
 */
export default function QuotaWarningBanner() {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mediaPct, setMediaPct] = useState<number>(0);

  useEffect(() => {
    async function load() {
      try {
        // Fetch quota for each notebook — simplified: just check first one
        const res = await fetch('/api/quota');
        if (!res.ok) return;
        const data = await res.json() as QuotaMetrics[];
        const allWarnings = data.flatMap((n) => n.warnings);
        setWarnings(allWarnings);
        const maxPct = Math.max(...data.map((n) =>
          Math.round((n.total_media_bytes / n.hard_limit_bytes) * 100)
        ), 0);
        setMediaPct(maxPct);
      } catch {
        // Ignore quota errors silently
      }
    }
    load();
  }, []);

  if (warnings.length === 0 && mediaPct < 60) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`px-4 py-3 rounded-md mb-4 ${
        mediaPct >= 80
          ? 'bg-red-50 border border-red-200 text-red-800'
          : mediaPct >= 60
            ? 'bg-yellow-50 border border-yellow-200 text-yellow-800'
            : 'bg-blue-50 border border-blue-200 text-blue-700'
      }`}
    >
      <p className="font-medium">
        {mediaPct >= 80 ? '⚠️ Cảnh báo dung lượng' : 'ℹ️ Thông tin dung lượng'}
      </p>
      {warnings.map((w, i) => (
        <p key={i} className="text-sm mt-1">{w}</p>
      ))}
      {mediaPct > 0 && mediaPct < 60 && (
        <p className="text-sm mt-1">
          Media: {(mediaPct / 100 * 250).toFixed(1)} MB / 250 MB ({mediaPct}%)
        </p>
      )}
    </div>
  );
}
