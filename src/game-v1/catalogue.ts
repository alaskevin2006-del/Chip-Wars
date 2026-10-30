import type { ActionCard, Metric, Role } from './types';
export const roles: Role[] = ['US','CN','NL','AS'];
export const names: Record<Role,string> = {US:'美国政府',CN:'中国政府',NL:'荷兰政府',AS:'ASML'};
export const avatarRoles = {US:'USA',CN:'China',NL:'Netherlands',AS:'ASML'} as const;
export const metrics: {id:Metric;name:string;explanation:string}[] = [
  {id:'A',name:'技术合作机会',explanation:'合法跨境技术合作的可行程度；高则合作空间大'},
  {id:'B',name:'商业活力',explanation:'四方半导体业务的整体商业环境；高则交易机会多'},
  {id:'H',name:'美荷协调',explanation:'美国与荷兰的出口管制和产业政策协调程度'},
  {id:'R',name:'中国自主技术',explanation:'中国自主研发能力的长期积累'},
];
export const cards: Record<Role,ActionCard[]> = {
 US:[{id:'U1',role:'US',name:'收紧美国技术管制',description:'A −1，B −1'},{id:'U2',role:'US',name:'有限放宽管制',description:'A +1，B +1'},{id:'U3',role:'US',name:'与荷兰开展产业合作',description:'B +1，H +1'}],
 CN:[{id:'C1',role:'CN',name:'投资自主研发',description:'下回合开始 R +1；最多 2 次，第 4 回合不可选'},{id:'C2',role:'CN',name:'限制关键材料出口',description:'B −2'},{id:'C3',role:'CN',name:'提供市场合作便利',description:'B +1'}],
 NL:[{id:'N1',role:'NL',name:'收紧荷兰设备许可',description:'A −1，B −1，H +1'},{id:'N2',role:'NL',name:'批准本轮有限许可',description:'H −1；须 ASML 同轮选择 S1 才产生订单效果'},{id:'N3',role:'NL',name:'提议美荷联合项目',description:'仅美国同轮选择 U3 时，额外 B +1，H +1'}],
 AS:[{id:'S1',role:'AS',name:'执行对华合规订单',description:'荷兰同轮选择 N2：A +1，B +2；否则不交付，B −1'},{id:'S2',role:'AS',name:'拓展其他市场',description:'B +1，A −1'},{id:'S3',role:'AS',name:'维护现有合规客户',description:'回合开始 A ≥3 时 B +1；否则无效果'}],
};
export const cardName = (id:string) => Object.values(cards).flat().find(card=>card.id===id)?.name ?? '维持现状';
