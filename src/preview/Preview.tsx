import { useState } from 'react';
import { names } from '../game-v1/catalogue';
import type { ActionId, CommitLevel, IssueId, Metric, Metrics, Role, Tone } from '../game-v1/types';
import SubgameReview, { type RoundActionData } from '../game-v1/SubgameReview';

type View = 'announcement' | 'report' | 'results';
type RoleOrder = 'US' | 'NL' | 'CN' | 'AS';

type RoundPreview = {
  round: number;
  focus: string;
  focusRole: Role;
  summary: string;
  moves: string;
  start: Metrics;
  end: Metrics;
  delta: Metrics;
  utility: number;
  previousUtility: number;
  threshold: number;
  credit: number;
  fulfilledDeals: number;
  kept: number;
  broken: number;
  actions: Record<Role, ActionId | 'hidden'>;
  effects: string[];
  chance: string;
};

const roleOrder: RoleOrder[] = ['US', 'NL', 'CN', 'AS'];
const metricOrder: Metric[] = ['T', 'A', 'E', 'S', 'P'];
const metricMeta: Record<Metric, { name: string; max: number }> = {
  T: { name: '先进技术获取难度', max: 5 },
  A: { name: '美荷政策协调度', max: 5 },
  E: { name: '整体商业收益', max: 5 },
  S: { name: '中国技术自主能力', max: 5 },
  P: { name: '美国国内产业压力', max: 2 },
};

const actionNames: Record<ActionId, string> = {
  U1: '收紧技术管制',
  U2: '有限放宽管制',
  U3: '争取荷兰协调',
  U4: '加强合规执法',
  C1: '投资自主研发',
  C2: '限制材料出口',
  C3: '提出中荷合作',
  C4: '放松材料限制',
  N1: '收紧设备许可',
  N2: '批准有限许可',
  N3: '配合美方协调',
  S1: '执行合规订单',
  S2: '开拓其他市场',
  S4: '灰色渠道交易',
  PASS: '维持现状',
};

const rounds: RoundPreview[] = [
  {
    round: 1,
    focus: '技术出口管制',
    focusRole: 'US',
    summary: '美国先有限放宽，荷兰批准有限许可；中国提出中荷商业合作，商业收益显著回升。',
    moves: '技术获取难度与政策协调度同时下降，商业收益达到本局高位。',
    start: { T: 2, A: 2, E: 3, S: 1, P: 0 },
    end: { T: 0, A: 0, E: 5, S: 1, P: 0 },
    delta: { T: -2, A: -2, E: 2, S: 0, P: 0 },
    utility: 0.61,
    previousUtility: 0.55,
    threshold: 0.12,
    credit: 1,
    fulfilledDeals: 0,
    kept: 0,
    broken: 0,
    actions: { US: 'U2', NL: 'N2', CN: 'C3', AS: 'hidden' },
    effects: [
      '美国有限放宽：T −1、E +1、P −1。',
      '荷兰批准有限许可，中国提出中荷合作：A −2、E +0.9。',
      '另有未公开措施贡献 T −1、E +1；具体行动仍不可见。',
    ],
    chance: '本轮没有公开的随机反噬或灰色交易查获记录。',
  },
  {
    round: 2,
    focus: '设备许可自主',
    focusRole: 'NL',
    summary: '美国与荷兰同时收紧设备条件，中国把资源投入下一回合才生效的自主研发。',
    moves: '技术获取难度上升，整体商业收益明显回落；中国的自主能力将在下一回合到账。',
    start: { T: 0, A: 0, E: 5, S: 1, P: 0 },
    end: { T: 3, A: 1, E: 3, S: 1, P: 0 },
    delta: { T: 3, A: 1, E: -2, S: 0, P: 0 },
    utility: 0.68,
    previousUtility: 0.61,
    threshold: 0.12,
    credit: 2,
    fulfilledDeals: 1,
    kept: 1,
    broken: 0,
    actions: { US: 'U1', NL: 'N1', CN: 'C1', AS: 'hidden' },
    effects: [
      '美国收紧技术管制：按轮初 A=0 计算，T +1、E −1。',
      '荷兰收紧设备许可：T +1、A +1、E −1。',
      '中国投资研发：本轮 E −0.5，下回合 S +1。',
      '另有未公开措施贡献 T +1、E +0.5；具体行动仍不可见。',
    ],
    chance: '当前视角无法确认 ASML 的具体措施；公开结果只显示合计影响。',
  },
  {
    round: 3,
    focus: '关键材料与供应链',
    focusRole: 'CN',
    summary: '美国重新争取荷兰协调，中国限制关键材料；协调度上升，但商业收益继续收缩。',
    moves: '荷兰的胜利进度短暂后退；上一轮研发在本轮转化为自主能力。',
    start: { T: 3, A: 1, E: 3, S: 2, P: 0 },
    end: { T: 3, A: 3, E: 1.1, S: 2, P: 1 },
    delta: { T: 0, A: 2, E: -1.9, S: 0, P: 1 },
    utility: 0.66,
    previousUtility: 0.68,
    threshold: 0.12,
    credit: 2,
    fulfilledDeals: 1,
    kept: 1,
    broken: 0,
    actions: { US: 'U3', NL: 'N3', CN: 'C2', AS: 'hidden' },
    effects: [
      '美国争取协调，荷兰同时配合：A +2。',
      '中国限制关键材料出口：P +1、E −0.5。',
      '美国协调行动另付出 E −0.4。',
      '另有未公开措施贡献 E −1；具体行动仍不可见。',
    ],
    chance: '本轮没有公开的 U3 反噬或灰色交易查获记录。',
  },
  {
    round: 4,
    focus: '商业收益与市场',
    focusRole: 'NL',
    summary: '最后一轮美国放宽、中国放松材料限制；荷兰维持设备许可方向，商业条件小幅改善。',
    moves: '荷兰以四轮累计的相对提升越过胜利线，并凭全员履约记录获得外交胜利。',
    start: { T: 3, A: 3, E: 1.1, S: 2, P: 1 },
    end: { T: 4.6, A: 4, E: 2.1, S: 2, P: 0 },
    delta: { T: 1.6, A: 1, E: 1, S: 0, P: -1 },
    utility: 0.74,
    previousUtility: 0.66,
    threshold: 0.12,
    credit: 2,
    fulfilledDeals: 2,
    kept: 1,
    broken: 0,
    actions: { US: 'U2', NL: 'N1', CN: 'C4', AS: 'hidden' },
    effects: [
      '美国有限放宽：T −1、E +1、P −1。',
      '荷兰收紧设备许可：T +1.6、A +1、E −1。',
      '中国放松关键材料限制：P −1、E +0.5。',
      '另有未公开措施贡献 T +1、E +0.5；具体行动仍不可见。',
    ],
    chance: '终局没有发生需要公开的灰色交易查获。',
  },
];

const comparison = [
  {
    role: 'NL' as Role,
    preference: '协调优先',
    verdict: '外交胜利',
    delta: 0.19,
    threshold: 0.12,
    credit: 2,
    fulfilledDeals: 2,
    isPlayer: true,
  },
  {
    role: 'US' as Role,
    preference: '安全优先',
    verdict: '实质胜利',
    delta: 0.14,
    threshold: 0.12,
    credit: 2,
    fulfilledDeals: 0,
    isPlayer: false,
  },
  {
    role: 'CN' as Role,
    preference: '自主突破',
    verdict: '数值过线，信用不足',
    delta: 0.13,
    threshold: 0.08,
    credit: 0,
    fulfilledDeals: 1,
    isPlayer: false,
  },
  {
    role: 'AS' as Role,
    preference: '全球多元',
    verdict: '未过胜利线',
    delta: 0.07,
    threshold: 0.08,
    credit: 1,
    fulfilledDeals: 1,
    isPlayer: false,
  },
];

const fmt = (value: number) => value.toFixed(2);
const sign = (value: number) => `${value >= 0 ? '+' : ''}${fmt(value)}`;

function PreviewHeader({ view, onView }: { view: View; onView: (view: View) => void }) {
  return (
    <header className="pv-header">
      <div>
        <p className="g-eyebrow">本地视觉预览 · 示例数据</p>
        <h1>战报与结局改版</h1>
        <p>正式游戏入口不变；这里检查模型摘要、行动路径和单轮行动树。</p>
      </div>
      <div className="pv-view-switch" role="group" aria-label="预览页面">
        <button type="button" aria-pressed={view === 'announcement'} onClick={() => onView('announcement')}>
          公开表态
        </button>
        <button type="button" aria-pressed={view === 'report'} onClick={() => onView('report')}>
          回合战报
        </button>
        <button type="button" aria-pressed={view === 'results'} onClick={() => onView('results')}>
          最终结果
        </button>
      </div>
    </header>
  );
}

function AnnouncementPreview() {
  const [issue, setIssue] = useState<IssueId>('licensing');
  const [tone, setTone] = useState<Tone>('hawk');
  const [level, setLevel] = useState<CommitLevel>('pledge');
  const [target, setTarget] = useState<Role | ''>('US');
  const [drafted, setDrafted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const hint = level === 'signal'
    ? '只表达倾向，不要求后续行动一致。'
    : level === 'pledge'
      ? '预告后续行动。实际措施相反会降低可信度。'
      : '最强表态。实际措施相反时，可信度损失最大。';

  return (
    <main className="pv-main">
      <section className="pv-page-heading">
        <div>
          <h2>就一个议题公开表态</h2>
          <p>美国先发言，其他方随后表态。也可以保持沉默。</p>
        </div>
      </section>
      <section className="g-announce g-announce-simplified">
        <div className="g-announce-heading">
          <div><h3>本轮公开表态</h3><p>美国先发言，其他方随后表态。也可以保持沉默。</p></div>
          <span>焦点 · 设备许可自主</span>
        </div>
        <div className="g-announce-status">
          <p><strong>美国政府</strong><span>技术管制 · 强硬 · 预告</span></p>
          <p className={submitted ? '' : 'is-pending'}><strong>荷兰政府</strong><span>{submitted ? '设备许可自主 · 强硬 · 预告 · @美国' : '待表态'}</span></p>
          <p className="is-pending"><strong>中国政府</strong><span>待表态</span></p>
          <p className="is-pending"><strong>ASML</strong><span>待表态</span></p>
        </div>
        <section className="g-stance-editor">
          <label className="g-stancefield">
            用一句话说出你的立场，或留白让 AI 代拟
            <textarea rows={2} defaultValue="荷兰应保持许可自主，但愿意继续沟通。" />
          </label>
          <div className="g-buttons"><button type="button" onClick={() => setDrafted(true)}>AI 判定并起草</button>{drafted && <button type="button" onClick={() => setDrafted(true)}>AI 换一稿</button>}</div>
          <div className="g-stance-selects">
            <label>议题<select value={issue} onChange={(event) => setIssue(event.target.value as IssueId)}><option value="controls">技术出口管制</option><option value="materials">关键材料与供应链</option><option value="licensing">设备许可自主</option><option value="enforcement">执法与灰色渠道</option><option value="commerce">商业收益与市场</option></select></label>
            <label>立场<select value={tone} onChange={(event) => setTone(event.target.value as Tone)}><option value="dove">合作</option><option value="hawk">强硬</option></select></label>
            <label>强度<select value={level} onChange={(event) => setLevel(event.target.value as CommitLevel)}><option value="signal">看法</option><option value="pledge">预告</option><option value="redline">红线</option></select></label>
            <label>点名对象<select value={target} onChange={(event) => setTarget(event.target.value as Role | '')}><option value="">不点名</option><option value="US">美国政府</option><option value="CN">中国政府</option><option value="AS">ASML</option></select></label>
          </div>
          <p className="g-stancehint">{hint}</p>
          {drafted && <section className="g-stancecard"><h3>AI 起草结果</h3><p className="g-note">判定：设备许可议题，合作姿态，预告级。</p><p className="g-hint">可以修改上方四个选项，正文会按新选项重新生成。</p></section>}
          <label className="g-stancefield">表态正文<textarea rows={3} defaultValue="荷兰政府就设备许可自主准备采取更严格的措施，并点名美国政府。" /></label>
          <div className="g-buttons"><button type="button">AI 代拟</button><button type="button" className="primary" onClick={() => setSubmitted(true)}>发表表态</button><button type="button">保持沉默</button></div>
        </section>
        <details className="g-stance-rules"><summary>规则</summary><p>表态不会立即改变数值，也不会替你锁定实际行动。</p><p>同一议题上，如果后续行动与“预告”或“红线”相反，可信度会下降；不同议题不核对。</p><p>点名会让被点名方更清楚地接收到你的表态。</p></details>
      </section>
    </main>
  );
}

function ProgressBand({ report }: { report: RoundPreview }) {
  const progress = report.utility - 0.55;
  const gap = Math.max(0, report.threshold - progress);
  return (
    <section className="pv-progress" aria-label="本回合玩家进度">
      <div>
        <small>你的胜利进度</small>
        <strong>{fmt(progress)}</strong>
        <span>{gap > 0 ? `距胜利线还差 ${fmt(gap)}` : '已越过胜利线'}</span>
      </div>
      <div>
        <small>本回合 U</small>
        <strong>
          {fmt(report.previousUtility)} → {fmt(report.utility)}
        </strong>
        <span>信用 {report.credit}/2</span>
      </div>
      <div>
        <small>协议结果</small>
        <strong>
          履约 {report.kept} · 违约 {report.broken}
        </strong>
        <span>累计全员履约 {report.fulfilledDeals}</span>
      </div>
    </section>
  );
}

function ActionPath({ report }: { report: RoundPreview }) {
  return (
    <section className="pv-action-path" aria-label="本回合措施顺序">
      <div className="pv-section-heading">
        <h3>本回合措施路径</h3>
        <small>美国 → 荷兰 → 中国 → ASML</small>
      </div>
      <div className="pv-action-nodes">
        {roleOrder.map((role, index) => {
          const action = report.actions[role];
          return (
            <article key={role} className={action === 'hidden' ? 'is-hidden' : ''}>
              <small>第 {index + 1} 步</small>
              <strong>{names[role]}</strong>
              <span>{action === 'hidden' ? '措施未公开' : `${action} · ${actionNames[action]}`}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReportPreview() {
  const [roundNumber, setRoundNumber] = useState(2);
  const report = rounds.find((item) => item.round === roundNumber) ?? rounds[1];

  return (
    <main className="pv-main">
      <section className="pv-top-summary" aria-label="本轮模型摘要">
        <p className="g-eyebrow">本轮摘要 · AI 生成</p>
        <p>{report.summary}</p>
        <details>
          <summary>更多摘要</summary>
          <p>{report.moves}</p>
        </details>
      </section>
      <section className="pv-page-heading">
        <div>
          <h2>第 {report.round} 回合 · 已公开结果</h2>
        </div>
        <label className="pv-round-select">
          查看回合
          <select value={roundNumber} onChange={(event) => setRoundNumber(Number(event.target.value))}>
            {rounds.map((item) => (
              <option key={item.round} value={item.round}>
                第 {item.round} 回合
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="g-report">
        <p className="pv-round-status">
          胜利进度 <strong>{sign(report.utility - 0.55)}</strong>
          <span> · 信用 {report.credit}/2 · 全员履约 {report.fulfilledDeals}</span>
        </p>
        <p className="pv-focus-line">
          焦点：<strong>{report.focus}</strong> · {names[report.focusRole]}
        </p>

        <section className="pv-action-line" aria-label="本回合措施顺序">
          <strong>行动</strong>
          <div>
            {roleOrder.map((role) => {
              const action = report.actions[role];
              return (
                <span key={role} className={action === 'hidden' ? 'is-hidden' : ''}>
                  <b>{names[role]}</b>
                  {action === 'hidden' ? ' 未公开' : ` ${action} ${actionNames[action]}`}
                </span>
              );
            })}
          </div>
        </section>

        <details className="pv-reconcile">
          <summary>查看指标变化</summary>
          <div className="g-tablewrap pv-metric-table">
            <table>
              <thead>
                <tr>
                  <th>指标</th>
                  <th>轮初</th>
                  <th>合计影响</th>
                  <th>结算后</th>
                </tr>
              </thead>
              <tbody>
                {metricOrder.map((metric) => (
                  <tr key={metric}>
                    <th>{metricMeta[metric].name}</th>
                    <td>{fmt(report.start[metric])}</td>
                    <td>{sign(report.delta[metric])}</td>
                    <td>
                      {fmt(report.end[metric])}
                      {report.end[metric] === metricMeta[metric].max ? ' · 上限' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="pv-details">
          <summary>详细对账</summary>
          {report.effects.map((effect) => (
            <p key={effect}>{effect}</p>
          ))}
          <p>
            <strong>协议履约</strong>：本轮 1 份安排全员履约；荷兰信用达到 2/2。
          </p>
          <p>
            <strong>言行核对</strong>：荷兰就“设备许可自主”发表的预告与实际行动一致。
          </p>
        </details>
      </section>
    </main>
  );
}

function FinalState() {
  const state = rounds[3].end;
  return (
    <section className="pv-final-state" aria-labelledby="final-state-title">
      <div className="pv-section-heading">
        <div>
          <p className="g-eyebrow">FINAL STATE</p>
          <h3 id="final-state-title">终局局势</h3>
        </div>
        <small>虚构 2027 情景 · 游戏假设</small>
      </div>
      <div className="pv-final-metrics">
        {metricOrder.map((metric) => (
          <div key={metric}>
            <small>{metricMeta[metric].name}</small>
            <strong>{fmt(state[metric])}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function EndingNarrative() {
  return (
    <section className="pv-ending-narrative" aria-labelledby="ending-title">
      <div className="pv-section-heading">
        <div>
          <p className="g-eyebrow">MODEL ENDING · 示例稿</p>
          <h3 id="ending-title">管制很紧，合作也很贵</h3>
        </div>
        <small>只依据公开终局状态撰写，不生成新数值</small>
      </div>
      <div className="pv-ending-copy">
        <p>
          四轮结束时，技术获取难度停在 4.6，美荷政策协调度升至 4.0。技术壁垒比开局更厚，
          美荷之间的政策距离却明显收窄；代价是整体商业收益从开局的 3.0 降至 2.1。
        </p>
        <p>
          荷兰没有成为最强硬的管制者，也没有以短期商业收益换取全面放开。它在有限许可、
          协调承诺与产业损失之间维持了一条可执行的中间路线，最终以 0.19 的相对提升和两份全员履约安排，
          取得外交层级上的最好结果。
        </p>
        <p>
          美国实现了较强的协调与安全方向，但未能把盟友配合转化为更多履约协议；中国完成了一定的自主积累，
          数值进度达到门槛，却因信用降至 0 失去实质胜利资格；ASML 则在高管制、低商业空间的环境中落在胜利线之后。
          这是一个“管制能力上升、产业收益收缩、各方都付出成本”的结局，而不是任何一方的彻底胜利。
        </p>
      </div>
    </section>
  );
}

function ComparisonTable() {
  return (
    <section className="pv-comparison" aria-labelledby="comparison-title">
      <div className="pv-section-heading">
        <div>
          <h3 id="comparison-title">四方最终状态</h3>
        </div>
        <small>可多人同时获胜</small>
      </div>
      <div className="g-tablewrap">
        <table className="pv-comparison-table">
          <thead>
            <tr>
              <th>角色</th>
              <th>目标</th>
              <th>结果</th>
              <th>ΔU / 门槛</th>
              <th>信用</th>
              <th>全员履约</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((row) => (
              <tr key={row.role} className={row.isPlayer ? 'is-player' : ''}>
                <th>
                  {names[row.role]}
                  {row.isPlayer ? ' · 你' : ''}
                </th>
                <td data-label="目标">{row.preference}</td>
                <td data-label="结果">{row.verdict}</td>
                <td data-label="ΔU / 门槛">
                  {sign(row.delta)} / {fmt(row.threshold)}
                </td>
                <td data-label="信用">{row.credit}/2</td>
                <td data-label="全员履约">{row.fulfilledDeals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResultsPreview() {
  const actionRounds: RoundActionData[] = rounds.map((round) => ({
    round: round.round,
    actions: round.actions,
    start: round.start,
    chance: round.chance,
  }));

  return (
    <main className="pv-main">
      <section className="pv-top-summary" aria-label="结局摘要">
        <p className="g-eyebrow">结局摘要 · AI 生成</p>
        <h2>管制很紧，合作也很贵</h2>
        <p>
          四轮结束时，技术获取难度停在 4.6，美荷政策协调度升至 4.0。技术壁垒比开局更厚，
          美荷之间的政策距离却明显收窄；代价是整体商业收益从开局的 3.0 降至 2.1。
        </p>
        <details>
          <summary>阅读完整结局</summary>
          <p>
            荷兰没有成为最强硬的管制者，也没有以短期商业收益换取全面放开。它在有限许可、
            协调承诺与产业损失之间维持了一条可执行的中间路线，最终取得外交层级上的最好结果。
          </p>
          <p>
            美国实现了较强的协调与安全方向，却未能把盟友配合转化为更多履约协议；中国完成了一定的自主积累，
            数值进度达到门槛，却因信用降至 0 失去实质胜利资格；ASML 则落在胜利线之后。
          </p>
        </details>
      </section>
      <section className="pv-result-hero">
        <h2>你达成了外交胜利</h2>
        <p>荷兰政府 · 协调优先</p>
        <div>
          <span>胜利进度 +0.19 / 0.12</span>
          <span>信用 2/2</span>
          <span>全员履约 2</span>
        </div>
      </section>

      <ComparisonTable />
      <SubgameReview rounds={actionRounds} />
    </main>
  );
}

export default function Preview() {
  const initialView = new URLSearchParams(window.location.search).get('view');
  const [view, setView] = useState<View>(
    initialView === 'results' ? 'results' : initialView === 'report' ? 'report' : 'announcement',
  );
  return (
    <div className="pv-shell">
      <PreviewHeader view={view} onView={setView} />
      {view === 'announcement' ? <AnnouncementPreview /> : view === 'report' ? <ReportPreview /> : <ResultsPreview />}
      <footer className="pv-footer">
        <span>本地版本 · 示例对局</span>
        <span>所有数值仅用于版式确认，不代表正式结算</span>
      </footer>
    </div>
  );
}
