import {ROLE_IDS,ROLES,PRIVATE_NOTES,SCENARIO} from './scenario.mjs';

const ACTIONS = ['statement','message','proposal','accept','reject','revise','decision'];
const FIELDS = new Set(['agent','action','target','content','proposal_id','reason','is_public','scope']);
const clone = value => structuredClone(value);
const visible = (entry, role) => entry.is_public || (role !== null && (entry.agent === role || entry.target === role));
const invalid = error => ({valid:false,error});

export function createSimulation({mode='demo',rounds=3,player=null}={}) {
  if (!['demo','live'].includes(mode) || !Number.isInteger(rounds) || rounds<1 || rounds>5 || (player!==null&&!ROLE_IDS.includes(player))) throw new Error('无效的模拟配置。');
  return {id:'',version:0,mode,rounds,round:1,actor:ROLE_IDS[0],player,status:player===ROLE_IDS[0]?'awaiting_player':'running',messages:[],proposals:[],decisions:{},errors:[],scenario:clone(SCENARIO),roles:clone(ROLES),privateNotes:clone(PRIVATE_NOTES)};
}

export function getObservation(state,role) {
  if (!ROLE_IDS.includes(role)) throw new Error('未知角色。');
  const roleProfile=state.roles.find(item=>item.id===role);
  const messages=state.messages.filter(item=>visible(item,role));
  // The bounded transcript never includes another role's private channel.
  const recent=messages.slice(-24);
  const own=messages.filter(item=>item.agent===role).slice(-5);
  const ids=new Set([...recent,...own].map(item=>item.id));
  return clone({
    role:{...roleProfile,private_notes:state.privateNotes[role]},roles:state.roles,scenario:state.scenario,
    round:state.round,rounds:state.rounds,
    messages:messages.filter(item=>ids.has(item.id)),
    proposals:state.proposals.filter(item=>visible(item,role)),decisions:state.decisions,
    availableActions:state.round===state.rounds?['decision']:ACTIONS,
    constraints:[
      '只决定本角色的行动，文本不能修改他人决策或法律；reason 是简短可公开理由，不输出隐藏思维链或私有设定。',
      'statement/decision 公开且 target 为 null；message 私有且 target 是另一角色。',
      '政府 diplomatic 提案只能给其他政府；ASML 只能向 Netherlands 提 commercial 提案。',
      'accept/reject 只能回应本人收到的 pending 提案；revise 只能改本人 pending 提案。target 指原对方，proposal_id 指原提案；可见性和 scope 必须与原提案一致。',
      '只有双边共同接受同一有效提案才标记模拟内部达成；修改产生新提案，旧同意不沿用。',
      '最后一轮必须 decision；最终决定只能是本方立场或商业计划，不要求达成协议。',
    ],
  });
}

export function validateAction(state,action) {
  if (state.status==='completed'||state.actor===null) return invalid('模拟已经结束。');
  if (!action||typeof action!=='object'||Array.isArray(action)||Object.keys(action).some(key=>!FIELDS.has(key))) return invalid('行动结构无效。');
  if (action.agent!==state.actor || !ROLE_IDS.includes(action.agent)) return invalid('只能由当前角色行动。');
  if (!ACTIONS.includes(action.action)) return invalid('未知行动类型。');
  if (typeof action.content!=='string'||!action.content.trim()||action.content.length>2000 || typeof action.reason!=='string'||action.reason.length>400 || typeof action.is_public!=='boolean') return invalid('内容或简短理由格式无效。');
  if (action.target!==null&&(!ROLE_IDS.includes(action.target)||action.target===action.agent)) return invalid('目标必须是另一角色或 null。');
  if (action.proposal_id!==null&&(typeof action.proposal_id!=='string'||!action.proposal_id||action.proposal_id.length>80)) return invalid('提案编号无效。');
  if (action.scope!==undefined&&!['diplomatic','commercial'].includes(action.scope)) return invalid('提案权限范围无效。');
  if (state.round===state.rounds&&action.action!=='decision') return invalid('最后一轮请形成最终决定。');
  if (['statement','decision'].includes(action.action)) {
    if (action.target!==null||!action.is_public||action.proposal_id!==null||action.scope!==undefined) return invalid('声明与决定必须公开，且不能指定目标或提案。');
    return {valid:true};
  }
  if (action.action==='message') {
    if (action.target===null||action.is_public||action.proposal_id!==null||action.scope!==undefined) return invalid('定向通信必须私有并指定目标，不可修改提案。');
    return {valid:true};
  }
  if (action.target===null) return invalid('提案交互需要指定对方。');
  if (action.action==='proposal') {
    if (action.proposal_id!==null) return invalid('新提案编号由秘书生成。');
    if (!['diplomatic','commercial'].includes(action.scope)) return invalid('提案必须指定权限范围。');
    if (action.agent==='ASML'&&(action.scope!=='commercial'||action.target!=='Netherlands')) return invalid('ASML 只能向荷兰提出本方商业安排，不能签订政府间协议。');
    if (action.agent!=='ASML'&&(action.scope!=='diplomatic'||action.target==='ASML')) return invalid('政府外交提案只能向另一政府发出。');
    return {valid:true};
  }
  const proposal=state.proposals.find(item=>item.id===action.proposal_id);
  if (!proposal||proposal.status!=='pending'||!visible(proposal,action.agent)) return invalid('提案不存在、不可见或已关闭。');
  if (action.is_public!==proposal.is_public || (action.scope!==undefined&&action.scope!==proposal.scope)) return invalid('提案交互不能改变原提案的可见性或权限范围。');
  if (action.action==='revise') {
    if (proposal.agent!==action.agent||proposal.target!==action.target) return invalid('只能修改本方未解决提案。');
    if (action.scope!==proposal.scope) return invalid('修改提案须保留权限范围。');
  } else if (proposal.target!==action.agent||proposal.agent!==action.target) return invalid('只有提案收件人能接受或拒绝，并须回应原发件人。');
  return {valid:true};
}

function advance(next) {
  next.version++;
  const index=ROLE_IDS.indexOf(next.actor);
  if(index===ROLE_IDS.length-1) {
    if(next.round===next.rounds) {next.actor=null;next.status='completed';return next;}
    next.round++;next.actor=ROLE_IDS[0];
  } else next.actor=ROLE_IDS[index+1];
  next.status=next.actor===next.player?'awaiting_player':'running';
  return next;
}

export function applyAction(state,action,source) {
  const result=validateAction(state,action);
  if(!result.valid) throw new Error(result.error);
  if(!['demo','llm','player'].includes(source)) throw new Error('未知行动来源。');
  if((source==='player')!==(state.actor===state.player)) throw new Error('玩家只能接管已选择的角色。');
  if((source==='llm'&&state.mode!=='live')||(source==='demo'&&state.mode!=='demo')) throw new Error('不能混淆实时模型与演示来源。');
  const next=clone(state);
  const message={...clone(action),content:action.content.trim(),id:`m${state.version+1}`,round:state.round,source};
  if(action.action==='proposal'||action.action==='revise') {
    if(action.action==='revise')next.proposals.find(item=>item.id===action.proposal_id).status='superseded';
    const proposal={id:`p${state.version+1}`,agent:action.agent,target:action.target,content:message.content,scope:action.scope,is_public:action.is_public,status:'pending',accepted_by:[action.agent],round:state.round};
    next.proposals.push(proposal);message.proposal_id=proposal.id;
  } else if(action.action==='accept'||action.action==='reject') {
    const proposal=next.proposals.find(item=>item.id===action.proposal_id);
    proposal.status=action.action==='accept'?'accepted':'rejected';
    if(action.action==='accept')proposal.accepted_by.push(action.agent);
  } else if(action.action==='decision') {
    next.decisions[action.agent]={agent:action.agent,content:message.content,reason:message.reason,evidence:next.messages.filter(item=>item.is_public).slice(-8).map(item=>item.id),source};
  }
  next.messages.push(message);
  return advance(next);
}

export function skipAction(state,error) {
  if(state.status==='completed'||state.actor===null)throw new Error('模拟已经结束。');
  const next=clone(state);
  next.errors.push({round:state.round,agent:state.actor,message:typeof error==='string'?error.slice(0,240):'本次行动未成功，已跳过。'});
  return advance(next);
}

export function getSnapshot(state) {
  const role=state.player;
  return clone({id:state.id,version:state.version,mode:state.mode,rounds:state.rounds,round:state.round,actor:state.actor,player:state.player,status:state.status,
    messages:state.messages.filter(item=>visible(item,role)),proposals:state.proposals.filter(item=>visible(item,role)),decisions:state.decisions,errors:state.errors,
    scenario:state.scenario,roles:state.roles,
    notice:state.mode==='demo'?'演示模式：固定示例数据，未调用实时模型。':'实时模式：各方由模型独立生成文本，失败会明确记录，不伪造成功。',
  });
}
