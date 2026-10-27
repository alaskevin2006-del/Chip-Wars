// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { createMockAdapter, mockObservation } from '../src/ui/mock';
import { actionKey, type GameAdapter } from '../src/ui/adapter';
import { canSelectAction, toggleAction } from '../src/ui/GameScreen';

beforeEach(() => { window.scrollTo = vi.fn(); });
afterEach(cleanup);
describe('policy selection', () => {
  it('replaces same-template targets while permitting independent ga/ge choices', () => {
    const actions = mockObservation('CN_GOV').legalActions;
    const ga = actions.find(action => action.target === 'ga' && action.level === 2)!;
    const gaRelaxed = actions.find(action => action.target === 'ga' && action.level === 0)!;
    const ge = actions.find(action => action.target === 'ge')!;
    expect(toggleAction(gaRelaxed,[ga])).toEqual([gaRelaxed]);
    expect(toggleAction(ge,[ga])).toHaveLength(2);
    const design = actions.find(action => action.target === 'design')!;
    const fab = actions.find(action => action.target === 'fab')!;
    expect(toggleAction(fab,[design])).toEqual([fab]);
  });
  it('enforces aggregate AP and budget and handles HOLD exclusivity', () => {
    const actions = mockObservation('CN_GOV').legalActions;
    const subsidy = actions.find(action => action.id === 'CN_SUBSIDY')!;
    const coord = actions.find(action => action.id === 'CN_INDUSTRY_COORD')!;
    const hold = actions.find(action => action.id === 'HOLD')!;
    expect(canSelectAction(coord,[subsidy],2,20)).toBe(false);
    expect(canSelectAction(coord,[subsidy],1,100)).toBe(false);
    expect(canSelectAction(coord,[subsidy],2,100)).toBe(true);
    expect(toggleAction(hold,[subsidy])).toEqual([hold]);
    expect(toggleAction(coord,[hold])).toEqual([coord]);
    expect(toggleAction(coord,[coord])).toEqual([]);
  });
});
describe('four-screen game interface', () => {
  it('selects either player, completes six fixture reports and restarts', async () => {
    render(<App adapter={createMockAdapter()}/>);
    fireEvent.click(screen.getByRole('button',{name:/美国政府/}));
    fireEvent.click(screen.getByRole('button',{name:/进入决策室/}));
    expect(screen.getByRole('heading',{name:/决策中心/})).toBeTruthy();
    expect(screen.getByText('美国 AI 有效交付')).toBeTruthy();
    expect(screen.getAllByText('首轮基线 · 暂无趋势').length).toBeGreaterThan(0);
    for (let turn=1;turn<=6;turn++) {
      fireEvent.click(screen.getByRole('button',{name:`提交第 ${turn} 轮决策`}));
      await screen.findByRole('heading',{name:/本轮战报/});
      expect(screen.getByText('样例决策已记录')).toBeTruthy();
      fireEvent.click(screen.getAllByRole('button',{name:turn===6?'查看最终结局':`进入第 ${turn+1} 轮`})[0]);
    }
    expect(screen.getByRole('heading',{name:'你的多维绩效'})).toBeTruthy();
    expect(screen.getByText('财政持续')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'重新选择立场'}));
    expect(screen.getByRole('button',{name:/进入决策室/})).toBeTruthy();
  });
  it('submits only selected action intents, disables overspending, and retains choices on failure',async()=>{
    const adapter = createMockAdapter();
    const failing:GameAdapter = {...adapter,play:vi.fn().mockRejectedValue(new Error('服务暂时不可用，请重试'))};
    render(<App adapter={failing}/>);
    fireEvent.click(screen.getByRole('button',{name:/进入决策室/}));
    const subsidy = screen.getByRole('button',{name:/支持芯片设计/});
    fireEvent.click(subsidy);
    expect(subsidy.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button',{name:'提交第 1 轮决策'}));
    await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('服务暂时不可用'));
    expect(failing.play).toHaveBeenCalledWith([{id:'CN_SUBSIDY',target:'design',level:undefined}]);
    expect(subsidy.getAttribute('aria-pressed')).toBe('true');
  });
  it('exposes optional intelligent opponent without requiring it',()=>{
    render(<App adapter={createMockAdapter()}/>);
    const checkbox=screen.getByRole('checkbox',{name:/启用智能对手/}) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});
