import type { ActionCard, Metric, Metrics, Role } from './types';
export const roles: Role[] = ['US','CN','NL','AS'];
export const names: Record<Role,string> = {US:'美国政府',CN:'中国政府',NL:'荷兰政府',AS:'ASML'};
export const avatarRoles = {US:'USA',CN:'China',NL:'Netherlands',AS:'ASML'} as const;
export const metrics: {id:Metric;name:string;explanation:string;max:number}[] = [
 {id:'T',name:'先进技术获取难度',explanation:'越高，中国越难获得先进芯片技术与设备',max:5},
 {id:'A',name:'美荷政策协调度',explanation:'越高，美荷越协调，荷兰越难独立放宽许可',max:5},
 {id:'E',name:'整体商业收益',explanation:'四方整体收益空间，包含非中国市场',max:5},
 {id:'S',name:'中国技术自主能力',explanation:'越高，越能缓冲外部限制；研发下轮生效',max:5},
 {id:'P',name:'美国国内产业压力',explanation:'材料供应及企业成本压力；不等于美国已让步',max:2},
];
export const effectiveT=(state:Metrics)=>Math.max(0,state.T-.5*Math.max(0,state.S-2));
export const metricLabel=(metric:string)=>metric==='effectiveT'?'有效 T':metric;
const card=(role:Role,id:ActionCard['id'],name:string,description:string):ActionCard=>({role,id,name,description});
export const cards: Record<Role,ActionCard[]> = {
 US:[card('US','U1','收紧技术管制','T 增加 1 × (1 + 回合开始 A/5)，E −1；开始时 S ≥3，基础 E 损失改为 −0.5；开始时 P ≥1 再 E −0.5。'),card('US','U2','有限放宽管制','T −1，E +1，P −1；降低商业界施压，不代表中国解除材料限制。'),card('US','U3','争取荷兰协调','E −0.4；荷兰同轮配合美方协调：A +2（只计一次）。否则 70% A 不变、30% A −1。'),card('US','U4','加强合规执法','E −0.2；当轮灰色交付查获概率 +30 个百分点，若查获，再 A +0.5。')],
 CN:[card('CN','C1','投资自主研发','本轮 E −0.5，下一回合开始 S +1；每局最多 3 次，第 4 回合不可选。'),card('CN','C2','限制对美关键材料出口','P +1，E −0.5；不会直接改变 T，也不强制美国让步。'),card('CN','C3','提出中荷商业合作','A −1，E +0.4；荷兰同轮批准有限许可，再 E +0.5。'),card('CN','C4','放松关键材料出口限制','仅回合开始 P ≥1 可选。P −1，E +0.5，可作为谈判让步。')],
 NL:[card('NL','N1','收紧设备许可','T 增加 1 × (1 + 回合开始 A/5)，E −1，A +1；开始时 S ≥3，E 损失改为 −0.5。'),card('NL','N2','批准有限许可','仅回合开始 A <4 可选，A −1；ASML 同轮执行合规订单：合计 T −1、E +1，只结算一次。'),card('NL','N3','配合美方协调','无独立效果；美国同轮争取协调时，合计 A +2，只结算一次。')],
 AS:[card('AS','S1','执行对华合规订单','荷兰同轮批准有限许可：合计 T −1、E +1，只计一次；否则订单未执行，E −1。'),card('AS','S2','开拓其他市场','E +0.5，T +1；技术难度增量不受同盟杠杆放大。'),card('AS','S4','灰色渠道交付（高风险）','无需荷兰许可，不可写入正式协议。未查获 T −1、E +1.5；查获 E −2、信用 −1、下轮 T +1（第 4 轮在判胜前追加）。查获率：20% + 临时 A ×10% + 美国执法 30个百分点 + 已重点监控 20个百分点，上限100%。查获且最终信用首次降为0则永久重点监控。')],
};
export const cardName = (id:string) => id==='hidden'?'未公开':Object.values(cards).flat().find(card=>card.id===id)?.name ?? '维持现状';
