export const ROLE_IDS = Object.freeze(['USA', 'China', 'Netherlands', 'ASML']);

// Profiles and private notes are fictional scenario assumptions, not inferred real intentions.
export const ROLES = Object.freeze([
  {id:'USA',name:'美国政府',kind:'政府',goal:'维持技术优势，争取盟友合作，兼顾企业利益。',color:'#5b88bb'},
  {id:'China',name:'中国政府',kind:'政府',goal:'维护技术发展空间，争取公平、稳定的经贸合作。',color:'#d77667'},
  {id:'Netherlands',name:'荷兰政府',kind:'政府',goal:'平衡安全合作、监管自主与本国产业利益。',color:'#e5aa57'},
  {id:'ASML',name:'ASML 企业',kind:'企业',goal:'维护合法市场准入、监管透明度与经营稳定。',color:'#7ca28b'},
]);

export const PRIVATE_NOTES = Object.freeze({
  USA:['【虚构私有设定】希望合作方案有清晰的审查与复议程序；盟友拒绝会带来协调成本，但不接受以外交替代法律程序。'],
  China:['【虚构私有设定】可讨论透明、对等的沟通安排；避免作出无法由本方执行的技术或商业保证。'],
  Netherlands:['【虚构私有设定】愿意听取安全证据和企业意见；尚未决定扩大限制，要求保留独立许可审查。'],
  ASML:['【虚构私有设定】更看重清晰的许可规则与过渡安排；可调整自身合规计划，但不能替政府作许可决定。'],
});

export const SCENARIO = Object.freeze({
  title:'先进半导体设备出口管制争端',
  description:'【虚构后续谈判】美国提议荷兰进一步扩大特定先进设备的管制合作。中国反对限制扩大，荷兰尚未决定，ASML 正寻求监管清晰度。结果由互动产生，不预设任何一方让步。',
  facts:[
    {label:'历史背景 · 2023-10-17',text:'美国 BIS 公布先进计算和半导体制造设备出口管制更新。这是历史背景，不是本场景对现行全部法律的完整陈述。',url:'https://www.bis.gov/press-release/commerce-strengthens-restrictions-advanced-computing-semiconductors-semiconductor-manufacturing-equipment'},
    {label:'历史背景 · 2024-09-06',text:'荷兰政府宣布扩大部分先进半导体制造设备的国家授权要求，涉及特定 DUV 光刻设备。',url:'https://www.government.nl/latest/news/2024/09/06/the-netherlands-expands-export-control-measure-advanced-semiconductor-manufacturing-equipment'},
    {label:'历史背景 · 2024-09-06',text:'ASML 就荷兰政府更新的出口许可要求发布声明；企业需要遵守适用的许可制度。',url:'https://www.asml.com/news/press-releases/2024/dutch-governments-updated-export-license-requirement'},
  ],
  assumptions:[
    '后续谈判、角色目标、私有信息和每轮调度均为模拟设定，不构成现实政策预测。',
    '美国不能代荷兰修改法律；ASML 不能解除政府管制；中国声明不会自动产生经济效果。',
    '协议仅表示模拟内部双方同意文本，不表示现实法律、许可证或政府间协议已经生效。',
    '实时模式内容由 LLM 生成；演示模式为明确标注的固定示例，不冒充实时推演。',
  ],
});
