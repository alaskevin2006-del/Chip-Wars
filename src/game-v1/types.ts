export type Role = 'US'|'CN'|'NL'|'AS';
export type Metric = 'T'|'A'|'E'|'S'|'P';
export type Metrics = Record<Metric,number>;
export type ActionId = 'U1'|'U2'|'U3'|'U4'|'C1'|'C2'|'C3'|'C4'|'N1'|'N2'|'N3'|'S1'|'S2'|'S4'|'PASS';
export type Phase = 'announcement'|'negotiation'|'signing'|'actions'|'report'|'finished';
export type TermId = 'Teff'|'A'|'E'|'S'|'Access'|'LowA'|'LowP';
// A private policy preference: it decides what a state is worth to you, never what you may do.
export interface Preference {id:string;role:Role;label:string;blurb:string;description:string;weights:Partial<Record<TermId,number>>}
export interface Milestone {id:string;role:Role;label:string;description:string;conditionsMet:boolean[];earned:boolean}
// Where a party stands on the scale the verdict uses: relative improvement over the starting state.
export interface Standing {prefId:string;score:number;utility:number;delta:number;deltaThreshold:number;substantiveVictory:boolean;diplomaticVictory:boolean;credit:number;fulfilledDeals:number;won:boolean;initial:number;terms:Record<TermId,number>;preference:Preference}
export interface ActionCard {id:ActionId;role:Role;name:string;description:string}
export interface PreviewBranch {label:string;probability?:number;state:Metrics;delta:Metrics;delayed:{metric:Metric;amount:number;when:string}[];creditDelta?:number;fulfilledDelta?:number;utility?:number;deltaU?:number;substantive?:boolean;credit?:number;deals?:number;terms?:Record<TermId,number>}
export interface ActionPreview {actionId:ActionId;summary:string;assumptions:string[];branches:PreviewBranch[];riskIsEstimate?:boolean}
export interface PublicRole {id:Role;name:string;description:string;credit:number;fulfilledDeals:number;possiblePreferences:{id:string;label:string}[]}
export interface Message {id:string;round:number;from:Role;to:Role|null;content:string;source:'player'|'llm';stance?:'dove'|'hawk'|null}
export type Commitments = Partial<Record<Role,ActionId>>;
export interface PledgeConflict {role:Role;issue:IssueId;tone:Tone;level:CommitLevel}
export interface RoundBrief {id:string;round:number;focus?:{issue:string;by:string|null}|null;summary:string;moves:string;watch:string;source:'llm'|'template';arrangements?:{reached:number;kept:string[];broken:string[]};backing?:{measure:string;party:string;kind:string}[]}
export type ClaimKind='offer'|'consider'|'request'|'mention'|'refuse';
export interface Claim {id:string;round:number;from:Role;to:Role|null;owner:Role;actionId:ActionId;kind:ClaimKind}
export interface Deal {id:string;round:number;proposer:Role;participants:Role[];commitments?:Commitments;text?:string;accepted?:Role[];status:'pending'|'effective'|'rejected'|'expired'|'conflict'|'fulfilled'|'breached';fulfillment?:Partial<Record<Role,boolean>>;conflicts?:PledgeConflict[];backing?:{party:Role;action:ActionId;kind:ClaimKind|null;contact:boolean}[]}
export interface RoundReport {round:number;focusIssue?:IssueId|null;focusRole?:Role|null;roundStart:Metrics;actions:Record<Role,ActionId|'hidden'>;sources:Partial<Record<Role,'player'|'llm'|'timeout'|'fallback'>>;delta:Metrics;state:Metrics;effects:{rule:string;description:string;delta:Partial<Metrics>}[];deals:Deal[];credit:Record<Role,number>;fulfilledDeals:Record<Role,number>;adjustment?:Metrics;beliefShifts?:{target:Role;from:number;to:number;reason:string}[];statementChecks?:StatementCheck[]}
export interface Result extends Standing {}
export interface Notice {round:number;role?:Role;task?:string;message:string}
export interface Snapshot {id:string;version:number;round:number;totalRounds:4;phase:Phase;state:Metrics;roundStart:Metrics;playerRole:Role;roles:PublicRole[];preferenceCatalogue:Record<Role,Preference[]>;termLabels:Record<TermId,string>;ownPreference:Preference;milestones:Record<Role,Milestone[]>;ownStanding:Standing;legalActions:ActionCard[];messages:Message[];claims?:Claim[];claimKinds?:Record<ClaimKind,string>;deals:Deal[];readyRoles:Role[];submittedRoles:Role[];ownAction?:ActionId;signedDealId?:string;messageCount:number;proposalsMade:number;reportHistory:RoundReport[];revealedPreferences?:Record<Role,Preference>;results?:Record<Role,Result>;aiStatus?:{busy:boolean;role?:Role;task?:string};deadlineAt?:number;notices:Notice[];pendingResearch?:{dueRound:number;amount:number}[];researchUses?:number;monitoring?:boolean;pendingPenalties?:{dueRound:number;amount:number}[];ownGreyRisk?:number;actionPreviews?:ActionPreview[];beliefs?:Partial<Record<Role,number>>;ownImage?:number;announcements?:Partial<Record<Role,ActionId|null>>;announcedRoles?:Role[];announceCred?:Partial<Record<Role,number>>;
  statements?:Partial<Record<Role,Statement|null>>;declaredRoles?:Role[];statementCred?:Partial<Record<Role,number>>;issues?:Record<IssueId,string>;commitLevels?:Record<CommitLevel,string>;tones?:Record<Tone,string>;focusIssue?:IssueId|null;focusRole?:Role|null}
export type IssueId = 'controls'|'materials'|'licensing'|'enforcement'|'commerce';
export type Tone = 'dove'|'hawk';
export type CommitLevel = 'signal'|'pledge'|'redline';
export interface Statement {issue:IssueId;tone:Tone;level:CommitLevel;target:Role|null;text:string}
export interface StatementCheck {role:Role;issue:IssueId;tone:Tone;level:CommitLevel;target:Role|null;actual:ActionId|'hidden';actualIssue:IssueId|null;actualTone:Tone|'neutral'|'hidden';consistent?:boolean;cred:number}
export interface NewsItem {id:string;kind:'announcement'|'talks'|'pact'|'nopact'|'kept'|'broken'|'consistent'|'deviated';role:Role;roleName:string;scope?:'open'|'closed';other?:string;participants?:string[];quitters?:string[];issue?:string|null;tone?:string|null;level?:string;named?:string|null;focus?:boolean|null;headline:string;body:string;source:'llm'|'template';image?:string;caption?:string}
export interface Session {id:string;token:string;snapshot:Snapshot}
export interface NegotiationInput {messages:{content:string;target:Role|null}[];proposal:null|{commitments:Commitments;text:string}}
export interface SigningInput {responses:{dealId:string;accept:boolean}[]}
export interface SecretaryAdvice {otherRequests:string[];possibleMotives:{text:string;uncertain:true}[];relevantActions:ActionId[];risks:string[]}

