export type Role = 'USA'|'China'|'Netherlands'|'ASML';
export type ActionKind = 'statement'|'message'|'proposal'|'accept'|'reject'|'revise'|'decision';
export interface DiplomacyAction { agent:Role; action:ActionKind; target:Role|null; content:string; proposal_id:string|null; reason:string; is_public:boolean; scope?:'diplomatic'|'commercial' }
export interface Message extends DiplomacyAction {id:string;round:number;source:'demo'|'llm'|'player'}
export interface Proposal {id:string;agent:Role;target:Role;content:string;scope:'diplomatic'|'commercial';is_public:boolean;status:'pending'|'accepted'|'rejected'|'superseded';accepted_by:Role[];round:number}
export interface Decision {agent:Role;content:string;reason:string;evidence:string[];source:'demo'|'llm'|'player'}
export interface RoleProfile {id:Role;name:string;kind:string;goal:string;color:string}
export interface Scenario {title:string;description:string;facts:{label:string;text:string;url:string}[];assumptions:string[]}
export interface Snapshot {id:string;version:number;mode:'demo'|'live';rounds:number;round:number;actor:Role|null;player:Role|null;status:'running'|'paused'|'awaiting_player'|'completed';messages:Message[];proposals:Proposal[];decisions:Partial<Record<Role,Decision>>;errors:{round:number;agent:Role;message:string}[];scenario:Scenario;roles:RoleProfile[];notice?:string}
