// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/game-v1/App';
import { cards, roles, names } from '../src/game-v1/catalogue';
import type { GoalCard, Session, Snapshot } from '../src/game-v1/types';

const goal:GoalCard={id:'US_SEC',role:'US',label:'安全优先',description:'保住商业，同时收紧技术空间',conditions:[{metric:'effectiveT',operator:'gte',value:4}]};
const base:Snapshot={id:'one',version:1,round:1,totalRounds:4,phase:'negotiation',state:{T:2,A:2,E:3,S:1,P:0},roundStart:{T:2,A:2,E:3,S:1,P:0},playerRole:'US',roles:roles.map(id=>({id,name:names[id],description:'公开利益',credit:1,fulfilledDeals:0,possibleGoals:[{id:`${id}_1`,label:'公开类型甲'},{id:`${id}_2`,label:'公开类型乙'}]})),goalCatalogue:{US:[goal],CN:[],NL:[],AS:[]},ownGoal:goal,legalActions:[...cards.US,{id:'PASS',role:'US',name:'维持现状',description:'不改变指标'}],messages:[],deals:[],readyRoles:[],submittedRoles:[],messageCount:0,proposalsMade:0,reportHistory:[],notices:[],researchUses:0};
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
let live:Snapshot;
let fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{
  sessionStorage.clear();live=structuredClone(base);
  fetcher=vi.fn(async(input:string,options?:RequestInit)=>{
    if(input==='/api/health')return response({status:'ok',rulesVersion:'1.6',llm:{enabled:true,model:'deepseek-chat'}});
    if(input==='/api/diplomacy/sessions')return response({id:live.id,token:'test-session-token',snapshot:live});
    if(options?.method==='DELETE')return response({deleted:true});
    if(input.endsWith('/polish'))return response({candidate:'希望共同维护合法合作空间。'});
    if(input.endsWith('/secretary'))return response({advice:{otherRequests:['对方希望交换行动'],possibleMotives:[{text:'可能偏重商业',uncertain:true}],relevantActions:['U2'],risks:['请先确认签约']}});
    if(options?.method==='POST')return response({...live,version:live.version+1});
    return response(live);
  });
  vi.stubGlobal('fetch',fetcher);
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()});
async function start() {render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));await screen.findByText('你的声明')}
const calls=(suffix:string)=>fetcher.mock.calls.filter(([url])=>(url as string).endsWith(suffix));

describe('V1.6 real-service interface',()=>{
  it('disables creation when DeepSeek is unavailable and renders four charming roles without a map',async()=>{
    fetcher.mockResolvedValue(response({status:'ok',rulesVersion:'1.6',llm:{enabled:false,model:'deepseek-chat'}}));
    render(<App/>);await screen.findByText(/模型不可用：服务端尚未配置/);
    expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole('img',{name:/卡通代表/})).toHaveLength(4);
    expect(screen.queryByText(/演示模式|离线模式|地理关系/)).toBeNull();
    expect(calls('/sessions')).toHaveLength(0);
  });
  it('creates only one live session with the selected role and authenticates subsequent requests',async()=>{
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:/荷兰政府 NL/}));
    fireEvent.click(screen.getByText('开始四回合博弈'));fireEvent.click(screen.getByText('正在创建对局…'));
    await screen.findByText('你的声明');expect(calls('/sessions')).toHaveLength(1);
    expect(JSON.parse(calls('/sessions')[0][1].body)).toEqual({playerRole:'NL'});
    fireEvent.change(screen.getByLabelText('谈判消息'),{target:{value:'共同合作'}});fireEvent.click(screen.getByText('发送'));
    await waitFor(()=>expect(calls('/message')).toHaveLength(1));
    expect(calls('/message')[0][1].headers.Authorization).toBe('Bearer test-session-token');
    expect(JSON.parse(calls('/message')[0][1].body)).toEqual({expectedVersion:1,content:'共同合作',target:null});
  });
  it('AI polish remains an editable candidate and never automatically sends',async()=>{
    await start();fireEvent.change(screen.getByLabelText('润色语气'),{target:{value:'firm'}});fireEvent.change(screen.getByLabelText('谈判消息'),{target:{value:'合法合作'}});fireEvent.click(screen.getByText('AI 润色'));
    await waitFor(()=>expect((screen.getByLabelText('谈判消息') as HTMLTextAreaElement).value).toBe('希望共同维护合法合作空间。'));
    expect(calls('/message')).toHaveLength(0);expect(JSON.parse(calls('/polish')[0][1].body)).toEqual({text:'合法合作',tone:'firm'});
    fireEvent.change(screen.getByLabelText('谈判消息'),{target:{value:'请讨论 U2'}});
    fireEvent.change(screen.getByLabelText('消息收件人'),{target:{value:'CN'}});fireEvent.click(screen.getByText('发送'));
    await waitFor(()=>expect(calls('/message')).toHaveLength(1));
    expect(JSON.parse(calls('/message')[0][1].body).target).toBe('CN');
  });
  it('counts Unicode codepoints and prevents a third message',async()=>{
    await start();fireEvent.change(screen.getByLabelText('谈判消息'),{target:{value:'😀'.repeat(100)}});
    expect(screen.getByText('100/100 字')).toBeTruthy();expect((screen.getByText('发送') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('谈判消息'),{target:{value:'😀'.repeat(101)}});
    expect((screen.getByText('发送') as HTMLButtonElement).disabled).toBe(true);
  });
  it('reconciles stale writes by GET while preserving unsent draft',async()=>{
    const original=fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>url.endsWith('/message')?response({error:'stale'},409):original(url,options));
    await start();fireEvent.change(screen.getByLabelText('谈判消息'),{target:{value:'保留这条草稿'}});fireEvent.click(screen.getByText('发送'));
    await screen.findByText(/局面已更新/);
    expect((screen.getByLabelText('谈判消息') as HTMLTextAreaElement).value).toBe('保留这条草稿');
    expect(calls('/one').some(([,options])=>options.method==='GET')).toBe(true);
  });
  it('requires an own commitment and at least one partner, excluding illegal late research and PASS',async()=>{
    live={...live,round:4,researchUses:2};await start();
    const own=screen.getByLabelText('美国政府协议承诺') as HTMLSelectElement;
    expect(Array.from((screen.getByLabelText('中国政府协议承诺') as HTMLSelectElement).options).map(option=>option.value)).toEqual(['','C2','C3']);
    fireEvent.change(own,{target:{value:'U2'}});
    expect((screen.getByText('提交提案（已发起 0/1）') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('荷兰政府协议承诺'),{target:{value:'N2'}});fireEvent.click(screen.getByText('提交提案（已发起 0/1）'));
    await waitFor(()=>expect(calls('/proposal')).toHaveLength(1));
    expect(JSON.parse(calls('/proposal')[0][1].body)).toEqual({expectedVersion:1,commitments:{US:'U2',NL:'N2'},text:''});
  });
  it('shows signing invitations and submits an explicit acceptance',async()=>{
    live={...live,phase:'signing',deals:[{id:'deal',round:1,proposer:'NL',participants:['US','NL'],commitments:{US:'U2',NL:'N2'},text:'相互合作',accepted:['NL'],status:'pending'}]};
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    fireEvent.click(await screen.findByText('接受协议'));await waitFor(()=>expect(calls('/respond')).toHaveLength(1));
    expect(JSON.parse(calls('/respond')[0][1].body)).toEqual({expectedVersion:1,dealId:'deal',accept:true});
  });
  it('permits a different secret action from an agreement and warns about breach',async()=>{
    live={...live,phase:'actions',submittedRoles:['CN'],deals:[{id:'deal',round:1,proposer:'US',participants:['US','NL'],commitments:{US:'U2',NL:'N2'},text:'正式协议',accepted:['US','NL'],status:'effective'}]};
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    fireEvent.click(await screen.findByRole('button',{name:/收紧技术管制/}));await screen.findByText(/此行动与你的正式承诺不同/);
    fireEvent.click(screen.getByText('秘密提交行动'));await waitFor(()=>expect(calls('/action')).toHaveLength(1));
    expect(JSON.parse(calls('/action')[0][1].body).actionId).toBe('U1');
    expect(screen.queryByText('C2 · 限制关键材料出口')).toBeNull();
  });
  it('labels secretary motives as guesses, showing explicit provider failure without fixtures',async()=>{
    await start();fireEvent.click(screen.getByText('请秘书建议'));await screen.findByText('推测：可能偏重商业');
    fetcher.mockResolvedValueOnce(response({error:'模型服务暂时不可用'},503));fireEvent.click(screen.getByText('AI 润色')); // Empty draft disables polish.
    fireEvent.change(screen.getByLabelText('谈判消息'),{target:{value:'合作'}});fireEvent.click(screen.getByText('AI 润色'));
    await screen.findByText(/AI 请求失败：模型服务暂时不可用/);expect((screen.getByLabelText('谈判消息') as HTMLTextAreaElement).value).toBe('合作');
  });
  it('restores a bearer session without creating another one',async()=>{
    sessionStorage.setItem('chip-diplomacy-v16-session',JSON.stringify({id:'one',token:'restore-token'}));render(<App/>);await screen.findByText('你的声明');
    expect(calls('/sessions')).toHaveLength(0);expect(calls('/one')[0][1].headers.Authorization).toBe('Bearer restore-token');
  });
  it('reveals all final goals and explains official victory conditions with retained reports',async()=>{
    const revealed=Object.fromEntries(roles.map(role=>[role,{...goal,id:`${role}_GOAL`,role,label:`${names[role]}最终目标`}]));
    live={...live,phase:'finished',round:4,revealedGoals:revealed as Snapshot['revealedGoals'],results:Object.fromEntries(roles.map(role=>[role,{goal:revealed[role],conditionsMet:[true],fulfilledDeals:role==='US'?0:1,credit:1,won:role!=='US',substantiveVictory:true,diplomaticVictory:role!=='US',effectiveT:4}])) as Snapshot['results'],reportHistory:[{round:4,roundStart:base.state,actions:{US:'U2',CN:'C3',NL:'N2',AS:'hidden'},sources:{US:'player',CN:'fallback',NL:'llm'},delta:{T:2,A:0,E:1,S:0,P:0},state:{T:4,A:2,E:4,S:1,P:0},effects:[{rule:'N2+S1',description:'荷兰批准与合规订单同时发生',delta:{T:-1,E:1}}],deals:[],credit:{US:1,CN:1,NL:1,AS:1},fulfilledDeals:{US:0,CN:1,NL:1,AS:1}}]};
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    await screen.findByText('你达成了实质胜利！');
    expect(screen.getAllByText(/实质胜利：达成/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/荷兰批准与合规订单同时发生/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('模型失败 · 确定性策略兜底').length).toBeGreaterThan(0);
    expect(screen.getAllByText('外交胜利')).toHaveLength(3);expect(screen.getAllByText('未公开').length).toBeGreaterThan(0);expect(screen.queryByText('执行对华合规订单')).toBeNull();
    expect(screen.queryByText('秘密提交行动')).toBeNull();
  });
  it('renders public deal participants without inventing private terms and never shows hidden AS actions',async()=>{
    live={...live,deals:[{id:'private',round:1,proposer:'NL',participants:['NL','AS'],status:'effective'}]};
    await start();expect(screen.getByText('条款仅签约方可见。')).toBeTruthy();expect(screen.queryByText('接受协议')).toBeNull();
    expect(screen.getByText('参与方：荷兰政府、ASML')).toBeTruthy();
  });
  it('enforces current-round eligibility and excludes grey delivery from formal promises',async()=>{
    live={...live,round:3,researchUses:2,roundStart:{...live.roundStart,A:4,P:1}};await start();
    const options=(name:string)=>Array.from((screen.getByLabelText(name) as HTMLSelectElement).options).map(option=>option.value);
    expect(options('中国政府协议承诺')).toEqual(['','C1','C2','C3','C4']);expect(options('荷兰政府协议承诺')).toEqual(['','N1','N3']);expect(options('ASML协议承诺')).toEqual(['','S1','S2']);
    expect(screen.getByText(/外交胜利还需美国国内产业压力 ≤1/)).toBeTruthy();
  });
  it('explains ASML baseline risk, hidden policy decisions, and unavailable actions',async()=>{
    live=Object.assign({...live,playerRole:'AS' as const,phase:'actions' as const,legalActions:[...cards.AS,{id:'PASS' as const,role:'AS' as const,name:'维持现状',description:'不改变指标'}]}, {monitoring:true,ownGreyRisk:.6});
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    await screen.findByRole('button',{name:/灰色渠道交付/});expect(screen.getByText(/你的基础查获风险 60%/)).toBeTruthy();expect(screen.getByText(/实际受本轮政策及协调变化影响/)).toBeTruthy();expect(screen.queryByRole('button',{name:/维护现有合规客户/})).toBeNull();
  });
  it('polls authoritative server state and never invokes a browser step endpoint',async()=>{
    await start();live={...live,version:2,messageCount:2,readyRoles:['US']};
    await screen.findByText('你已就绪，等待其余代表。',{}, {timeout:2500});
    expect((screen.getByText('发送') as HTMLButtonElement).disabled).toBe(true);
    expect(fetcher.mock.calls.some(([url])=>(url as string).endsWith('/step'))).toBe(false);
  });
  it('discards an outstanding poll after DELETE reset',async()=>{
    let resolvePoll:(value:Response)=>void=()=>{};
    const original=fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>url.endsWith('/one')&&options?.method==='GET'?new Promise<Response>(resolve=>{resolvePoll=resolve}):original(url,options));
    await start();await waitFor(()=>expect(calls('/one')).toHaveLength(1),{timeout:2500});
    fireEvent.click(screen.getByText('结束对局'));await screen.findByText('开始四回合博弈');
    await act(async()=>resolvePoll(response({...live,version:99})));
    expect(screen.queryByText('你的声明')).toBeNull();expect(sessionStorage.getItem('chip-diplomacy-v16-session')).toBeNull();
  });
  it('allows reset during a pending AI request and discards the late candidate',async()=>{
    let resolvePolish:(value:Response)=>void=()=>{};
    const original=fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>url.endsWith('/polish')?new Promise<Response>(resolve=>{resolvePolish=resolve}):original(url,options));
    await start();fireEvent.change(screen.getByLabelText('谈判消息'),{target:{value:'合作'}});fireEvent.click(screen.getByText('AI 润色'));
    await waitFor(()=>expect(calls('/polish')).toHaveLength(1));
    fireEvent.click(screen.getByText('结束对局'));await screen.findByText('开始四回合博弈');
    await act(async()=>resolvePolish(response({candidate:'迟到的候选'})));
    expect(screen.queryByText('迟到的候选')).toBeNull();expect(calls('/one').some(([,options])=>options.method==='DELETE')).toBe(true);
  });
});
