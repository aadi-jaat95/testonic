// Testonic backend for Cloudflare Pages Functions.
// Bindings required (Pages > Settings > Bindings):  DB = D1 database,  FILES = KV namespace.
// Optional env var: AUTH_SECRET (long random string).

// First-run admin. Used only while no admin exists; change it from Account right after the first login.
const SEED={u:"aadi6581",p:"01201",name:"Admin"};
const SESSION_MS=30*24*3600e3,ID=/^[a-z0-9._-]{1,40}$/,ITER=15000,MAXFILE=20e6;
class E extends Error{constructor(m,s=400){super(m);this.s=s}}
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
let ENV,READY;
const enc=new TextEncoder();
const hex=u=>[...u].map(b=>b.toString(16).padStart(2,"0")).join("");
const unhex=h=>Uint8Array.from(h.match(/../g)||[],x=>parseInt(x,16));
const b64u=u=>btoa(String.fromCharCode(...u)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const teq=(a,b)=>{if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0};

async function init(){
  if(!ENV.DB)throw new E("Missing D1 binding named DB. Add it in Pages > Settings > Bindings, then redeploy.",500);
  if(!ENV.FILES)throw new E("Missing KV binding named FILES. Add it in Pages > Settings > Bindings, then redeploy.",500);
  READY??=ENV.DB.prepare("CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT NOT NULL, ver INTEGER NOT NULL DEFAULT 1)").run();
  await READY;
}
const rd=async c=>{const r=await ENV.DB.prepare("SELECT v FROM kv WHERE k=?").bind("c/"+c).first();return r?JSON.parse(r.v):{}};
async function mut(c,fn){
  const k="c/"+c;
  for(let i=0;i<8;i++){
    const r=await ENV.DB.prepare("SELECT v,ver FROM kv WHERE k=?").bind(k).first(),d=r?JSON.parse(r.v):{},out=await fn(d),v=JSON.stringify(d);
    const w=r?await ENV.DB.prepare("UPDATE kv SET v=?,ver=ver+1 WHERE k=? AND ver=?").bind(v,k,r.ver).run():await ENV.DB.prepare("INSERT OR IGNORE INTO kv(k,v,ver) VALUES(?,?,1)").bind(k,v).run();
    if(w.meta.changes===1)return out;
  }
  throw new E("Server busy, try again",503);
}
const fput=(k,buf,type)=>ENV.FILES.put(k,buf,{metadata:{type}});
const fget=async k=>{const r=await ENV.FILES.getWithMetadata(k,"arrayBuffer");return r&&r.value?{data:r.value,type:r.metadata&&r.metadata.type}:null};
const fdel=k=>ENV.FILES.delete(k);

async function hp(pw,saltHex){
  const k=await crypto.subtle.importKey("raw",enc.encode(String(pw)),"PBKDF2",false,["deriveBits"]);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:unhex(saltHex),iterations:ITER},k,256)));
}
const mkp=async pw=>{const salt=hex(crypto.getRandomValues(new Uint8Array(16)));return{salt,h:await hp(pw,salt)}};
const chk=async(x,pw)=>!!x&&typeof pw==="string"&&teq(await hp(pw,x.salt),x.h);
let SEC,HK;
async function secret(){
  if(SEC)return SEC;let s=ENV.AUTH_SECRET;
  if(!s){
    const q=()=>ENV.DB.prepare("SELECT v FROM kv WHERE k='meta/secret'").first();
    let r=await q();
    if(!r){await ENV.DB.prepare("INSERT OR IGNORE INTO kv(k,v,ver) VALUES('meta/secret',?,1)").bind(hex(crypto.getRandomValues(new Uint8Array(32)))).run();r=await q()}
    s=r.v;
  }
  return SEC=s;
}
const mac=async p=>{HK??=crypto.subtle.importKey("raw",enc.encode(await secret()),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64u(new Uint8Array(await crypto.subtle.sign("HMAC",await HK,enc.encode(p))))};
async function sign(u,admin){const p=b64u(enc.encode(JSON.stringify({u,a:admin?1:0,e:Date.now()+SESSION_MS})));return p+"."+await mac(p)}
async function auth(req,url){
  const t=(req.headers.get("authorization")||"").replace(/^Bearer /,"")||url.searchParams.get("t")||"",[p,s]=t.split(".");
  if(!p||!s)throw new E("Not signed in",401);
  if(!teq(s,await mac(p)))throw new E("Not signed in",401);
  let o;try{o=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0))))}catch(e){throw new E("Not signed in",401)}
  if(o.e<Date.now())throw new E("Session expired",401);
  const rec=(await rd(o.a?"admins":"users"))[o.u];if(!rec)throw new E("Account no longer exists",401);
  return{u:o.u,admin:!!o.a,name:rec.name};
}
async function seed(){const a=await rd("admins");if(!Object.keys(a).length){const p=await mkp(SEED.p);await mut("admins",d=>{if(!Object.keys(d).length)d[SEED.u]={name:SEED.name,...p}})}}
const L=o=>Object.entries(o).map(([id,x])=>({id,...x}));

async function state(me){
  const N=["users","admins","papers","att","subs","adm","set","ann","sched","prefs"];
  const q=await ENV.DB.prepare(`SELECT k,v FROM kv WHERE k IN (${N.map(()=>"?").join(",")})`).bind(...N.map(n=>"c/"+n)).all();
  const M=Object.fromEntries(q.results.map(r=>[r.k.slice(2),JSON.parse(r.v)])),g=n=>M[n]||{};
  const users=g("users"),admins=g("admins"),papers=g("papers"),att=g("att"),subs=g("subs"),adm=g("adm"),set=g("set"),ann=g("ann"),sched=g("sched"),prefs=g("prefs");
  const A=me.admin,u=me.u,mine=k=>att[k]&&att[k].u===u,sh=k=>adm[k]&&adm[k].v;
  return{
    users:L(users).map(x=>({id:x.id,name:x.name})),
    admins:A?L(admins).map(x=>({id:x.id,name:x.name})):[],
    papers:L(papers).filter(p=>A||!p.to||p.to.includes(u)).sort((a,b)=>b.created-a.created).map(p=>({...p,kid:p.hasKey?"1":""})),
    att:A?att:Object.fromEntries(Object.entries(att).filter(([,x])=>x.u===u)),
    subs:L(subs).filter(s=>A||s.u===u||sh(s.id)),
    adm:A?adm:Object.fromEntries(Object.entries(adm).filter(([k])=>mine(k)||sh(k))),
    set:set.main||{},ann:L(ann).sort((a,b)=>b.at-a.at),sched:L(sched).sort((a,b)=>a.at-b.at),prefs:{[u]:prefs[u]||{}},
    marks:Object.entries(adm).filter(([k,a])=>subs[k]&&papers[subs[k].pid]&&a.marks!==""&&a.marks!=null).map(([k,a])=>({k,pid:subs[k].pid,u:subs[k].u,marks:+a.marks,max:papers[subs[k].pid].max}))
  };
}
async function wipe(pid){
  const pre=pid+"_",subs=await rd("subs");
  for(const k of Object.keys(subs))if(k.startsWith(pre))await fdel("f/sheet/"+k);
  for(const c of["att","subs","adm"])await mut(c,d=>{for(const k of Object.keys(d))if(k.startsWith(pre))delete d[k]});
}
async function doc(me,{c,id,op,data}){
  data=data||{};id=String(id||"");const A=me.admin,del=op==="del",now=Date.now(),pw=data.pw?await mkp(data.pw):null;
  if(c==="prefs"){if(id!==me.u||del)throw new E("Not allowed",403);await mut("prefs",d=>{d[id]={pop:data.pop!==false,corner:data.corner!==false}});return{ok:1}}
  if(c==="me"){
    if(A||id!==me.u)throw new E("Not allowed",403);
    await mut("users",d=>{const x=d[id];if(!x)throw new E("Not found",404);d[id]={name:String(data.name||x.name).slice(0,60),...(pw||{salt:x.salt,h:x.h})}});return{ok:1};
  }
  if(c==="att"&&!A&&!del){
    const pid=id.slice(0,id.length-me.u.length-1);if(id!==pid+"_"+me.u)throw new E("Not allowed",403);
    const p=(await rd("papers"))[pid];
    if(!p||!p.hasPdf||(p.to&&!p.to.includes(me.u)))throw new E("Paper not available",403);
    if(p.st&&now<p.st)throw new E("This paper is not open yet");
    if(now>=p.dl)throw new E("The deadline has passed");
    return await mut("att",d=>{if(!d[id])d[id]={u:me.u,pid,start:now};return{start:d[id].start}});
  }
  if(!A)throw new E("Not allowed",403);
  const SD=(coll,fn)=>mut(coll,d=>{if(del)delete d[id];else fn(d)}).then(()=>({ok:1}));
  switch(c){
    case"papers":
      if(del){const p=(await rd("papers"))[id];await SD("papers",()=>{});if(p){await fdel("f/paper/"+id);await fdel("f/key/"+id);await wipe(id)}return{ok:1}}
      if(!/^[a-z0-9]{1,20}$/.test(id)||!data.title||!(+data.dl))throw new E("Invalid paper");
      return SD("papers",d=>{const o=d[id]||{};d[id]={title:String(data.title).slice(0,120),mins:Math.max(1,+data.mins||60),max:Math.max(1,+data.max||100),st:+data.st||0,dl:+data.dl,to:Array.isArray(data.to)?data.to.map(String):null,created:o.created||now,hasPdf:!!o.hasPdf,hasKey:!!o.hasKey}});
    case"users":{
      if(del)return SD("users",()=>{});
      if(!ID.test(id))throw new E("Username: 1-40 letters, digits, . _ -");
      if((await rd("admins"))[id])throw new E("That username belongs to an admin");
      return SD("users",d=>{const o=d[id];if(!o&&!pw)throw new E("Password required");d[id]={name:String(data.name||(o&&o.name)||id).slice(0,60),...(pw||{salt:o.salt,h:o.h})}});
    }
    case"admins":{
      const ad=await rd("admins");
      if(del){if(id===me.u)throw new E("You can't remove yourself");if(Object.keys(ad).length<2)throw new E("At least one admin must remain");return SD("admins",()=>{})}
      const from=data.from&&data.from!==id?String(data.from):null;
      if(!ID.test(id))throw new E("Username: 1-40 letters, digits, . _ -");
      if((from||!ad[id])&&((await rd("users"))[id]||ad[id]))throw new E("Username already in use");
      await mut("admins",d=>{const o=d[from||id];if(!o&&!pw)throw new E("Password required");d[id]={name:String(data.name||(o&&o.name)||id).slice(0,60),...(pw||{salt:o.salt,h:o.h})};if(from)delete d[from]});
      return{ok:1,u:id,tok:me.u===(from||id)?await sign(id,true):undefined};
    }
    case"set":return SD("set",d=>{d.main={site:String(data.site||"Testonic").slice(0,40),arc:data.arc!==false}});
    case"ann":return SD("ann",d=>{d[id]={text:String(data.text||"").slice(0,500),at:+data.at||now}});
    case"sched":return SD("sched",d=>{d[id]={title:String(data.title||"").slice(0,120),at:+data.at||now,note:String(data.note||"").slice(0,200)}});
    case"adm":return SD("adm",d=>{d[id]={v:!!data.v,marks:data.marks===""||data.marks==null?"":+data.marks,rem:String(data.rem||"").slice(0,300)}});
    case"att":case"subs":
      if(!del)throw new E("Not allowed",403);
      if(c==="subs")await fdel("f/sheet/"+id);
      return SD(c,()=>{});
  }
  throw new E("Unknown collection");
}
async function upload(me,url,req){
  const kind=url.searchParams.get("kind"),id=url.searchParams.get("id")||"",buf=await req.arrayBuffer();
  if(!buf.byteLength||buf.byteLength>MAXFILE)throw new E("Invalid file size (max 20 MB)");
  const type=(req.headers.get("content-type")||"").split(";")[0];
  if(kind==="paper"||kind==="key"){
    if(!me.admin)throw new E("Not allowed",403);if(type!=="application/pdf")throw new E("Papers must be PDF files");
    if(!(await rd("papers"))[id])throw new E("Paper not found",404);
    await fput("f/"+kind+"/"+id,buf,type);
    await mut("papers",d=>{if(d[id])d[id][kind==="paper"?"hasPdf":"hasKey"]=true});return{ok:1};
  }
  if(kind==="sheet"){
    if(me.admin)throw new E("Admins don't submit answer sheets",403);
    if(!/^(application\/pdf|image\/(png|jpeg|webp|gif))$/.test(type))throw new E("Upload a PDF or an image");
    const k=id+"_"+me.u;if(!(await rd("att"))[k])throw new E("Start the test first",403);
    await fput("f/sheet/"+k,buf,type);
    await mut("subs",d=>{d[k]={pid:id,u:me.u,name:me.name,at:Date.now()}});return{ok:1};
  }
  throw new E("Unknown upload type");
}
async function file(me,[kind,id]){
  const A=me.admin,now=Date.now();let ok=false;
  if(kind==="paper"||kind==="key"){
    const p=(await rd("papers"))[id];if(!p||!(kind==="paper"?p.hasPdf:p.hasKey))throw new E("Not found",404);
    if(A)ok=true;
    else if(!p.to||p.to.includes(me.u)){
      const a=(await rd("att"))[id+"_"+me.u],end=a?Math.min(a.start+p.mins*6e4,p.dl):0,arc=((await rd("set")).main||{}).arc!==false;
      ok=kind==="paper"?!!(a&&now<end)||(arc&&now>=p.dl):!!(a&&now>=end)||now>=p.dl;
    }
    if(!ok)throw new E("This file is locked right now",403);
  }else if(kind==="sheet"){
    const a=(await rd("att"))[id],ad=(await rd("adm"))[id];
    if(!(A||(a&&a.u===me.u)||(ad&&ad.v)))throw new E("Not allowed",403);
  }else throw new E("Not found",404);
  const r=await fget("f/"+kind+"/"+id);if(!r)throw new E("File not found (it may still be syncing, retry in a minute)",404);
  const t=kind==="sheet"?r.type||"application/octet-stream":"application/pdf";
  return new Response(r.data,{headers:{"content-type":t,"content-disposition":"inline","cache-control":"private, no-store","x-content-type-options":"nosniff"}});
}
export async function onRequest({request:req,env}){
  ENV=env;
  try{
    const url=new URL(req.url),path=url.pathname.replace(/^\/api\/?/,""),M=req.method;
    if(path==="health"){const r={ok:true,db:!!env.DB,files:!!env.FILES};try{await init()}catch(e){r.ok=false;r.error=e.message}return J(r)}
    await init();
    if(path==="public")return J({site:((await rd("set")).main||{}).site||"Testonic"});
    if(path==="login"&&M==="POST"){
      await seed();const b=await req.json().catch(()=>({})),id=String(b.u||"").toLowerCase();
      for(const[c,adm]of[["admins",1],["users",0]]){const x=(await rd(c))[id];if(x&&await chk(x,b.p))return J({u:id,admin:!!adm,name:x.name,tok:await sign(id,adm)})}
      throw new E("Incorrect username or password",401);
    }
    const me=await auth(req,url);
    if(path==="state")return J(await state(me));
    if(path==="doc"&&M==="POST")return J(await doc(me,await req.json()));
    if(path==="upload"&&M==="POST")return J(await upload(me,url,req));
    if(path.startsWith("file/"))return await file(me,path.split("/").slice(1).map(decodeURIComponent));
    throw new E("Not found",404);
  }catch(e){if(!e.s)console.error(e);return J({error:e.s?e.message:"Server error: "+String(e&&e.message||e).slice(0,200)},e.s||500)}
}
