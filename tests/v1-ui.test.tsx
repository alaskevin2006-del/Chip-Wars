// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/game-v1/App';
import { cards, roles, names } from '../src/game-v1/catalogue';
import { CONTEXT_INTRO_STORAGE_KEY } from '../src/game-v1/IntroGuide';
import { RULES_GUIDE_STORAGE_KEY } from '../src/game-v1/RulesGuide';
import type { Preference, Session, Snapshot, Standing, TermId } from '../src/game-v1/types';
// Fixtures are hand-written so the interface can be tested without a running engine. They mirror what
// getSnapshot now projects: a private preference with weights, not a checklist of Boolean targets.
const preference:Preference={id:'US_SEC',role:'US',label:'安全优先',blurb:'宁可牺牲商业收益，也要压住技术空间',description:'技术空间优先',weights:{Teff:.5,A:.2,E:.1,LowP:.2}};
const termLabels={Teff:'有效技术难度',A:'美荷协调',E:'商业收益',S:'中国自主能力',Access:'对华渠道敞口',LowA:'低压制',LowP:'美国低压力'} as Record<TermId,string>;
const catalogue=Object.fromEntries(roles.map(role=>[role,[{...preference,id:`${role}_1`,role,label:'公开类型甲'},{...preference,id:`${role}_2`,role,label:'公开类型乙'}]])) as Snapshot['preferenceCatalogue'];
const milestones=Object.fromEntries(roles.map(role=>[role,[{id:`${role}_badge`,role,label:'小院高墙',description:'现实原型：2022.10 美国出口管制新规。达成条件：按「安全优先」的权重路线，把局面得分推到 0.7 以上。',conditionsMet:[false],earned:false}]])) as Snapshot['milestones'];
const standing:Standing={prefId:preference.id,score:.54,utility:.54,delta:0,deltaThreshold:.1,substantiveVictory:false,diplomaticVictory:false,credit:1,fulfilledDeals:0,won:false,initial:.54,terms:{Teff:.4,A:.4,E:.6,S:.2,Access:.6,LowA:.6,LowP:1},preference};
const base:Snapshot={id:'one',version:1,round:1,totalRounds:4,phase:'negotiation',state:{T:2,A:2,E:3,S:1,P:0},roundStart:{T:2,A:2,E:3,S:1,P:0},playerRole:'US',roles:roles.map(id=>({id,name:names[id],description:'公开利益',credit:1,fulfilledDeals:0,possiblePreferences:[{id:`${id}_1`,label:'公开类型甲'},{id:`${id}_2`,label:'公开类型乙'}]})),preferenceCatalogue:catalogue,termLabels,ownPreference:preference,milestones,ownStanding:standing,legalActions:[...cards.US,{id:'PASS',role:'US',name:'维持现状',description:'不改变指标'}],messages:[],deals:[],readyRoles:[],submittedRoles:[],messageCount:0,proposalsMade:0,reportHistory:[],notices:[],researchUses:0};
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
// The announcement stage needs the label maps the engine projects, otherwise the card can only show raw ids.
const announcement:Snapshot={...base,phase:'announcement',declaredRoles:[],statements:{},issues:{controls:'技术出口管制',materials:'关键材料与供应链',licensing:'设备许可自主',enforcement:'执法与灰色渠道',commerce:'商业收益与市场'},tones:{dove:'合作',hawk:'强硬'},commitLevels:{signal:'看法',pledge:'预告',redline:'红线'}};
let live:Snapshot;
let fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{
  sessionStorage.clear();localStorage.setItem(CONTEXT_INTRO_STORAGE_KEY,'done');localStorage.setItem(RULES_GUIDE_STORAGE_KEY,'done');live=structuredClone(base);
  fetcher=vi.fn(async(input:string,options?:RequestInit)=>{
    if(input==='/api/health')return response({status:'ok',rulesVersion:'1.6',llm:{enabled:true,model:'deepseek-chat'}});
    if(input==='/api/diplomacy/sessions')return response({id:live.id,token:'test-session-token',snapshot:live});
    if(options?.method==='DELETE')return response({deleted:true});
    if(input.endsWith('/polish'))return response({candidate:'希望共同维护合法合作空间。'});
    if(input.endsWith('/statement'))return response({statement:{issue:'licensing',tone:'dove',level:'pledge',target:'NL',text:'我方愿意就设备许可与各方保持沟通。'},reason:'落在设备许可议题，用愿意表示合作，属预告级。',drafted:false,source:'llm'});
    if(input.endsWith('/secretary'))return response({advice:{otherRequests:['对方希望交换行动'],possibleMotives:[{text:'可能偏重商业',uncertain:true}],relevantActions:['U2'],risks:['请先确认签约']}});
    if(options?.method==='POST')return response({...live,version:live.version+1});
    return response(live);
  });
  vi.stubGlobal('fetch',fetcher);
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()});
async function start() {render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));await screen.findByText('磋商发言')}
const calls=(suffix:string)=>fetcher.mock.calls.filter(([url])=>(url as string).endsWith(suffix));

describe('V1.6 real-service interface',()=>{
  it('requires all three context pages before welcome and persists completion for reopening',async()=>{
    localStorage.removeItem(CONTEXT_INTRO_STORAGE_KEY);
    render(<App/>);
    expect(screen.queryByText('开始四回合博弈')).toBeNull();
    expect(screen.getByRole('heading',{name:'半导体何以重要？'})).toBeTruthy();
    expect(screen.getByRole('img',{name:'全球半导体关键环节与主要经济体份额地图'}).getAttribute('src')).toBe('/intro/semiconductor-importance.jpeg');
    expect(screen.queryByText('我已阅读，进入游戏')).toBeNull();
    fireEvent.click(screen.getByText('继续阅读'));
    expect(screen.getByRole('heading',{name:'半导体全球产业链分布'})).toBeTruthy();
    expect(screen.getByRole('img',{name:'半导体上中下游产业链与终端应用示意图'}).getAttribute('src')).toBe('/intro/semiconductor-supply-chain.png');
    expect(screen.getByRole('img',{name:'全球半导体供给与需求格局分布图'}).getAttribute('src')).toBe('/intro/global-supply-demand.png');
    fireEvent.click(screen.getByText('继续阅读'));
    expect(screen.getByRole('heading',{name:'利益关系图速览'})).toBeTruthy();
    const stakeholders=screen.getByRole('dialog');
    expect(screen.getByRole('img',{name:'美国、中国、荷兰与 ASML 的半导体利益关系图'}).getAttribute('src')).toBe('/intro/stakeholder-interest-map.png');
    expect(stakeholders.textContent).toContain('美国：掌握技术规则与长臂管辖工具，但必须承受管制带来的本土商业损失');
    expect(stakeholders.textContent).toContain('ASML：手握不可替代的光刻技术垄断优势，却同时受制于美国域外管辖与荷兰本国出口许可');
    fireEvent.click(screen.getByText('我已阅读，进入游戏'));
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    expect(localStorage.getItem(CONTEXT_INTRO_STORAGE_KEY)).toBe('done');
    expect(screen.getByText('开始四回合博弈')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'背景导读'}));
    expect(screen.getByRole('heading',{name:'半导体何以重要？'})).toBeTruthy();
  });
  it('shows the role-specific four-page rules guide before creating a game',async()=>{
    localStorage.removeItem(RULES_GUIDE_STORAGE_KEY);
    render(<App/>);await waitFor(()=>expect((screen.getByText('查看规则并开始') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:/荷兰政府 NL/}));
    fireEvent.click(screen.getByText('查看规则并开始'));
    expect(screen.getByRole('heading',{name:'你代表谁'})).toBeTruthy();
    expect(screen.getByText(/你选择代表 荷兰政府/)).toBeTruthy();
    expect(screen.getByText('个人目标会在正式开局后揭晓。')).toBeTruthy();
    fireEvent.click(screen.getByText('继续阅读'));
    expect(screen.getByRole('heading',{name:'怎样才算赢'})).toBeTruthy();
    expect(screen.getByText('个人目标只影响计分，不限制你的选择。')).toBeTruthy();
    expect(screen.queryByText(/个人目标决定同一个局势对你值多少/)).toBeNull();
    fireEvent.click(screen.getByText('继续阅读'));
    expect(screen.getByRole('heading',{name:'每回合怎么操作'})).toBeTruthy();
    expect(screen.queryByText(/每个阶段只做一件事/)).toBeNull();
    expect(screen.getByText('安排确认')).toBeTruthy();
    expect(screen.getByText(/灰色交易被查获时除外/)).toBeTruthy();
    fireEvent.click(screen.getByText('继续阅读'));
    expect(screen.getByRole('heading',{name:'右侧三个面板'})).toBeTruthy();
    expect(screen.getByText('电讯：刚刚发生了什么。')).toBeTruthy();
    expect(screen.getByText(/展示你对其他方偏好类型的判断、自己的偏好权重和公开形象/)).toBeTruthy();
    expect(screen.getByText('幕僚：我下一步可以怎么考虑。')).toBeTruthy();
    expect(screen.queryByText(/右侧面板随时可以切换/)).toBeNull();
    fireEvent.click(screen.getByText('创建对局并进入'));
    await waitFor(()=>expect(calls('/sessions')).toHaveLength(1));
    expect(JSON.parse(calls('/sessions')[0][1].body)).toEqual({playerRole:'NL'});
    expect(localStorage.getItem(RULES_GUIDE_STORAGE_KEY)).toBe('done');
  });
  it('brings a selected preview into view and returns to cards without clearing the choice or submitting',async()=>{
    const descriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollIntoView'),scroll=vi.fn();
    Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:scroll});
    try{
      live={...live,phase:'actions',actionPreviews:[{actionId:'U1',summary:'基础管制情景',assumptions:['前提甲：其他方保持现状','前提乙：不是对方真实选择','前提丙：最终结果统一结算'],branches:[{label:'本方行动情景',state:{T:3.4,A:2,E:2,S:1,P:0},delta:{T:1.4,A:0,E:-1,S:0,P:0},delayed:[]}]}]};
      render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
      const card=await screen.findByRole('button',{name:/收紧技术管制/});await waitFor(()=>expect((card as HTMLButtonElement).disabled).toBe(false));fireEvent.click(card);
      const previewHeading=screen.getByRole('heading',{name:'这个措施会带来什么'});
      expect(scroll).toHaveBeenCalledWith({block:'start',behavior:'auto'});expect(scroll.mock.contexts.at(-1)).toBe(previewHeading);expect(document.activeElement).toBe(previewHeading);
      const details=screen.getByText('查看这个预估是怎么算的').closest('details')!;expect(details.open).toBe(false);
      fireEvent.click(screen.getByText('查看这个预估是怎么算的'));expect(details.open).toBe(true);expect(screen.getByText('前提乙：不是对方真实选择')).toBeTruthy();
      fireEvent.click(screen.getByRole('button',{name:'换个措施'}));expect(scroll.mock.contexts.at(-1)).toBe(screen.getByRole('heading',{name:'可选措施'}));expect(card.getAttribute('aria-pressed')).toBe('true');fireEvent.click(card);expect(scroll.mock.contexts.at(-1)).toBe(previewHeading);expect(calls('/action')).toHaveLength(0);
    }finally{if(descriptor)Object.defineProperty(HTMLElement.prototype,'scrollIntoView',descriptor);else delete (HTMLElement.prototype as any).scrollIntoView;}
  });
  it('retries the same secret action once after a benign NPC version race',async()=>{
    live={...live,phase:'actions'};const original=fetcher.getMockImplementation()!;let attempts=0;
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url.endsWith('/action')){attempts++;if(attempts===1){live={...live,version:2,submittedRoles:['CN']};return response({error:'NPC advanced'},409);}return response({...live,version:3,ownAction:'U1',submittedRoles:['CN','US']});}
      return original(url,options);
    });
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    const card=await screen.findByRole('button',{name:/收紧技术管制/});await waitFor(()=>expect((card as HTMLButtonElement).disabled).toBe(false));fireEvent.click(card);fireEvent.click(screen.getByRole('button',{name:'提交本方措施'}));
    await screen.findByText(/你已提交：收紧技术管制/);
    expect(calls('/action').map(([,o])=>JSON.parse(o.body))).toEqual([{expectedVersion:1,actionId:'U1'},{expectedVersion:2,actionId:'U1'}]);expect(screen.queryByRole('alert')).toBeNull();
  });
  it('does not retry a secret action across a phase transition',async()=>{
    live={...live,phase:'actions'};const original=fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>{if(url.endsWith('/action')){live={...live,version:2,phase:'report'};return response({error:'phase advanced'},409);}return original(url,options)});
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    const card=await screen.findByRole('button',{name:/收紧技术管制/});await waitFor(()=>expect((card as HTMLButtonElement).disabled).toBe(false));fireEvent.click(card);fireEvent.click(screen.getByRole('button',{name:'提交本方措施'}));
    await screen.findByText(/局面已更新/);expect(calls('/action')).toHaveLength(1);expect(screen.getByRole('button',{name:'进入第 2 回合'})).toBeTruthy();
  });
  it('retries an unchanged pending invitation with the same explicit response',async()=>{
    const deal={id:'stable',round:1,proposer:'NL' as const,participants:['US','NL'] as const,commitments:{US:'U2' as const,NL:'N2' as const},text:'原定条款',accepted:['NL' as const],status:'pending' as const};
    live={...live,phase:'signing',deals:[{...deal,participants:[...deal.participants]}]};const original=fetcher.getMockImplementation()!;let attempts=0;
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>{if(url.endsWith('/respond')){attempts++;if(attempts===1){live={...live,version:2,readyRoles:['CN']};return response({error:'NPC signing'},409);}return response({...live,version:3,deals:[{...live.deals[0],accepted:['NL','US'],status:'effective'}]});}return original(url,options)});
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    const accept=await screen.findByRole('button',{name:'确认并签署'});await waitFor(()=>expect((accept as HTMLButtonElement).disabled).toBe(false));fireEvent.click(accept);
    await screen.findByText(/荷兰政府 发起 · 已生效/);expect(calls('/respond').map(([,o])=>JSON.parse(o.body))).toEqual([{expectedVersion:1,dealId:'stable',accept:true},{expectedVersion:2,dealId:'stable',accept:true}]);
  });
  it('requires manual review if the invitation terms changed during a version conflict',async()=>{
    live={...live,phase:'signing',deals:[{id:'changed',round:1,proposer:'NL',participants:['US','NL'],commitments:{US:'U2',NL:'N2'},text:'原定条款',accepted:['NL'],status:'pending'}]};const original=fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>{if(url.endsWith('/respond')){live={...live,version:2,deals:[{...live.deals[0],commitments:{US:'U1',NL:'N2'},text:'已修改条款'}]};return response({error:'terms changed'},409);}return original(url,options)});
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    const accept=await screen.findByRole('button',{name:'确认并签署'});await waitFor(()=>expect((accept as HTMLButtonElement).disabled).toBe(false));fireEvent.click(accept);
    await screen.findByText(/局面已更新/);expect(calls('/respond')).toHaveLength(1);expect(screen.getByText('已修改条款')).toBeTruthy();
  });
  it('bounds benign ready retries to one then asks for manual review',async()=>{
    const original=fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>{if(url.endsWith('/ready')){live={...live,version:live.version+1};return response({error:'racing again'},409);}return original(url,options)});
    await start();const ready=screen.getByRole('button',{name:'谈判结束 · 进入安排确认'});await waitFor(()=>expect((ready as HTMLButtonElement).disabled).toBe(false));fireEvent.click(ready);
    await screen.findByText(/局面已更新/);expect(calls('/ready').map(([,o])=>JSON.parse(o.body).expectedVersion)).toEqual([1,2]);
  });
  it('shows a one-time role briefing after start and dismisses it without taking a game action',async()=>{
    await start();
    const briefing=screen.getByRole('dialog',{name:'本局个人目标'});
    expect(briefing.textContent).toContain('你代表 美国政府');
    expect(briefing.textContent).toContain('本局你的个人目标：安全优先');
    expect(briefing.textContent).toContain('你的分数取决于：有效技术难度 50%');
    expect(briefing.textContent).toContain('不改变你的合法行动');
    expect(briefing.textContent).toContain('胜利进度');
    fireEvent.click(screen.getByText('进入第一回合'));
    expect(screen.queryByRole('dialog',{name:'本局个人目标'})).toBeNull();
    expect(calls('/ready')).toHaveLength(0);expect(calls('/message')).toHaveLength(0);
  });
  it('puts the victory progress strip before the phase task and moves weight detail into intel',async()=>{
    await start();fireEvent.click(screen.getByText('进入第一回合'));
    const mine=screen.getByRole('region',{name:'我的个人目标与胜利进度'});
    expect(mine.textContent).toContain('我的目标：安全优先');
    expect(mine.textContent).toContain('胜利进度 +0 / 胜利线 0.1');
    expect(mine.textContent).toContain('还差 0.1 达到胜利线');
    expect(mine.textContent).toContain('局面得分 0.54 → 0.54');
    fireEvent.click(screen.getByRole('tab',{name:'情报'}));
    expect(screen.getByText('我的个人目标 · 安全优先')).toBeTruthy();
    expect(screen.getByText(/你的分数取决于：有效技术难度 50% ｜ 美荷协调 20% ｜ 美国低压力 20% ｜ 商业收益 10%/)).toBeTruthy();
    // The intel panel no longer lists badges in-play; they are revealed when the game ends.
    expect(screen.getByText(/将在游戏结束后揭晓/)).toBeTruthy();
    // The intel panel itself should not carry badge rows; the situation drawer in the main column may
    // still contain them as a collapsed rules reference, so scope the absence to the aside.
    expect(document.querySelector('aside')?.textContent).not.toMatch(/小院高墙/);
    const situation=screen.getByText('局势详情 · 指标、角色、规则与历史').closest('details');expect(situation?.open).toBe(false);
    expect(screen.getByRole('button',{name:'谈判结束 · 进入安排确认'})).toBeTruthy();expect(screen.queryByText('秘密提交措施')).toBeNull();
  });
  it('translates model action IDs into clickable Chinese action context',async()=>{
    live={...live,messages:[{id:'context',round:1,from:'NL',to:null,content:'建议 US 选 U1，同时下调 A',source:'llm'}]};
    await start();fireEvent.click(screen.getByRole('button',{name:'收紧技术管制 U1'}));
    const dialog=screen.getByRole('dialog',{name:'措施说明'});expect(dialog.textContent).toContain('提高技术限制，但会损失商业收益');
    expect(screen.getByText(/同时下调 美荷政策协调度/)).toBeTruthy();fireEvent.click(screen.getByText('关闭措施说明'));
    expect(calls('/action')).toHaveLength(0);
  });
  it('shows compact server previews with calculation details and action comparison',async()=>{
    live={...live,phase:'actions',actionPreviews:[{actionId:'U1',summary:'基础管制情景',assumptions:['其他方保持现状，不是已知选择'],branches:[{label:'本方行动',state:{T:3.4,A:2,E:2,S:1,P:0},delta:{T:1.4,A:0,E:-1,S:0,P:0},delayed:[]}]},{actionId:'U2',summary:'有限放宽管制情景',assumptions:['其他方保持现状'],branches:[{label:'本方行动',state:{T:1,A:2,E:4,S:1,P:0},delta:{T:-1,A:0,E:1,S:0,P:0},delayed:[]}]}]};
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    const card=await screen.findByRole('button',{name:/收紧技术管制/});await waitFor(()=>expect((card as HTMLButtonElement).disabled).toBe(false));fireEvent.click(card);
    const preview=screen.getByRole('region',{name:'措施后果预览'});expect(preview.textContent).toContain('先进技术获取难度 +1.4');expect(preview.textContent).toContain('整体商业收益 -1');expect(preview.textContent).toContain('其他方保持现状，不是已知选择');
    const comparison=screen.getByText('对比本轮可选措施').closest('details')!;expect(comparison.open).toBe(false);
    fireEvent.click(screen.getByText('对比本轮可选措施'));expect(comparison.open).toBe(true);expect(comparison.textContent).toContain('有限放宽管制');
    expect(screen.getByRole('button',{name:'提交本方措施'})).toBeTruthy();expect(screen.queryByRole('textbox',{name:'谈判消息'})).toBeNull();
  });
  it('summarizes conditional branches without repeating raw state values',async()=>{
    live={...live,phase:'actions',actionPreviews:[{actionId:'U3',summary:'争取荷兰配合，结果取决于荷兰本轮选择。',riskIsEstimate:true,assumptions:['荷兰如果已经公开行动，则按实际措施计入。'],branches:[
      {label:'荷兰配合协调',state:{T:2,A:4,E:2.6,S:1,P:0},delta:{T:0,A:2,E:-.4,S:0,P:0},delayed:[],deltaU:.05,substantive:true},
      {label:'荷兰未配合，协调不变',probability:.7,state:{T:2,A:2,E:2.6,S:1,P:0},delta:{T:0,A:0,E:-.4,S:0,P:0},delayed:[],deltaU:.02,substantive:false},
      {label:'荷兰未配合，发生反噬',probability:.3,state:{T:2,A:1,E:2.6,S:1,P:0},delta:{T:0,A:-1,E:-.4,S:0,P:0},delayed:[],deltaU:-.02,substantive:false},
    ]}]};
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    fireEvent.click(await screen.findByRole('button',{name:/争取荷兰协调/}));
    const preview=screen.getByRole('region',{name:'措施后果预览'});
    expect(preview.textContent).toContain('胜利进度-0.02 至 +0.05');
    expect(preview.textContent).toContain('荷兰未配合，协调不变');
    expect(preview.textContent).toContain('70%');
    expect(preview.textContent).toContain('荷兰未配合，发生反噬');
    expect(preview.textContent).toContain('30%');
    expect(preview.textContent).not.toContain('2 → 4');
  });
  it('automatically opens secretary once per round without blocking next-step or message input',async()=>{
    let release:(value:Response)=>void=()=>{};const original=fetcher.getMockImplementation()!;
    live={...live,readyRoles:['CN','NL','AS'],aiStatus:{busy:false}};
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>url.endsWith('/secretary')?new Promise<Response>(r=>{release=r}):original(url,options));
    await start();await waitFor(()=>expect(calls('/secretary')).toHaveLength(1));
    expect((screen.getByRole('button',{name:'谈判结束 · 进入安排确认'}) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('谈判消息'),{target:{value:'继续写草稿'}});fireEvent.click(screen.getByRole('button',{name:'谈判结束 · 进入安排确认'}));
    await waitFor(()=>expect(calls('/ready')).toHaveLength(1));
    await act(async()=>release(response({advice:{otherRequests:[],possibleMotives:[],relevantActions:['U1'],risks:['保持信用']}})));
    expect(calls('/secretary')).toHaveLength(1);
  });
  it('discards a failed secretary request after phase transition and keeps the new primary task usable',async()=>{
    let release:(value:Response)=>void=()=>{};const original=fetcher.getMockImplementation()!;
    live={...live,readyRoles:['CN','NL','AS'],aiStatus:{busy:false}};
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>url.endsWith('/secretary')?new Promise<Response>(r=>{release=r}):original(url,options));
    await start();await waitFor(()=>expect(calls('/secretary')).toHaveLength(1));
    live={...live,version:2,phase:'signing',readyRoles:[]};
    fireEvent.click(screen.getByRole('button',{name:'谈判结束 · 进入安排确认'}));
    await screen.findByRole('heading',{name:'确认是否签署安排'});
    await act(async()=>release(response({error:'上一阶段已经失效'},503)));
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('button',{name:'确认完成 · 进入实际措施'}) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button',{name:'确认完成 · 进入实际措施'}));
    await waitFor(()=>expect(calls('/ready')).toHaveLength(2));
  });
  it('reconciles undisclosed aggregate effects and preserves hundredths in rounding adjustments',async()=>{
    live={...live,phase:'report',reportHistory:[{round:1,roundStart:base.state,actions:{US:'U1',CN:'PASS',NL:'PASS',AS:'hidden'},sources:{US:'player'},delta:{T:1.24,A:0,E:-.5,S:0,P:0},adjustment:{T:-.04,A:0,E:0,S:0,P:0},state:{T:3.2,A:2,E:2.5,S:1,P:0},effects:[{rule:'U1',description:'本轮管制成本',delta:{T:1.24,E:-1}},{rule:'UNDISCLOSED',description:'未公开方',delta:{E:.5}}],deals:[],credit:{US:1,CN:1,NL:1,AS:1},fulfilledDeals:{US:0,CN:0,NL:0,AS:0}}]};
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    const tables=await screen.findAllByRole('table');expect(tables[0].textContent).toContain('1.24');expect(tables[0].textContent).toContain('-0.04');
    expect(screen.getAllByText(/另有未公开措施：整体商业收益 \+0.5/).length).toBeGreaterThan(0);expect(screen.queryByText('开拓其他市场')).toBeNull();
    expect(screen.getByRole('button',{name:'进入第 2 回合'})).toBeTruthy();
  });
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
    await screen.findByText('磋商发言');expect(calls('/sessions')).toHaveLength(1);
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
    expect((screen.getByText('起草并提交安排（已发起 0/1）') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('荷兰政府协议承诺'),{target:{value:'N2'}});fireEvent.click(screen.getByText('起草并提交安排（已发起 0/1）'));
    await waitFor(()=>expect(calls('/proposal')).toHaveLength(1));
    expect(JSON.parse(calls('/proposal')[0][1].body)).toEqual({expectedVersion:1,commitments:{US:'U2',NL:'N2'},text:''});
  });
  it('keeps submitted deals compact during negotiation and expands them only in confirmation',async()=>{
    live={...live,deals:[{id:'queued',round:1,proposer:'NL',participants:['US','NL'],commitments:{US:'U2',NL:'N2'},text:'确认阶段才展开的条款',accepted:['NL'],status:'pending'}]};
    await start();
    const queue=screen.getByRole('region',{name:'安排确认队列'});
    expect(queue.textContent).toContain('荷兰政府提交');
    expect(queue.textContent).toContain('等待安排确认');
    expect(screen.queryByText('确认阶段才展开的条款')).toBeNull();
    expect(screen.queryByRole('button',{name:'确认并签署'})).toBeNull();
  });
  it('shows signing invitations and submits an explicit acceptance',async()=>{
    live={...live,phase:'signing',deals:[{id:'deal',round:1,proposer:'NL',participants:['US','NL'],commitments:{US:'U2',NL:'N2'},text:'相互合作',accepted:['NL'],status:'pending'}]};
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    expect((await screen.findAllByText(/发起方已确认/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/待确认/).length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByText('确认并签署'));await waitFor(()=>expect(calls('/respond')).toHaveLength(1));
    expect(JSON.parse(calls('/respond')[0][1].body)).toEqual({expectedVersion:1,dealId:'deal',accept:true});
  });
  it('permits a different secret action from an agreement and warns about breach',async()=>{
    live={...live,phase:'actions',submittedRoles:['CN'],deals:[{id:'deal',round:1,proposer:'US',participants:['US','NL'],commitments:{US:'U2',NL:'N2'},text:'正式安排',accepted:['US','NL'],status:'effective'}]};
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    fireEvent.click(await screen.findByRole('button',{name:/收紧技术管制/}));await screen.findByText(/此措施与你在正式安排中的承诺不同/,{},{timeout:5000});
    fireEvent.click(screen.getByText('提交本方措施'));await waitFor(()=>expect(calls('/action')).toHaveLength(1));
    expect(JSON.parse(calls('/action')[0][1].body).actionId).toBe('U1');
    expect(screen.queryByText('C2 · 限制关键材料出口')).toBeNull();
  });
  it('labels secretary motives as guesses, showing explicit provider failure without fixtures',async()=>{
    await start();fireEvent.click(screen.getByRole('tab',{name:'幕僚'}));fireEvent.click(screen.getByText('请幕僚建议'));await screen.findByText('推测：可能偏重商业');
    fetcher.mockResolvedValueOnce(response({error:'模型服务暂时不可用'},503));fireEvent.click(screen.getByText('AI 润色')); // Empty draft disables polish.
    fireEvent.change(screen.getByLabelText('谈判消息'),{target:{value:'合作'}});fireEvent.click(screen.getByText('AI 润色'));
    await screen.findByText(/AI 请求失败：模型服务暂时不可用/);expect((screen.getByLabelText('谈判消息') as HTMLTextAreaElement).value).toBe('合作');
  });
  it('flags auto-provided aide analysis as unread until the panel is opened',async()=>{
    live={...live,readyRoles:['CN','NL','AS']};await start();
    const unread=await screen.findByRole('tab',{name:'幕僚（新）'});
    fireEvent.click(unread);await screen.findByText('推测：可能偏重商业');
    await waitFor(()=>expect(screen.getByRole('tab',{name:'幕僚'})).toBeTruthy());
  });
  it('re-titles aide sections for signing and shows a signing hint',async()=>{
    live={...live,phase:'signing',deals:[{id:'aide-deal',round:1,proposer:'NL',participants:['US','NL'],commitments:{US:'U2',NL:'N2'},text:'待分析条款',accepted:['NL'],status:'pending'}]};
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    await screen.findByText(/拿不准时/);
    fireEvent.click(screen.getByRole('tab',{name:'幕僚'}));fireEvent.click(screen.getByText('请幕僚分析'));
    await screen.findByText('推测：可能偏重商业');
    expect(screen.getByText('条款要点')).toBeTruthy();expect(screen.getByText('缔约动机 · 推测')).toBeTruthy();
  });
  it('restores a bearer session without creating another one',async()=>{
    sessionStorage.setItem('chip-diplomacy-v16-session',JSON.stringify({id:'one',token:'restore-token'}));render(<App/>);await screen.findByText('磋商发言');
    expect(calls('/sessions')).toHaveLength(0);expect(calls('/one')[0][1].headers.Authorization).toBe('Bearer restore-token');
  });
  it('reveals all final goals and explains official victory conditions with retained reports',async()=>{
    const revealed=Object.fromEntries(roles.map(role=>[role,{...preference,id:`${role}_INITIAL`,role,label:`${names[role]}实际目标`}]));
    const reportHistory=[1,2,3,4].map(round=>({round,focusIssue:'controls' as const,focusRole:'US' as const,roundStart:base.state,actions:{US:'U2' as const,CN:'C3' as const,NL:'N2' as const,AS:'hidden' as const},sources:{US:'player' as const,CN:'fallback' as const,NL:'llm' as const},delta:{T:2,A:0,E:1,S:0,P:0},state:{T:4,A:2,E:4,S:1,P:0},effects:[{rule:'N2+S1',description:`第${round}轮荷兰批准与合规订单同时发生`,delta:{T:-1,E:1}}],deals:[],credit:{US:1,CN:1,NL:1,AS:1},fulfilledDeals:{US:0,CN:1,NL:1,AS:1}}));
    live={...live,phase:'finished',round:4,revealedPreferences:revealed as Snapshot['revealedPreferences'],results:Object.fromEntries(roles.map(role=>[role,{...standing,prefId:`${role}_INITIAL`,preference:revealed[role],delta:role==='US'?0:.2,utility:role==='US'?.54:.74,substantiveVictory:true,diplomaticVictory:role!=='US',won:role!=='US',fulfilledDeals:role==='US'?0:1}])) as Snapshot['results'],reportHistory};
    const original=fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>url.endsWith('/ending')?response({ending:{title:'模型结局测试标题',paragraphs:['第一段。','第二段。','第三段。'],source:'llm'}}):original(url,options));
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    await screen.findByText('你达成了实质胜利！');
    await screen.findByText('模型结局测试标题');
    expect(screen.getByText(/结局摘要 · AI 生成/)).toBeTruthy();
    expect(screen.getAllByText('实质胜利 · 无外交履约').length).toBe(1);
    expect(screen.getAllByText('外交胜利').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(/第4轮荷兰批准与合规订单同时发生/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/规则兜底/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/措施未公开/).length).toBeGreaterThan(0);expect(screen.queryByText('执行对华合规订单')).toBeNull();
    const replay=screen.getByRole('region',{name:'四轮回合复盘'});
    expect(within(replay).getAllByRole('button',{name:/R[1-4]/})).toHaveLength(4);
    fireEvent.click(within(replay).getByRole('button',{name:'R1'}));
    expect(within(replay).getByText('第 1 回合 · 已公开结果')).toBeTruthy();
    expect(within(replay).getByText(/本轮焦点是/)).toBeTruthy();
    const treeHeading=screen.getByRole('heading',{name:'四轮行动完整树与路径环'});
    expect(treeHeading.closest('details')).toBeNull();
    expect(within(treeHeading.closest('section')!).getAllByRole('button',{name:/R[1-4]/})).toHaveLength(4);
    expect(screen.queryByText('秘密提交措施')).toBeNull();
  });
  it('renders public deal participants without inventing private terms and never shows hidden AS actions',async()=>{
    live={...live,phase:'signing',deals:[{id:'private',round:1,proposer:'NL',participants:['NL','AS'],status:'effective'}]};
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    await screen.findByRole('heading',{name:'确认是否签署安排'});
    expect(screen.getByText('条款仅参与方可见。')).toBeTruthy();expect(screen.queryByText('确认并签署')).toBeNull();
    expect(screen.getByText('参与方：荷兰政府、ASML')).toBeTruthy();
  });
  it('enforces current-round eligibility and excludes grey delivery from formal promises',async()=>{
    live={...live,round:3,researchUses:2,roundStart:{...live.roundStart,A:4,P:1}};await start();
    const options=(name:string)=>Array.from((screen.getByLabelText(name) as HTMLSelectElement).options).map(option=>option.value);
    expect(options('中国政府协议承诺')).toEqual(['','C1','C2','C3','C4']);expect(options('荷兰政府协议承诺')).toEqual(['','N1','N3']);expect(options('ASML协议承诺')).toEqual(['','S1','S2']);
    expect(screen.getByText(/你的分数取决于/)).toBeTruthy();expect(screen.getByText(/第四回合末，胜利进度 ≥ 0.1/)).toBeTruthy();
  });
  it('explains ASML baseline risk, hidden policy decisions, and unavailable actions',async()=>{
    live=Object.assign({...live,playerRole:'AS' as const,phase:'actions' as const,legalActions:[...cards.AS,{id:'PASS' as const,role:'AS' as const,name:'维持现状',description:'不改变指标'}]}, {monitoring:true,ownGreyRisk:.6});
    render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));
    await screen.findByRole('button',{name:/灰色渠道交易/});expect(screen.getByText(/你的灰色交易当前查获风险约 60%/)).toBeTruthy();expect(screen.getByText(/会随本轮各方政策变化/)).toBeTruthy();expect(screen.queryByRole('button',{name:/维护现有合规客户/})).toBeNull();
  });
  it('polls authoritative server state and never invokes a browser step endpoint',async()=>{
    await start();live={...live,version:2,messageCount:2,readyRoles:['US']};
    await screen.findByText('你已确认，等待其余代表。',{}, {timeout:2500});
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
    expect(screen.queryByText('磋商发言')).toBeNull();expect(sessionStorage.getItem('chip-diplomacy-v16-session')).toBeNull();
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

describe('stance card',()=>{
  async function startAnnouncement(){live=structuredClone(announcement);render(<App/>);await waitFor(()=>expect((screen.getByText('开始四回合博弈') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('开始四回合博弈'));await screen.findByText('本轮公开表态')}
  it('turns one plain sentence into an adjustable card and submits structured fields only',async()=>{
    await startAnnouncement();
    fireEvent.change(screen.getByLabelText(/用一句话说出你的立场/),{target:{value:'荷兰应保持自主，我们愿意谈'}});
    fireEvent.click(screen.getByText('AI 判定并起草'));
    await screen.findByText('AI 起草结果');
    expect(screen.getByText(/判定：落在设备许可议题/)).toBeTruthy();
    expect((screen.getByLabelText('议题') as HTMLSelectElement).value).toBe('licensing');
    expect((screen.getByLabelText('立场') as HTMLSelectElement).value).toBe('dove');
    expect((screen.getByLabelText('点名对象') as HTMLSelectElement).value).toBe('NL');
    expect((screen.getByLabelText('表态正文') as HTMLTextAreaElement).value).toBe('我方愿意就设备许可与各方保持沟通。');
    fireEvent.change(screen.getByLabelText('议题'),{target:{value:'commerce'}});
    expect((screen.getByLabelText('表态正文') as HTMLTextAreaElement).value).toContain('商业收益与市场');
    fireEvent.click(screen.getByText('发表表态'));
    await waitFor(()=>expect(calls('/declare')).toHaveLength(1));
    const body=JSON.parse(calls('/declare')[0][1].body);
    expect(Object.keys(body).sort()).toEqual(['expectedVersion','issue','level','target','text','tone']);
    expect(body).toMatchObject({issue:'commerce',tone:'dove',level:'pledge',target:'NL'});
  });
  it('drafts a stance when the sentence is blank and offers another draft',async()=>{
    await startAnnouncement();
    fireEvent.click(screen.getByText('AI 代拟'));
    await screen.findByText('AI 起草结果');
    expect(JSON.parse(calls('/statement')[0][1].body).text).toBe('');
    fireEvent.click(screen.getByText('AI 换一稿'));
    await waitFor(()=>expect(calls('/statement')).toHaveLength(2));
  });
  it('offers silence when the aide cannot judge the sentence',async()=>{
    const original=fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>url.endsWith('/statement')?response({error:'模型服务暂时不可用'},503):original(url,options));
    await startAnnouncement();
    fireEvent.change(screen.getByLabelText(/用一句话说出你的立场/),{target:{value:'荷兰应保持自主'}});
    fireEvent.click(screen.getByText('AI 判定并起草'));
    await screen.findByText(/AI 起草失败：模型服务暂时不可用/);
    expect(screen.getAllByRole('button',{name:'保持沉默'}).some(button=>!(button as HTMLButtonElement).disabled)).toBe(true);
  });
});

describe('speech template panel',()=>{
  it('fills the draft with a sentence aligned to the chosen stance and measure',async()=>{
    await start();
    fireEvent.click(screen.getByText('不会写？用模板组一句'));
    fireEvent.click(screen.getByRole('button',{name:'愿意让步'}));
    const measure=screen.getByLabelText('模板措施') as HTMLSelectElement;
    const own=[...measure.options].map(o=>o.value);
    expect(own).toEqual(expect.arrayContaining(cards.US.map(c=>c.id)));
    fireEvent.change(measure,{target:{value:'U2'}});
    fireEvent.click(screen.getByText('填入发言框'));
    expect((screen.getByLabelText('谈判消息') as HTMLTextAreaElement).value).toBe('关于「有限放宽管制」，我方愿意作出让步。');
  });
  it('filters request templates to other parties measures',async()=>{
    await start();
    fireEvent.click(screen.getByText('不会写？用模板组一句'));
    fireEvent.click(screen.getByRole('button',{name:'提出要求'}));
    const measure=screen.getByLabelText('模板措施') as HTMLSelectElement;
    const ids=[...measure.options].map(o=>o.value).filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.some(id=>cards.US.some(c=>c.id===id))).toBe(false);
    fireEvent.change(measure,{target:{value:'N2'}});
    fireEvent.click(screen.getByText('填入发言框'));
    expect((screen.getByLabelText('谈判消息') as HTMLTextAreaElement).value).toBe('希望贵方重新考虑「批准有限许可」。');
  });
  it('rewrites the template into formal wording and falls back to the parseable template if the model fails',async()=>{
    await start();
    const original=fetcher.getMockImplementation()!;let mode:'ok'|'fail'='ok';
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>url.endsWith('/polish')
      ? (mode==='ok'?response({candidate:'关于有限放宽管制，我方愿意在互惠基础上作出相应安排。',source:'llm'}):response({error:'AI服务未成功返回有效建议，请稍后重试；未生成示例内容。'},503))
      : original(url,options));
    fireEvent.click(screen.getByText('不会写？用模板组一句'));
    fireEvent.click(screen.getByRole('button',{name:'愿意让步'}));
    fireEvent.change(screen.getByLabelText('模板措施'),{target:{value:'U2'}});
    fireEvent.click(screen.getByText('AI 改写为正式措辞'));
    await waitFor(()=>expect((screen.getByLabelText('谈判消息') as HTMLTextAreaElement).value).toBe('关于有限放宽管制，我方愿意在互惠基础上作出相应安排。'));
    expect(JSON.parse(calls('/polish')[0][1].body)).toEqual({text:'关于「有限放宽管制」，我方愿意作出让步。',tone:'neutral'});
    expect(screen.getByText(/已改写为正式磋商措辞/)).toBeTruthy();expect(calls('/message')).toHaveLength(0);
    mode='fail';
    fireEvent.click(screen.getByText('AI 改写为正式措辞'));
    await waitFor(()=>expect((screen.getByLabelText('谈判消息') as HTMLTextAreaElement).value).toBe('关于「有限放宽管制」，我方愿意作出让步。'));
    expect(screen.getByText(/模型未能改写/)).toBeTruthy();expect(calls('/message')).toHaveLength(0);
  });
});
