// All numeric effects and thresholds below are hypothetical game assumptions [G].
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const copy = value => structuredClone(value);
export const ROLE_IDS = freeze(['US', 'CN', 'NL', 'AS']);
const METRICS = ['T', 'A', 'E', 'S', 'P'];
const clamp = (n, max = 5) => Math.max(0, Math.min(max, n));
const record = value => Object.fromEntries(ROLE_IDS.map(role => [role, value]));
const fail = message => { throw new Error(message); };
const validRole = role => { if (!ROLE_IDS.includes(role)) fail('请选择有效角色。'); };
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const goal = (role, id, label, conditions) => ({ role, id, label,
  description: `${conditions.map(c => `${c.metric === 'effectiveT' ? '有效T' : c.metric}${c.operator === 'gte' ? '≥' : '≤'}${c.value}`).join('，')}；信用≥1为实质胜利，另有全员履约协议为外交胜利（美国还需P≤1）。抽取概率50%。`, conditions });
const condition = (metric, operator, value) => ({ metric, operator, value });
export const GOAL_CATALOGUE = freeze({
  US: [goal('US','US_SEC','安全优先',[condition('effectiveT','gte',4)]),goal('US','US_ALLY','联盟优先',[condition('A','gte',4),condition('T','gte',3)])],
  CN: [goal('CN','CN_TECH','自主突破',[condition('S','gte',3),condition('T','lte',3)]),goal('CN','CN_TRADE','合作维持',[condition('T','lte',2),condition('E','gte',4)])],
  NL: [goal('NL','NL_ALLY','协调优先',[condition('A','gte',4),condition('E','gte',3)]),goal('NL','NL_TRADE','商业优先',[condition('T','lte',2),condition('A','lte',3),condition('E','gte',4)])],
  AS: [goal('AS','AS_CN','对华深耕',[condition('T','lte',2),condition('A','gte',3),condition('E','gte',4)]),goal('AS','AS_GLOBAL','全球多元',[condition('E','gte',5),condition('A','gte',3)])],
});
const card = (role,id,name,description) => ({role,id,name,description});
export const ACTIONS = freeze({
 US:[card('US','U1','收紧技术管制','T增加1×(1+回合开始A/5)；基础E−1，开始S≥3改为−0.5；开始P≥1额外E−0.5。'),card('US','U2','有限放宽管制','T−1，E+1，P−1；缓和预期，不表示中国自动解除材料限制。'),card('US','U3','争取荷兰协调','E−0.4；荷兰同轮配合协调则A+2，否则70%不变、30% A−1。'),card('US','U4','加强合规执法','E−0.2；本轮灰色交付查获概率+30个百分点，查获再A+0.5。'),card('US','PASS','保持现状','无指标变化。')],
 CN:[card('CN','C1','投资自主研发','本轮E−0.5；下一回合开始S+1；最多3次，第4回合不可选。'),card('CN','C2','限制对美关键材料出口','P+1，E−0.5；不直接改变T，也不强制美国让步。'),card('CN','C3','提出中荷商业合作','A−1，E+0.4；荷兰同轮批准有限许可时额外E+0.5。'),card('CN','C4','放松关键材料出口限制','P−1，E+0.5；仅回合开始P≥1可选。'),card('CN','PASS','保持现状','无指标变化。')],
 NL:[card('NL','N1','收紧设备许可','T增加1×(1+开始A/5)，A+1；E−1，开始S≥3时改为E−0.5。'),card('NL','N2','批准有限许可','A−1；仅回合开始A<4可选；与ASML同轮合规订单联动一次T−1、E+1。'),card('NL','N3','配合美方协调','仅与美方同轮争取协调联动A+2，不重复叠加；独立无效果。'),card('NL','PASS','保持现状','无指标变化。')],
 AS:[card('AS','S1','执行对华合规订单','与荷兰同轮有限许可联动一次T−1、E+1；没有许可则订单未执行、E−1。行动默认不公开。'),card('AS','S2','开拓其他市场','E+0.5，T+1；此T上升不受同盟杠杆放大。行动默认不公开。'),card('AS','S4','灰色渠道交付（高风险）','未查获T−1、E+1.5；查获E−2、信用−1，下回合T+1（第4回合在判胜前追加）；查获概率=min(100%,20%+临时A×10%+执法30个百分点+此前重点监控20个百分点)。不能写入正式协议。'),card('AS','PASS','保持现状','无指标变化，行动默认不公开。')],
});
const ROLE_INFO = {
  US: ['美国政府', '关注有效技术管制、美荷协调、商业收益；国内压力P为负面成本。'],
  CN: ['中国政府', '关注技术自主、技术获取难度及商业合作；材料限制提供谈判筹码。'],
  NL: ['荷兰政府', '关注许可自主、美荷协调与商业收益。'],
  AS: ['ASML', '关注合规订单、现有客户及其他市场。'],
};

export function createGame(draws,seed=1) {
  if (!draws || ROLE_IDS.some(role => !has(draws, role) || ![0, 1].includes(draws[role])) || Object.keys(draws).some(role => !ROLE_IDS.includes(role))) fail('目标抽签输入无效。');
  if (!Number.isInteger(seed) || seed<0 || seed>0xffffffff) fail('随机种子输入无效。');
  const state = { T:2, A:2, E:3, S:1, P:0 };
  return { version: 0, round: 1, totalRounds: 4, phase: 'negotiation', state, roundStart: copy(state),
    goals: Object.fromEntries(ROLE_IDS.map(role => [role, copy(GOAL_CATALOGUE[role][draws[role]])])),
    seed,roundSeed:roundSeed(seed,1),randomRecords:[],pendingPenalties:[],monitoring:false,
    pendingResearch: [], researchUses: 0, credit: record(1), fulfilledDeals: record(0),
    messages: [], deals: [], actions: {}, actionSources: {}, readyRoles: [], reportHistory: [] };
}

export function legalActions(game, role) {
  validRole(role);
  return copy(ACTIONS[role].filter(action => (action.id !== 'C1' || (game.round < 4 && game.researchUses < 3)) && (action.id !== 'C4' || game.roundStart.P>=1) && (action.id !== 'N2' || game.roundStart.A<4)));
}
const isLegal = (game, role, actionId) => legalActions(game, role).some(action => action.id === actionId);
const requireStage = (game, phase, role) => {
  validRole(role);
  if (game.phase !== phase) fail('当前阶段不支持此操作。');
  if (game.readyRoles.includes(role)) fail('本阶段已确认完成。');
};
const length = value => typeof value === 'string' ? [...value].length : -1;
const currentDeals = game => game.deals.filter(deal => deal.round === game.round);
const signed = (game, role) => currentDeals(game).find(deal => deal.status === 'effective' && has(deal.commitments, role));

export function sendMessage(game, role, input, source = 'player') {
  requireStage(game, 'negotiation', role);
  if (!input || length(input.content) < 1 || length(input.content) > 100 || !input.content.trim()) fail('消息须为1至100字。');
  if (input.target !== null && (!ROLE_IDS.includes(input.target) || input.target === role)) fail('请选择其他角色或公开发送。');
  if (!['player', 'llm'].includes(source)) fail('消息来源无效。');
  if (game.messages.filter(message => message.round === game.round && message.from === role).length >= 2) fail('本回合最多发送2条消息。');
  const next = copy(game);
  next.messages.push({ id: `m${next.messages.length + 1}`, round: game.round, from: role, to: input.target, content: input.content, source });
  next.version++;
  return next;
}

export function proposeDeal(game, role, input) {
  requireStage(game, 'negotiation', role);
  const commitments = input?.commitments;
  if (!commitments || typeof commitments !== 'object' || Array.isArray(commitments)) fail('协议须包含有效行动承诺。');
  const participants = Object.keys(commitments);
  if (participants.length < 2 || participants.length > 4 || !participants.includes(role) || participants.some(p => !ROLE_IDS.includes(p))) fail('协议须由包含发起者的2至4方参加。');
  if (participants.some(p => ['PASS','S4'].includes(commitments[p]) || !isLegal(game, p, commitments[p]))) fail('协议须承诺本回合合法的非PASS、非灰色交付行动。');
  if (length(input.text) < 0 || length(input.text) > 300) fail('协议说明不得超过300字。');
  if (currentDeals(game).some(deal => deal.proposer === role)) fail('本回合最多发起1份协议。');
  if (signed(game, role)) fail('本回合已签署生效协议。');
  const next = copy(game);
  next.deals.push({ id: `d${next.deals.length + 1}`, round: game.round, proposer: role, participants:participants, commitments: copy(commitments), text: input.text, accepted: [role], status: 'pending' });
  next.version++;
  return next;
}

export function respondDeal(game, role, input) {
  requireStage(game, 'signing', role);
  const index = game.deals.findIndex(deal => deal.id === input?.dealId && deal.round === game.round);
  const deal = game.deals[index];
  if (!deal || deal.status !== 'pending' || !has(deal.commitments, role) || deal.accepted.includes(role) || typeof input.accept !== 'boolean') fail('该协议当前无法回应。');
  const next = copy(game);
  const updated = next.deals[index];
  if (!input.accept) updated.status = 'rejected';
  else {
    updated.accepted.push(role);
    const participants = Object.keys(updated.commitments);
    if (participants.every(p => updated.accepted.includes(p))) updated.status = participants.some(p => signed(game, p)) ? 'conflict' : 'effective';
  }
  next.version++;
  return next;
}

export function ready(game, role) {
  validRole(role);
  if (!['negotiation', 'signing'].includes(game.phase)) fail('当前阶段无需确认。');
  if (game.readyRoles.includes(role)) return game;
  const next = copy(game);
  next.readyRoles.push(role);
  if (next.readyRoles.length === 4) {
    next.readyRoles = [];
    next.phase = game.phase === 'negotiation' ? 'signing' : 'actions';
    if (next.phase === 'actions') next.deals.forEach(deal => { if (deal.round === game.round && deal.status === 'pending') deal.status = 'expired'; });
  }
  next.version++;
  return next;
}

export function submitAction(game, role, actionId, source = 'player') {
  validRole(role);
  if (!['player', 'llm', 'timeout','fallback'].includes(source)) fail('行动来源无效。');
  if (game.phase !== 'actions') fail('当前阶段不能提交行动。');
  if (!isLegal(game, role, actionId)) fail('请选择本回合合法行动。');
  if (has(game.actions, role)) {
    if (game.actions[role] === actionId) return game;
    fail('行动已秘密提交，不可更改。');
  }
  const next = copy(game);
  next.actions[role] = actionId;
  next.actionSources[role] = source;
  next.version++;
  return ROLE_IDS.every(p => has(next.actions, p)) ? settle(next) : next;
}

// Integer hundredths preserve simultaneous effects until the single final rounding.
const normalize = (key,n) => key==='P' ? clamp(Math.round(n),2) : clamp(Math.floor((Math.round(n*100)+5)/10)/10);
const effectiveT = state => Math.max(0,Math.round(state.T*100)-Math.max(0,Math.round(state.S*100)-200)/2)/100;
function mix(seed) {let x=seed>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return (x^(x>>>16))>>>0;}
const roundSeed = (seed,round) => mix(seed^Math.imul(round,0x9e3779b9));
const roll = (seed,lane) => mix(seed^lane)/4294967296;
function outcome(start,a,backlash,caught) {
 const hundredths=Object.fromEntries(METRICS.map(k=>[k,0])),effects=[];
 const add=(rule,description,delta,privateAS=false)=>{effects.push({rule,description,delta,privateAS});for(const k of METRICS)hundredths[k]+=Math.round((delta[k]||0)*100);};
 const leverage=1+start.A/5,baseCost=start.S>=3?-.5:-1;
 if(a.US==='U1')add('U1','美国收紧管制；同盟杠杆按回合开始协调度计算，研发缓冲及已有材料压力计入成本。',{T:leverage,E:baseCost-(start.P>=1?.5:0)});
 if(a.US==='U2')add('U2','美国有限放宽，商业预期缓和降低国内压力；不表示中国解除材料限制。',{T:-1,E:1,P:-1});
 if(a.US==='U3') {add('U3','美国争取协调，付出商业成本。',{E:-.4});if(a.NL==='N3')add('U3+N3','美荷协调联动一次。',{A:2});else add('U3_RANDOM',backlash?'美方协调未获配合，随机反噬。':'美方协调未获配合，本轮没有反噬。',backlash?{A:-1}:{});}
 if(a.US==='U4')add('U4','美国加强合规执法，查获概率额外提高30个百分点。',{E:-.2});
 if(a.CN==='C1')add('C1','中国投资研发；本轮商业成本，下一回合开始自主能力提高。',{E:-.5});
 if(a.CN==='C2')add('C2','中国限制对美关键材料出口，提高美国压力，不直接改变技术获取难度。',{P:1,E:-.5});
 if(a.CN==='C3'){add('C3','中国提出中荷商业合作。',{A:-1,E:.4});if(a.NL==='N2')add('C3+N2','中荷商业合作与有限许可联动。',{E:.5});}
 if(a.CN==='C4')add('C4','中国放松关键材料限制。',{P:-1,E:.5});
 if(a.NL==='N1')add('N1','荷兰收紧设备许可；同盟杠杆及研发缓冲按回合开始值计算。',{T:leverage,A:1,E:baseCost});
 if(a.NL==='N2')add('N2','荷兰批准有限许可，协调度下降。',{A:-1});
 if(a.AS==='S1')add('N2+S1',a.NL==='N2'?'有限许可与合规订单联动一次。':'缺少当轮有限许可，订单未执行，发生准备成本。',a.NL==='N2'?{T:-1,E:1}:{E:-1},true);
 if(a.AS==='S2')add('S2','ASML开拓其他市场；技术难度上升不受杠杆放大。',{E:.5,T:1},true);
 if(a.AS==='S4') {add('S4',caught?'灰色交付被查获；商业损失、信用处罚及延迟技术处罚。':'灰色交付未被查获。',caught?{E:-2}:{T:-1,E:1.5},true);if(caught&&a.finalRound)add('S4_FINAL','终局查获的技术处罚在最终判胜前执行。',{T:1},true);if(caught&&a.US==='U4')add('U4_CAUGHT','合规执法查获灰色交付，协调度提高。',{A:.5});}
 const delta=Object.fromEntries(METRICS.map(k=>[k,hundredths[k]/100]));
 return {delta,effects,state:Object.fromEntries(METRICS.map(k=>[k,normalize(k,start[k]+delta[k])]))};
}
function chance(start,a,backlash,monitoring) {
 let tempA=start.A+(a.US==='U3'?(a.NL==='N3'?2:backlash?-1:0):0)+(a.CN==='C3'?-1:0)+(a.NL==='N1'?1:a.NL==='N2'?-1:0);
 tempA=clamp(tempA);return Math.min(1,(20+tempA*10+(a.US==='U4'?30:0)+(monitoring?20:0))/100);
}
function settle(next) {
 const a={...next.actions,finalRound:next.round===4},u3Roll=a.US==='U3'&&a.NL!=='N3'?roll(next.roundSeed,0x12345):null,greyRoll=a.AS==='S4'?roll(next.roundSeed,0xabcde):null;
 const backlash=a.US==='U3'&&a.NL!=='N3'&&u3Roll<.3;
 const probability=chance(next.roundStart,a,backlash,next.monitoring),caught=a.AS==='S4'&&greyRoll<probability;
 const result=outcome(next.roundStart,a,backlash,caught);next.state=result.state;
 if(a.CN==='C1'){next.pendingResearch.push({dueRound:next.round+1,amount:1});next.researchUses++;}
 if(caught&&next.round<4)next.pendingPenalties.push({dueRound:next.round+1,amount:1});
 const creditDelta=record(0);if(caught)creditDelta.AS--;
 for(const deal of currentDeals(next)) {
  if(deal.status!=='effective')continue;
  deal.fulfillment=Object.fromEntries(deal.participants.map(r=>[r,a[r]===deal.commitments[r]]));
  const kept=deal.participants.every(r=>deal.fulfillment[r]);
  for(const r of deal.participants){creditDelta[r]+=deal.fulfillment[r]?1:-1;if(kept)next.fulfilledDeals[r]++;}
  deal.status=kept?'fulfilled':'breached';
 }
 for(const r of ROLE_IDS)next.credit[r]=clamp(next.credit[r]+creditDelta[r],2);
 if(caught&&next.credit.AS===0)next.monitoring=true;
 const randomRecord={round:next.round,seed:next.roundSeed,u3Roll,greyRoll,probability,backlash,caught};next.randomRecords.push(randomRecord);
 next.reportHistory.push(copy({round:next.round,roundStart:next.roundStart,actions:next.actions,sources:next.actionSources,...result,deals:currentDeals(next),credit:next.credit,fulfilledDeals:next.fulfilledDeals,caught,randomRecord}));
 next.phase=next.round===4?'finished':'report';return next;
}

export function resolveRound(game, round = game.round) {
  if (game.reportHistory.some(report => report.round === round)) return game;
  if (round !== game.round || game.phase !== 'actions') fail('当前回合无法结算。');
  if (Object.keys(game.actions).length !== 4 || ROLE_IDS.some(role => !isLegal(game, role, game.actions[role]) || !['player', 'llm', 'timeout','fallback'].includes(game.actionSources[role]))) fail('须由四方提交合法行动后才能结算。');
  const next = copy(game);
  next.version++;
  return settle(next);
}

export function advanceRound(game) {
  if (game.phase !== 'report' || game.round >= 4) fail('当前不能开始下一回合。');
  const next = copy(game);
  next.round++;
  const research = next.pendingResearch.filter(item => item.dueRound === next.round);
  next.state.S=normalize('S',next.state.S+research.reduce((sum,item)=>sum+item.amount,0));
  next.state.T=normalize('T',next.state.T+next.pendingPenalties.filter(item=>item.dueRound===next.round).reduce((sum,item)=>sum+item.amount,0));
  next.pendingPenalties=next.pendingPenalties.filter(item=>item.dueRound>next.round);
  next.roundSeed=roundSeed(next.seed,next.round);
  next.pendingResearch = next.pendingResearch.filter(item => item.dueRound > next.round);
  next.roundStart = copy(next.state);
  next.actions = {};
  next.actionSources = {};
  next.readyRoles = [];
  next.phase = 'negotiation';
  next.version++;
  return next;
}

function projectDeal(deal,viewer) {
 const publicPart={id:deal.id,round:deal.round,proposer:deal.proposer,participants:deal.participants,status:deal.status};
 return deal.participants.includes(viewer)?{...publicPart,commitments:deal.commitments,text:deal.text,accepted:deal.accepted,...(deal.fulfillment?{fulfillment:deal.fulfillment}:{})}:publicPart;
}
function projectReport(report,viewer) {
 const canSeeAS=viewer==='AS'||report.caught;
 const effects=report.effects.filter(e=>!e.privateAS||canSeeAS).map(({rule,description,delta})=>({rule,description,delta}));
 if(!canSeeAS)effects.push({rule:'UNDISCLOSED',description:'ASML本轮行动未公开；可根据公开指标自行推断。',delta:{}});
 const sources={...report.sources};if(!canSeeAS)delete sources.AS;
 return {round:report.round,roundStart:report.roundStart,state:report.state,delta:report.delta,actions:{...report.actions,AS:canSeeAS?report.actions.AS:'hidden'},sources,effects,deals:report.deals.map(d=>projectDeal(d,viewer)),credit:report.credit,fulfilledDeals:report.fulfilledDeals};
}
export function getSnapshot(game,viewer) {
 validRole(viewer);const ownDeal=signed(game,viewer);
 const snapshot={version:game.version,round:game.round,totalRounds:4,phase:game.phase,state:game.state,roundStart:game.roundStart,playerRole:viewer,
  roles:ROLE_IDS.map(id=>({id,name:ROLE_INFO[id][0],description:ROLE_INFO[id][1],credit:game.credit[id],fulfilledDeals:game.fulfilledDeals[id],possibleGoals:GOAL_CATALOGUE[id].map(({id:goalId,label})=>({id:goalId,label}))})),
  goalCatalogue:GOAL_CATALOGUE,ownGoal:game.goals[viewer],legalActions:legalActions(game,viewer),messages:game.messages.filter(m=>m.to===null||m.from===viewer||m.to===viewer),deals:game.deals.map(d=>projectDeal(d,viewer)),
  readyRoles:game.readyRoles,submittedRoles:ROLE_IDS.filter(r=>has(game.actions,r)),messageCount:game.messages.filter(m=>m.round===game.round&&m.from===viewer).length,proposalsMade:currentDeals(game).filter(d=>d.proposer===viewer).length,
  reportHistory:game.reportHistory.map(r=>projectReport(r,viewer)),pendingResearch:game.pendingResearch,researchUses:game.researchUses,monitoring:game.monitoring,pendingPenalties:game.pendingPenalties};
 if(viewer==='AS')snapshot.ownGreyRisk=Math.min(1,.2+game.roundStart.A*.1+(game.monitoring?.2:0));
 if(has(game.actions,viewer))snapshot.ownAction=game.actions[viewer];if(ownDeal)snapshot.signedDealId=ownDeal.id;
 if(game.phase==='finished') {
  snapshot.revealedGoals=game.goals;
  snapshot.results=Object.fromEntries(ROLE_IDS.map(role=>{
   const values={...game.state,effectiveT:effectiveT(game.state)},conditionsMet=game.goals[role].conditions.map(c=>c.operator==='gte'?values[c.metric]>=c.value:values[c.metric]<=c.value);
   const substantiveVictory=conditionsMet.every(Boolean)&&game.credit[role]>=1,diplomaticVictory=substantiveVictory&&game.fulfilledDeals[role]>=1&&(role!=='US'||game.state.P<=1);
   return [role,{goal:game.goals[role],conditionsMet,credit:game.credit[role],fulfilledDeals:game.fulfilledDeals[role],substantiveVictory,diplomaticVictory,won:diplomaticVictory,effectiveT:values.effectiveT}];
  }));
 }
 return copy(snapshot);
}
export function getObservation(game,role) {
 const snapshot=getSnapshot(game,role);
 return {...snapshot,role:snapshot.roles.find(r=>r.id===role),actionCatalogue:copy(ACTIONS),rules:{version:'1.6',assumption:'所有数值是游戏假设，不构成现实政策预测。',
  metrics:{T:'先进技术获取难度，越高中国获取越难',A:'美荷政策协调度',E:'半导体整体商业收益，包括非中国市场',S:'中国技术自主能力',P:'美国国内产业压力；美国视为负面因素'},
  settlement:'以roundStart决定资格和杠杆：仅U1/N1的T增量乘1+A/5；S≥3时各自基础E成本减为0.5，U1的P≥1额外0.5成本不减。所有效果合计，T/A/E/S统一四舍五入1位并截断0..5，P整数0..2。C1下回合S+1最多3次第4回合禁用；N2需开始A<4，C4需开始P≥1。',
  risk:'查获概率=min(1,0.2+临时A*0.1+U4的0.3+此前重点监控0.2)。临时A包括确定性A变化和U3随机反噬，不含U4查获后A+0.5。U3无N3配合时30% A−1否则不变。S4查获信用−1、E−2、下回合T+1；第4回合在最终判胜前T+1。查获且合并协议处罚后的最终信用0触发永久重点监控一次。随机结果固定不可重抽。',
  agreements:'每轮最多发起1份并参与1份生效协议，2至4方各承诺本轮合法非PASS非S4行动。最后接受时原子锁定，冲突作废。条款只对参与者可见；其他人只见参与方/是否达成/履约状态。允许违约，逐人信用±1，所有人履约才计fulfilledDeals。S4查获额外信用−1合并后截断0..2。',
  privacy:'ASML历史行动默认未公开，仅查获S4公开；不可从effects/source/协议条款读取隐藏行动。私聊仅参与方可见。不得声称知道其他人抽中的目标或本轮密封选择。',
  victory:'第4回合末目标全部数值条件+信用≥1为实质胜利；再有至少1份全员履约协议为外交胜利，美国外交还需P≤1。US_SEC只看有效T=max(0,T−0.5*max(0,S−2))≥4，其他目标看原始T。',
  limits:'每方每回合最多2条100字消息、1份当轮协议提案；自由文本不改变数值或生成额外条款。'}};
}
export function chooseFallbackAction(game,role) {
 validRole(role);const promised=signed(game,role)?.commitments[role];
 if(promised&&isLegal(game,role,promised))return promised;
 const ownGoal=game.goals[role],start=game.roundStart,other=record('PASS');
 // Only own visible agreement terms are available; never use sealed actions, other goals or seeded future outcomes.
 const score=state=>{
  const values={...state,effectiveT:effectiveT(state)};
  const gap=ownGoal.conditions.reduce((n,c)=>n+Math.max(0,c.operator==='gte'?c.value-values[c.metric]:values[c.metric]-c.value),0);
  const interests=role==='US'?state.T+state.A+state.E-state.P*2:role==='CN'?state.S+state.E-state.T:role==='NL'?state.E+state.A:state.E;
  return {gap,interests};
 };
 let best;
 for(const action of legalActions(game,role).sort((a,b)=>a.id.localeCompare(b.id))) {
  const a={...other,[role]:action.id,finalRound:game.round===4};let gap=0,interests=0;
  const backlashCases=a.US==='U3'&&a.NL!=='N3'?[[false,.7],[true,.3]]:[[false,1]];
  for(const [backlash,weight] of backlashCases){const p=chance(start,a,backlash,game.monitoring),cases=a.AS==='S4'?[[true,p],[false,1-p]]:[[false,1]];
   for(const [caught,w] of cases){const state=outcome(start,a,backlash,caught).state;if(action.id==='C1'&&game.round<4)state.S=normalize('S',state.S+1);const s=score(state);gap+=s.gap*weight*w;interests+=s.interests*weight*w;}}
  // Goal deficit first, then role interest, then stable action ID. No invented economic state.
  if(!best||gap<best.gap-1e-9||(Math.abs(gap-best.gap)<1e-9&&interests>best.interests+1e-9))best={id:action.id,gap,interests};
 }
 return best.id;
}
