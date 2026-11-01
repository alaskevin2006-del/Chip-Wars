import { cardName, metrics, names } from './catalogue';
import type { Deal, Role, RoundBrief, RoundReport, Snapshot } from './types';

const fmt = (value: number) => Number(value.toFixed(2)).toString();
const sgn = (value: number) => `${value >= 0 ? '+' : ''}${fmt(value)}`;
const issueNames = {
  controls: '技术出口管制',
  materials: '关键材料与供应链',
  licensing: '设备许可自主',
  enforcement: '执法与灰色渠道',
  commerce: '商业收益与市场',
} as const;
const toneNames = { dove: '合作姿态', hawk: '强硬姿态' } as const;
const levelNames = { signal: '看法', pledge: '预告', redline: '红线' } as const;
const statusNames: Record<Deal['status'], string> = {
  pending: '等待参与方确认',
  effective: '已生效',
  rejected: '已拒绝',
  expired: '已过期',
  conflict: '安排冲突',
  fulfilled: '全员履约',
  breached: '存在违约',
};

function historySummary(report: RoundReport, snapshot: Snapshot) {
  const order: Role[] = snapshot.actionOrder ?? ['US', 'NL', 'CN', 'AS'];
  const actions = order
    .map((role) => {
      const action = report.actions[role];
      return action === 'hidden'
        ? `${names[role]}采取了未公开措施`
        : `${names[role]}选择${cardName(action)}`;
    })
    .join('，');
  const focus = report.focusIssue
    ? `本轮焦点是${issueNames[report.focusIssue]}${report.focusRole ? `，由${names[report.focusRole]}提出` : ''}。`
    : '';
  return `${focus}${actions}。`;
}

function VisibleDeal({ deal, role }: { deal: Deal; role: Role }) {
  return (
    <article className="g-deal">
      <h3>{names[deal.proposer]} 发起 · {statusNames[deal.status]}</h3>
      <p>参与方：{deal.participants.map((item) => names[item]).join('、')}</p>
      {deal.commitments ? (
        <>
          {deal.text && <p>{deal.text}</p>}
          {Object.entries(deal.commitments).map(([participant, action]) => (
            <p key={participant}>
              {names[participant as Role]} → <strong>{cardName(action)}</strong>
              {deal.fulfillment?.[participant as Role] === undefined
                ? ''
                : deal.fulfillment[participant as Role]
                  ? ' · 履约'
                  : ' · 违约'}
            </p>
          ))}
        </>
      ) : (
        <p>条款仅参与方可见。</p>
      )}
      {deal.status === 'effective' && !deal.commitments?.[role] && (
        <p className="g-note">你不在该安排中，只能看到公开状态。</p>
      )}
    </article>
  );
}

export default function ReportPanel({
  report,
  brief,
  snapshot,
}: {
  report: RoundReport;
  brief?: RoundBrief | null;
  snapshot: Snapshot;
}) {
  const isCurrent = snapshot.phase === 'report' && snapshot.round === report.round;
  const isHistory = !isCurrent;
  const summary = brief?.summary ?? (isHistory ? historySummary(report, snapshot) : null);
  const own = snapshot.roles.find((role) => role.id === snapshot.playerRole);
  const gap = Math.max(0, snapshot.ownStanding.deltaThreshold - snapshot.ownStanding.delta);
  const actionOrder: Role[] = snapshot.actionOrder ?? ['US', 'NL', 'CN', 'AS'];

  return (
    <section className="g-report">
      <section className="pv-top-summary" aria-label="本轮模型摘要">
        <p className="g-eyebrow">
          本轮摘要 · {brief?.source === 'llm' ? 'AI 生成' : isHistory ? '自动整理' : 'AI 整理中'}
        </p>
        <p>{summary ?? '本轮摘要正在生成，战报结果已经可以查看。'}</p>
        {brief && (brief.moves || brief.watch || brief.backing?.length) && (
          <details>
            <summary>更多摘要</summary>
            {brief.moves && <p>{brief.moves}</p>}
            {brief.watch && <p>{brief.watch}</p>}
            {!!brief.backing?.length && (
              <p>
                磋商与安排核对：
                {brief.backing.map((item) => `${item.party}的${item.measure}（${item.kind}）`).join('；')}。
              </p>
            )}
          </details>
        )}
      </section>

      <h3>第 {report.round} 回合 · 已公开结果</h3>
      {isCurrent && (
        <p className="pv-round-status">
          胜利进度 <strong>{sgn(snapshot.ownStanding.delta)}</strong>
          <span>{gap > 0 ? ` · 距胜利线 ${fmt(gap)}` : ' · 已越过胜利线'}</span>
          <span> · 信用 {own?.credit ?? 1}/2 · 全员履约 {own?.fulfilledDeals ?? 0}</span>
        </p>
      )}

      {report.focusIssue && (
        <p className="pv-focus-line">
          焦点：<strong>{issueNames[report.focusIssue]}</strong>
          {report.focusRole ? ` · ${names[report.focusRole]}` : ''}
        </p>
      )}

      <section className="pv-action-line" aria-label="本回合措施顺序">
        <strong>行动</strong>
        <div>
          {actionOrder.map((role) => {
            const action = report.actions[role];
            const source = report.sources[role];
            return (
              <span key={role} className={action === 'hidden' ? 'is-hidden' : ''}>
                <b>{names[role]}</b>
                {action === 'hidden' ? ' 未公开' : ` ${action} ${cardName(action)}`}
                {source === 'fallback' ? ' · 规则兜底' : source === 'timeout' ? ' · 超时' : ''}
              </span>
            );
          })}
        </div>
      </section>

      <details className="pv-reconcile">
        <summary>查看指标变化</summary>
        <div className="g-tablewrap">
          <table>
            <thead>
              <tr>
                <th>指标</th>
                <th>轮初</th>
                <th>合计影响</th>
                <th>取位/截断</th>
                <th>结算后</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => {
                const adjustment =
                  report.adjustment?.[metric.id] ??
                  report.state[metric.id] - report.roundStart[metric.id] - report.delta[metric.id];
                return (
                  <tr key={metric.id}>
                    <th>{metric.name}</th>
                    <td>{fmt(report.roundStart[metric.id])}</td>
                    <td>{fmt(report.delta[metric.id])}</td>
                    <td>{fmt(adjustment)}</td>
                    <td>
                      {fmt(report.state[metric.id])}
                      {report.state[metric.id] === metric.max
                        ? ' · 上限'
                        : report.state[metric.id] === 0
                          ? ' · 下限'
                          : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="g-note">所有增量合计后统一取位；达到边界时继续同方向的增量会被截断。</p>
      </details>

      <details className="pv-audit">
        <summary>详细对账</summary>
        {report.effects.map((effect, index) => (
          <p key={index}>
            {effect.rule === 'UNDISCLOSED' ? '另有未公开措施' : effect.description}：
            {Object.entries(effect.delta)
              .map(([metric, value]) => {
                const label = metrics.find((item) => item.id === metric)?.name ?? metric;
                return `${label} ${value! >= 0 ? '+' : ''}${fmt(value!)}`;
              })
              .join('，') || '0'}
          </p>
        ))}
        {report.deals.map((deal) => (
          <VisibleDeal key={deal.id} deal={deal} role={snapshot.playerRole} />
        ))}
        {!!report.beliefShifts?.length && (
          <>
            <h3>公开信号 · 类型后验更新</h3>
            {report.beliefShifts.map((shift, index) => (
              <p key={index}>
                {shift.reason} → 对{names[shift.target]}的公开判断{' '}
                {Math.round(shift.from * 100)}% → {Math.round(shift.to * 100)}%
              </p>
            ))}
          </>
        )}
        {!!report.statementChecks?.length && (
          <>
            <h3>言行一致性 · 宣示与措施核对</h3>
            {report.statementChecks.map((check, index) => (
              <p key={index}>
                {names[check.role]}：就{issueNames[check.issue]}发表{toneNames[check.tone]}（
                {levelNames[check.level]}）
                {check.target ? ` · 点名${names[check.target]}` : ''} → 实际
                {check.actual === 'hidden' ? '（未公开）' : cardName(check.actual)}
                {check.consistent === undefined
                  ? ' · 未核对'
                  : check.consistent
                    ? ' · 一致'
                    : ' · 背离，可信度下降'}
              </p>
            ))}
          </>
        )}
      </details>
    </section>
  );
}
