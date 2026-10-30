export type Role = 'US'|'CN'|'NL'|'AS';
export type Metric = 'T'|'A'|'E'|'S'|'P';
export type Metrics = Record<Metric,number>;
export type ActionId = 'U1'|'U2'|'U3'|'U4'|'C1'|'C2'|'C3'|'C4'|'N1'|'N2'|'N3'|'S1'|'S2'|'S4'|'PASS';
export type Phase = 'negotiation'|'signing'|'actions'|'report'|'finished';
export interface Condition {metric:Metric|'effectiveT';operator:'gte'|'lte';value:number}
export interface GoalCard {id:string;role:Role;label:string;description:string;conditions:Condition[]}
export interface ActionCard {id:ActionId;role:Role;name:string;description:string}
export interface PreviewBranch {label:string;probability?:number;state:Metrics;delta:Metrics;delayed:{metric:Metric;amount:number;when:string}[];creditDelta?:number}
export interface ActionPreview {actionId:ActionId;summary:string;assumptions:string[];branches:PreviewBranch[];riskIsEstimate?:boolean}
export interface PublicRole {id:Role;name:string;description:string;credit:number;fulfilledDeals:number;possibleGoals:{id:string;label:string}[]}
export interface Message {id:string;round:number;from:Role;to:Role|null;content:string;source:'player'|'llm'}
export type Commitments = Partial<Record<Role,ActionId>>;
export interface Deal {id:string;round:number;proposer:Role;participants:Role[];commitments?:Commitments;text?:string;accepted?:Role[];status:'pending'|'effective'|'rejected'|'expired'|'conflict'|'fulfilled'|'breached';fulfillment?:Partial<Record<Role,boolean>>}
export interface RoundReport {round:number;roundStart:Metrics;actions:Record<Role,ActionId|'hidden'>;sources:Partial<Record<Role,'player'|'llm'|'timeout'|'fallback'>>;delta:Metrics;state:Metrics;effects:{rule:string;description:string;delta:Partial<Metrics>}[];deals:Deal[];credit:Record<Role,number>;fulfilledDeals:Record<Role,number>;adjustment?:Metrics}
export interface Result {goal:GoalCard;conditionsMet:boolean[];fulfilledDeals:number;credit:number;won:boolean;substantiveVictory:boolean;diplomaticVictory:boolean;effectiveT:number}
export interface Notice {round:number;role?:Role;task?:string;message:string}
export interface Snapshot {id:string;version:number;round:number;totalRounds:4;phase:Phase;state:Metrics;roundStart:Metrics;playerRole:Role;roles:PublicRole[];goalCatalogue:Record<Role,GoalCard[]>;ownGoal:GoalCard;legalActions:ActionCard[];messages:Message[];deals:Deal[];readyRoles:Role[];submittedRoles:Role[];ownAction?:ActionId;signedDealId?:string;messageCount:number;proposalsMade:number;reportHistory:RoundReport[];revealedGoals?:Record<Role,GoalCard>;results?:Record<Role,Result>;aiStatus?:{busy:boolean;role?:Role;task?:string};deadlineAt?:number;notices:Notice[];pendingResearch?:{dueRound:number;amount:number}[];researchUses?:number;monitoring?:boolean;pendingPenalties?:{dueRound:number;amount:number}[];ownGreyRisk?:number;actionPreviews?:ActionPreview[]}
export interface Session {id:string;token:string;snapshot:Snapshot}
export interface NegotiationInput {messages:{content:string;target:Role|null}[];proposal:null|{commitments:Commitments;text:string}}
export interface SigningInput {responses:{dealId:string;accept:boolean}[]}
export interface SecretaryAdvice {otherRequests:string[];possibleMotives:{text:string;uncertain:true}[];relevantActions:ActionId[];risks:string[]}

