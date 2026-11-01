import { useEffect, useRef, useState } from 'react';
import { names } from './catalogue';
import type { ActionId, Metrics, Role } from './types';

type RoleOrder = 'US' | 'NL' | 'CN' | 'AS';

export type RoundActionData = {
  round: number;
  actions: Record<Role, ActionId | 'hidden'>;
  start: Metrics;
  chance: string;
  legal?: Partial<Record<RoleOrder, ActionId[]>>;
  sources?: Partial<Record<Role, 'player' | 'llm' | 'timeout' | 'fallback'>>;
};

const roleOrder: RoleOrder[] = ['US', 'NL', 'CN', 'AS'];
const roleColors: Record<RoleOrder, string> = {
  US: 'var(--pv-us)',
  NL: 'var(--pv-nl)',
  CN: 'var(--pv-cn)',
  AS: 'var(--pv-as)',
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

type ChoiceMap = Partial<Record<RoleOrder, ActionId | null>>;
type Path = Record<RoleOrder, ActionId>;

function legalActions(round: RoundActionData, role: RoleOrder): ActionId[] {
  if (round.legal?.[role]?.length) return round.legal[role]!;
  if (role === 'US') return ['U1', 'U2', 'U3', 'U4', 'PASS'];
  if (role === 'NL') return round.start.A < 4 ? ['N1', 'N2', 'N3', 'PASS'] : ['N1', 'N3', 'PASS'];
  if (role === 'CN') {
    const options: ActionId[] = ['C2', 'C3'];
    if (round.round < 4) options.push('C1');
    if (round.start.P >= 1) options.push('C4');
    options.push('PASS');
    return options;
  }
  return ['S1', 'S2', 'S4', 'PASS'];
}

function buildPaths(round: RoundActionData): Path[] {
  const paths: Path[] = [];
  for (const US of legalActions(round, 'US')) {
    for (const NL of legalActions(round, 'NL')) {
      for (const CN of legalActions(round, 'CN')) {
        for (const AS of legalActions(round, 'AS')) {
          paths.push({ US, NL, CN, AS });
        }
      }
    }
  }
  return paths;
}

function polar(cx: number, cy: number, radius: number, angle: number) {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function arcPath(cx: number, cy: number, inner: number, outer: number, start: number, end: number) {
  const [x0, y0] = polar(cx, cy, outer, start);
  const [x1, y1] = polar(cx, cy, outer, end);
  const [x2, y2] = polar(cx, cy, inner, end);
  const [x3, y3] = polar(cx, cy, inner, start);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${outer} ${outer} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${inner} ${inner} 0 ${large} 0 ${x3} ${y3} Z`;
}

function PathRing({
  round,
  choices,
  onPick,
}: {
  round: RoundActionData;
  choices: ChoiceMap;
  onPick: (role: RoleOrder, action: ActionId) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(520);
  const paths = buildPaths(round);
  const choicesByRole = {
    US: legalActions(round, 'US'),
    NL: legalActions(round, 'NL'),
    CN: legalActions(round, 'CN'),
    AS: legalActions(round, 'AS'),
  };
  const counts = {
    US: choicesByRole.NL.length * choicesByRole.CN.length * choicesByRole.AS.length,
    NL: choicesByRole.CN.length * choicesByRole.AS.length,
    CN: choicesByRole.AS.length,
    AS: 1,
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (typeof ResizeObserver === 'undefined') {
      setSize(Math.max(280, Math.min(560, Math.floor(wrap.getBoundingClientRect().width || 520))));
      return;
    }
    const observer = new ResizeObserver(() => {
      setSize(Math.max(280, Math.min(560, Math.floor(wrap.getBoundingClientRect().width))));
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const segments: {
    path: ChoiceMap;
    depth: number;
    count: number;
    startIndex: number;
    role: RoleOrder;
  }[] = [];

  choicesByRole.US.forEach((US, ui) => {
    segments.push({ path: { US }, depth: 1, count: counts.US, startIndex: ui * counts.US, role: 'US' });
  });
  choicesByRole.US.forEach((US, ui) => {
    choicesByRole.NL.forEach((NL, ni) => {
      segments.push({
        path: { US, NL },
        depth: 2,
        count: counts.NL,
        startIndex: ui * counts.US + ni * counts.NL,
        role: 'NL',
      });
    });
  });
  choicesByRole.US.forEach((US, ui) => {
    choicesByRole.NL.forEach((NL, ni) => {
      choicesByRole.CN.forEach((CN, ci) => {
        segments.push({
          path: { US, NL, CN },
          depth: 3,
          count: counts.CN,
          startIndex: ui * counts.US + ni * counts.NL + ci * counts.CN,
          role: 'CN',
        });
      });
    });
  });
  paths.forEach((path, index) => {
    segments.push({ path, depth: 4, count: 1, startIndex: index, role: 'AS' });
  });

  const activeAtDepth = (path: ChoiceMap, depth: number) => {
    if (depth >= 1 && choices.US && path.US !== choices.US) return false;
    if (depth >= 2 && choices.NL && path.NL !== choices.NL) return false;
    if (depth >= 3 && choices.CN && path.CN !== choices.CN) return false;
    if (depth >= 4 && choices.AS && path.AS !== choices.AS) return false;
    return true;
  };

  const cx = size / 2;
  const cy = size / 2;
  const outerMax = size * 0.48;
  const rings = [
    { inner: outerMax * 0.23, outer: outerMax * 0.38 },
    { inner: outerMax * 0.4, outer: outerMax * 0.55 },
    { inner: outerMax * 0.57, outer: outerMax * 0.72 },
    { inner: outerMax * 0.74, outer: outerMax * 0.9 },
  ];

  return (
    <div className="pv-ring-wrap" ref={wrapRef}>
      <svg
        className="pv-ring"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label={`第${round.round}回合完整行动路径环，共${paths.length}条路径`}
      >
        <title>第 {round.round} 回合完整行动路径环</title>
        <desc>由内向外依次是美国、荷兰、中国和 ASML 的行动分支。</desc>
        <circle cx={cx} cy={cy} r={outerMax * 0.19} fill="#fffef8" stroke="#d7dfcf" />
        <text x={cx} y={cy - 5} textAnchor="middle" fill="#294231" fontSize="12" fontWeight="600">
          R{round.round}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#7b8974" fontSize="11">
          {paths.length} 路径
        </text>
        {segments.map((segment, index) => {
          const ring = rings[segment.depth - 1];
          const start = -Math.PI / 2 + (segment.startIndex / paths.length) * Math.PI * 2;
          const end = -Math.PI / 2 + ((segment.startIndex + segment.count) / paths.length) * Math.PI * 2;
          const active = activeAtDepth(segment.path, segment.depth);
          const asUnknown = segment.depth === 4 && choices.AS === null && active;
          return (
            <path
              key={`${segment.depth}-${index}`}
              d={arcPath(cx, cy, ring.inner, ring.outer, start, end)}
              fill={asUnknown ? '#85649a' : roleColors[segment.role]}
              opacity={active ? (segment.depth === 4 && choices.AS === null ? 0.46 : 0.92) : 0.2}
              stroke="#fffef8"
              strokeWidth="1"
              onClick={() => {
                if (segment.depth === 1 && segment.path.US) onPick('US', segment.path.US);
                if (segment.depth === 2 && segment.path.NL) {
                  if (segment.path.US) onPick('US', segment.path.US);
                  onPick('NL', segment.path.NL);
                }
                if (segment.depth === 3 && segment.path.CN) {
                  if (segment.path.US) onPick('US', segment.path.US);
                  if (segment.path.NL) onPick('NL', segment.path.NL);
                  onPick('CN', segment.path.CN);
                }
                if (
                  segment.depth === 4 &&
                  segment.path.US &&
                  segment.path.NL &&
                  segment.path.CN &&
                  segment.path.AS
                ) {
                  onPick('US', segment.path.US);
                  onPick('NL', segment.path.NL);
                  onPick('CN', segment.path.CN);
                  onPick('AS', segment.path.AS);
                }
              }}
            >
              <title>
                {Object.entries(segment.path)
                  .map(([role, action]) => `${names[role as Role]} ${action}`)
                  .join(' → ')}
                {` · ${segment.count} 条`}
              </title>
            </path>
          );
        })}
        {choicesByRole.US.map((US, index) => {
          const angle =
            -Math.PI / 2 +
            ((index * counts.US + counts.US / 2) / paths.length) * Math.PI * 2;
          const [x, y] = polar(cx, cy, (rings[0].inner + rings[0].outer) / 2, angle);
          return (
            <text key={US} x={x} y={y} dy="4" textAnchor="middle" fill="#294231" fontSize="12" fontWeight="600">
              {US}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export default function SubgameReview({ rounds }: { rounds: RoundActionData[] }) {
  const [roundNumber, setRoundNumber] = useState(rounds.at(-1)?.round ?? 1);
  const [drafts, setDrafts] = useState<Record<number, ChoiceMap>>({});
  const round = rounds.find((item) => item.round === roundNumber) ?? rounds[0];
  const draft = drafts[round.round] ?? {};
  const choices: ChoiceMap = {};

  for (const role of roleOrder) {
    if (Object.prototype.hasOwnProperty.call(draft, role)) choices[role] = draft[role] ?? null;
    else choices[role] = round.actions[role] === 'hidden' ? null : round.actions[role];
  }

  const hypothetical =
    roleOrder.some((role) => {
      const actual = round.actions[role];
      const selected = choices[role];
      if (actual === 'hidden') return selected !== null;
      return selected !== actual;
    });

  const pick = (role: RoleOrder, action: ActionId) => {
    setDrafts((current) => ({
      ...current,
      [round.round]: {
        ...current[round.round],
        [role]: action,
      },
    }));
  };

  const reset = () => {
    setDrafts((current) => {
      const next = { ...current };
      delete next[round.round];
      return next;
    });
  };

  return (
    <section className="pv-subgame" aria-labelledby="subgame-title">
      <div className="pv-section-heading">
        <div>
          <h3 id="subgame-title">四轮行动完整树与路径环</h3>
        </div>
        <small>选择回合，查看美国 → 荷兰 → 中国 → ASML 的完整行动路径</small>
      </div>
      <div className="pv-tree-tabs" role="group" aria-label="选择复盘回合">
        {rounds.map((item) => (
          <button
            key={item.round}
            type="button"
            aria-pressed={roundNumber === item.round}
            onClick={() => setRoundNumber(item.round)}
          >
            R{item.round}
          </button>
        ))}
      </div>
      <div className="pv-tree-context">
        <span>第 {round.round} 回合</span>
        <span>完整结构 {buildPaths(round).length} 条路径</span>
        <span className={hypothetical ? 'is-hypothetical' : 'is-actual'}>
          {hypothetical ? '正在查看假设路径' : '正在查看真实历史路径'}
        </span>
        {hypothetical && (
          <button type="button" onClick={reset}>
            恢复真实路径
          </button>
        )}
      </div>
      <div className="pv-tree-workspace">
        <PathRing round={round} choices={choices} onPick={pick} />
        <div className="pv-tree-branches">
          {roleOrder.map((role, index) => {
            const options = legalActions(round, role);
            const actual = round.actions[role];
            const source = round.sources?.[role];
            return (
              <section key={role} className={actual === 'hidden' ? 'is-hidden' : ''}>
                <div className="pv-tree-branch-head">
                  <small>第 {index + 1} 步</small>
                  <strong>{names[role]}</strong>
                  <span>{actual === 'hidden' ? '实际措施未公开' : `实际：${actual}`}</span>
                  {source === 'fallback' && <em>规则兜底</em>}
                  {source === 'timeout' && <em>超时</em>}
                </div>
                <div className="pv-tree-options" role="group" aria-label={`${names[role]}行动分支`}>
                  {options.map((action) => (
                    <button
                      key={action}
                      type="button"
                      aria-pressed={choices[role] === action}
                      onClick={() => pick(role, action)}
                    >
                      <span>{action}</span>
                      {actionNames[action]}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <div className="pv-tree-terminal">
        <span>随机 / 公开结果</span>
        <strong>{round.chance}</strong>
        <small>
          未发生分支只代表当时合法可选，不表示真实结算。ASML 未查获的实际措施不会在结局页揭晓。
        </small>
      </div>
    </section>
  );
}
