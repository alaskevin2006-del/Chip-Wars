// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/diplomacy/App';
import { api, ApiError, type Session } from '../src/diplomacy/api';
import type { Snapshot } from '../src/diplomacy/types';
vi.mock('../src/diplomacy/api',async importOriginal=>{const original=await importOriginal<typeof import('../src/diplomacy/api')>();return {...original,api:{health:vi.fn(),create:vi.fn(),read:vi.fn(),step:vi.fn(),control:vi.fn(),remove:vi.fn()}}});
const snapshot:Snapshot={id:'test',version:0,mode:'demo',rounds:3,round:1,actor:'USA',player:null,status:'running',messages:[],proposals:[],decisions:{},errors:[],roles:[],scenario:{title:'Test',description:'Fiction',facts:[],assumptions:[]}};
const session=(s:Snapshot):Session=>({id:'test',token:'session-token',snapshot:s});
beforeEach(()=>{vi.mocked(api.health).mockResolvedValue({status:'ok',llm:{enabled:false,model:'deepseek-flash'}});vi.mocked(api.remove).mockResolvedValue({});});
afterEach(()=>{cleanup();vi.resetAllMocks();});
describe('Chip Diplomacy interface',()=>{
  it('clearly labels fixed demo and does not enable unconfigured live model',async()=>{
    render(<App/>);await waitFor(()=>expect(api.health).toHaveBeenCalled());
    expect(screen.getByText('演示数据 · 非实时 LLM')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('运行方式'),{target:{value:'live'}});
    expect((screen.getByRole('button',{name:'开始模拟'}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/实时模型尚未配置/)).toBeTruthy();
    expect(screen.getAllByRole('img',{name:/卡通代表/})).toHaveLength(4);
  });
  it('replaces the controlled role decision with player text and keeps private routing',async()=>{
    const playerState={...snapshot,player:'USA' as const,status:'awaiting_player' as const};
    vi.mocked(api.create).mockResolvedValue(session(playerState));
    vi.mocked(api.step).mockResolvedValue({...playerState,version:1,actor:'China',status:'paused'});
    render(<App/>);fireEvent.change(screen.getByLabelText('你的角色'),{target:{value:'USA'}});fireEvent.click(screen.getByRole('button',{name:'开始模拟'}));
    await screen.findByText('现在由你代表美国政府发言');
    expect(api.step).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('行动类型'),{target:{value:'message'}});
    fireEvent.change(screen.getByLabelText('接收方'),{target:{value:'Netherlands'}});
    fireEvent.change(screen.getByLabelText('外交文本'),{target:{value:'希望讨论许可范围与复审安排。'}});
    fireEvent.click(screen.getByRole('button',{name:'提交本轮行动'}));
    await waitFor(()=>expect(api.step).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.step).mock.calls[0][2]).toMatchObject({agent:'USA',action:'message',target:'Netherlands',is_public:false,content:'希望讨论许可范围与复审安排。'});
  });
  it('discards late creation result after reset of an active session and cancels in-flight steps',async()=>{
    vi.mocked(api.create).mockResolvedValue(session(snapshot));
    let finish:(s:Snapshot)=>void=()=>{};
    vi.mocked(api.step).mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:'开始模拟'}));
    await waitFor(()=>expect(api.step).toHaveBeenCalledTimes(1),{timeout:2000});
    fireEvent.click(screen.getByRole('button',{name:'重置模拟'}));
    await act(async()=>finish({...snapshot,version:1,messages:[{id:'late',round:1,agent:'USA',action:'statement',target:null,content:'旧局迟到消息',reason:'',is_public:true,proposal_id:null,source:'demo'}]}));
    expect(screen.queryByText('旧局迟到消息')).toBeNull();
    expect(screen.getByRole('button',{name:'开始模拟'})).toBeTruthy();
    expect(api.remove).toHaveBeenCalledTimes(1);
  });
  it('requires a final decision in the last round, and never invents missing decisions',async()=>{
    const final={...snapshot,round:3,player:'USA' as const,status:'awaiting_player' as const};
    vi.mocked(api.create).mockResolvedValue(session(final));
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:'开始模拟'}));
    await screen.findByLabelText('行动类型');
    expect((screen.getByLabelText('行动类型') as HTMLSelectElement).value).toBe('decision');
    expect((screen.getByLabelText('行动类型') as HTMLSelectElement).options).toHaveLength(1);
    expect(screen.getAllByText('等待最后一轮的独立决定。')).toHaveLength(4);
  });
  it('reconciles a lost player response without submitting the same action twice',async()=>{
    const playerState={...snapshot,player:'USA' as const,status:'awaiting_player' as const};
    const committed={...playerState,version:1,actor:'China' as const,status:'paused' as const,messages:[{id:'committed',round:1,agent:'USA' as const,action:'statement' as const,target:null,content:'已经记录的玩家行动',reason:'',is_public:true,proposal_id:null,source:'player' as const}]};
    vi.mocked(api.create).mockResolvedValue(session(playerState));
    vi.mocked(api.step).mockRejectedValue(new TypeError('response connection lost'));
    vi.mocked(api.read).mockResolvedValue(committed);
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:'开始模拟'}));
    await screen.findByLabelText('外交文本');
    fireEvent.change(screen.getByLabelText('外交文本'),{target:{value:'已经记录的玩家行动'}});
    fireEvent.click(screen.getByRole('button',{name:'提交本轮行动'}));
    await screen.findByText('已经记录的玩家行动');
    expect(api.read).toHaveBeenCalledTimes(1);expect(api.step).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('refreshes a stale 409 and permits retry from the authoritative version',async()=>{
    vi.mocked(api.create).mockResolvedValue(session(snapshot));
    vi.mocked(api.step).mockRejectedValueOnce(new ApiError('busy',409)).mockResolvedValue({...snapshot,version:2,status:'paused'});
    vi.mocked(api.read).mockResolvedValueOnce(snapshot).mockResolvedValueOnce({...snapshot,version:1,actor:'China'});
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:'开始模拟'}));
    await screen.findByText('另一项行动仍在处理。状态已同步，请稍后重试。');
    fireEvent.click(screen.getByRole('button',{name:'重试当前步骤'}));
    await waitFor(()=>expect(api.step).toHaveBeenCalledTimes(2),{timeout:2000});
    expect(vi.mocked(api.step).mock.calls[1][1]).toBe(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('serializes control and discards the old step after pause and resume',async()=>{
    vi.mocked(api.create).mockResolvedValue(session(snapshot));
    let oldStep:(s:Snapshot)=>void=()=>{},finishPause:(s:Snapshot)=>void=()=>{};
    vi.mocked(api.step).mockImplementationOnce(()=>new Promise(resolve=>{oldStep=resolve})).mockResolvedValue({...snapshot,version:1,status:'paused'});
    vi.mocked(api.control).mockImplementationOnce(()=>new Promise(resolve=>{finishPause=resolve})).mockResolvedValue(snapshot);
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:'开始模拟'}));
    await waitFor(()=>expect(api.step).toHaveBeenCalledTimes(1),{timeout:2000});
    const pause=screen.getByRole('button',{name:'暂停'});fireEvent.click(pause);fireEvent.click(pause);
    expect(api.control).toHaveBeenCalledTimes(1);
    await act(async()=>finishPause({...snapshot,status:'paused'}));
    fireEvent.click(screen.getByRole('button',{name:'继续'}));
    await waitFor(()=>expect(api.control).toHaveBeenCalledTimes(2));
    await act(async()=>oldStep({...snapshot,version:99,status:'completed'}));
    await waitFor(()=>expect(api.step).toHaveBeenCalledTimes(2),{timeout:2000});
    expect(vi.mocked(api.step).mock.calls[1][1]).toBe(0);
    expect(screen.queryByText('本次推演结束')).toBeNull();
  });
});
