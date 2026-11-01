import { useState } from 'react';
import { names } from './catalogue';
import type { CommitLevel, IssueId, Role, Snapshot, Statement, Tone } from './types';

const issueNames: Record<IssueId, string> = {
  controls: '技术出口管制',
  materials: '关键材料与供应链',
  licensing: '设备许可自主',
  enforcement: '执法与灰色渠道',
  commerce: '商业收益与市场',
};
const toneNames: Record<Tone, string> = { dove: '合作', hawk: '强硬' };
const levelNames: Record<CommitLevel, string> = { signal: '看法', pledge: '预告', redline: '红线' };
const levelHints: Record<CommitLevel, string> = {
  signal: '只表达倾向，不要求后续行动一致。',
  pledge: '预告后续行动。实际措施相反会降低可信度。',
  redline: '最强表态。实际措施相反时，可信度损失最大。',
};

function template(role: Role, issue: IssueId, tone: Tone, level: CommitLevel, target: Role | '') {
  const positive = tone === 'dove';
  const action = level === 'signal'
    ? positive ? '认为应保持对话与灵活性' : '认为应采取更严格的立场'
    : level === 'pledge'
      ? positive ? '准备推动合作与许可便利' : '准备采取更严格的技术限制'
      : positive ? '明确反对走向对抗，愿通过对话解决分歧' : '划出红线，不接受相反安排';
  return `${names[role]}就${issueNames[issue]}${action}${target ? `，并点名${names[target]}` : ''}。`;
}

export default function AnnouncementPanel({
  snapshot,
  busy,
  onDraft,
  onDeclare,
}: {
  snapshot: Snapshot;
  busy: boolean;
  onDraft: (text: string) => Promise<{statement: Statement; reason?: string}>;
  onDeclare: (statement: Statement | null) => Promise<boolean>;
}) {
  const role = snapshot.playerRole;
  const declared = snapshot.declaredRoles?.includes(role) ?? false;
  const usReady = snapshot.declaredRoles?.includes('US') ?? false;
  const canAct = !declared && (role === 'US' || usReady);
  const [issue, setIssue] = useState<IssueId>('controls');
  const [tone, setTone] = useState<Tone>('hawk');
  const [level, setLevel] = useState<CommitLevel>('pledge');
  const [target, setTarget] = useState<Role | ''>('');
  const [text, setText] = useState(() => template(role, 'controls', 'hawk', 'pledge', ''));
  const [stanceInput, setStanceInput] = useState('');
  const [drafted, setDrafted] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function sync(next: {
    issue?: IssueId;
    tone?: Tone;
    level?: CommitLevel;
    target?: Role | '';
  }) {
    const nextIssue = next.issue ?? issue;
    const nextTone = next.tone ?? tone;
    const nextLevel = next.level ?? level;
    const nextTarget = next.target ?? target;
    setIssue(nextIssue);
    setTone(nextTone);
    setLevel(nextLevel);
    setTarget(nextTarget);
    setText(template(role, nextIssue, nextTone, nextLevel, nextTarget));
    setReason('');
    setDrafted(false);
  }

  async function draft() {
    if (drafting || busy) return;
    setDrafting(true);
    setError('');
    try {
      const value = await onDraft(stanceInput.trim());
      setIssue(value.statement.issue);
      setTone(value.statement.tone);
      setLevel(value.statement.level);
      setTarget(value.statement.target ?? '');
      setText(value.statement.text);
      setReason(value.reason ?? '');
      setDrafted(true);
    } catch (problem) {
      setError(`AI 起草失败：${problem instanceof Error ? problem.message : '请直接修改文本后发表。'}`);
    } finally {
      setDrafting(false);
    }
  }

  async function submit(statement: Statement | null) {
    if (busy) return;
    setError('');
    const ok = await onDeclare(statement);
    if (!ok) setError('表态未提交，请检查当前局面后重试。');
  }

  return (
    <section className="g-announce g-announce-simplified">
      <div className="g-announce-heading">
        <div>
          <h3>本轮公开表态</h3>
          <p>美国先发言，其他方随后表态。也可以保持沉默。</p>
        </div>
        {snapshot.focusIssue && <span>焦点 · {issueNames[snapshot.focusIssue]}</span>}
      </div>

      <div className="g-announce-status" aria-label="各方表态状态">
        {(snapshot.actionOrder ?? ['US', 'NL', 'CN', 'AS']).map((item) => {
          const done = snapshot.declaredRoles?.includes(item);
          const value = snapshot.statements?.[item];
          const waiting = item === 'US' ? '等待美国' : usReady ? '待表态' : '等待美国';
          return (
            <p key={item} className={done ? '' : 'is-pending'}>
              <strong>{names[item]}</strong>
              <span>
                {done
                  ? value
                    ? `${issueNames[value.issue]} · ${toneNames[value.tone]} · ${levelNames[value.level]}${value.target ? ` · @${names[value.target]}` : ''}`
                    : '保持沉默'
                  : waiting}
              </span>
            </p>
          );
        })}
      </div>

      {!canAct ? (
        <p className="g-announce-wait" role="status">
          {declared ? '你已完成本轮表态，等待其他方。' : '等待美国先发表公开表态。'}
        </p>
      ) : (
        <section className="g-stance-editor" aria-label="我的公开表态">
          <label className="g-stancefield" htmlFor="stance-input">
            用一句话说出你的立场，或留白让 AI 代拟
            <textarea
              id="stance-input"
              value={stanceInput}
              maxLength={100}
              rows={2}
              disabled={busy || drafting}
              placeholder="例如：我们希望荷兰在许可问题上保持自主，但愿意就技术安全进行对话。"
              onChange={(event) => setStanceInput(event.target.value)}
            />
          </label>
          <div className="g-buttons">
            <button type="button" disabled={busy || drafting} onClick={() => void draft()}>
              {drafting ? 'AI 处理中…' : stanceInput.trim() ? 'AI 判定并起草' : 'AI 代拟'}
            </button>
            {drafted && <button type="button" disabled={busy || drafting} onClick={() => void draft()}>AI 换一稿</button>}
          </div>
          <div className="g-stance-selects">
            <label>
              议题
              <select value={issue} disabled={busy || drafting} onChange={(event) => sync({issue: event.target.value as IssueId})}>
                {Object.entries(issueNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label>
              立场
              <select value={tone} disabled={busy || drafting} onChange={(event) => sync({tone: event.target.value as Tone})}>
                <option value="dove">合作</option>
                <option value="hawk">强硬</option>
              </select>
            </label>
            <label>
              强度
              <select value={level} disabled={busy || drafting} onChange={(event) => sync({level: event.target.value as CommitLevel})}>
                <option value="signal">看法</option>
                <option value="pledge">预告</option>
                <option value="redline">红线</option>
              </select>
            </label>
            <label>
              点名对象
              <select value={target} disabled={busy || drafting} onChange={(event) => sync({target: event.target.value as Role | ''})}>
                <option value="">不点名</option>
                {(['US', 'CN', 'NL', 'AS'] as Role[]).filter((item) => item !== role).map((item) => <option key={item} value={item}>{names[item]}</option>)}
              </select>
            </label>
          </div>
          <p className="g-stancehint">{levelHints[level]}</p>
          {drafted && (
            <section className="g-stancecard">
              <h3>AI 起草结果</h3>
              {reason && <p className="g-note">判定：{reason}</p>}
              <p className="g-hint">可以修改上方议题、立场、强度或点名对象；正文会按新选项重新生成。</p>
            </section>
          )}
          <label className="g-stancefield" htmlFor="announcement-text">
            表态正文
            <textarea
              id="announcement-text"
              value={text}
              maxLength={200}
              rows={3}
              disabled={busy || drafting}
              onChange={(event) => {
                setText(event.target.value);
              }}
            />
          </label>
          {error && <p className="g-warning" role="alert">{error}</p>}
          <div className="g-buttons">
            <button
              type="button"
              className="primary"
              disabled={busy || drafting || !text.trim()}
              onClick={() => void submit({issue, tone, level, target: target || null, text: text.trim()})}
            >
              发表表态
            </button>
            <button type="button" disabled={busy || drafting} onClick={() => void submit(null)}>
              保持沉默
            </button>
          </div>
        </section>
      )}

      <details className="g-stance-rules">
        <summary>规则</summary>
        <p>表态不会立即改变数值，也不会替你锁定实际行动。</p>
        <p>同一议题上，如果后续行动与“预告”或“红线”相反，可信度会下降；不同议题不核对。</p>
        <p>点名会让被点名方更清楚地接收到你的表态，旁观者收到的信号较弱。</p>
      </details>
    </section>
  );
}
