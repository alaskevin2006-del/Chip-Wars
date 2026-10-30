import {createDiplomacyServer} from '../server/diplomacy-index.mjs';
// Isolated release probe only: no outbound network and never a production session.
const provider={status:()=>({enabled:true,model:'offline-release-probe'}),decide:async observation=>observation.task==='action'?{actionId:'PASS'}:observation.task==='signing'?{responses:[]}:{messages:[],proposal:null}};
const server=createDiplomacyServer({env:{},provider,playerTimeoutMs:15,reportDelayMs:5});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
try{
 const response=await fetch(origin),html=await response.text();if(!response.ok||!html.includes('Chip Diplomacy'))throw Error('Wrong frontend');
 for(const match of html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g))if(!(await fetch(origin+match[1])).ok)throw Error('Missing asset');
 const health=await(await fetch(origin+'/api/health')).json();if(health.rulesVersion!=='1.0')throw Error('Wrong rules');
 const created=await fetch(origin+'/api/diplomacy/sessions',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({playerRole:'US'})});if(!created.ok)throw Error('Creation failed');
 const {id,token}=await created.json();let state;
 for(let n=0;n<200;n++){state=await(await fetch(`${origin}/api/diplomacy/sessions/${id}`,{headers:{Authorization:`Bearer ${token}`}})).json();if(state.phase==='finished')break;await new Promise(r=>setTimeout(r,20));}
 if(state.phase!=='finished'||state.reportHistory.length!==4||Object.keys(state.results).length!==4)throw Error('Incomplete4round game');
 console.log(JSON.stringify({productionProbe:'passed',rules:'1.0',rounds:4,results:4,externalProviderCalls:0}));
}finally{server.closeAllConnections();server.close();}
