import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check } from 'lucide-react';
import { names } from './catalogue';
import type { Role } from './types';

export const RULES_GUIDE_STORAGE_KEY = 'chip-diplomacy-v16-rules-guide';

const roleGuide: Record<Role, { focus: string; leverage: string; constraint: string }> = {
  US: {
    focus: '技术规则与盟友协调',
    leverage: '你可以收紧或放宽技术管制、推动荷兰协调，并加强合规执法。',
    constraint: '管制会损害整体商业收益，也可能推高美国国内产业压力。',
  },
  CN: {
    focus: '市场空间、材料筹码与自主能力',
    leverage: '你可以推动自主研发、运用关键材料筹码，或争取中荷商业合作。',
    constraint: '先进设备与技术获取仍然受限，短期商业利益与长期自主能力需要权衡。',
  },
  NL: {
    focus: '设备许可自主与商业利益',
    leverage: '你可以决定设备许可松紧，并与美国协管或保留本国商业空间。',
    constraint: '你对 ASML 有许可约束，但本国产业收益和盟友压力会同时牵制你。',
  },
  AS: {
    focus: '全球市场与合规确定性',
    leverage: '你可以执行合规订单、开拓其他市场，或承担高风险交易。',
    constraint: '你的部分行动受荷兰许可和美国规则影响，高风险交易还可能被查获。',
  },
};

const phaseGuide = [
  {
    title: '公开表态',
    action: '选择一个议题，写一句话让幕僚整理成正式表态，也可以保持沉默。美国先表态，其他方随后行动。',
    result: '表态会影响别人对你个人目标类型的判断，但不是正式承诺。',
  },
  {
    title: '闭门磋商',
    action: '最多发送两条公开或私聊消息，也可以起草一份包含各方行动承诺的正式安排。',
    result: '安排提交后只进入确认队列，不会立即生效。',
  },
  {
    title: '安排确认',
    action: '发起人已在提交时确认；受邀方分别选择接受或拒绝。',
    result: '所有受邀方确认后生效；任意一方拒绝，整份安排作废。',
  },
  {
    title: '实际行动',
    action: '按美国 → 荷兰 → 中国 → ASML 的顺序选择合法措施，查看情景预览后提交。',
    result: '已提交不能更改；ASML 的行动默认不公开，灰色交易被查获时除外。',
  },
  {
    title: '公开战报',
    action: '查看本轮指标变化、信用变化、履约结果和胜利进度。',
    result: '看完战报后进入下一回合，第四回合结束后进入最终结果。',
  },
] as const;

export function hasCompletedRulesGuide() {
  try {
    return localStorage.getItem(RULES_GUIDE_STORAGE_KEY) === 'done';
  } catch {
    return false;
  }
}

export default function RulesGuide({
  role,
  activeGame,
  disabled,
  onBack,
  onComplete,
}: {
  role: Role;
  activeGame: boolean;
  disabled: boolean;
  onBack: () => void;
  onComplete: () => void;
}) {
  const [page, setPage] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const currentRole = roleGuide[role];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    headingRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [page]);

  const pages = [
    {
      title: '你代表谁',
      section: '01 / 你的角色',
      content: (
        <div className="g-rules-role">
          <p className="g-rules-lead">你选择代表 {names[role]}。</p>
          <div className="g-rules-role-card">
            <p className="g-eyebrow">本局角色 · {role}</p>
            <h3>{names[role]}</h3>
            <dl>
              <div><dt>核心关注</dt><dd>{currentRole.focus}</dd></div>
              <div><dt>你可以做什么</dt><dd>{currentRole.leverage}</dd></div>
              <div><dt>你的主要约束</dt><dd>{currentRole.constraint}</dd></div>
            </dl>
          </div>
          <div className="g-rules-callout">
            <strong>个人目标会在正式开局后揭晓。</strong>
            <p>每个角色有两种可能的个人目标。你只会知道自己抽到哪一种；其他方只知道两种可能，不知道你的实际目标。</p>
          </div>
        </div>
      ),
    },
    {
      title: '怎样才算赢',
      section: '02 / 四回合目标',
      content: (
        <div className="g-rules-win">
          <p className="g-rules-lead">一局共四回合。目标不是把每项指标都推高，而是让局势朝你的个人目标前进。</p>
          <div className="g-rules-win-grid">
            <article><strong>四回合</strong><p>每回合都经历完整的表态、磋商、确认、行动和结算流程。</p></article>
            <article><strong>胜利进度</strong><p>当前局面相对开局局面的提升达到个人门槛，才算越过胜利线。</p></article>
            <article><strong>信用与履约</strong><p>信用不得低于一；至少有一份全员履约安排，才能取得外交胜利。</p></article>
          </div>
          <div className="g-rules-callout">
            <strong>个人目标只影响计分，不限制你的选择。</strong>
            <p>同一个结果对不同目标的重要程度不同。个人目标只决定胜利进度怎样计算，不会限制你能采取哪些措施。怎么谈、怎么交换、下一步做什么，仍由你决定。正式开局后，界面会显示你的个人目标及其计分方式。</p>
          </div>
        </div>
      ),
    },
    {
      title: '每回合怎么操作',
      section: '03 / 五个阶段',
      content: (
        <div className="g-rules-phases">
          <p className="g-rules-lead">完成当前阶段后，页脚按钮会带你进入下一步。</p>
          <ol>
            {phaseGuide.map((phase, index) => (
              <li key={phase.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{phase.title}</strong>
                  <p><b>怎么操作：</b>{phase.action}</p>
                  <p><b>完成结果：</b>{phase.result}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ),
    },
    {
      title: '右侧三个面板',
      section: '04 / 你的指挥台',
      content: (
        <div className="g-rules-hud">
          <div className="g-rules-hud-grid">
            <article>
              <strong>电讯：刚刚发生了什么。</strong>
              <p>汇总公开表态、磋商动向、安排成立和履约结果；用于每轮开始或结算后快速了解局势。</p>
            </article>
            <article>
              <strong>情报：对手可能在怎么判断。</strong>
              <p>展示你对其他方偏好类型的判断、自己的偏好权重和公开形象；情报是概率和推测，不是对手隐藏目标的确定答案。</p>
            </article>
            <article>
              <strong>幕僚：我下一步可以怎么考虑。</strong>
              <p>根据当前可见信息分析行动、风险和交换建议。</p>
            </article>
          </div>
          <div className="g-rules-callout">
            <strong>建议供参考，决定仍由你完成。</strong>
            <p>先看电讯了解发生了什么，再对照情报判断对方，仍拿不准时询问幕僚，最后回到主任务区提交选择。</p>
          </div>
        </div>
      ),
    },
  ];
  const current = pages[page];
  const finalPage = page === pages.length - 1;

  return (
    <div className="g-overlay g-intro-overlay">
      <section role="dialog" aria-modal="true" aria-labelledby="rules-guide-title" className="g-intro-card g-rules-card">
        <header className="g-intro-header">
          <div className="g-intro-brand">
            <BookOpen aria-hidden="true" size={20} strokeWidth={1.8} />
            <span>游戏规则导读</span>
          </div>
          <ol className="g-intro-progress g-rules-progress" aria-label="游戏规则导读进度">
            {pages.map((item, index) => (
              <li key={item.title} className={index === page ? 'is-current' : index < page ? 'is-done' : ''} aria-current={index === page ? 'step' : undefined}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{item.title}</strong>
              </li>
            ))}
          </ol>
        </header>

        <div className="g-intro-scroll">
          <div className="g-intro-titlebar">
            <p className="g-eyebrow">{current.section}</p>
            <h2 ref={headingRef} tabIndex={-1} id="rules-guide-title">{current.title}</h2>
          </div>
          <div className="g-intro-page g-rules-page" aria-live="polite">{current.content}</div>
        </div>

        <footer className="g-intro-footer">
          <p>已读 {page + 1} / {pages.length}{activeGame ? ' · 可随时返回游戏' : ''}</p>
          <div className="g-intro-nav">
            <button type="button" onClick={() => page === 0 ? onBack() : setPage(value => value - 1)}>
              <ArrowLeft aria-hidden="true" size={16} />
              {page === 0 ? (activeGame ? '返回游戏' : '重新选择角色') : '上一页'}
            </button>
            {!finalPage ? (
              <button type="button" className="primary" onClick={() => setPage(value => value + 1)}>
                继续阅读
                <ArrowRight aria-hidden="true" size={16} />
              </button>
            ) : (
              <button type="button" className="primary" disabled={disabled} onClick={onComplete}>
                <Check aria-hidden="true" size={17} />
                {activeGame ? '返回游戏' : disabled ? '模型不可用' : '创建对局并进入'}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
