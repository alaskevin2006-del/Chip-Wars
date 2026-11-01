import { useState } from 'react';
import ReportPanel from './ReportPanel';
import type { Snapshot } from './types';

export default function RoundReview({ snapshot }: { snapshot: Snapshot }) {
  const reports = snapshot.reportHistory;
  const [round, setRound] = useState(reports.at(-1)?.round ?? 1);
  const report = reports.find((item) => item.round === round) ?? reports.at(-1);

  if (!report) return null;

  return (
    <section className="pv-round-review" aria-labelledby="round-review-title">
      <div className="pv-section-heading">
        <div>
          <h3 id="round-review-title">四轮回合复盘</h3>
        </div>
        <small>逐轮查看公开措施、指标变化与言行核对</small>
      </div>
      <div className="pv-tree-tabs" role="group" aria-label="选择回合战报">
        {reports.map((item) => (
          <button
            key={item.round}
            type="button"
            aria-pressed={round === item.round}
            onClick={() => setRound(item.round)}
          >
            R{item.round}
          </button>
        ))}
      </div>
      <div className="pv-round-review-body">
        <ReportPanel report={report} snapshot={snapshot} />
      </div>
    </section>
  );
}
