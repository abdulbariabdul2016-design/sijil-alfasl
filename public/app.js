(function(){
'use strict';
var de=document.documentElement;de.setAttribute('dir','rtl');de.setAttribute('lang','ar');

/* ---------- helpers ---------- */
var $=function(s,r){return (r||document).querySelector(s);};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var clone=function(o){return JSON.parse(JSON.stringify(o));};
var uid=function(){return 'x'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);};
var r1=function(n){return Math.round(n*10)/10;};
var r2=function(n){return Math.round(n*100)/100;};
var fmt=function(n){return n==null?'':String(r2(n));};
var fmt1=function(n){return n==null?'':String(r1(n));};
var clampI=function(v,a,b,d){v=parseInt(v,10);if(!isFinite(v))return d;return Math.max(a,Math.min(b,v));};
function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function normAr(s){return String(s).replace(/[ً-ْـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').toLowerCase();}

var ATT={p:{t:'حاضر'},a:{t:'غائب'},l:{t:'متأخر'},e:{t:'بعذر'}};
var ATT_KEYS=['p','a','l','e'];
var TABS=[['home','الرئيسية'],['students','الطلاب'],['grades','الدرجات'],['att','الحضور'],['export','التصدير'],['settings','الإعدادات']];
var DEFAULT_CATS=[
  {id:'quiz',name:'اختبار قصير',count:4,max:10},
  {id:'hw',name:'واجب',count:5,max:5},
  {id:'part',name:'مشاركة',count:5,max:5},
  {id:'mid',name:'اختبار شهري',count:2,max:20},
  {id:'final',name:'اختبار نهائي',count:1,max:40}
];

/* ---------- state ---------- */
var S={settings:{cats:clone(DEFAULT_CATS)},classes:[],att:{}};
var U={tab:'home',cls:null,mapOpen:false,student:null,seg:'grades',gmode:'quick',pad:null,mapMode:'open',filter:'all',q:'',
  attDate:today(),exScope:'class',exStudent:null,exPick:[],exSheet:0,exType:'both',exAtt:false,exPer:'all',exMonths:[],exWeeks:[],mcat:null,mmax:null,focus:null,_ask:null};

function normalize(d){
  var o={settings:{cats:[]},classes:[],att:{}};
  var cats=d&&d.settings&&Array.isArray(d.settings.cats)&&d.settings.cats.length?d.settings.cats:DEFAULT_CATS;
  o.settings.cats=cats.map(function(k){var sym=k.kind==='sym',ded=k.kind==='ded';return {id:String(k.id||uid()),name:String(k.name||'نوع'),count:clampI(k.count,1,60,1),max:(sym||ded)?1:(+k.max>0?+k.max:10),kind:sym?'sym':ded?'ded':'num',weight:ded?0:(+k.weight>0?+k.weight:0),group:String(k.group||'')};});
  (d&&Array.isArray(d.classes)?d.classes:[]).forEach(function(c){
    o.classes.push({
      id:String(c.id||uid()).replace(/[^A-Za-z0-9]/g,'')||uid(),name:String(c.name||'فصل'),subject:String(c.subject||''),
      cols:clampI(c.cols,2,10,5),rows:clampI(c.rows,1,12,5),created:+c.created||Date.now(),
      students:(Array.isArray(c.students)?c.students:[]).map(function(s,i){return {
        id:String(s.id||uid()),name:String(s.name||'طالب'),num:String(s.num||''),
        seat:Number.isInteger(s.seat)&&s.seat>=0?s.seat:i,
        grades:(Array.isArray(s.grades)?s.grades:[]).map(function(g){return {id:String(g.id||uid()),cat:String(g.cat),slot:Number.isInteger(g.slot)?g.slot:null,score:+g.score||0,max:+g.max>0?+g.max:1,date:String(g.date||''),note:String(g.note||'')};})
      };})
    });
  });
  o.att=d&&d.att&&typeof d.att==='object'?d.att:{};
  return o;
}

var curClass=function(){return S.classes.find(function(c){return c.id===U.cls;})||null;};
function ensureCls(){if(!curClass())U.cls=S.classes.length?S.classes[0].id:null;}
var byId=function(c,id){return c.students.find(function(s){return s.id===id;});};
var sortedStudents=function(c){return c.students.slice().sort(function(a,b){return a.seat-b.seat;});};
var catById=function(id){return S.settings.cats.find(function(k){return k.id===id;});};
function cellCount(c){var used=c.students.reduce(function(m,s){return Math.max(m,s.seat);},-1)+1;var n=Math.max(c.cols*c.rows,used);return Math.ceil(n/c.cols)*c.cols;}
function freeSeat(c){var taken={};c.students.forEach(function(s){taken[s.seat]=1;});var i=0;while(taken[i])i++;return i;}

function monthKey(d){return String(d||'').slice(0,7);}
/* فترة التصدير: PF دالة تقبل التاريخ، أو null لكل الفترة */
var PF=null;
var DAYS=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
function parseD(d){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;}
function ymd(dt){return dt.getFullYear()+'-'+('0'+(dt.getMonth()+1)).slice(-2)+'-'+('0'+dt.getDate()).slice(-2);}
function dayName(d){var t=parseD(d);return t?DAYS[t.getDay()]:'';}
function weekStart(d){var t=parseD(d);if(!t)return '';t.setDate(t.getDate()-((t.getDay()+1)%7));return ymd(t);}
function weekEnd(ws){var t=parseD(ws);if(!t)return '';t.setDate(t.getDate()+6);return ymd(t);}
function weekLabel(d){var w=weekStart(d);return w?w+' إلى '+weekEnd(w):'';}
function periodPF(){
  if(U.exPer==='months'){var ms={};(U.exMonths||[]).forEach(function(m){ms[m]=1;});return function(d){return !!ms[monthKey(d)];};}
  if(U.exPer==='weeks'){var ws={};(U.exWeeks||[]).forEach(function(w){ws[w]=1;});return function(d){return !!ws[weekStart(d)];};}
  return null;
}
function periodLabel(){
  if(U.exPer==='months'&&(U.exMonths||[]).length)return U.exMonths.slice().sort().map(monthLabel).join('، ');
  if(U.exPer==='weeks'&&(U.exWeeks||[]).length){var w=U.exWeeks.slice().sort();return (w.length>2?w.length+' أسابيع من ':'')+(w.length===1?'أسبوع ':'أسابيع ')+w.map(function(x){return x+' إلى '+weekEnd(x);}).slice(0,w.length>2?1:2).join('، ');}
  return '';
}
function periodReady(){return !(U.exPer==='months'&&!(U.exMonths||[]).length)&&!(U.exPer==='weeks'&&!(U.exWeeks||[]).length);}
function rawStats(s,catId,month){
  var rs=s.grades.filter(function(g){return (!catId||g.cat===catId)&&(!month||monthKey(g.date)===month)&&(!PF||PF(g.date));});
  var sum=rs.reduce(function(a,g){return a+g.score;},0),mx=rs.reduce(function(a,g){return a+g.max;},0);
  return {n:rs.length,sum:sum,max:mx,avg:rs.length?sum/rs.length:null,pct:mx?sum/mx*100:null};
}
/* الدرجة المعتمدة = (مجموع درجات الطالب ÷ الممكن) × الوزن. الرموز تُقرَّب إلى نصف درجة. */
function catFinal(s,k,month){
  if(!k||!(k.weight>0))return null;
  var st=rawStats(s,k.id,month);if(!st.n||!st.max)return null;
  var v=st.sum/st.max*k.weight;
  return k.kind==='sym'?Math.round(v*2)/2:r2(v);
}
function statsFor(s,catId,month){
  if(catId)return rawStats(s,catId,month);
  var known={},sum=0,mx=0,n=0;
  S.settings.cats.forEach(function(k){
    known[k.id]=1;if(k.kind==='ded')return;var st=rawStats(s,k.id,month);if(!st.n)return;n+=st.n;
    if(k.weight>0){sum+=catFinal(s,k,month);mx+=k.weight;}else{sum+=st.sum;mx+=st.max;}
  });
  s.grades.forEach(function(g){if(!known[g.cat]&&(!month||monthKey(g.date)===month)&&(!PF||PF(g.date))){sum+=g.score;mx+=g.max;n++;}});
  var dd=dedSum(s,null,month);if(dd>0)sum=Math.max(0,sum-dd);
  return {n:n,sum:sum,max:mx,avg:n?sum/n:null,pct:mx?sum/mx*100:null};
}
function classPct(c){var sum=0,mx=0;c.students.forEach(function(s){var t=statsFor(s);sum+=t.sum;mx+=t.max;});return mx?sum/mx*100:null;}
function groupsList(){
  var m={},out=[];
  S.settings.cats.forEach(function(k){
    if(!(k.weight>0)||!k.group)return;
    var g=m[k.group];if(!g){g=m[k.group]={name:k.group,cats:[],max:0};out.push(g);}
    g.cats.push(k);g.max+=k.weight;
  });
  return out;
}
function groupTotal(s,g,month){var sum=0,any=false;g.cats.forEach(function(k){var f=catFinal(s,k,month);if(f!=null){sum+=f;any=true;}});var d=dedSum(s,g.name,month);if(d>0){sum=Math.max(0,sum-d);any=true;}return any?r2(sum):null;}
/* السلوك: كل خصم درجة من نوع 'ded' بقيمة 0.5 أو 1، ويُخصم من مجموع مجموعته ومن الإجمالي */
function dedCats(){return S.settings.cats.filter(function(k){return k.kind==='ded';});}
function behCat(create){
  var k=dedCats()[0];
  if(!k&&create){k={id:uid(),name:'السلوك',count:1,max:1,kind:'ded',weight:0,group:S.settings.cats.some(function(x){return x.group==='المشاركة اليومية';})?'المشاركة اليومية':''};S.settings.cats.push(k);markSettings();}
  return k||null;
}
function dedSum(s,group,month){var t=0;S.settings.cats.forEach(function(k){if(k.kind!=='ded'||(group!=null&&k.group!==group))return;t+=rawStats(s,k.id,month).sum;});return t;}
function dedOn(s,date){var k=behCat(false);return k?s.grades.filter(function(g){return g.cat===k.id&&g.date===date;}):[];}
function symOf(v){return v>=0.99?'+':v>0?'✓':'−';}
function symCat(){return S.settings.cats.find(function(k){return k.kind==='sym';})||null;}
function symGrade(s,k,date){return s.grades.find(function(g){return g.cat===k.id&&g.date===date&&g.slot==null;})||null;}
function setSym(c,s,k,date,score){
  var g=symGrade(s,k,date);
  if(score==null){if(g)s.grades=s.grades.filter(function(x){return x!==g;});}
  else if(g)g.score=score;
  else s.grades.push({id:uid(),cat:k.id,slot:null,score:score,max:1,date:date,note:''});
  markClass(c.id);
}
function cycleSym(c,sid){
  var k=symCat();if(!k){toast('أضف قالب المشاركة اليومية من الإعدادات أولاً');return;}
  var st=byId(c,sid),g=symGrade(st,k,U.attDate),order=[null,1,0.75,0],cur=g?g.score:null;
  var i=order.findIndex(function(v){return v===cur;});
  setSym(c,st,k,U.attDate,order[(i+1)%order.length]);renderKeep();
}
function attOf(c,sid,month){
  var p=0,a=0,l=0,e=0,m=S.att[c.id]||{};
  for(var d in m){if(month&&d.slice(0,7)!==month)continue;if(PF&&!PF(d))continue;var v=m[d][sid];if(v==='p')p++;else if(v==='a')a++;else if(v==='l')l++;else if(v==='e')e++;}
  var tot=p+a+l+e;return {p:p,a:a,l:l,e:e,tot:tot,rate:tot?(p+l)/tot*100:null};
}
function attOn(c,date,sid){var m=S.att[c.id];return (m&&m[date]&&m[date][sid])||'';}
function setAtt(c,date,sid,val){
  var m=S.att[c.id]||(S.att[c.id]={});var day=m[date]||(m[date]={});
  if(val)day[sid]=val;else{delete day[sid];if(!Object.keys(day).length)delete m[date];}
  markAtt(c.id,date);
}

/* ---------- persistence ---------- */
var LS_KEY='sijil-alfasl-v1',LS_UI='sijil-alfasl-ui';
var P={db:null,dirty:{settings:false,classes:{},att:{},del:{}},timer:null,busy:false,touched:false,syncing:false};
var SRV={on:false,token:null,timer:null,retry:null,started:false};
var LS_TOKEN='sijil-token',LS_PEND='sijil-pending',LS_SRV='sijil-server';
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){}}
function hasDirty(){var d=P.dirty;return !!(d.settings||Object.keys(d.classes).length||Object.keys(d.att).length||Object.keys(d.del).length);}
function lsSave(){try{localStorage.setItem(LS_KEY,JSON.stringify(S));}catch(e){}}
function lsLoad(){try{var t=localStorage.getItem(LS_KEY);return t?JSON.parse(t):null;}catch(e){return null;}}
function uiSave(){try{localStorage.setItem(LS_UI,JSON.stringify({tab:U.tab,cls:U.cls}));}catch(e){}}
function uiLoad(){try{var t=localStorage.getItem(LS_UI);return t?JSON.parse(t):null;}catch(e){return null;}}
function setStatus(t,k){var el=$('#save');if(el){el.textContent=t;el.setAttribute('data-k',k||'');}}
function markSettings(){P.dirty.settings=true;queue();}
function markClass(id){P.dirty.classes[id]=1;queue();}
function markAtt(cid,date){P.dirty.att[cid+'_'+date.slice(0,7)]=1;queue();}
function markAll(){P.dirty.settings=true;S.classes.forEach(function(c){P.dirty.classes[c.id]=1;});Object.keys(S.att).forEach(function(cid){Object.keys(S.att[cid]).forEach(function(d){P.dirty.att[cid+'_'+d.slice(0,7)]=1;});});}
function queue(){
  P.touched=true;lsSave();
  if(!P.db){if(SRV.on)lsSet(LS_PEND,'1');setStatus(SRV.on?'غير متصل بالخادم: محفوظ على هذا الجهاز':'محفوظ على هذا الجهاز',SRV.on?'warn':'ok');return;}
  setStatus('جارٍ الحفظ…','busy');clearTimeout(P.timer);P.timer=setTimeout(flush,600);
}
async function flush(){
  if(!P.db)return;
  if(P.busy){P.timer=setTimeout(flush,400);return;}
  P.busy=true;
  try{
    var d=P.dirty;
    if(d.settings){d.settings=false;await P.db.doc('app/settings').set({cats:S.settings.cats});}
    for(var id in d.classes){delete d.classes[id];var c=S.classes.find(function(x){return x.id===id;});if(c)await P.db.doc('classes/'+id).set(clone(c));}
    for(var key in d.att){delete d.att[key];var parts=key.split('_');var days={};var m=S.att[parts[0]]||{};for(var dt in m){if(dt.indexOf(parts[1])===0)days[dt]=m[dt];}await P.db.doc('att/'+key).set({cls:parts[0],month:parts[1],days:days});}
    for(var path in d.del){delete d.del[path];await P.db.doc(path).delete();}
    if(!hasDirty())lsSet(LS_PEND,null);
    setStatus(SRV.on?'تمت المزامنة':'تم الحفظ','ok');
  }catch(e){
    markAll();
    if(SRV.on){lsSet(LS_PEND,'1');if(!e||e.code!=='unauthenticated')scheduleRetry();}
    setStatus(e&&e.code==='unauthenticated'?'سجّل الدخول لمتابعة الحفظ':e&&e.code==='invalid_argument'?'للقراءة فقط: محفوظ على هذا الجهاز':'تعذر الحفظ على الخادم: محفوظ على هذا الجهاز','warn');
  }
  P.busy=false;
}
async function connectDb(){
  try{
    if(!(window.claude&&window.claude.use))return;
    var db=await window.claude.use('db');
    if(!db){setStatus('محفوظ على هذا الجهاز','ok');return;}
    P.db=db;
    var res=await Promise.all([db.doc('app/settings').get(),db.collection('classes').get(),db.collection('att').get()]);
    var sSnap=res[0],cSnap=res[1],aSnap=res[2];
    if(sSnap.exists||!cSnap.empty){
      if(P.touched){markAll();flush();return;}
      var st=sSnap.exists?clone(sSnap.data()):null;
      var d={settings:st,classes:cSnap.docs.map(function(x){var o=clone(x.data());o.id=x.id;return o;}),att:{}};
      aSnap.docs.forEach(function(x){var v=x.data();if(!v||!v.cls)return;var m=d.att[v.cls]||(d.att[v.cls]={});var days=v.days||{};for(var dt in days)m[dt]=days[dt];});
      d.classes.sort(function(a,b){return (a.created||0)-(b.created||0);});
      S=normalize(d);lsSave();ensureCls();render();
    }else if(S.classes.length){markAll();flush();}
    setStatus('تم الحفظ','ok');
  }catch(e){P.db=null;setStatus('محفوظ على هذا الجهاز','ok');}
}

/* ---------- المزامنة مع الخادم (Neon) ---------- */
async function api(method,url,body){
  var r=await fetch(url,{method:method,headers:Object.assign({'Authorization':'Bearer '+(SRV.token||'')},body!==undefined?{'Content-Type':'application/json'}:{}),body:body!==undefined?JSON.stringify(body):undefined,cache:'no-store'});
  if(r.status===401){var e1=new Error('unauthenticated');e1.code='unauthenticated';SRV.token=null;lsSet(LS_TOKEN,null);P.db=null;SRV.started=false;showLogin();throw e1;}
  if(!r.ok){var e2=new Error('http '+r.status);e2.code='http_'+r.status;throw e2;}
  return r.json();
}
function makeRemoteDb(){
  var snap=function(path,x){return {id:path.split('/').pop(),exists:!!x,data:function(){return x?x:undefined;}};};
  return {
    doc:function(path){return {
      get:async function(){var r=await api('GET','api/doc?path='+encodeURIComponent(path));return snap(path,r.data);},
      set:function(data){return api('PUT','api/doc?path='+encodeURIComponent(path),data);},
      delete:function(){return api('DELETE','api/doc?path='+encodeURIComponent(path));}
    };},
    collection:function(name){return {get:async function(){var r=await api('GET','api/docs?prefix='+encodeURIComponent(name));var docs=r.docs.map(function(x){return snap(x.path,x.data);});return {docs:docs,empty:!docs.length,size:docs.length};}};}
  };
}
function busyEditing(){
  var a=document.activeElement,tag=a&&a.tagName;
  var modalOpen=false;try{modalOpen=!$('#modal').hidden;}catch(e){}
  return !!(U.pad||U.login||modalOpen||(a&&(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')));
}
function mergeLocalInto(ns){
  var added=0,have={},ids={};
  ns.settings.cats.forEach(function(k){have[k.id]=1;});
  S.settings.cats.forEach(function(k){if(!have[k.id]){ns.settings.cats.push(k);P.dirty.settings=true;}});
  ns.classes.forEach(function(c){ids[c.id]=1;});
  S.classes.forEach(function(c){
    if(ids[c.id])return;
    ns.classes.push(c);P.dirty.classes[c.id]=1;added++;
    var m=S.att[c.id];
    if(m){ns.att[c.id]=m;Object.keys(m).forEach(function(d){P.dirty.att[c.id+'_'+d.slice(0,7)]=1;});}
  });
  return added;
}
async function syncPull(initial){
  var db=P.db;if(!db)return;
  var res=await Promise.all([db.doc('app/settings').get(),db.collection('classes').get(),db.collection('att').get()]);
  var sSnap=res[0],cSnap=res[1],aSnap=res[2];
  if(sSnap.exists||!cSnap.empty){
    if(initial&&(P.touched||lsGet(LS_PEND))){markAll();await flush();return;}
    if(!initial&&(P.busy||hasDirty()||busyEditing()))return;
    var st=sSnap.exists?clone(sSnap.data()):null;
    var d={settings:st,classes:cSnap.docs.map(function(x){var o=clone(x.data());o.id=x.id;return o;}),att:{}};
    aSnap.docs.forEach(function(x){var v=x.data();if(!v||!v.cls)return;var m=d.att[v.cls]||(d.att[v.cls]={});var days=v.days||{};for(var dt in days)m[dt]=days[dt];});
    d.classes.sort(function(a,b){return (a.created||0)-(b.created||0);});
    var ns=normalize(d),merged=0;
    if(initial&&lsGet(LS_SRV)!=='1'&&S.classes.length)merged=mergeLocalInto(ns);
    if(JSON.stringify(ns)!==JSON.stringify(S)){S=ns;lsSave();ensureCls();if(initial)render();else renderKeep();}
    if(merged){toast('تم دمج '+merged+' فصل من هذا الجهاز مع بياناتك على الخادم');queue();}
  }else if(S.classes.length){markAll();await flush();}
}
function showLogin(msg){
  U.login=true;
  var m=$('#modal');
  m.innerHTML='<div class="ov"><div class="dlg" role="dialog" aria-modal="true"><h2>تسجيل الدخول</h2><p class="muted" style="margin:6px 0 12px">أدخل كلمة المرور لفتح بياناتك وتسجيل الدرجات من أي جهاز.</p><form data-form="login" class="stack"><label class="f">كلمة المرور<input name="password" id="loginPw" type="password" required autocomplete="current-password"></label>'+(msg?'<p class="t-bad" role="alert">'+esc(msg)+'</p>':'')+'<div class="row"><button class="btn pri">دخول</button></div></form></div></div>';
  m.hidden=false;
  var i=$('#loginPw');if(i)i.focus();
}
async function doLogin(pw){
  try{
    var r=await fetch('api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw}),cache:'no-store'});
    var j={};try{j=await r.json();}catch(e){}
    if(!r.ok||!j.token){showLogin(j.error||'تعذر تسجيل الدخول');return;}
    SRV.token=j.token;lsSet(LS_TOKEN,j.token);U.login=false;
    var m=$('#modal');m.hidden=true;m.innerHTML='';
    await startSync();
  }catch(e){showLogin('تعذر الاتصال بالخادم');}
}
function scheduleRetry(){
  if(SRV.retry)return;
  SRV.retry=setTimeout(function(){SRV.retry=null;if(SRV.started)refresh();else connectAny();},20000);
}
async function startSync(){
  P.db=makeRemoteDb();
  setStatus('جارٍ المزامنة…','busy');
  try{
    await syncPull(true);
    lsSet(LS_SRV,'1');SRV.started=true;
    setStatus(hasDirty()?'جارٍ الحفظ…':'تمت المزامنة','ok');
  }catch(e){
    if(e&&e.code==='unauthenticated')return;
    setStatus('غير متصل بالخادم: محفوظ على هذا الجهاز','warn');scheduleRetry();
  }
  clearInterval(SRV.timer);
  SRV.timer=setInterval(function(){if(document.visibilityState!=='hidden')refresh();},60000);
}
async function refresh(manual){
  if(!P.db||P.syncing)return;
  P.syncing=true;
  try{
    if(!hasDirty()&&lsGet(LS_PEND))markAll();
    if(hasDirty()){clearTimeout(P.timer);await flush();}
    if(hasDirty()||lsGet(LS_PEND)){setStatus('تعذر الحفظ على الخادم: محفوظ على هذا الجهاز','warn');if(manual)toast('تعذر الاتصال بالخادم');return;}
    await syncPull(false);
    setStatus('تمت المزامنة','ok');
    if(manual)toast('تمت المزامنة');
  }catch(e){
    if(!e||e.code!=='unauthenticated'){setStatus('غير متصل بالخادم: محفوظ على هذا الجهاز','warn');if(manual)toast('تعذر الاتصال بالخادم');scheduleRetry();}
  }finally{P.syncing=false;}
}
async function connectAny(){
  if(window.claude&&window.claude.use)return connectDb();
  if(!/^https?:$/.test(location.protocol))return;
  var known=lsGet(LS_SRV)==='1',ok=false;
  try{var h=await fetch('api/health',{cache:'no-store'});if(h.ok){var j=await h.json();ok=!!(j&&j.app==='sijil-alfasl');}}catch(e){}
  if(!ok&&!known)return;
  SRV.on=true;SRV.token=lsGet(LS_TOKEN);
  if(!SRV.token){showLogin();return;}
  if(!ok){P.db=makeRemoteDb();setStatus('غير متصل بالخادم: محفوظ على هذا الجهاز','warn');scheduleRetry();return;}
  await startSync();
}
function syncCard(){
  if(!SRV.on)return '';
  var pend=hasDirty()||lsGet(LS_PEND);
  return '<section class="card"><h2>الحساب والمزامنة</h2><p class="muted" style="margin-top:6px">بياناتك محفوظة على الخادم وتظهر على أي جهاز تدخل منه بكلمة المرور. '+(pend?'<b class="t-warn">توجد تغييرات لم تُرسل بعد.</b>':'كل التغييرات مُرسلة.')+'</p><div class="row"><button type="button" class="btn" data-act="syncNow">مزامنة الآن</button><button type="button" class="btn danger" data-act="logout">تسجيل الخروج من هذا الجهاز</button></div></section>';
}

/* ---------- views ---------- */
function renderTabs(){
  $('#tabs').innerHTML=TABS.map(function(t){return '<button type="button" data-act="tab" data-t="'+t[0]+'"'+(U.tab===t[0]?' aria-current="page"':'')+'>'+t[1]+'</button>';}).join('');
  var cur=$('#tabs [aria-current]');
  if(cur&&cur.scrollIntoView){try{cur.scrollIntoView({inline:'center',block:'nearest'});}catch(e){}}
}
function render(top){
  uiSave();renderTabs();
  var html='',c=curClass();
  if(U.student&&c&&byId(c,U.student))html=vStudent();
  else{U.student=null;html=({home:vHome,students:vStudents,grades:vGrades,att:vAtt,'export':vExport,settings:vSettings})[U.tab]();}
  $('#main').innerHTML=html;
  if(U.tab==='home'&&U.mapOpen&&!U.student)applySeatFilter();
  if(U.focus){var el=$(U.focus);if(el)el.focus();U.focus=null;}
  if(top)window.scrollTo(0,0);
}
function renderKeep(){
  var y=window.scrollY,rw=$('.roomwrap'),sl=rw?rw.scrollLeft:0;
  render();
  var rw2=$('.roomwrap');if(rw2)rw2.scrollLeft=sl;
  window.scrollTo(0,y);
}
function classPick(){
  return '<div class="pick"><label class="f inline">الفصل<select data-ch="pickClass">'+S.classes.map(function(c){return '<option value="'+c.id+'"'+(c.id===U.cls?' selected':'')+'>'+esc(c.name)+(c.subject?' · '+esc(c.subject):'')+'</option>';}).join('')+'</select></label></div>';
}
function vNoClass(){
  return '<div class="head"><h1>لا توجد فصول بعد</h1></div><p class="lead">أنشئ فصلاً من الرئيسية أولاً، ثم عد إلى هذا التبويب.</p><div class="row"><button type="button" class="btn pri" data-act="goHome">الذهاب إلى الرئيسية</button></div>';
}
function behTally(c,date){
  var n=0,tot=0;c.students.forEach(function(s){var a=dedOn(s,date);if(a.length){n++;tot+=a.reduce(function(x,g){return x+g.score;},0);}});
  return '<div class="tally"><span class="tl a-d"><b>'+n+'</b> طالب عليهم خصم</span><span class="tl a-d"><b>'+fmt(tot)+'</b> مجموع الخصم في هذا اليوم</span></div>';
}
function behModal(c,sid){
  var s=byId(c,sid);if(!s)return;U.behSid=sid;
  var list=dedOn(s,U.attDate),tot=list.reduce(function(x,g){return x+g.score;},0);
  modal('<h2>سلوك الطالب: '+esc(s.name)+'</h2><p class="muted">التاريخ '+esc(U.attDate)+(tot>0?' · خصم اليوم <b class="neg">− '+fmt(tot)+'</b>':'')+'</p>'+
    '<label class="f">السبب (اختياري)<input id="behNote" autocomplete="off" placeholder="مثال: حديث أثناء الشرح"></label>'+
    '<div class="row" style="margin:12px 0"><button type="button" class="btn danger" data-act="behAdd" data-sid="'+s.id+'" data-v="0.5">− نصف درجة</button><button type="button" class="btn danger" data-act="behAdd" data-sid="'+s.id+'" data-v="1">− درجة</button></div>'+
    (list.length?'<div class="tablewrap"><table><tbody>'+list.map(function(g){return '<tr><td class="num neg"><b>− '+fmt(g.score)+'</b></td><td>'+esc(g.note||'بدون سبب')+'</td><td><button type="button" class="btn ghost sm" data-act="behDel" data-gid="'+g.id+'">حذف</button></td></tr>';}).join('')+'</tbody></table></div>':'')+
    '<div class="row" style="margin-top:12px"><button type="button" class="btn ghost" data-act="mcancel">إغلاق</button></div>');
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
}
function dedCard(c,s,k){
  var st=rawStats(s,k.id),hist=s.grades.filter(function(g){return g.cat===k.id;}).sort(function(a,b){return String(b.date).localeCompare(String(a.date));}).slice(0,30);
  return '<article class="cat ded"><header><h3>'+esc(k.name)+'</h3><span class="muted neg">'+(st.n?st.n+' خصم · المجموع − '+fmt(st.sum):'لا يوجد خصم')+'</span></header>'+
    '<div class="row" style="align-items:center;margin-bottom:8px"><label class="f inline">التاريخ<input type="date" value="'+U.attDate+'" data-ch="attDate"></label><label class="f inline" style="flex:1">السبب<input id="behNote" autocomplete="off" placeholder="اختياري"></label></div>'+
    '<div class="pns"><button type="button" class="btn danger" data-act="behAdd" data-sid="'+s.id+'" data-v="0.5">− نصف درجة</button><button type="button" class="btn danger" data-act="behAdd" data-sid="'+s.id+'" data-v="1">− درجة</button></div>'+
    (hist.length?'<div class="slots" style="margin-top:10px">'+hist.map(function(g){return '<span class="slot has neg" style="cursor:default" title="'+esc(g.date+(g.note?' · '+g.note:''))+'"><i>'+esc(String(g.date).slice(5))+'</i><b>−'+fmt(g.score)+'</b></span>';}).join('')+'</div>':'')+'</article>';
}
function tally(c,date){
  var cnt={p:0,a:0,l:0,e:0,n:0};c.students.forEach(function(s){cnt[attOn(c,date,s.id)||'n']++;});
  return '<div class="tally">'+ATT_KEYS.map(function(k){return '<span class="tl a-'+k+'"><b>'+cnt[k]+'</b> '+ATT[k].t+'</span>';}).join('')+'<span class="tl a-n"><b>'+cnt.n+'</b> غير مسجل</span></div>';
}

/* home */
function classFields(){
  return '<label class="f">اسم الفصل<input name="name" required placeholder="مثال: الصف الخامس - أ" autocomplete="off"></label>'+
    '<label class="f">المادة<input name="subject" placeholder="مثال: الرياضيات" autocomplete="off"></label>'+
    '<label class="f">مقاعد في الصف الواحد<input name="cols" type="number" min="2" max="10" value="6"></label>'+
    '<label class="f">عدد الصفوف<input name="rows" type="number" min="1" max="12" value="5"></label>';
}
function mapCols(n){var w=window.innerWidth||1024;return Math.min(n,w<=560?3:w<=820?4:n);}
function widthBucket(){var w=window.innerWidth||1024;return w<=560?0:w<=820?1:2;}
function ghostRoom(){
  var seats='';for(var i=0;i<18;i++)seats+='<div class="seat empty ghost"><span>مقعد فارغ</span></div>';
  return roomShell(seats,mapCols(6));
}
function roomShell(seats,cols){
  return '<div class="roomwrap"><div class="room"><div class="wall"><div class="door"><span class="tag">الباب</span></div><div class="board"><span class="tag">السبورة</span></div><div class="tdesk"><i class="lap"></i><span class="tag">مكتب المعلم</span></div></div><div class="floor"><div class="seats" style="--cols:'+cols+'">'+seats+'</div></div></div></div>';
}
function vEmptyHome(){
  return '<div class="head"><div><h1>أهلاً بك في سجل الفصل</h1><p class="lead">سجّل طلاب كل فصل على خريطة الجلوس، وأدخل درجاتهم بضغطة واحدة، وتابع الحضور والغياب، ثم صدّر النتائج.</p></div></div>'+
    ghostRoom()+
    '<section class="card"><h2>أنشئ فصلك الأول</h2><form data-form="newClass" class="fgrid">'+classFields()+'<button class="btn pri">إنشاء الفصل</button></form>'+
    '<p class="muted" style="margin-top:14px">تريد أن ترى البرنامج يعمل أولاً؟ <button type="button" class="btn ghost sm" data-act="demo">حمّل فصلاً تجريبياً</button> ويمكنك حذفه لاحقاً من الإعدادات.</p></section>';
}
function classCard(c){
  var day=(S.att[c.id]&&S.att[c.id][today()])||{},p=0,a=0,l=0;
  Object.keys(day).forEach(function(k){if(day[k]==='p')p++;else if(day[k]==='a')a++;else if(day[k]==='l')l++;});
  var rec=Object.keys(day).length,pct=classPct(c);
  return '<button type="button" class="ccard" data-act="openClass" data-id="'+c.id+'"><span class="cname">'+esc(c.name)+'</span><span class="csub">'+esc(c.subject||'بدون مادة')+'</span>'+
    '<span class="cmeta">'+c.students.length+' طالب · متوسط الدرجات '+(pct==null?'—':fmt1(pct)+'%')+'</span>'+
    '<span class="cmeta">اليوم: '+(rec?p+' حاضر، '+a+' غائب'+(l?'، '+l+' متأخر':''):'لم يُسجَّل الحضور بعد')+'</span></button>';
}
function vHome(){
  if(!S.classes.length)return vEmptyHome();
  ensureCls();
  if(U.mapOpen&&curClass())return vMap();
  return '<div class="head"><h1>الفصول</h1><button type="button" class="btn pri" data-act="newClass">+ فصل جديد</button></div><p class="lead">اضغط على فصل لفتح خريطة الجلوس.</p><div class="cgrid">'+S.classes.map(classCard).join('')+'</div>';
}
function seatCard(c,s,date){
  var st=statsFor(s),pct=st.pct,a=attOn(c,date,s.id),im=U.mapMode==='int',bm=U.mapMode==='beh',sg=null,dd=0;
  if(im){var sk=symCat();sg=sk?symGrade(s,sk,date):null;a=sg?(sg.score>=0.99?'p':sg.score>0?'l':'a'):'';}
  if(bm){dd=dedOn(s,date).reduce(function(x,g){return x+g.score;},0);a=dd>0?'d':'';}
  var tone=pct==null?'none':pct>=85?'ok':pct>=60?'warn':'bad';
  return '<button type="button" class="seat st-'+(a||'n')+'" draggable="true" data-act="seat" data-sid="'+s.id+'" data-slot="'+s.seat+'">'+
    '<span class="ring t-'+tone+'" style="--p:'+(pct==null?0:Math.round(pct))+'"><b>'+(pct==null?'–':Math.round(pct))+'</b></span>'+
    '<span class="sname">'+esc(s.name)+'</span>'+
    '<span class="sline"><span class="achip a-'+(a||'n')+'">'+(bm?(dd>0?'− '+fmt(dd):'لا خصم'):im?(sg?symOf(sg.score)+' '+(sg.score>=0.99?'ممتازة':sg.score>0?'عادية':'لا مشاركة'):'غير مسجل'):(a?ATT[a].t:'غير مسجل'))+'</span><span class="num">مقعد '+(s.seat+1)+'</span></span></button>';
}
function vMap(){
  var c=curClass(),date=U.attDate,total=cellCount(c),bySeat={};
  c.students.forEach(function(s){bySeat[s.seat]=s;});
  var seats='';
  for(var i=0;i<total;i++){var s=bySeat[i];seats+=s?seatCard(c,s,date):'<button type="button" class="seat empty" data-act="addAt" data-seat="'+i+'" data-slot="'+i+'"><span>+ إضافة طالب</span><span>مقعد '+(i+1)+'</span></button>';}
  var filters=[['all','الكل'],['p','الحاضرون'],['a','الغائبون'],['l','المتأخرون'],['e','بعذر'],['n','غير مسجل']];
  return '<div class="maphead"><div><button type="button" class="btn ghost sm" data-act="mapBack">→ الفصول</button>'+
    '<h1 style="margin-top:8px">خريطة الجلوس التفاعلية<span class="sub">'+esc(c.name)+(c.subject?' · '+esc(c.subject):'')+' · '+c.students.length+' طالب</span></h1></div>'+
    '<div class="mapctl"><label class="f inline">التاريخ<input type="date" value="'+date+'" data-ch="attDate"></label>'+
    '<div class="seg"><button type="button" data-act="mode" data-m="open" class="'+(U.mapMode==='open'?'on':'')+'">فتح الطالب</button><button type="button" data-act="mode" data-m="att" class="'+(U.mapMode==='att'?'on':'')+'">تسجيل الحضور</button><button type="button" data-act="mode" data-m="int" class="'+(U.mapMode==='int'?'on':'')+'">تسجيل التفاعل</button><button type="button" data-act="mode" data-m="beh" class="'+(U.mapMode==='beh'?'on':'')+'">تسجيل السلوك</button></div>'+
    '<label class="f inline">عرض<select data-ch="filter">'+filters.map(function(f){return '<option value="'+f[0]+'"'+(U.filter===f[0]?' selected':'')+'>'+f[1]+'</option>';}).join('')+'</select></label>'+
    '<input type="search" id="seatQ" placeholder="بحث عن طالب" value="'+esc(U.q)+'" aria-label="بحث عن طالب"></div></div>'+
    (U.mapMode==='int'?'':U.mapMode==='beh'?behTally(c,date):tally(c,date))+
    roomShell(seats,mapCols(c.cols))+
    '<div class="legend"><span style="--c:var(--ok)">حاضر</span><span style="--c:var(--bad)">غائب</span><span style="--c:var(--chalk)">متأخر</span><span style="--c:var(--info)">بعذر</span>'+
    '<span>الحلقة = نسبة درجات الطالب</span>'+
    '<span>'+(U.mapMode==='att'?'اضغط على المقعد لتغيير حالة الحضور (حاضر ← غائب ← متأخر ← بعذر ← مسح)':U.mapMode==='beh'?'اضغط على المقعد لخصم نصف درجة أو درجة بسبب السلوك، ويظهر الخصم بالأحمر ويُطرح من مجموع الطالب':U.mapMode==='int'?'اضغط على المقعد لتسجيل تفاعل هذه الحصة: + ممتازة ← ✓ عادية ← − لا مشاركة ← مسح. سجّل 5 أو 6 طلاب في الحصة بالتناوب':'اضغط على الطالب لإدخال درجاته · اسحب مقعداً لتبديل المكان')+'</span></div>';
}
function applySeatFilter(){
  var c=curClass();if(!c)return;var q=normAr(U.q.trim()),f=U.filter;
  $$('.seat[data-sid]').forEach(function(el){
    var s=byId(c,el.getAttribute('data-sid'));if(!s)return;
    var a=attOn(c,U.attDate,s.id),ok=true;
    if(f==='n')ok=!a;else if(f!=='all')ok=a===f;
    if(q&&normAr(s.name).indexOf(q)<0)ok=false;
    el.classList.toggle('dim',!ok);
  });
}

/* students tab */
function vStudents(){
  var c=curClass();if(!c)return vNoClass();
  var list=sortedStudents(c);
  var table=list.length?'<div class="tablewrap"><table><thead><tr><th>المقعد</th><th>الاسم</th><th>رقم الطالب</th><th>نسبة الدرجات %</th><th>نسبة الحضور %</th><th></th></tr></thead><tbody>'+
    list.map(function(s){var st=statsFor(s),at=attOf(c,s.id);
      return '<tr><td class="num">'+(s.seat+1)+'</td><td><button type="button" class="lnk" data-act="openStudent" data-id="'+s.id+'">'+esc(s.name)+'</button></td><td>'+(esc(s.num)||'—')+'</td><td class="num">'+(st.pct==null?'—':fmt1(st.pct))+'</td><td class="num">'+(at.rate==null?'—':fmt1(at.rate))+'</td>'+
      '<td class="acts"><button type="button" class="btn ghost sm" data-act="editStudent" data-id="'+s.id+'">تعديل</button><button type="button" class="btn ghost sm" data-act="delStudent" data-id="'+s.id+'">حذف</button></td></tr>';}).join('')+'</tbody></table></div>'
    :'<p class="empty-note">لا يوجد طلاب في هذا الفصل. أضف الطالب الأول من النموذج أعلاه.</p>';
  return '<div class="head"><h1>تسجيل الطلاب</h1>'+classPick()+'</div>'+
    '<section class="card"><h2>إضافة طالب إلى '+esc(c.name)+'</h2><form class="fgrid" data-form="addStudent">'+
    '<label class="f">اسم الطالب<input name="name" id="stuName" required autocomplete="off"></label>'+
    '<label class="f">رقم الطالب (اختياري)<input name="num" autocomplete="off"></label>'+
    '<label class="f">رقم المقعد (اختياري)<input name="seat" type="number" min="1" placeholder="تلقائي"></label>'+
    '<button class="btn pri">إضافة</button></form>'+
    '<details class="bulk"><summary>إضافة عدة طلاب دفعة واحدة</summary><form data-form="bulk" class="stack"><label class="f">اكتب اسماً في كل سطر<textarea name="names" rows="6"></textarea></label><div class="row"><button class="btn">إضافة الأسماء</button></div></form></details></section>'+
    '<section class="card"><div class="cardhead"><h2>طلاب الفصل</h2><span class="muted">'+list.length+' طالب</span></div>'+table+'</section>';
}

/* grades tab (class gradebook) */
function pctCell(st,k){
  if(!st.n)return '<td class="num">—</td>';
  var t=st.pct>=85?'t-ok':st.pct>=60?'t-warn':'t-bad';
  return '<td class="num"><b class="'+t+'">'+fmt1(st.pct)+'%</b>'+(k&&k.kind!=='sym'?'<small>'+st.n+' من '+k.count+'</small>':'')+'</td>';
}
function vGrades(){
  var c=curClass();if(!c)return vNoClass();
  var cats=S.settings.cats,list=sortedStudents(c);
  var rows=list.map(function(s){
    return '<tr><td><button type="button" class="lnk" data-act="openStudent" data-id="'+s.id+'">'+esc(s.name)+'</button></td>'+
      cats.map(function(k){if(k.kind==='ded'){var dv=rawStats(s,k.id).sum;return dv>0?'<td class="num neg"><b>− '+fmt(dv)+'</b></td>':'<td class="num">—</td>';}return pctCell(statsFor(s,k.id),k);}).join('')+groupsList().map(function(g){var t=groupTotal(s,g);return '<td class="num"><b>'+(t==null?'—':fmt(t))+'</b></td>';}).join('')+
      '<td class="num">'+(function(){var t=statsFor(s);return t.n?fmt(t.sum)+' / '+fmt(t.max):'—';})()+'</td>'+pctCell(statsFor(s),null)+'</tr>';
  }).join('');
  var foot='<tr><td>متوسط الفصل</td>'+cats.map(function(k){if(k.kind==='ded')return '<td class="num">—</td>';var sum=0,mx=0,n=0;c.students.forEach(function(s){s.grades.forEach(function(g){if(g.cat===k.id){sum+=g.score;mx+=g.max;n++;}});});return n?'<td class="num">'+fmt1(sum/mx*100)+'%</td>':'<td class="num">—</td>';}).join('')+groupsList().map(function(g){var v=c.students.map(function(s){return groupTotal(s,g);}).filter(function(x){return x!=null;});return '<td class="num">'+(v.length?fmt(v.reduce(function(a,b){return a+b;},0)/v.length):'—')+'</td>';}).join('')+'<td></td><td class="num">'+(classPct(c)==null?'—':fmt1(classPct(c))+'%')+'</td></tr>';
  return '<div class="head"><h1>درجات الطلاب</h1>'+classPick()+'</div>'+
    '<section class="card"><div class="cardhead"><h2>سجل الدرجات</h2><span class="muted">اضغط اسم الطالب لإدخال درجاته</span></div>'+
    (list.length?'<div class="tablewrap"><table class="gb"><thead><tr><th>الطالب</th>'+cats.map(function(k){return '<th>'+esc(k.name)+'<small>'+(k.kind==='sym'?'رموز':k.kind==='ded'?'خصم':k.count+' × '+fmt(k.max))+'</small></th>';}).join('')+groupsList().map(function(g){return '<th>'+esc(g.name)+'<small>من '+fmt(g.max)+'</small></th>';}).join('')+'<th>المجموع</th><th>النسبة</th></tr></thead><tbody>'+rows+'</tbody><tfoot>'+foot+'</tfoot></table></div>':'<p class="empty-note">سجّل الطلاب أولاً من تبويب الطلاب.</p>')+'</section>';
}

/* attendance tab */
function segBtns(cur,sid){
  return '<div class="seg">'+ATT_KEYS.map(function(k){return '<button type="button" class="'+(cur===k?'on':'')+'" data-act="attBtn" data-sid="'+sid+'" data-v="'+k+'">'+ATT[k].t+'</button>';}).join('')+'</div>';
}
function vAtt(){
  var c=curClass();if(!c)return vNoClass();
  var list=sortedStudents(c),date=U.attDate;
  var rows=list.map(function(s){var at=attOf(c,s.id);
    return '<tr><td><button type="button" class="lnk" data-act="openStudent" data-id="'+s.id+'">'+esc(s.name)+'</button></td><td>'+segBtns(attOn(c,date,s.id),s.id)+'</td><td class="num">'+at.p+'</td><td class="num">'+at.a+'</td><td class="num">'+at.l+'</td><td class="num">'+at.e+'</td><td class="num">'+(at.rate==null?'—':fmt1(at.rate)+'%')+'</td></tr>';}).join('');
  return '<div class="head"><h1>الحضور والغياب</h1>'+classPick()+'</div>'+
    '<section class="card"><div class="cardhead"><h2>تسجيل يوم</h2><label class="f inline">التاريخ<input type="date" value="'+date+'" data-ch="attDate"></label></div>'+tally(c,date)+
    '<div class="row" style="margin-bottom:12px"><button type="button" class="btn sm" data-act="allPresent">تسجيل الجميع حاضرين</button><button type="button" class="btn ghost sm" data-act="clearDay">مسح تسجيل اليوم</button></div>'+
    (list.length?'<div class="tablewrap"><table><thead><tr><th>الطالب</th><th>حالة اليوم</th><th>أيام الحضور</th><th>أيام الغياب</th><th>أيام التأخر</th><th>بعذر</th><th>نسبة الحضور</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="empty-note">سجّل الطلاب أولاً من تبويب الطلاب.</p>')+
    '<p class="muted" style="margin-top:10px">نسبة الحضور = (الحاضر + المتأخر) ÷ كل الأيام المسجلة للطالب.</p></section>';
}

/* student panel */
function vStudent(){
  var c=curClass(),s=byId(c,U.student),list=sortedStudents(c),i=list.findIndex(function(x){return x.id===s.id;});
  var prev=list[i-1],next=list[i+1],st=statsFor(s),at=attOf(c,s.id);
  var tone=st.pct==null?'none':st.pct>=85?'ok':st.pct>=60?'warn':'bad';
  var segs=[['grades','الدرجات'],['att','الحضور'],['export','التصدير']];
  return '<div class="shead"><div class="sid"><span class="ring big t-'+tone+'" style="--p:'+(st.pct==null?0:Math.round(st.pct))+'"><b>'+(st.pct==null?'–':Math.round(st.pct))+'</b></span>'+
    '<div><h1>'+esc(s.name)+'</h1><p class="muted">'+esc(c.name)+(c.subject?' · '+esc(c.subject):'')+' · مقعد '+(s.seat+1)+(s.num?' · رقم '+esc(s.num):'')+'</p></div></div>'+
    '<div class="snav"><button type="button" class="btn ghost sm" data-act="stBack">→ رجوع</button>'+
    (prev?'<button type="button" class="btn sm" data-act="stNav" data-id="'+prev.id+'">→ السابق</button>':'')+
    (next?'<button type="button" class="btn sm" data-act="stNav" data-id="'+next.id+'">التالي ←</button>':'')+'</div></div>'+
    '<div class="kpis"><div class="kpi"><small>مجموع الدرجات</small><b>'+(st.n?fmt(st.sum)+' / '+fmt(st.max):'—')+'</b></div>'+
    '<div class="kpi"><small>النسبة الإجمالية</small><b>'+(st.pct==null?'—':fmt1(st.pct)+'%')+'</b></div>'+
    '<div class="kpi"><small>نسبة الحضور</small><b>'+(at.rate==null?'—':fmt1(at.rate)+'%')+'</b></div>'+
    '<div class="kpi"><small>أيام الغياب</small><b>'+at.a+'</b></div></div>'+
    '<div class="seg" style="margin-bottom:4px">'+segs.map(function(g){return '<button type="button" class="'+(U.seg===g[0]?'on':'')+'" data-act="seg" data-s="'+g[0]+'">'+g[1]+'</button>';}).join('')+'</div>'+
    (U.seg==='grades'?vStGrades(c,s):U.seg==='att'?vStAtt(c,s):vStExport(c,s));
}
function padHtml(k,s){
  var slot=U.pad.slot,cur=s.grades.find(function(g){return g.cat===k.id&&g.slot===slot;});
  var btns='',top=Math.floor(k.max);
  if(k.max<=20){
    for(var v=0;v<=top;v++)btns+='<button type="button" class="pn'+(cur&&cur.score===v?' on':'')+'" data-act="padv" data-v="'+v+'">'+v+'</button>';
    if(top!==k.max)btns+='<button type="button" class="pn" data-act="padv" data-v="'+k.max+'">'+fmt(k.max)+'</button>';
  }else{
    [100,90,80,70,60,50].forEach(function(p){var v=r2(k.max*p/100);btns+='<button type="button" class="pn" data-act="padv" data-v="'+v+'">'+fmt(v)+'</button>';});
  }
  return '<div class="pad"><div class="padtop"><span>الدرجة رقم '+(slot+1)+' من '+fmt(k.max)+'</span><span class="row" style="margin:0"><button type="button" class="btn ghost sm" data-act="padclear">مسح الدرجة</button><button type="button" class="btn ghost sm" data-act="padclose">إغلاق</button></span></div>'+
    '<div class="pns">'+btns+'</div><form class="padform" data-form="padcustom"><input name="v" type="number" step="any" min="0" max="'+k.max+'" placeholder="قيمة أخرى" aria-label="قيمة أخرى"><button class="btn sm">تسجيل</button></form></div>';
}
function symCard(c,s,k){
  var st=statsFor(s,k.id),fin=catFinal(s,k),cur=symGrade(s,k,U.attDate),cv=cur?cur.score:null;
  var hist=s.grades.filter(function(g){return g.cat===k.id;}).sort(function(a,b){return String(b.date).localeCompare(String(a.date));}).slice(0,30);
  var btn=function(v,label,txt){return '<button type="button" class="pn'+(cv!=null&&Math.abs(cv-v)<0.01?' on':'')+'" data-act="sym" data-cat="'+k.id+'" data-v="'+v+'">'+txt+' '+label+'</button>';};
  return '<article class="cat"><header><h3>'+esc(k.name)+'</h3><span class="muted">'+(st.n?st.n+' حصة مسجلة'+(fin!=null?' · المعتمدة '+fmt(fin)+' من '+fmt(k.weight):''):'لا توجد حصص مسجلة')+'</span></header>'+
    '<label class="f inline" style="margin-bottom:8px">تاريخ الحصة<input type="date" value="'+U.attDate+'" data-ch="attDate"></label>'+
    '<div class="pns">'+btn(1,'ممتازة','+')+btn(0.75,'عادية','✓')+btn(0,'لا مشاركة','−')+'<button type="button" class="pn" data-act="sym" data-cat="'+k.id+'" data-v="">مسح</button></div>'+
    (hist.length?'<div class="slots" style="margin-top:10px">'+hist.map(function(g){return '<span class="slot has" style="cursor:default" title="'+esc(g.date)+'"><i>'+esc(String(g.date).slice(5))+'</i><b>'+symOf(g.score)+'</b></span>';}).join('')+'</div>':'')+'</article>';
}
function groupCards(s){
  return groupsList().map(function(g){
    var t=groupTotal(s,g);
    var rows=g.cats.map(function(k){
      var st=rawStats(s,k.id),f=catFinal(s,k),sym=k.kind==='sym';
      return '<tr><td>'+esc(k.name)+'<small>'+(sym?'من الرموز: + = 1، ✓ = 0.75، − = 0، ويُقرَّب لنصف درجة':'(مجموع الدرجات ÷ الممكن) × '+fmt(k.weight))+'</small></td><td class="num">'+(st.n?(sym?st.n+' حصة':fmt(st.sum)+' / '+fmt(st.max)):'—')+'</td><td class="num">'+(st.n?fmt1(st.pct)+'%':'—')+'</td><td class="num"><b>'+(f==null?'—':fmt(f))+'</b> / '+fmt(k.weight)+'</td></tr>';
    }).join('');
    var dg=dedSum(s,g.name);if(dg>0)rows+='<tr><td>السلوك (خصم)<small>يُطرح من مجموع المجموعة</small></td><td class="num neg">− '+fmt(dg)+'</td><td class="num">—</td><td class="num neg"><b>− '+fmt(dg)+'</b></td></tr>';
    return '<section class="card"><div class="cardhead"><h2>'+esc(g.name)+'</h2><b class="num" style="font-size:20px">'+(t==null?'—':fmt(t))+' / '+fmt(g.max)+'</b></div><div class="tablewrap"><table><thead><tr><th>المكوّن</th><th>المدخل</th><th>النسبة</th><th>الدرجة المعتمدة</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
  }).join('');
}
function catCard(c,s,k){
  if(k.kind==='sym')return symCard(c,s,k);
  if(k.kind==='ded')return dedCard(c,s,k);
  var used=s.grades.filter(function(g){return g.cat===k.id&&g.slot!=null;});
  var maxSlot=used.reduce(function(m,g){return Math.max(m,g.slot);},-1),n=Math.max(k.count,maxSlot+1),by={};
  used.forEach(function(g){by[g.slot]=g;});
  var st=statsFor(s,k.id),slots='';
  for(var i=0;i<n;i++){var g=by[i],on=U.pad&&U.pad.cat===k.id&&U.pad.slot===i;
    slots+='<button type="button" class="slot'+(g?' has':'')+(on?' sel':'')+'" data-act="slot" data-cat="'+k.id+'" data-slot="'+i+'"><i>'+(i+1)+'</i><b>'+(g?fmt(g.score):'—')+'</b></button>';}
  slots+='<button type="button" class="slot'+(U.pad&&U.pad.cat===k.id&&U.pad.slot===n?' sel':'')+'" data-act="slot" data-cat="'+k.id+'" data-slot="'+n+'" title="إضافة درجة جديدة"><i>جديدة</i><b>+</b></button>';
  return '<article class="cat"><header><h3>'+esc(k.name)+'</h3><span class="muted">من '+fmt(k.max)+' · '+(st.n?'المتوسط '+fmt(st.pct/100*k.max)+' ('+fmt1(st.pct)+'%)':'لا توجد درجات')+(k.weight>0&&st.n?' · المعتمدة '+fmt(catFinal(s,k))+' من '+fmt(k.weight):'')+'</span></header><div class="slots">'+slots+'</div>'+(U.pad&&U.pad.cat===k.id?padHtml(k,s):'')+'</article>';
}
function manualForm(c,s){
  var cats=S.settings.cats.filter(function(k){return k.kind!=='sym'&&k.kind!=='ded';}),sel=cats.find(function(k){return k.id===U.mcat;})||cats[0];
  if(!sel)return '<p class="empty-note">لا توجد أنواع درجات. أضفها أولاً من تبويب الإعدادات.</p>';
  return '<form class="fgrid" data-form="manual">'+
    '<label class="f">نوع الدرجة<select name="cat" data-ch="manualCat">'+cats.map(function(k){return '<option value="'+k.id+'"'+(k.id===sel.id?' selected':'')+'>'+esc(k.name)+'</option>';}).join('')+'</select></label>'+
    '<label class="f">الدرجة النهائية<input name="max" type="number" step="any" min="0.01" required value="'+fmt(U.mmax||sel.max)+'"></label>'+
    '<label class="f">درجة الطالب<input name="score" id="mScore" type="number" step="any" min="0" required></label>'+
    '<label class="f">التاريخ<input name="date" type="date" value="'+today()+'"></label>'+
    '<label class="f">ملاحظة (اختياري)<input name="note" autocomplete="off"></label>'+
    '<button class="btn pri">حفظ في سجل الطالب</button></form>';
}
function vStGrades(c,s){
  var cats=S.settings.cats;
  var mode='<div class="seg"><button type="button" class="'+(U.gmode==='quick'?'on':'')+'" data-act="gmode" data-m="quick">إدخال سريع</button><button type="button" class="'+(U.gmode==='manual'?'on':'')+'" data-act="gmode" data-m="manual">إدخال يدوي</button></div>';
  var body=U.gmode==='quick'?(cats.length?'<div class="row" style="align-items:center;margin:0 0 12px"><label class="f inline">تاريخ الإدخال<input type="date" value="'+U.attDate+'" data-ch="attDate"></label><span class="muted">اضغط على خانة الدرجة ثم الرقم. يمكنك تسجيل أكثر من درجة من النوع نفسه في اليوم الواحد، وزر + يضيف خانة جديدة.</span></div><div class="catgrid">'+cats.map(function(k){return catCard(c,s,k);}).join('')+'</div>':'<p class="empty-note">لا توجد أنواع درجات. أضفها من تبويب الإعدادات.</p>'):manualForm(c,s);
  var recs=s.grades.slice().sort(function(a,b){return String(b.date).localeCompare(String(a.date));});
  var log=recs.length?'<div class="tablewrap"><table><thead><tr><th>التاريخ</th><th>اليوم والشهر</th><th>النوع</th><th>الدرجة</th><th>من</th><th>النسبة</th><th>ملاحظة</th><th></th></tr></thead><tbody>'+recs.map(function(g){var k=catById(g.cat);
    return '<tr><td><input type="date" value="'+esc(g.date)+'" data-ch="gradeDate" data-gid="'+g.id+'" aria-label="تاريخ الدرجة"></td><td>'+esc((dayName(g.date)?dayName(g.date)+' · ':'')+monthLabel(monthKey(g.date)))+'</td><td>'+esc(k?k.name:'(نوع محذوف)')+(g.slot!=null?' #'+(g.slot+1):'')+'</td>'+(k&&k.kind==='ded'?'<td class="num neg"><b>− '+fmt(g.score)+'</b></td><td class="num">—</td><td class="num">—</td>':k&&k.kind==='sym'?'<td class="num"><b>'+symOf(g.score)+'</b></td><td class="num">—</td><td class="num">—</td>':'<td class="num"><b>'+fmt(g.score)+'</b></td><td class="num">'+fmt(g.max)+'</td><td class="num">'+fmt1(g.score/g.max*100)+'%</td>')+'<td>'+esc(g.note)+'</td><td><button type="button" class="btn ghost sm" data-act="delGrade" data-gid="'+g.id+'">حذف</button></td></tr>';}).join('')+'</tbody></table></div>':'<p class="empty-note">لم تسجَّل أي درجة لهذا الطالب بعد.</p>';
  return groupCards(s)+'<section class="card"><div class="cardhead"><h2>إدخال الدرجات</h2>'+mode+'</div>'+body+'</section>'+
    '<section class="card"><div class="cardhead"><h2>سجل الطالب</h2><span class="muted">'+recs.length+' درجة</span></div>'+log+'</section>';
}
function vStAtt(c,s){
  var m=S.att[c.id]||{},dates=Object.keys(m).filter(function(d){return m[d][s.id];}).sort().reverse();
  var at=attOf(c,s.id);
  return '<section class="card"><div class="cardhead"><h2>حضور اليوم</h2><label class="f inline">التاريخ<input type="date" value="'+U.attDate+'" data-ch="attDate"></label></div>'+segBtns(attOn(c,U.attDate,s.id),s.id)+
    '<p class="muted" style="margin-top:10px">حضور '+at.p+' · غياب '+at.a+' · تأخر '+at.l+' · بعذر '+at.e+'</p></section>'+
    '<section class="card"><div class="cardhead"><h2>الأيام المسجلة</h2><span class="muted">'+dates.length+' يوم</span></div>'+
    (dates.length?'<div class="tablewrap"><table><thead><tr><th>التاريخ</th><th>الحالة</th></tr></thead><tbody>'+dates.slice(0,90).map(function(d){var v=m[d][s.id];
      return '<tr><td class="num">'+d+'</td><td><select data-ch="attDay" data-date="'+d+'">'+ATT_KEYS.map(function(k){return '<option value="'+k+'"'+(v===k?' selected':'')+'>'+ATT[k].t+'</option>';}).join('')+'<option value="">مسح التسجيل</option></select></td></tr>';}).join('')+'</tbody></table></div>':'<p class="empty-note">لا توجد أيام مسجلة لهذا الطالب.</p>')+'</section>';
}
function exPeriodUi(){
  var c=curClass(),ms={},ws={};
  if(c)c.students.forEach(function(s){s.grades.forEach(function(g){if(!parseD(g.date))return;ms[monthKey(g.date)]=(ms[monthKey(g.date)]||0)+1;var w=weekStart(g.date);ws[w]=(ws[w]||0)+1;});});
  var modes=[['all','كل الفترة'],['months','شهر أو عدة شهور'],['weeks','أسبوع أو عدة أسابيع']];
  var h='<div class="periodbox"><b>الفترة</b><div class="seg">'+modes.map(function(m){return '<button type="button" class="'+(U.exPer===m[0]?'on':'')+'" data-act="exPerMode" data-m="'+m[0]+'">'+m[1]+'</button>';}).join('')+'</div>';
  if(U.exPer==='months'||U.exPer==='weeks'){
    var isM=U.exPer==='months',map=isM?ms:ws,sel=isM?U.exMonths:U.exWeeks,keys=Object.keys(map).sort().reverse();
    h+=keys.length?'<div class="pickbox">'+keys.map(function(k){return '<label class="pk"><input type="checkbox" data-ch="exPerOne" data-v="'+k+'"'+(sel.indexOf(k)>=0?' checked':'')+'> '+esc(isM?monthLabel(k):'من '+k+' إلى '+weekEnd(k)+' ('+DAYS[6]+' – '+DAYS[5]+')')+' <small class="muted">'+map[k]+' درجة</small></label>';}).join('')+'</div>'+
      '<div class="row" style="align-items:center"><button type="button" class="btn ghost sm" data-act="exPerAll">تحديد الكل</button><button type="button" class="btn ghost sm" data-act="exPerNone">إلغاء التحديد</button><span class="muted">'+(sel.length?'محدد '+sel.length:'اختر واحداً على الأقل')+'</span></div>':'<p class="muted">لا توجد درجات مؤرخة بعد.</p>';
  }
  return h+'</div>';
}
function exOptions(){
  var o=function(v,t,d){return '<label class="opt'+(U.exType===v?' on':'')+'"><input type="radio" name="exType" value="'+v+'" data-ch="exOpt" data-k="exType"'+(U.exType===v?' checked':'')+'><div><b>'+t+'</b><span>'+d+'</span></div></label>';};
  return '<div class="opts">'+
    o('both','الدرجات والمتوسطات معاً (الأفضل)','ملف واحد بأوراق: المتوسطات، كل الدرجات، السجل التفصيلي بالتاريخ والشهر، والمتوسط الشهري.')+
    o('all','كل الدرجات المدخلة','ورقة بكل درجة في عمود، وورقة سجل تفصيلي لكل درجة بتاريخها وشهرها.')+
    o('avg','متوسط الدرجات حسب التصنيف','متوسط كل نوع (واجب، اختبار، مشاركة…) والمجموعات، وورقة المتوسط الشهري.')+'</div>'+
    exPeriodUi()+
    '<label class="chk"><input type="checkbox" data-ch="exOpt" data-k="exAtt"'+(U.exAtt?' checked':'')+'> إضافة أعمدة الحضور والغياب</label>';
}
function vStExport(c,s){
  return '<section class="card"><div class="cardhead"><h2>التصدير إلى Excel</h2></div><p class="muted">اختر نوع التصدير، ثم صدّر درجات هذا الطالب أو كل طلاب الفصل أو طلاباً تختارهم. يُنزَّل الملف بصيغة Excel (xlsx): اسم الطالب في الصف، ونوع الدرجة في العمود.</p>'+exOptions()+
    '<div class="row"><button type="button" class="btn pri" data-act="doExport" data-scope="student" data-sid="'+s.id+'">تصدير درجات '+esc(s.name)+'</button>'+
    '<button type="button" class="btn" data-act="doExport" data-scope="class" data-sid="'+s.id+'">تصدير كل الفصل</button>'+
    '<button type="button" class="btn ghost" data-act="exPickFromStudent">اختيار طلاب معينين…</button></div></section>';
}

/* export tab */
function previewHtml(sh){
  if(!sh.rows.length)return '<p class="empty-note">لا توجد بيانات لهذه الورقة بعد.</p>';
  var shown=sh.rows.slice(0,40),colColor=[];
  sh.head1.forEach(function(h){var cs=h.cs||1;for(var j=0;j<cs;j++)colColor.push(h.c==null?null:h.c);});
  var th=function(c){return c==null?'':' style="background:#'+PAL[c][0]+';color:#15302e"';};
  var td=function(c){return c==null?'':' style="background:#'+PAL[c][1]+';color:#15302e"';};
  var h1=sh.head1.map(function(h){return '<th colspan="'+(h.cs||1)+'" rowspan="'+(h.rs||1)+'"'+th(h.c)+'>'+esc(h.t)+'</th>';}).join('');
  var h2=sh.head2?'<tr>'+sh.head2.map(function(t,j){return t==null?'':'<th'+th(colColor[j])+'>'+esc(t)+'</th>';}).join('')+'</tr>':'';
  var body=shown.map(function(r,i){
    var sum=sh.sum&&sh.sum.indexOf(i)>=0,rc=sh.rowColors?sh.rowColors[i]:null;
    return '<tr'+(sum?' class="sumrow"':'')+'>'+r.map(function(v,j){var c=sum?null:(rc!=null?rc:colColor[j]);return '<td class="'+(typeof v==='number'?'num':'')+'"'+td(c)+'>'+esc(v)+'</td>';}).join('')+'</tr>';
  }).join('');
  return '<div class="tablewrap"><table class="xp"><thead><tr>'+h1+'</tr>'+h2+'</thead><tbody>'+body+'</tbody></table></div>'+
    (sh.rows.length>shown.length?'<p class="muted" style="margin-top:8px">المعاينة تعرض أول '+shown.length+' صفاً من '+sh.rows.length+'. ملف Excel يحتوي كل الصفوف.</p>':'');
}
function vExport(){
  var c=curClass();if(!c)return vNoClass();
  var list=sortedStudents(c);
  if(!U.exStudent||!byId(c,U.exStudent))U.exStudent=list.length?list[0].id:null;
  U.exPick=(U.exPick||[]).filter(function(id){return byId(c,id);});
  var scope=U.exScope;if(scope==='student'&&!U.exStudent)scope='class';
  var wb=buildWorkbook(c,scope,U.exStudent,U.exType,U.exAtt);
  var si=Math.min(U.exSheet||0,wb.sheets.length-1);
  var scopes=[['class','كل طلاب الفصل'],['student','طالب واحد'],['pick','طلاب معينون']];
  var extra='';
  if(scope==='student'){
    extra='<select data-ch="exStudent" aria-label="الطالب">'+list.map(function(s){return '<option value="'+s.id+'"'+(s.id===U.exStudent?' selected':'')+'>'+esc(s.name)+'</option>';}).join('')+'</select>';
  }else if(scope==='pick'){
    extra='<div style="width:100%"><div class="pickbox">'+list.map(function(s){return '<label class="pk"><input type="checkbox" data-ch="exPickOne" data-id="'+s.id+'"'+(U.exPick.indexOf(s.id)>=0?' checked':'')+'> '+esc(s.name)+'</label>';}).join('')+'</div>'+
      '<div class="row" style="align-items:center"><button type="button" class="btn ghost sm" data-act="exPickAll">تحديد الكل</button><button type="button" class="btn ghost sm" data-act="exPickNone">إلغاء التحديد</button><span class="muted">محدد '+U.exPick.length+' من '+list.length+'</span></div></div>';
  }
  var args='data-scope="'+scope+'" data-sid="'+(U.exStudent||'')+'"';
  return '<div class="head"><h1>تصدير الدرجات</h1>'+classPick()+'</div>'+
    '<section class="card"><h2>ما الذي تريد تصديره؟</h2>'+
    '<div class="row" style="align-items:center"><div class="seg">'+scopes.map(function(x){return '<button type="button" class="'+(scope===x[0]?'on':'')+'" data-act="exScope" data-s="'+x[0]+'">'+x[1]+'</button>';}).join('')+'</div>'+extra+'</div>'+
    exOptions()+
    '<div class="row"><button type="button" class="btn pri" data-act="doExport" '+args+'>تنزيل ملف Excel</button><button type="button" class="btn" data-act="copyExport" '+args+'>نسخ الورقة المعروضة كجدول</button></div></section>'+
    '<section class="card"><div class="cardhead"><h2>معاينة الورقة</h2><span class="muted">'+esc(wb.name)+'</span></div>'+
    (wb.sheets.length>1?'<div class="seg" style="margin-bottom:12px">'+wb.sheets.map(function(sh,i){return '<button type="button" class="'+(i===si?'on':'')+'" data-act="exSheet" data-i="'+i+'">'+esc(sh.name)+'</button>';}).join('')+'</div>':'')+
    previewHtml(wb.sheets[si])+'</section>';
}

/* settings */
function vSettings(){
  var cats=S.settings.cats,c=curClass();
  var rows=cats.map(function(k){var sym=k.kind==='sym',ded=k.kind==='ded',id=' data-ch="catField" data-id="'+k.id+'"';return '<tr class="cfg"><td><input value="'+esc(k.name)+'"'+id+' data-f="name" aria-label="اسم النوع"></td>'+
    '<td><select'+id+' data-f="kind" aria-label="طريقة الإدخال"><option value="num"'+(sym||ded?'':' selected')+'>درجات</option><option value="sym"'+(sym?' selected':'')+'>رموز + ✓ −</option><option value="ded"'+(ded?' selected':'')+'>خصم (سلوك)</option></select></td>'+
    '<td>'+(sym||ded?'<span class="muted">—</span>':'<input type="number" min="1" max="30" value="'+k.count+'"'+id+' data-f="count" aria-label="عدد الدرجات">')+'</td>'+
    '<td>'+(sym||ded?'<span class="muted">—</span>':'<input type="number" min="0.01" step="any" value="'+fmt(k.max)+'"'+id+' data-f="max" aria-label="الدرجة الكاملة">')+'</td>'+
    '<td>'+(ded?'<span class="muted">—</span>':'<input type="number" min="0" step="any" value="'+(k.weight?fmt(k.weight):'')+'" placeholder="بدون"'+id+' data-f="weight" aria-label="الدرجة المعتمدة">')+'</td>'+
    '<td><input value="'+esc(k.group||'')+'" placeholder="بدون"'+id+' data-f="group" aria-label="المجموعة"></td>'+
    '<td><button type="button" class="btn ghost sm" data-act="delCat" data-id="'+k.id+'">حذف</button></td></tr>';}).join('');
  var clsCard=c?'<section class="card"><div class="cardhead"><h2>إعدادات الفصل</h2>'+classPick()+'</div><div class="fgrid">'+
    '<label class="f">اسم الفصل<input value="'+esc(c.name)+'" data-ch="clsField" data-f="name"></label>'+
    '<label class="f">المادة<input value="'+esc(c.subject)+'" data-ch="clsField" data-f="subject"></label>'+
    '<label class="f">مقاعد في الصف الواحد<input type="number" min="2" max="10" value="'+c.cols+'" data-ch="clsField" data-f="cols"></label>'+
    '<label class="f">عدد الصفوف<input type="number" min="1" max="12" value="'+c.rows+'" data-ch="clsField" data-f="rows"></label></div>'+
    '<div class="row" style="margin-top:14px"><button type="button" class="btn" data-act="newClass">+ فصل جديد</button><button type="button" class="btn danger" data-act="delClass">حذف هذا الفصل</button></div></section>':'<section class="card"><h2>الفصول</h2><p class="muted" style="margin-top:6px">لا توجد فصول بعد.</p><div class="row"><button type="button" class="btn pri" data-act="newClass">+ فصل جديد</button></div></section>';
  return '<div class="head"><h1>الإعدادات</h1></div>'+
    '<section class="card"><div class="cardhead"><h2>أنواع الدرجات</h2></div><p class="muted">حدّد نوع الدرجة وكم درجة تُسجَّل منه، والدرجة الكاملة لكل درجة. تظهر هذه الأنواع في الإدخال السريع والإدخال اليدوي وفي التصدير.</p><p class="muted" style="margin-top:6px"><b>الدرجة المعتمدة:</b> إن كتبتَ رقماً (مثل 6) تُحوَّل درجات النوع إلى هذا الرقم بالمعادلة (مجموع درجات الطالب ÷ الممكن) × الرقم، وغياب الطالب بعذر لا يُحسب صفراً لأن المتوسط يؤخذ من الدرجات المدخلة فقط. <b>المجموعة:</b> الأنواع التي تحمل اسم مجموعة واحداً تُجمع معاً (مثل المشاركة اليومية من 12). <b>رموز + ✓ −:</b> للتفاعل داخل الصف، وتُسجَّل من خريطة الجلوس (وضع تسجيل التفاعل). <b>خصم (سلوك):</b> يُسجَّل من وضع تسجيل السلوك بنصف درجة أو درجة، ويُطرح بالأحمر من مجموع المجموعة التي يحمل اسمها (اتركها فارغة ليُطرح من الإجمالي فقط).</p>'+
    '<div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>نوع الدرجة</th><th>طريقة الإدخال</th><th>عدد الخانات الظاهرة</th><th>الدرجة الكاملة لكل درجة</th><th>الدرجة المعتمدة</th><th>المجموعة</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="row" style="margin-top:12px"><button type="button" class="btn pri" data-act="addCat">+ إضافة نوع درجة</button><button type="button" class="btn" data-act="tplDaily">إضافة قالب المشاركة اليومية (12 درجة)</button></div></section>'+
    clsCard+syncCard()+
    '<section class="card"><h2>نسخة احتياطية</h2><p class="muted" style="margin-top:6px">نزّل نسخة من كل الفصول والطلاب والدرجات والحضور، أو استعدها من ملف سابق.</p>'+
    '<div class="row"><button type="button" class="btn" data-act="backup">تنزيل نسخة احتياطية</button><button type="button" class="btn" data-act="restorePick">استعادة من ملف</button><input type="file" id="restoreIn" accept=".json,application/json" hidden data-ch="restore"></div></section>';
}

/* ---------- overlays ---------- */
function modal(html){var m=$('#modal');m.innerHTML='<div class="ov" data-act="mclose"><div class="dlg" role="dialog" aria-modal="true">'+html+'</div></div>';m.hidden=false;var i=$('#modal input:not([type=hidden]),#modal textarea');if(i)i.focus();}
function closeModal(){var m=$('#modal');m.hidden=true;m.innerHTML='';if(U._ask){var r=U._ask;U._ask=null;r(false);}}
function ask(msg,ok){return new Promise(function(res){modal('<p class="q">'+esc(msg)+'</p><div class="row"><button type="button" class="btn danger" data-act="askok">'+esc(ok||'حذف')+'</button><button type="button" class="btn ghost" data-act="mcancel">إلغاء</button></div>');U._ask=res;});}
var toastT=null,undoFn=null;
function toast(msg,undo){var el=$('#toast');undoFn=undo||null;el.innerHTML='<span>'+esc(msg)+'</span>'+(undo?'<button type="button" class="btn sm" data-act="undo">تراجع</button>':'');el.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){el.hidden=true;undoFn=null;},undo?6000:3200);}
function classModal(){modal('<h2>فصل جديد</h2><form data-form="newClass" class="stack">'+classFields()+'<div class="row"><button class="btn pri">إنشاء الفصل</button><button type="button" class="btn ghost" data-act="mcancel">إلغاء</button></div></form>');}
function studentModal(c,s,seat){
  modal('<h2>'+(s?'تعديل بيانات الطالب':'إضافة طالب')+'</h2><form data-form="stu" class="stack"><input type="hidden" name="sid" value="'+(s?s.id:'')+'">'+
    '<label class="f">اسم الطالب<input name="name" required value="'+esc(s?s.name:'')+'" autocomplete="off"></label>'+
    '<label class="f">رقم الطالب (اختياري)<input name="num" value="'+esc(s?s.num:'')+'" autocomplete="off"></label>'+
    '<label class="f">رقم المقعد<input name="seat" type="number" min="1" value="'+(s?s.seat+1:(seat!=null?seat+1:''))+'" placeholder="تلقائي"></label>'+
    '<div class="row"><button class="btn pri">حفظ</button><button type="button" class="btn ghost" data-act="mcancel">إلغاء</button></div></form>');
}

/* ---------- export (Excel) ---------- */
function exStudents(c,scope,sid){
  var all=sortedStudents(c);
  if(scope==='student')return all.filter(function(s){return s.id===sid;});
  if(scope==='pick'){var set={};(U.exPick||[]).forEach(function(i){set[i]=1;});return all.filter(function(s){return set[s.id];});}
  return all;
}
var PAL=[['9FD3CB','E4F3F0'],['F2CF8E','FBF0D8'],['A9C8EC','E5EEF9'],['CDB6E6','F0E9F8'],['B6DDA0','EBF5E3'],['F0B4B4','FAE6E6'],['E57373','FDE3E3']];
var MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function monthLabel(k){var p=String(k).split('-');if(p.length<2||!p[0]||!MONTHS[(+p[1])-1])return 'بدون تاريخ';return MONTHS[(+p[1])-1]+' '+p[0];}
function buildWorkbook(c,scope,sid,type,withAtt){
  PF=periodPF();
  try{return buildWB(c,scope,sid,type,withAtt);}finally{PF=null;}
}
function buildWB(c,scope,sid,type,withAtt){
  var cats=S.settings.cats,list=exStudents(c,scope,sid),groups=groupsList();
  var lbl=scope==='student'&&list[0]?list[0].name:scope==='pick'?'طلاب محددون':'كل الفصل';
  var typeLbl=type==='both'?'الدرجات والمتوسطات':type==='all'?'كل الدرجات المدخلة':'متوسط الدرجات حسب التصنيف';
  var title=c.name+(c.subject?' - '+c.subject:'')+'  |  '+typeLbl+'  |  '+lbl+(periodLabel()?'  |  الفترة: '+periodLabel():'')+'  |  '+today();
  var safe=function(x){return String(x).replace(/[\\\/:*?"<>|]+/g,'').trim().replace(/\s+/g,'-');};
  var name=safe(c.name)+'-'+safe(typeLbl)+'-'+safe(lbl)+(periodLabel()?'-'+safe(periodLabel()).slice(0,40):'')+'.xlsx';
  /* لون لكل مجموعة، ولون لكل نوع خارج المجموعات */
  var gi={},colorOf={},next=0;
  groups.forEach(function(g){gi[g.name]=(next++)%6;});
  cats.forEach(function(k){if(k.weight>0&&k.group)colorOf[k.id]=gi[k.group];});
  cats.forEach(function(k){if(k.kind==='ded')colorOf[k.id]=6;});
  cats.forEach(function(k){if(colorOf[k.id]==null)colorOf[k.id]=(next++)%6;});
  var byDate=function(a,b){return String(a.date).localeCompare(String(b.date))||((a.slot==null?999:a.slot)-(b.slot==null?999:b.slot));};
  var gradesOf=function(s,id,m){return s.grades.filter(function(g){return g.cat===id&&(!m||monthKey(g.date)===m)&&(!PF||PF(g.date));}).sort(byDate);};
  var NUM2=['اسم الطالب','رقم الطالب'];

  function addTail(head1,head2,cols){
    groups.forEach(function(g){head1.push({t:g.name,cs:1,c:gi[g.name]});head2.push('المجموع من '+fmt(g.max));cols.push(function(s,m){var t=groupTotal(s,g,m);return t==null?'':t;});});
    head1.push({t:'الإجمالي',cs:3});head2.push('المجموع','من','النسبة %');
    cols.push(function(s,m){var t=statsFor(s,undefined,m);return t.n?r2(t.sum):'';});
    cols.push(function(s,m){var t=statsFor(s,undefined,m);return t.n?r2(t.max):'';});
    cols.push(function(s,m){var t=statsFor(s,undefined,m);return t.n?r1(t.pct):'';});
    if(withAtt){
      head1.push({t:'الحضور والغياب',cs:5});head2.push('حضور','غياب','تأخر','بعذر','نسبة الحضور %');
      ['p','a','l','e'].forEach(function(k){cols.push(function(s,m){return attOf(c,s.id,m)[k];});});
      cols.push(function(s,m){var a=attOf(c,s.id,m);return a.rate==null?'':r1(a.rate);});
    }
  }
  function addFinal(head1,head2,cols,k){
    if(!(k.weight>0))return;
    head1.push({t:k.name+' - المعتمدة',cs:1,c:colorOf[k.id]});head2.push('من '+fmt(k.weight));
    cols.push(function(s,m){var f=catFinal(s,k,m);return f==null?'':f;});
  }
  function withAvgRow(rows,startCol){
    var sum=[];
    if(rows.length>1){
      var avg=['متوسط المجموعة',''];
      for(var i=2;i<rows[0].length;i++){
        var nums=rows.map(function(r){return r[i];}).filter(function(v){return typeof v==='number';});
        avg.push(nums.length?r2(nums.reduce(function(a,b){return a+b;},0)/nums.length):'');
      }
      sum.push(rows.length);rows.push(avg);
    }
    return sum;
  }

  /* المتوسطات (كل الفترة) أو المتوسط الشهري */
  function summarySheet(monthMode){
    var head1=[{t:NUM2[0],rs:2},{t:monthMode?'الشهر':NUM2[1],rs:2}],head2=[null,null],cols=[];
    cats.forEach(function(k){
      var col=colorOf[k.id];
      if(k.kind==='ded'){
        head1.push({t:k.name+' (خصم)',cs:2,c:col});head2.push('عدد المرات','مجموع الخصم');
        cols.push(function(s,m){var st=rawStats(s,k.id,m);return st.n?st.n:'';});
        cols.push(function(s,m){var st=rawStats(s,k.id,m);return st.n?-r2(st.sum):'';});
        return;
      }
      if(k.kind==='sym'){
        head1.push({t:k.name+' (عدد المرات)',cs:3,c:col});head2.push('+','✓','−');
        [1,0.75,0].forEach(function(v){cols.push(function(s,m){return gradesOf(s,k.id,m).filter(function(g){return Math.abs(g.score-v)<0.01;}).length;});});
      }else{
        head1.push({t:k.name+' (من '+fmt(k.max)+')',cs:3,c:col});head2.push('المتوسط','النسبة %','العدد');
        cols.push(function(s,m){var st=rawStats(s,k.id,m);return st.n&&st.pct!=null?r2(st.pct/100*k.max):'';});
        cols.push(function(s,m){var st=rawStats(s,k.id,m);return st.n?r1(st.pct):'';});
        cols.push(function(s,m){var st=rawStats(s,k.id,m);return st.n?st.n:'';});
      }
      addFinal(head1,head2,cols,k);
    });
    addTail(head1,head2,cols);
    var rows=[],sum=[];
    if(!monthMode){
      rows=list.map(function(s){return [s.name,s.num].concat(cols.map(function(f){return f(s);}));});
      sum=withAvgRow(rows);
    }else{
      var months={};
      list.forEach(function(s){s.grades.forEach(function(g){if(!PF||PF(g.date))months[monthKey(g.date)]=1;});});
      Object.keys(months).sort().forEach(function(m){
        list.forEach(function(s){
          if(!s.grades.some(function(g){return monthKey(g.date)===m&&(!PF||PF(g.date));}))return;
          rows.push([s.name,monthLabel(m)].concat(cols.map(function(f){return f(s,m);})));
        });
      });
    }
    return {name:monthMode?'المتوسط الشهري':'المتوسطات',title:title,head1:head1,head2:head2,rows:rows,sum:sum,note:'',freezeCols:1};
  }

  /* كل درجة في عمود */
  function gridSheet(){
    var head1=[{t:NUM2[0],rs:2},{t:NUM2[1],rs:2}],head2=[null,null],cols=[],known={};
    cats.forEach(function(k){
      known[k.id]=1;var col=colorOf[k.id],sym=k.kind==='sym',ded=k.kind==='ded';
      var ns=(sym||ded)?0:k.count;
      list.forEach(function(s){ns=Math.max(ns,gradesOf(s,k.id).length);});
      if(ns){
        head1.push({t:k.name+(sym?' (رموز بالتاريخ)':ded?' (خصم)':' (من '+fmt(k.max)+')'),cs:ns,c:col});
        for(var i=0;i<ns;i++){head2.push(i+1);(function(i){cols.push(function(s){var a=gradesOf(s,k.id);return a[i]?(sym?symOf(a[i].score):ded?-a[i].score:a[i].score):'';});})(i);}
      }
      addFinal(head1,head2,cols,k);
    });
    var no=0;
    list.forEach(function(s){no=Math.max(no,s.grades.filter(function(g){return !known[g.cat]&&(!PF||PF(g.date));}).length);});
    if(no){
      head1.push({t:'نوع محذوف',cs:no});
      for(var q=0;q<no;q++){head2.push(q+1);(function(q){cols.push(function(s){var a=s.grades.filter(function(g){return !known[g.cat]&&(!PF||PF(g.date));}).sort(byDate);return a[q]?a[q].score:'';});})(q);}
    }
    addTail(head1,head2,cols);
    var rows=list.map(function(s){return [s.name,s.num].concat(cols.map(function(f){return f(s);}));});
    var sum=withAvgRow(rows);
    return {name:'كل الدرجات',title:title,head1:head1,head2:head2,rows:rows,sum:sum,note:'الدرجات مرتبة في كل نوع من الأقدم إلى الأحدث، وتاريخ كل درجة وشهرها في ورقة «السجل التفصيلي».',freezeCols:1};
  }

  /* سجل كل درجة بتاريخها وشهرها */
  function detailSheet(){
    var order=function(id){var i=cats.findIndex(function(k){return k.id===id;});return i<0?999:i;};
    var head1=['اسم الطالب','رقم الطالب','المجموعة','نوع الدرجة','الدرجة','الدرجة النهائية','النسبة %','اليوم','التاريخ','الشهر','الأسبوع (من السبت)','ملاحظة'].map(function(t){return {t:t};});
    var rows=[],rc=[];
    list.forEach(function(s){
      var gs=s.grades.filter(function(g){return !PF||PF(g.date);}).sort(function(a,b){return String(a.date).localeCompare(String(b.date))||order(a.cat)-order(b.cat)||((a.slot==null?999:a.slot)-(b.slot==null?999:b.slot));});
      gs.forEach(function(g){
        var k=catById(g.cat),sym=k&&k.kind==='sym',ded=k&&k.kind==='ded';
        rows.push([s.name,s.num,k&&(k.weight>0||ded)&&k.group?k.group:'',k?k.name:'(نوع محذوف)',sym?symOf(g.score):ded?-g.score:g.score,(sym||ded)?'':g.max,(sym||ded)?'':r1(g.score/g.max*100),dayName(g.date),g.date,monthLabel(monthKey(g.date)),weekLabel(g.date),g.note]);
        rc.push(k?colorOf[k.id]:null);
      });
    });
    return {name:'السجل التفصيلي',title:title,head1:head1,head2:null,rows:rows,rowColors:rc,sum:[],filter:true,note:'كل صف درجة واحدة بيومها وتاريخها وشهرها وأسبوعها، ولون الصف حسب النوع. استعمل أسهم العناوين للتصفية حسب الطالب أو النوع أو الشهر.',freezeCols:1};
  }

  var sheets=type==='both'?[summarySheet(false),gridSheet(),detailSheet(),summarySheet(true)]:type==='all'?[gridSheet(),detailSheet()]:[summarySheet(false),summarySheet(true)];
  return {sheets:sheets,name:name,count:list.length};
}
function flatHead(sh){
  var out=[],col=0;
  sh.head1.forEach(function(h){var cs=h.cs||1;for(var j=0;j<cs;j++){var sub=sh.head2?sh.head2[col+j]:null;out.push(sub==null?h.t:h.t+' '+sub);}col+=cs;});
  return out;
}
function toTsv(sh){
  var clean=function(v){return String(v==null?'':v).replace(/[\t\r\n]+/g,' ');};
  return [flatHead(sh)].concat(sh.rows).map(function(r){return r.map(clean).join('\t');}).join('\n');
}

/* minimal .xlsx writer: zip (stored) + SpreadsheetML, no libraries */
var CRC_T=null;
function crc32(b){
  if(!CRC_T){CRC_T=new Uint32Array(256);for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;CRC_T[n]=c>>>0;}}
  var x=0xFFFFFFFF;for(var i=0;i<b.length;i++)x=CRC_T[(x^b[i])&255]^(x>>>8);
  return (x^0xFFFFFFFF)>>>0;
}
function zipStore(files){
  var enc=new TextEncoder(),chunks=[],central=[],offset=0,d=new Date();
  var time=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  files.forEach(function(f){
    var nm=enc.encode(f.name),crc=crc32(f.data),sz=f.data.length;
    var lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);lh.setUint16(10,time,true);lh.setUint16(12,date,true);
    lh.setUint32(14,crc,true);lh.setUint32(18,sz,true);lh.setUint32(22,sz,true);lh.setUint16(26,nm.length,true);lh.setUint16(28,0,true);
    chunks.push(new Uint8Array(lh.buffer),nm,f.data);
    var ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);ch.setUint16(12,time,true);ch.setUint16(14,date,true);
    ch.setUint32(16,crc,true);ch.setUint32(20,sz,true);ch.setUint32(24,sz,true);ch.setUint16(28,nm.length,true);ch.setUint16(30,0,true);ch.setUint16(32,0,true);ch.setUint16(34,0,true);ch.setUint16(36,0,true);ch.setUint32(38,0,true);ch.setUint32(42,offset,true);
    central.push(new Uint8Array(ch.buffer),nm);
    offset+=30+nm.length+sz;
  });
  var csize=0;central.forEach(function(x){csize+=x.length;});
  var end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(4,0,true);end.setUint16(6,0,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,csize,true);end.setUint32(16,offset,true);end.setUint16(20,0,true);
  var all=chunks.concat(central,[new Uint8Array(end.buffer)]),total=0;
  all.forEach(function(x){total+=x.length;});
  var out=new Uint8Array(total),p=0;
  all.forEach(function(x){out.set(x,p);p+=x.length;});
  return out;
}
function colName(i){var s='';i++;while(i>0){var m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;}
function xe(s){return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function cellXml(r,c,v,s){
  var ref=colName(c)+r;
  if(v===''||v==null)return '<c r="'+ref+'" s="'+s+'"/>';
  if(typeof v==='number'&&isFinite(v))return '<c r="'+ref+'" s="'+s+'"><v>'+v+'</v></c>';
  return '<c r="'+ref+'" s="'+s+'" t="inlineStr"><is><t xml:space="preserve">'+xe(v)+'</t></is></c>';
}
function sheetXml(sh){
  var nc=sh.head1.reduce(function(a,h){return a+(h.cs||1);},0),rows=[],merges=[],r=1,colColor=[];
  sh.head1.forEach(function(h){var cs=h.cs||1;for(var j=0;j<cs;j++)colColor.push(h.c==null?null:h.c);});
  if(sh.title){rows.push('<row r="1" ht="28" customHeight="1">'+cellXml(1,0,sh.title,1)+'</row>');merges.push('A1:'+colName(nc-1)+'1');r=2;}
  var hr1=r,hr2=sh.head2?r+1:0,cells='',col=0;
  sh.head1.forEach(function(h){
    var cs=h.cs||1,rs=h.rs||1,st=h.c!=null?7+h.c*3:2;
    for(var j=0;j<cs;j++)cells+=cellXml(hr1,col+j,j===0?h.t:'',st);
    if(cs>1||rs>1)merges.push(colName(col)+hr1+':'+colName(col+cs-1)+(hr1+rs-1));
    col+=cs;
  });
  rows.push('<row r="'+hr1+'" ht="24" customHeight="1">'+cells+'</row>');
  if(sh.head2){
    cells='';
    sh.head2.forEach(function(t,j){cells+=cellXml(hr2,j,t==null?'':t,colColor[j]!=null?7+colColor[j]*3:2);});
    rows.push('<row r="'+hr2+'" ht="22" customHeight="1">'+cells+'</row>');
  }
  var first=(hr2||hr1)+1,widths=[];
  for(var j2=0;j2<nc;j2++)widths.push(j2===0?24:j2===1?12:8);
  var grow=function(j,v){if(j<nc){var l=String(v==null?'':v).length*1.25+3;if(l>widths[j])widths[j]=Math.min(l,42);}};
  var hc=0;sh.head1.forEach(function(h){if((h.cs||1)===1)grow(hc,h.t);hc+=(h.cs||1);});
  if(sh.head2)sh.head2.forEach(function(t,j){if(t!=null)grow(j,t);});
  sh.rows.forEach(function(row,i){
    var isSum=sh.sum&&sh.sum.indexOf(i)>=0,rr=first+i,cs='',rc=sh.rowColors?sh.rowColors[i]:null;
    row.forEach(function(v,j){
      grow(j,v);
      var text=j===0||(typeof v==='string'&&v!=='');
      var c=isSum?null:(rc!=null?rc:colColor[j]);
      var st=isSum?(text?5:6):c!=null?(text?9+c*3:8+c*3):(text?3:4);
      cs+=cellXml(rr,j,v,st);
    });
    rows.push('<row r="'+rr+'">'+cs+'</row>');
  });
  var last=first+sh.rows.length-1;
  if(sh.note){last+=2;rows.push('<row r="'+last+'">'+cellXml(last,0,sh.note,0)+'</row>');}
  var fc=sh.freezeCols||0,yS=first-1,pane;
  if(fc)pane='<pane xSplit="'+fc+'" ySplit="'+yS+'" topLeftCell="'+colName(fc)+first+'" activePane="bottomRight" state="frozen"/><selection pane="topRight" activeCell="'+colName(fc)+'1" sqref="'+colName(fc)+'1"/><selection pane="bottomLeft" activeCell="A'+first+'" sqref="A'+first+'"/><selection pane="bottomRight" activeCell="'+colName(fc)+first+'" sqref="'+colName(fc)+first+'"/>';
  else pane='<pane ySplit="'+yS+'" topLeftCell="A'+first+'" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A'+first+'" sqref="A'+first+'"/>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'+
    '<dimension ref="A1:'+colName(nc-1)+Math.max(last,hr2||hr1)+'"/>'+
    '<sheetViews><sheetView rightToLeft="1" workbookViewId="0">'+pane+'</sheetView></sheetViews>'+
    '<sheetFormatPr defaultRowHeight="18"/>'+
    '<cols>'+widths.map(function(w,i){return '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+Math.round(w*10)/10+'" customWidth="1"/>';}).join('')+'</cols>'+
    '<sheetData>'+rows.join('')+'</sheetData>'+
    (sh.filter&&sh.rows.length?'<autoFilter ref="A'+hr1+':'+colName(nc-1)+(first+sh.rows.length-1)+'"/>':'')+
    (merges.length?'<mergeCells count="'+merges.length+'">'+merges.map(function(m){return '<mergeCell ref="'+m+'"/>';}).join('')+'</mergeCells>':'')+
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
}
function stylesXml(){
  var b='<border><left style="thin"><color rgb="FFBFD0CE"/></left><right style="thin"><color rgb="FFBFD0CE"/></right><top style="thin"><color rgb="FFBFD0CE"/></top><bottom style="thin"><color rgb="FFBFD0CE"/></bottom><diagonal/></border>';
  var f=function(extra){return '<font>'+extra+'<name val="Arial"/><family val="2"/></font>';};
  var fill=function(hex){return '<fill><patternFill patternType="solid"><fgColor rgb="FF'+hex+'"/><bgColor indexed="64"/></patternFill></fill>';};
  var fills=fill('0E6B62')+fill('E3F0EE'),xfs='';
  PAL.forEach(function(p,i){
    fills+=fill(p[0])+fill(p[1]);
    xfs+='<xf numFmtId="0" fontId="3" fillId="'+(4+i*2)+'" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'+
      '<xf numFmtId="164" fontId="0" fillId="'+(5+i*2)+'" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'+
      '<xf numFmtId="0" fontId="0" fillId="'+(5+i*2)+'" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>';
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="General;[Red]\\-General"/></numFmts><fonts count="4">'+f('<sz val="11"/>')+f('<b/><sz val="14"/><color rgb="FF0E6B62"/>')+f('<b/><sz val="11"/><color rgb="FFFFFFFF"/>')+f('<b/><sz val="11"/><color rgb="FF15302E"/>')+'</fonts>'+
    '<fills count="'+(4+PAL.length*2)+'"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+fills+'</fills>'+
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'+b+'</borders>'+
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
    '<cellXfs count="'+(7+PAL.length*3)+'">'+
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'+
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'+
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>'+
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'+
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>'+
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'+
    xfs+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}
function xlsxBytes(sheets){
  var enc=new TextEncoder(),used={};
  var names=sheets.map(function(sh,i){var n=String(sh.name).replace(/[\[\]:*?\/\\]/g,'').slice(0,31)||('ورقة'+(i+1));while(used[n])n=n.slice(0,28)+i;used[n]=1;return n;});
  var files=[
    {name:'[Content_Types].xml',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+sheets.map(function(s,i){return '<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';}).join('')+'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
    {name:'_rels/.rels',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'+names.map(function(n,i){return '<sheet name="'+xe(n).replace(/"/g,'&quot;')+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>';}).join('')+'</sheets></workbook>'},
    {name:'xl/_rels/workbook.xml.rels',text:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map(function(s,i){return '<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>';}).join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
    {name:'xl/styles.xml',text:stylesXml()}
  ];
  sheets.forEach(function(sh,i){files.push({name:'xl/worksheets/sheet'+(i+1)+'.xml',text:sheetXml(sh)});});
  return zipStore(files.map(function(f){return {name:f.name,data:enc.encode(f.text)};}));
}

/* saving and copying */
function showText(name,text){
  modal('<h2>انسخ البيانات</h2><p class="muted" style="margin:6px 0 10px">تعذر التنزيل المباشر هنا. انسخ النص والصقه في ملف باسم '+esc(name)+'.</p><textarea id="csvOut" readonly>'+esc(text)+'</textarea><div class="row"><button type="button" class="btn pri" data-act="copyText">نسخ</button><button type="button" class="btn ghost" data-act="mcancel">إغلاق</button></div>');
  var t=$('#csvOut');if(t)t.select();
}
async function copyTextOf(text,ta){
  try{await navigator.clipboard.writeText(text);toast('تم النسخ. الصقه في Excel');}
  catch(e){if(ta){ta.focus();ta.select();}toast('حدّد النص وانسخه يدوياً');}
}
var STANDALONE=!(window.claude&&window.claude.use);
var XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function blobDownload(name,data,bom){
  var bin=typeof data!=='string';
  var type=bin?XLSX_MIME:/\.json$/.test(name)?'application/json;charset=utf-8':'text/plain;charset=utf-8';
  var blob=new Blob([bin?data:(bom===false?'':'﻿')+data],{type:type});
  var url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(url);if(a.remove)a.remove();},1500);
}
async function saveFile(name,data,bom){
  var bin=typeof data!=='string';
  if(STANDALONE){
    try{blobDownload(name,data,bom);toast('تم تنزيل الملف');}
    catch(e){if(bin)toast('تعذر تنزيل الملف في هذا المتصفح');else showText(name,data);}
    return;
  }
  var dl=null;
  try{dl=await window.claude.use('downloads');}catch(e){dl=null;}
  if(dl){
    try{await dl.save({filename:name,data:bin?data:(bom===false?'':'﻿')+data});toast('تم تجهيز الملف');return;}
    catch(e){if(e&&e.code==='declined')return;}
  }
  if(bin)toast('تعذر تنزيل الملف هنا. افتح البرنامج بعد نشره على موقعك للتنزيل المباشر.');else showText(name,data);
}
function exportFromBtn(t){
  var c=curClass();if(!c)return null;
  var wb=buildWorkbook(c,t.getAttribute('data-scope'),t.getAttribute('data-sid')||null,U.exType,U.exAtt);
  if(!periodReady()){toast('اختر شهراً أو أسبوعاً واحداً على الأقل، أو اختر «كل الفترة».');return null;}
  if(!wb.count){toast('لا يوجد طلاب للتصدير. اختر طالباً واحداً على الأقل.');return null;}
  return wb;
}

/* ---------- mutations ---------- */
function addStudent(c,name,num,seat){
  name=String(name||'').trim();if(!name)return 'اكتب اسم الطالب';
  if(seat==null)seat=freeSeat(c);else if(c.students.some(function(s){return s.seat===seat;}))return 'هذا المقعد مشغول';
  var s={id:uid(),name:name,num:String(num||'').trim(),seat:seat,grades:[]};c.students.push(s);markClass(c.id);return s;
}
function setSlot(c,s,k,slot,score){
  var g=s.grades.find(function(x){return x.cat===k.id&&x.slot===slot;});
  if(score==null){if(g)s.grades=s.grades.filter(function(x){return x!==g;});}
  else if(g){g.score=score;g.max=k.max;g.date=U.attDate;}
  else s.grades.push({id:uid(),cat:k.id,slot:slot,score:score,max:k.max,date:U.attDate,note:''});
  markClass(c.id);
}
function applyPad(score){
  if(!U.pad)return;
  var c=curClass(),s=byId(c,U.student),k=catById(U.pad.cat);if(!s||!k)return;
  if(score!=null&&(!(score>=0)||score>k.max)){toast('الدرجة يجب أن تكون بين 0 و '+fmt(k.max));return;}
  setSlot(c,s,k,U.pad.slot,score);
  if(score==null){renderKeep();return;}
  var n=Math.max(k.count,U.pad.slot+1),next=-1;
  for(var i=U.pad.slot+1;i<n;i++){if(!s.grades.some(function(g){return g.cat===k.id&&g.slot===i;})){next=i;break;}}
  if(next<0&&U.pad.slot>=k.count)next=U.pad.slot+1;
  U.pad=next>=0?{cat:k.id,slot:next}:null;renderKeep();
}
function newClassFrom(fd){
  var name=String(fd.get('name')||'').trim();if(!name){toast('اكتب اسم الفصل');return;}
  var c={id:uid(),name:name,subject:String(fd.get('subject')||'').trim(),cols:clampI(fd.get('cols'),2,10,6),rows:clampI(fd.get('rows'),1,12,5),created:Date.now(),students:[]};
  S.classes.push(c);markClass(c.id);U.cls=c.id;U.tab='home';U.mapOpen=true;U.student=null;closeModal();render(true);
}
function demoClass(){
  var seed=20261013;var rnd=function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  var names=['أحمد خالد','عمر الفاروق','محمد إبراهيم','يوسف مصطفى','عبد الله منصور','إبراهيم علي','حسن يوسف','سالم المهدي','خالد الصغير','مصطفى الجالي','نوري عبد السلام','طارق بن عمر','زياد الفيتوري','معاذ الشريف','رامي الهوني','أنس بوزيد','ليث العريبي','فارس القذافي'];
  var c={id:uid(),name:'الصف الخامس - أ (تجريبي)',subject:'الرياضيات',cols:6,rows:5,created:Date.now(),students:[]};
  var back=function(n){var d=new Date();d.setDate(d.getDate()-n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
  names.forEach(function(nm,i){
    var ab=0.55+rnd()*0.42,s={id:uid(),name:nm,num:String(1001+i),seat:i,grades:[]};
    S.settings.cats.forEach(function(k){
      var fill=Math.min(k.count,Math.max(1,Math.round(k.count*(0.5+rnd()*0.5))));
      for(var j=0;j<fill;j++){var sc=Math.max(0,Math.min(k.max,Math.round(k.max*(ab+(rnd()-0.5)*0.3)*2)/2));s.grades.push({id:uid(),cat:k.id,slot:j,score:sc,max:k.max,date:back(j*6),note:''});}
    });
    c.students.push(s);
  });
  var days=[],n=0;while(days.length<10){var d=new Date();d.setDate(d.getDate()-n);var wd=d.getDay();if(wd!==5&&wd!==6)days.push(back(n));n++;}
  var m=S.att[c.id]={};
  days.forEach(function(dt,di){m[dt]={};c.students.forEach(function(s,i){
    if(di===0&&i%5===4)return;
    var r=rnd();m[dt][s.id]=r<0.86?'p':r<0.93?'a':r<0.98?'l':'e';
  });markAtt(c.id,dt);});
  S.classes.push(c);markClass(c.id);U.cls=c.id;U.mapOpen=true;U.tab='home';render(true);
}

/* ---------- actions ---------- */
async function act(a,t,e){
  var c=curClass();
  switch(a){
    case 'tab':U.tab=t.getAttribute('data-t');U.student=null;U.pad=null;if(U.tab==='home')U.mapOpen=false;render(true);break;
    case 'goHome':U.tab='home';U.mapOpen=false;render(true);break;
    case 'newClass':classModal();break;
    case 'demo':demoClass();break;
    case 'openClass':U.cls=t.getAttribute('data-id');U.mapOpen=true;U.student=null;render(true);break;
    case 'mapBack':U.mapOpen=false;render(true);break;
    case 'mode':U.mapMode=t.getAttribute('data-m');renderKeep();break;
    case 'seat':{
      var sid=t.getAttribute('data-sid');
      if(U.mapMode==='att'){var order=['','p','a','l','e'],cur=attOn(c,U.attDate,sid);setAtt(c,U.attDate,sid,order[(order.indexOf(cur)+1)%order.length]);renderKeep();}
      else if(U.mapMode==='int'){cycleSym(c,sid);}
      else if(U.mapMode==='beh'){behModal(c,sid);}
      else{U.student=sid;U.seg='grades';U.pad=null;render(true);}
      break;}
    case 'behAdd':{
      var bs=byId(c,t.getAttribute('data-sid')||U.behSid);if(!bs)break;
      var bk=behCat(true),bv=parseFloat(t.getAttribute('data-v')),bn=$('#behNote'),ng={id:uid(),cat:bk.id,slot:null,score:bv,max:1,date:U.attDate,note:bn?bn.value.trim():''};
      bs.grades.push(ng);markClass(c.id);closeModal();renderKeep();
      toast('خُصم '+(bv===0.5?'نصف درجة':'درجة')+' من '+bs.name,function(){bs.grades=bs.grades.filter(function(x){return x!==ng;});markClass(c.id);renderKeep();});break;}
    case 'behDel':{
      var ds=byId(c,U.behSid),dgid=t.getAttribute('data-gid');
      if(ds){ds.grades=ds.grades.filter(function(x){return x.id!==dgid;});markClass(c.id);renderKeep();behModal(c,U.behSid);}break;}
    case 'addAt':studentModal(c,null,+t.getAttribute('data-seat'));break;
    case 'openStudent':U.student=t.getAttribute('data-id');U.seg='grades';U.pad=null;render(true);break;
    case 'stBack':U.student=null;U.pad=null;render(true);break;
    case 'stNav':U.student=t.getAttribute('data-id');U.pad=null;render(true);break;
    case 'seg':U.seg=t.getAttribute('data-s');U.pad=null;renderKeep();break;
    case 'gmode':U.gmode=t.getAttribute('data-m');U.pad=null;renderKeep();break;
    case 'sym':{var sst=byId(c,U.student),sk2=catById(t.getAttribute('data-cat')),sv=t.getAttribute('data-v');if(sst&&sk2){setSym(c,sst,sk2,U.attDate,sv===''?null:parseFloat(sv));renderKeep();}break;}
    case 'tplDaily':{
      var G='المشاركة اليومية';
      if(S.settings.cats.some(function(k){return k.group===G;})){toast('قالب المشاركة اليومية موجود بالفعل');break;}
      S.settings.cats.push({id:uid(),name:'اختبار الخميس',count:8,max:10,kind:'num',weight:6,group:G},{id:uid(),name:'التفاعل داخل الصف',count:1,max:1,kind:'sym',weight:4,group:G},{id:uid(),name:'الانضباط والاستعداد',count:2,max:1,kind:'num',weight:2,group:G},{id:uid(),name:'السلوك',count:1,max:1,kind:'ded',weight:0,group:G});
      markSettings();renderKeep();toast('أُضيف قالب المشاركة اليومية (12 درجة)');break;}
    case 'slot':{var cat=t.getAttribute('data-cat'),sl=+t.getAttribute('data-slot');U.pad=(U.pad&&U.pad.cat===cat&&U.pad.slot===sl)?null:{cat:cat,slot:sl};renderKeep();break;}
    case 'padv':applyPad(parseFloat(t.getAttribute('data-v')));break;
    case 'padclear':applyPad(null);break;
    case 'padclose':U.pad=null;renderKeep();break;
    case 'delGrade':{
      var s=byId(c,U.student),gid=t.getAttribute('data-gid'),g=s.grades.find(function(x){return x.id===gid;});
      if(!g)break;s.grades=s.grades.filter(function(x){return x!==g;});markClass(c.id);renderKeep();
      toast('تم حذف الدرجة',function(){s.grades.push(g);markClass(c.id);renderKeep();});break;}
    case 'attBtn':{var sid2=t.getAttribute('data-sid'),v=t.getAttribute('data-v');setAtt(c,U.attDate,sid2,attOn(c,U.attDate,sid2)===v?'':v);renderKeep();break;}
    case 'allPresent':c.students.forEach(function(s){setAtt(c,U.attDate,s.id,'p');});renderKeep();toast('تم تسجيل الجميع حاضرين');break;
    case 'clearDay':c.students.forEach(function(s){setAtt(c,U.attDate,s.id,'');});renderKeep();break;
    case 'editStudent':studentModal(c,byId(c,t.getAttribute('data-id')));break;
    case 'delStudent':{
      var st=byId(c,t.getAttribute('data-id'));if(!st)break;
      if(await ask('حذف الطالب «'+st.name+'» مع كل درجاته وحضوره؟')){
        c.students=c.students.filter(function(x){return x!==st;});
        var m=S.att[c.id]||{};Object.keys(m).forEach(function(d){if(m[d][st.id]){delete m[d][st.id];markAtt(c.id,d);}});
        markClass(c.id);closeModal();renderKeep();
      }
      break;}
    case 'addCat':S.settings.cats.push({id:uid(),name:'نوع جديد',count:1,max:10});markSettings();U.focus='[data-f="name"][data-id="'+S.settings.cats[S.settings.cats.length-1].id+'"]';renderKeep();break;
    case 'delCat':{
      var k=catById(t.getAttribute('data-id'));if(!k)break;
      var inUse=S.classes.some(function(cl){return cl.students.some(function(s){return s.grades.some(function(g){return g.cat===k.id;});});});
      if(inUse){toast('لا يمكن حذف «'+k.name+'» لوجود درجات مسجلة عليه. يمكنك تعديل اسمه بدلاً من ذلك.');break;}
      S.settings.cats=S.settings.cats.filter(function(x){return x!==k;});markSettings();renderKeep();break;}
    case 'delClass':{
      if(!c)break;
      if(await ask('حذف الفصل «'+c.name+'» بكل طلابه ودرجاته وحضوره؟ لا يمكن التراجع.')){
        S.classes=S.classes.filter(function(x){return x!==c;});
        var months={};Object.keys(S.att[c.id]||{}).forEach(function(d){months[d.slice(0,7)]=1;});
        Object.keys(months).forEach(function(mo){P.dirty.del['att/'+c.id+'_'+mo]=1;});
        P.dirty.del['classes/'+c.id]=1;delete P.dirty.classes[c.id];delete S.att[c.id];
        U.cls=null;U.mapOpen=false;U.student=null;ensureCls();queue();closeModal();render(true);
      }
      break;}
    case 'exScope':U.exScope=t.getAttribute('data-s');U.exSheet=0;renderKeep();break;
    case 'exSheet':U.exSheet=+t.getAttribute('data-i')||0;renderKeep();break;
    case 'doExport':{var wb=exportFromBtn(t);if(wb)await saveFile(wb.name,xlsxBytes(wb.sheets));break;}
    case 'copyExport':{var wb2=exportFromBtn(t);if(wb2)await copyTextOf(toTsv(wb2.sheets[Math.min(U.exSheet||0,wb2.sheets.length-1)]));break;}
    case 'exPerMode':U.exPer=t.getAttribute('data-m');U.exSheet=0;renderKeep();break;
    case 'exPerAll':{var pm=U.exPer==='months',pc={};c.students.forEach(function(s){s.grades.forEach(function(g){if(parseD(g.date))pc[pm?monthKey(g.date):weekStart(g.date)]=1;});});if(pm)U.exMonths=Object.keys(pc);else U.exWeeks=Object.keys(pc);renderKeep();break;}
    case 'exPerNone':if(U.exPer==='months')U.exMonths=[];else U.exWeeks=[];renderKeep();break;
    case 'exPickAll':U.exPick=sortedStudents(c).map(function(x){return x.id;});renderKeep();break;
    case 'exPickNone':U.exPick=[];renderKeep();break;
    case 'exPickFromStudent':U.exScope='pick';U.exPick=[U.student];U.tab='export';U.student=null;U.pad=null;render(true);break;
    case 'copyText':{var ta=$('#csvOut');await copyTextOf(ta?ta.value:'',ta);break;}
    case 'syncNow':await refresh(true);renderKeep();break;
    case 'logout':{
      if(hasDirty()||lsGet(LS_PEND))await refresh();
      if(hasDirty()||lsGet(LS_PEND)){toast('توجد تغييرات لم تُرسل بعد. اتصل بالإنترنت ثم أعد المحاولة.');break;}
      if(!(await ask('تسجيل الخروج؟ تبقى بياناتك على الخادم، وتُمسح النسخة المحلية من هذا الجهاز.','خروج')))break;
      lsSet(LS_TOKEN,null);lsSet(LS_SRV,null);lsSet(LS_PEND,null);lsSet(LS_KEY,null);lsSet(LS_UI,null);location.reload();break;}
    case 'backup':saveFile('نسخة-احتياطية-سجل-الفصل-'+today()+'.json',JSON.stringify({v:1,app:'sijil-alfasl',exported:new Date().toISOString(),settings:S.settings,classes:S.classes,att:S.att}),false);break;
    case 'restorePick':{var inp=$('#restoreIn');if(inp){inp.value='';inp.click();}break;}
    case 'mclose':if(e.target===t)closeModal();break;
    case 'mcancel':closeModal();break;
    case 'askok':{var r=U._ask;U._ask=null;if(r)r(true);break;}
    case 'undo':if(undoFn){var f=undoFn;undoFn=null;$('#toast').hidden=true;f();}break;
  }
}
function onChange(k,t){
  var c=curClass();
  switch(k){
    case 'pickClass':U.cls=t.value;U.student=null;U.pad=null;U.exStudent=null;render();break;
    case 'attDate':if(t.value){U.attDate=t.value;renderKeep();}break;
    case 'filter':U.filter=t.value;applySeatFilter();break;
    case 'exOpt':U[t.getAttribute('data-k')]=t.type==='checkbox'?t.checked:t.value;if(t.getAttribute('data-k')==='exType')U.exSheet=0;renderKeep();break;
    case 'exStudent':U.exStudent=t.value;renderKeep();break;
    case 'gradeDate':{
      var gc=curClass(),gs2=gc&&byId(gc,U.student);if(!gs2||!t.value)break;
      var gg=gs2.grades.find(function(x){return x.id===t.getAttribute('data-gid');});if(!gg)break;
      var gk=catById(gg.cat);
      if(gk&&gk.kind==='sym'&&gg.slot==null&&gs2.grades.some(function(x){return x!==gg&&x.cat===gg.cat&&x.slot==null&&x.date===t.value;})){toast('يوجد تفاعل مسجل في هذا التاريخ');renderKeep();break;}
      gg.date=t.value;markClass(gc.id);renderKeep();break;}
    case 'exPerOne':{var pl=U.exPer==='months'?U.exMonths:U.exWeeks,pv=t.getAttribute('data-v'),pi=pl.indexOf(pv);if(t.checked&&pi<0)pl.push(pv);else if(!t.checked&&pi>=0)pl.splice(pi,1);renderKeep();break;}
    case 'exPickOne':{var pid=t.getAttribute('data-id'),ix=U.exPick.indexOf(pid);if(t.checked&&ix<0)U.exPick.push(pid);else if(!t.checked&&ix>=0)U.exPick.splice(ix,1);renderKeep();break;}
    case 'manualCat':{var kk=catById(t.value);U.mcat=t.value;U.mmax=null;if(kk&&t.form)t.form.elements.max.value=fmt(kk.max);break;}
    case 'catField':{
      var cat=catById(t.getAttribute('data-id')),f=t.getAttribute('data-f');if(!cat)break;
      if(f==='name'){var v=t.value.trim();if(!v){t.value=cat.name;break;}cat.name=v;}
      else if(f==='count'){cat.count=clampI(t.value,1,30,cat.count);t.value=cat.count;}
      else if(f==='max'){var m=parseFloat(t.value);if(!(m>0)){t.value=fmt(cat.max);break;}cat.max=cat.kind==='sym'?1:m;}
      else if(f==='weight'){var w=parseFloat(t.value);cat.weight=w>0?w:0;t.value=cat.weight?fmt(cat.weight):'';}
      else if(f==='group'){cat.group=t.value.trim();}
      else if(f==='kind'){cat.kind=t.value==='sym'?'sym':t.value==='ded'?'ded':'num';if(cat.kind==='sym'||cat.kind==='ded')cat.max=1;else if(!(cat.max>1))cat.max=10;if(cat.kind==='ded')cat.weight=0;}
      markSettings();if(f==='kind')renderKeep();break;}
    case 'clsField':{
      if(!c)break;var cf=t.getAttribute('data-f');
      if(cf==='name'){var nv=t.value.trim();if(!nv){t.value=c.name;break;}c.name=nv;}
      else if(cf==='subject')c.subject=t.value.trim();
      else if(cf==='cols'){c.cols=clampI(t.value,2,10,c.cols);t.value=c.cols;}
      else if(cf==='rows'){c.rows=clampI(t.value,1,12,c.rows);t.value=c.rows;}
      markClass(c.id);break;}
    case 'attDay':{if(c&&U.student)setAtt(c,t.getAttribute('data-date'),U.student,t.value);renderKeep();break;}
    case 'restore':{
      var file=t.files&&t.files[0];if(!file)break;
      var rd=new FileReader();
      rd.onload=async function(){
        var d;try{d=JSON.parse(String(rd.result));}catch(e){toast('الملف غير صالح');return;}
        if(!d||!Array.isArray(d.classes)){toast('هذا الملف ليس نسخة احتياطية من سجل الفصل');return;}
        if(!(await ask('دمج الفصول الموجودة في الملف مع بياناتك الحالية؟ الفصول المتطابقة تُستبدل، وتُستبدل أنواع الدرجات بما في الملف.','استعادة')))return;
        var n=normalize(d);
        S.settings=n.settings;
        n.classes.forEach(function(cl){var i=S.classes.findIndex(function(x){return x.id===cl.id;});if(i>=0)S.classes[i]=cl;else S.classes.push(cl);});
        Object.keys(n.att).forEach(function(cid){S.att[cid]=n.att[cid];});
        markAll();queue();closeModal();ensureCls();render(true);toast('تمت الاستعادة');
      };
      rd.readAsText(file);break;}
  }
}
function onSubmit(name,f){
  var c=curClass(),fd=new FormData(f);
  switch(name){
    case 'newClass':newClassFrom(fd);break;
    case 'login':doLogin(String(fd.get('password')||''));break;
    case 'addStudent':{
      var sv=parseInt(fd.get('seat'),10),r=addStudent(c,fd.get('name'),fd.get('num'),isFinite(sv)&&sv>=1?sv-1:null);
      if(typeof r==='string'){toast(r);return;}
      U.focus='#stuName';renderKeep();toast('أُضيف «'+r.name+'»');break;}
    case 'bulk':{
      var lines=String(fd.get('names')||'').split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean);
      if(!lines.length){toast('اكتب اسماً واحداً على الأقل');return;}
      lines.forEach(function(n){addStudent(c,n,'',null);});renderKeep();toast('أُضيف '+lines.length+' طالب');break;}
    case 'stu':{
      var sid=fd.get('sid'),nm=String(fd.get('name')||'').trim(),num=String(fd.get('num')||'').trim(),sv2=parseInt(fd.get('seat'),10),seat=isFinite(sv2)&&sv2>=1?sv2-1:null;
      if(!nm){toast('اكتب اسم الطالب');return;}
      if(!sid){var r2_=addStudent(c,nm,num,seat);if(typeof r2_==='string'){toast(r2_);return;}}
      else{
        var s=byId(c,sid);s.name=nm;s.num=num;
        if(seat!=null&&seat!==s.seat){var o=c.students.find(function(x){return x.seat===seat&&x!==s;});if(o){o.seat=s.seat;toast('تم تبديل المقعد مع «'+o.name+'»');}s.seat=seat;}
        markClass(c.id);
      }
      closeModal();renderKeep();break;}
    case 'manual':{
      var stu=byId(c,U.student),k=catById(fd.get('cat')),max=parseFloat(fd.get('max')),score=parseFloat(fd.get('score'));
      if(!stu||!k)return;
      if(!(max>0)){toast('اكتب الدرجة النهائية');return;}
      if(!(score>=0)){toast('اكتب درجة الطالب');return;}
      if(score>max){toast('درجة الطالب أكبر من الدرجة النهائية');return;}
      stu.grades.push({id:uid(),cat:k.id,slot:null,score:score,max:max,date:String(fd.get('date')||today()),note:String(fd.get('note')||'').trim()});
      U.mcat=k.id;U.mmax=max;markClass(c.id);U.focus='#mScore';renderKeep();toast('تم تسجيل الدرجة');break;}
    case 'padcustom':{var v=parseFloat(fd.get('v'));if(!isFinite(v)){toast('اكتب الدرجة');return;}applyPad(v);break;}
  }
}

/* ---------- wiring ---------- */
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-act]');if(t)act(t.getAttribute('data-act'),t,e);});
document.addEventListener('change',function(e){var t=e.target.closest&&e.target.closest('[data-ch]');if(t)onChange(t.getAttribute('data-ch'),t);});
document.addEventListener('input',function(e){if(e.target&&e.target.id==='seatQ'){U.q=e.target.value;applySeatFilter();}});
document.addEventListener('submit',function(e){var f=e.target.closest&&e.target.closest('form[data-form]');if(!f)return;e.preventDefault();onSubmit(f.getAttribute('data-form'),f);});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!U.login&&!$('#modal').hidden)closeModal();});
var dragSid=null;
document.addEventListener('dragstart',function(e){var t=e.target.closest&&e.target.closest('.seat[data-sid]');if(!t)return;dragSid=t.getAttribute('data-sid');try{e.dataTransfer.setData('text/plain',dragSid);e.dataTransfer.effectAllowed='move';}catch(_){}});
document.addEventListener('dragover',function(e){if(dragSid&&e.target.closest&&e.target.closest('.seat[data-slot]'))e.preventDefault();});
document.addEventListener('drop',function(e){
  var t=e.target.closest&&e.target.closest('.seat[data-slot]');if(!dragSid||!t)return;e.preventDefault();
  var c=curClass(),slot=+t.getAttribute('data-slot'),a=c&&byId(c,dragSid);
  if(a&&a.seat!==slot){var from=a.seat,b=c.students.find(function(s){return s.seat===slot&&s!==a;});a.seat=slot;if(b)b.seat=from;markClass(c.id);renderKeep();}
  dragSid=null;
});
document.addEventListener('dragend',function(){dragSid=null;});

/* ---------- boot ---------- */
var local=lsLoad();
if(local)S=normalize(local);
var ui=uiLoad();if(ui){if(TABS.some(function(t){return t[0]===ui.tab;}))U.tab=ui.tab;if(ui.cls)U.cls=ui.cls;}
ensureCls();
if(U.tab==='home')U.mapOpen=false;
render();
setStatus('محفوظ على هذا الجهاز','ok');
connectAny();
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&SRV.on&&P.db)refresh();});
window.addEventListener('online',function(){if(SRV.on&&P.db)refresh();});
var lastBucket=widthBucket(),rzT=null;
window.addEventListener('resize',function(){
  clearTimeout(rzT);
  rzT=setTimeout(function(){
    var b=widthBucket();
    if(b!==lastBucket){lastBucket=b;if(U.tab==='home'&&U.mapOpen&&!U.student||!S.classes.length&&U.tab==='home')renderKeep();}
  },150);
});
if(STANDALONE&&'serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
  window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){});});
}
})();
