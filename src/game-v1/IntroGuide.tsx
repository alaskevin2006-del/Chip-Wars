import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check } from 'lucide-react';

export const CONTEXT_INTRO_STORAGE_KEY = 'chip-diplomacy-v16-context-intro';

const introPages = [
  {
    title: '半导体何以重要？',
    section: '01 / 为什么先看芯片',
    content: (
      <div className="g-intro-split">
        <figure className="g-intro-figure g-intro-figure--hero">
          <img
            src="/intro/semiconductor-importance.jpeg"
            alt="全球半导体关键环节与主要经济体份额地图"
            width={1024}
            height={584}
          />
        </figure>
        <div className="g-intro-copy">
          <p className="g-intro-lead">欢迎进入这场以供应链为棋盘、以硅片为棋子的大国博弈。</p>
          <p>方寸大小的芯片，是驱动整个现代世界的核心引擎。2025 年全球半导体销售额达到 7917 亿美元，同比增长 25.6%，预计 2026 年将逼近 1 万亿美元大关—— 这是人类历史上规模最大的单一产业之一。</p>
          <p>这枚指甲盖大小的器件，撬动的是整个现代经济的根基。据 IMF 测算，每 1 美元的半导体产值，可带动约 10 美元的电子信息产业产出，进而拉动约 100 美元的 GDP；半导体产业的产出乘数高达 2.8，是所有制造业中杠杆效应最强的领域之一。手机、汽车、超级计算机、航天军工、人工智能，所有文明的尖端成果，都建立在这微米级的硅片电路之上。</p>
          <p>数十年的全球化分工已经将芯片的全产业链拆分为设计、EDA 工具、制造设备、核心材料、晶圆制造、封装测试六大环节，散落于全球各地。</p>
        </div>
      </div>
    ),
  },
  {
    title: '半导体全球产业链分布',
    section: '02 / 一条链，多重卡点',
    content: (
      <div className="g-intro-stack">
        <div className="g-intro-copy g-intro-copy--wide">
          <p>这是一场覆盖全球的网络化制裁与反制博弈。美国凭借上游技术霸权，以小院高墙策略拉起盟国阵营，试图切断中国半导体产业的升级路径。其管制同盟包含日本、韩国、荷兰等多个经济体 —— 日本垄断晶圆材料，韩国主导存储芯片制造，荷兰握有全球唯一的 EUV 光刻机 —— 各国依托产业链不同环节的优势，共同构成对华半导体出口管制体系。</p>
          <p>然而同盟内部并非铁板一块。各国均有本国产业利益与主权诉求，对美国管制政策的配合程度参差不齐。本游戏设定情境聚焦于美国政府、中国政府、荷兰政府、ASML 四方，围绕光刻设备出口管制政策的博弈展开模拟。</p>
        </div>
        <div className="g-intro-figures">
          <figure className="g-intro-figure">
            <img
              src="/intro/semiconductor-supply-chain.png"
              alt="半导体上中下游产业链与终端应用示意图"
              width={1024}
              height={584}
            />
          </figure>
          <figure className="g-intro-figure">
            <img
              src="/intro/global-supply-demand.png"
              alt="全球半导体供给与需求格局分布图"
              width={1138}
              height={481}
            />
          </figure>
        </div>
      </div>
    ),
  },
  {
    title: '利益关系图速览',
    section: '03 / 四方各有筹码',
    content: (
      <div className="g-intro-split g-intro-split--stakeholders">
        <figure className="g-intro-figure g-intro-figure--diagram">
          <img
            src="/intro/stakeholder-interest-map.png"
            alt="美国、中国、荷兰与 ASML 的半导体利益关系图"
            width={922}
            height={751}
          />
        </figure>
        <div className="g-intro-stakeholders">
          <p className="g-intro-lead">四方各握筹码，也各受现实条件约束：</p>
          <div className="g-intro-roles">
            <p><strong>美国：</strong>掌握技术规则与长臂管辖工具，但必须承受管制带来的本土商业损失</p>
            <p><strong>中国：</strong>手握全球最大半导体市场与关键矿产供给杠杆，但短期仍存在先进设备技术代差</p>
            <p><strong>荷兰：</strong>掌握光刻设备出口审批主权，却持续承受美国同盟压力与本国产业商业诉求的双重拉扯</p>
            <p><strong>ASML：</strong>手握不可替代的光刻技术垄断优势，却同时受制于美国域外管辖与荷兰本国出口许可</p>
          </div>
          <p className="g-intro-transition">接下来，你将扮演其中一方，在四回合的谈判与秘密行动中，运用自身筹码完成你的私人博弈目标。</p>
        </div>
      </div>
    ),
  },
] as const;

export function hasCompletedContextIntro() {
  try {
    return localStorage.getItem(CONTEXT_INTRO_STORAGE_KEY) === 'done';
  } catch {
    return false;
  }
}

export function IntroGuide({ onComplete }: { onComplete: () => void }) {
  const [page, setPage] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const current = introPages[page];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    headingRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [page]);

  return (
    <div className="g-overlay g-intro-overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="context-intro-title"
        className="g-intro-card"
      >
        <header className="g-intro-header">
          <div className="g-intro-brand">
            <BookOpen aria-hidden="true" size={20} strokeWidth={1.8} />
            <span>开局导入必读</span>
          </div>
          <ol className="g-intro-progress" aria-label="开局导入进度">
            {introPages.map((item, index) => (
              <li
                key={item.title}
                className={index === page ? 'is-current' : index < page ? 'is-done' : ''}
                aria-current={index === page ? 'step' : undefined}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{item.title}</strong>
              </li>
            ))}
          </ol>
        </header>

        <div className="g-intro-scroll">
          <div className="g-intro-titlebar">
            <p className="g-eyebrow">{current.section}</p>
            <h2 ref={headingRef} tabIndex={-1} id="context-intro-title">{current.title}</h2>
          </div>
          <div className="g-intro-page" aria-live="polite">{current.content}</div>
        </div>

        <footer className="g-intro-footer">
          <p>已读 {page + 1} / {introPages.length}</p>
          <div className="g-intro-nav">
            {page > 0 && (
              <button type="button" onClick={() => setPage(value => value - 1)}>
                <ArrowLeft aria-hidden="true" size={16} />
                上一页
              </button>
            )}
            {page < introPages.length - 1 ? (
              <button type="button" className="primary" onClick={() => setPage(value => value + 1)}>
                继续阅读
                <ArrowRight aria-hidden="true" size={16} />
              </button>
            ) : (
              <button type="button" className="primary" onClick={onComplete}>
                <Check aria-hidden="true" size={17} />
                我已阅读，进入游戏
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
