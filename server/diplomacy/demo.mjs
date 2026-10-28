// Deliberately scripted examples. Never used as a fallback for failed live calls.
export function decideDemo(observation) {
  const {role,round,rounds,proposals,messages}=observation;
  const base={agent:role.id,action:'statement',target:null,proposal_id:null,is_public:true,reason:'演示示例：展示各方目标与权限边界。'};
  if(round===rounds) {
    const agreement=proposals.some(item=>item.status==='accepted'&&(item.agent===role.id||item.target===role.id));
    const final={
      USA:'本方维持安全审查立场，继续通过证据交流争取合作；不以外交声明替代荷兰独立审批。',
      China:'本方继续反对不当扩大限制，保留对话与合法产业合作诉求；尚未取得新的设备许可。',
      Netherlands:'本方保留独立许可审查，继续听取安全证据与企业意见；此次会谈不自动修改适用法律。',
      ASML:'本企业继续按适用法律申请许可，并向荷兰反馈过渡安排需求；不承诺未经许可的交付。',
    };
    return {...base,action:'decision',content:final[role.id],reason:agreement?'演示示例：参考已达成的模拟内部沟通安排；它不是现实许可或法律变更。':'演示示例：各方诉求仍有分歧，未虚构新的有效协议。'};
  }
  const incoming=proposals.find(item=>item.target===role.id&&item.status==='pending');
  if(incoming)return {...base,action:'accept',target:incoming.agent,proposal_id:incoming.id,is_public:incoming.is_public,content:'同意在模拟内部建立这一沟通安排。各方独立法律程序与许可权限保持完整。',reason:'演示示例：只同意沟通程序，不代表同意扩大管制或签发许可。'};
  if(round===1&&role.id==='USA')return {...base,action:'proposal',target:'Netherlands',scope:'diplomatic',content:'建议建立安全证据交流与许可政策磋商窗口。荷兰保留独立审查权，管制范围须另行依法讨论。'};
  if(role.id==='China')return {...base,content:messages.some(item=>item.agent==='USA')?'注意到美方的协调主张。本方反对限制继续扩大，建议建立对等对话并保护合法商业往来。':'本方主张保护合法技术交流与产业发展空间，愿意讨论对等、透明的沟通机制。'};
  if(role.id==='Netherlands')return {...base,content:'本方需要审视安全证据、适用制度与产业意见，尚未决定扩大限制；外部提议不直接改变许可。'};
  if(role.id==='ASML')return {...base,content:'企业希望明确许可要求、申请程序与过渡安排，将继续合规经营；政府许可不能由企业自行解除。'};
  return {...base,content:'本方继续寻求安全证据交流和政策协调，并关注盟友自主审批及企业合法经营的关切。'};
}
