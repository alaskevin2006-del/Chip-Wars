import {createDiplomacyServer} from '../server/diplomacy-index.mjs';
const server=createDiplomacyServer({env:{DIPLOMACY_ALLOW_DEMO:'true'}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
try {
  const response=await fetch(origin),html=await response.text();
  if(!response.ok||!html.includes('Chip Diplomacy'))throw Error('Wrong frontend');
  for(const match of html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g))if(!(await fetch(origin+match[1])).ok)throw Error('Missing frontend asset');
  const post=async(route,body,token)=>{const r=await fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();};
  const {id,token,snapshot}=await post('/api/diplomacy/sessions',{mode:'demo',rounds:3,player:null});let current=snapshot;
  for(let i=0;i<12;i++)current=await post(`/api/diplomacy/sessions/${id}/step`,{expectedVersion:current.version},token);
  if(current.status!=='completed'||Object.keys(current.decisions).length!==4||current.errors.length)throw Error('Incomplete simulation');
  console.log(JSON.stringify({productionProbe:'passed',rounds:3,decisions:4,errors:0}));
}finally{server.closeAllConnections();server.close();}
