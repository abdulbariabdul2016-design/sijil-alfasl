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
  attDate:today(),exScope:'class',exStudent:null,exType:'all',exAtt:true,mcat:null,mmax:null,focus:null,_ask:null};

function normalize(d){
  var o={settings:{cats:[]},classes:[],att:{}};
  var cats=d&&d.settings&&Array.isArray(d.settings.cats)&&d.settings.cats.length?d.settings.cats:DEFAULT_CATS;
  o.settings.cats=cats.map(function(k){return {id:String(k.id||uid()),name:String(k.name||'نوع'),count:clampI(k.count,1,30,1),max:+k.max>0?+k.max:10};});
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

function statsFor(s,catId){
  var rs=s.grades.filter(function(g){return !catId||g.cat===catId;});
  var sum=rs.reduce(function(a,g){return a+g.score;},0),mx=rs.reduce(function(a,g){return a+g.max;},0);
  return {n:rs.length,sum:sum,max:mx,avg:rs.length?sum/rs.length:null,pct:mx?sum/mx*100:null};
}
function classPct(c){var sum=0,mx=0;c.students.forEach(function(s){s.grades.forEach(function(g){sum+=g.score;mx+=g.max;});});return mx?sum/mx*100:null;}
function attOf(c,sid){
  var p=0,a=0,l=0,e=0,m=S.att[c.id]||{};
  for(var d in m){var v=m[d][sid];if(v==='p')p++;else if(v==='a')a++;else if(v==='l')l++;else if(v==='e')e++;}
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
var P={db:null,dirty:{settings:false,classes:{},att:{},del:{}},timer:null,busy:false,touched:false};
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
  if(!P.db){setStatus('محفوظ على هذا الجهاز','ok');return;}
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
    setStatus('تم الحفظ','ok');
  }catch(e){
    markAll();
    setStatus(e&&e.code==='invalid_argument'?'للقراءة فقط: محفوظ على هذا الجهاز':'تعذر الحفظ على الخادم: محفوظ على هذا الجهاز','warn');
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
  var st=statsFor(s),pct=st.pct,a=attOn(c,date,s.id);
  var tone=pct==null?'none':pct>=85?'ok':pct>=60?'warn':'bad';
  return '<button type="button" class="seat st-'+(a||'n')+'" draggable="true" data-act="seat" data-sid="'+s.id+'" data-slot="'+s.seat+'">'+
    '<span class="ring t-'+tone+'" style="--p:'+(pct==null?0:Math.round(pct))+'"><b>'+(pct==null?'–':Math.round(pct))+'</b></span>'+
    '<span class="sname">'+esc(s.name)+'</span>'+
    '<span class="sline"><span class="achip a-'+(a||'n')+'">'+(a?ATT[a].t:'غير مسجل')+'</span><span class="num">مقعد '+(s.seat+1)+'</span></span></button>';
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
    '<div class="seg"><button type="button" data-act="mode" data-m="open" class="'+(U.mapMode==='open'?'on':'')+'">فتح الطالب</button><button type="button" data-act="mode" data-m="att" class="'+(U.mapMode==='att'?'on':'')+'">تسجيل الحضور</button></div>'+
    '<label class="f inline">عرض<select data-ch="filter">'+filters.map(function(f){return '<option value="'+f[0]+'"'+(U.filter===f[0]?' selected':'')+'>'+f[1]+'</option>';}).join('')+'</select></label>'+
    '<input type="search" id="seatQ" placeholder="بحث عن طالب" value="'+esc(U.q)+'" aria-label="بحث عن طالب"></div></div>'+
    tally(c,date)+
    roomShell(seats,mapCols(c.cols))+
    '<div class="legend"><span style="--c:var(--ok)">حاضر</span><span style="--c:var(--bad)">غائب</span><span style="--c:var(--chalk)">متأخر</span><span style="--c:var(--info)">بعذر</span>'+
    '<span>الحلقة = نسبة درجات الطالب</span>'+
    '<span>'+(U.mapMode==='att'?'اضغط على المقعد لتغيير حالة الحضور (حاضر ← غائب ← متأخر ← بعذر ← مسح)':'اضغط على الطالب لإدخال درجاته · اسحب مقعداً لتبديل المكان')+'</span></div>';
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
  return '<td class="num"><b class="'+t+'">'+fmt1(st.pct)+'%</b>'+(k?'<small>'+st.n+' من '+k.count+'</small>':'')+'</td>';
}
function vGrades(){
  var c=curClass();if(!c)return vNoClass();
  var cats=S.settings.cats,list=sortedStudents(c);
  var rows=list.map(function(s){
    return '<tr><td><button type="button" class="lnk" data-act="openStudent" data-id="'+s.id+'">'+esc(s.name)+'</button></td>'+
      cats.map(function(k){return pctCell(statsFor(s,k.id),k);}).join('')+
      '<td class="num">'+(function(){var t=statsFor(s);return t.n?fmt(t.sum)+' / '+fmt(t.max):'—';})()+'</td>'+pctCell(statsFor(s),null)+'</tr>';
  }).join('');
  var foot='<tr><td>متوسط الفصل</td>'+cats.map(function(k){var sum=0,mx=0,n=0;c.students.forEach(function(s){s.grades.forEach(function(g){if(g.cat===k.id){sum+=g.score;mx+=g.max;n++;}});});return n?'<td class="num">'+fmt1(sum/mx*100)+'%</td>':'<td class="num">—</td>';}).join('')+'<td></td><td class="num">'+(classPct(c)==null?'—':fmt1(classPct(c))+'%')+'</td></tr>';
  return '<div class="head"><h1>درجات الطلاب</h1>'+classPick()+'</div>'+
    '<section class="card"><div class="cardhead"><h2>سجل الدرجات</h2><span class="muted">اضغط اسم الطالب لإدخال درجاته</span></div>'+
    (list.length?'<div class="tablewrap"><table class="gb"><thead><tr><th>الطالب</th>'+cats.map(function(k){return '<th>'+esc(k.name)+'<small>'+k.count+' × '+fmt(k.max)+'</small></th>';}).join('')+'<th>المجموع</th><th>النسبة</th></tr></thead><tbody>'+rows+'</tbody><tfoot>'+foot+'</tfoot></table></div>':'<p class="empty-note">سجّل الطلاب أولاً من تبويب الطلاب.</p>')+'</section>';
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
function catCard(c,s,k){
  var used=s.grades.filter(function(g){return g.cat===k.id&&g.slot!=null;});
  var maxSlot=used.reduce(function(m,g){return Math.max(m,g.slot);},-1),n=Math.max(k.count,maxSlot+1),by={};
  used.forEach(function(g){by[g.slot]=g;});
  var st=statsFor(s,k.id),slots='';
  for(var i=0;i<n;i++){var g=by[i],on=U.pad&&U.pad.cat===k.id&&U.pad.slot===i;
    slots+='<button type="button" class="slot'+(g?' has':'')+(on?' sel':'')+'" data-act="slot" data-cat="'+k.id+'" data-slot="'+i+'"><i>'+(i+1)+'</i><b>'+(g?fmt(g.score):'—')+'</b></button>';}
  return '<article class="cat"><header><h3>'+esc(k.name)+'</h3><span class="muted">من '+fmt(k.max)+' · '+(st.n?'المتوسط '+fmt(st.avg)+' ('+fmt1(st.pct)+'%)':'لا توجد درجات')+'</span></header><div class="slots">'+slots+'</div>'+(U.pad&&U.pad.cat===k.id?padHtml(k,s):'')+'</article>';
}
function manualForm(c,s){
  var cats=S.settings.cats,sel=catById(U.mcat)||cats[0];
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
  var body=U.gmode==='quick'?(cats.length?'<p class="muted" style="margin-bottom:12px">اضغط على خانة الدرجة ثم اضغط الرقم مباشرة لتسجيله في سجل الطالب.</p><div class="catgrid">'+cats.map(function(k){return catCard(c,s,k);}).join('')+'</div>':'<p class="empty-note">لا توجد أنواع درجات. أضفها من تبويب الإعدادات.</p>'):manualForm(c,s);
  var recs=s.grades.slice().sort(function(a,b){return String(b.date).localeCompare(String(a.date));});
  var log=recs.length?'<div class="tablewrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>الدرجة</th><th>من</th><th>النسبة</th><th>ملاحظة</th><th></th></tr></thead><tbody>'+recs.map(function(g){var k=catById(g.cat);
    return '<tr><td class="num">'+esc(g.date)+'</td><td>'+esc(k?k.name:'(نوع محذوف)')+(g.slot!=null?' #'+(g.slot+1):'')+'</td><td class="num"><b>'+fmt(g.score)+'</b></td><td class="num">'+fmt(g.max)+'</td><td class="num">'+fmt1(g.score/g.max*100)+'%</td><td>'+esc(g.note)+'</td><td><button type="button" class="btn ghost sm" data-act="delGrade" data-gid="'+g.id+'">حذف</button></td></tr>';}).join('')+'</tbody></table></div>':'<p class="empty-note">لم تسجَّل أي درجة لهذا الطالب بعد.</p>';
  return '<section class="card"><div class="cardhead"><h2>إدخال الدرجات</h2>'+mode+'</div>'+body+'</section>'+
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
function exOptions(){
  return '<div class="opts"><label class="opt'+(U.exType==='all'?' on':'')+'"><input type="radio" name="exType" value="all" data-ch="exOpt" data-k="exType"'+(U.exType==='all'?' checked':'')+'><div><b>كل الدرجات المدخلة</b><span>صف لكل درجة: النوع، رقم الدرجة، درجة الطالب، النهائية، النسبة، التاريخ.</span></div></label>'+
    '<label class="opt'+(U.exType==='avg'?' on':'')+'"><input type="radio" name="exType" value="avg" data-ch="exOpt" data-k="exType"'+(U.exType==='avg'?' checked':'')+'><div><b>متوسط الدرجات حسب التصنيف</b><span>متوسط كل نوع من الدرجات (اختبارات، واجبات، مشاركة…) والإجمالي.</span></div></label></div>'+
    (U.exType==='avg'?'<label class="chk"><input type="checkbox" data-ch="exOpt" data-k="exAtt"'+(U.exAtt?' checked':'')+'> تضمين ملخص الحضور والغياب</label>':'');
}
function vStExport(c,s){
  return '<section class="card"><div class="cardhead"><h2>التصدير</h2></div><p class="muted">اختر نوع التصدير ثم صدّر درجات هذا الطالب أو درجات كل طلاب الفصل. يُنزَّل الملف بصيغة CSV ويُفتح في Excel.</p>'+exOptions()+
    '<div class="row"><button type="button" class="btn pri" data-act="doExport" data-scope="student" data-sid="'+s.id+'">تصدير درجات '+esc(s.name)+'</button>'+
    '<button type="button" class="btn" data-act="doExport" data-scope="class" data-sid="'+s.id+'">تصدير درجات كل الفصل</button></div></section>';
}

/* export tab */
function previewTable(ex){
  if(!ex.rows.length)return '<p class="empty-note">لا توجد بيانات للتصدير.</p>';
  var shown=ex.rows.slice(0,40);
  return '<div class="tablewrap"><table><thead><tr>'+ex.head.map(function(h){return '<th>'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+shown.map(function(r){return '<tr>'+r.map(function(v){return '<td class="'+(typeof v==='number'?'num':'')+'">'+esc(v)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>'+
    (ex.rows.length>shown.length?'<p class="muted" style="margin-top:8px">المعاينة تعرض أول '+shown.length+' صفاً من '+ex.rows.length+'. الملف المُصدَّر يحتوي كل الصفوف.</p>':'');
}
function vExport(){
  var c=curClass();if(!c)return vNoClass();
  var list=sortedStudents(c);
  if(!U.exStudent||!byId(c,U.exStudent))U.exStudent=list.length?list[0].id:null;
  var scope=U.exScope==='student'&&U.exStudent?'student':'class';
  var ex=buildExport(c,scope,U.exStudent,U.exType,U.exAtt);
  return '<div class="head"><h1>تصدير الدرجات</h1>'+classPick()+'</div>'+
    '<section class="card"><h2>ما الذي تريد تصديره؟</h2>'+
    '<div class="row" style="align-items:center"><div class="seg"><button type="button" class="'+(scope==='class'?'on':'')+'" data-act="exScope" data-s="class">كل طلاب الفصل</button><button type="button" class="'+(scope==='student'?'on':'')+'" data-act="exScope" data-s="student">طالب واحد</button></div>'+
    (scope==='student'?'<select data-ch="exStudent" aria-label="الطالب">'+list.map(function(s){return '<option value="'+s.id+'"'+(s.id===U.exStudent?' selected':'')+'>'+esc(s.name)+'</option>';}).join('')+'</select>':'')+'</div>'+
    exOptions()+
    '<div class="row"><button type="button" class="btn pri" data-act="doExport" data-scope="'+scope+'" data-sid="'+(U.exStudent||'')+'">تنزيل ملف CSV</button><button type="button" class="btn" data-act="copyExport" data-scope="'+scope+'" data-sid="'+(U.exStudent||'')+'">نسخ البيانات</button></div></section>'+
    '<section class="card"><div class="cardhead"><h2>معاينة</h2><span class="muted">'+esc(ex.name)+'.csv</span></div>'+previewTable(ex)+'</section>';
}

/* settings */
function vSettings(){
  var cats=S.settings.cats,c=curClass();
  var rows=cats.map(function(k){return '<tr class="cfg"><td><input value="'+esc(k.name)+'" data-ch="catField" data-id="'+k.id+'" data-f="name" aria-label="اسم النوع"></td>'+
    '<td><input type="number" min="1" max="30" value="'+k.count+'" data-ch="catField" data-id="'+k.id+'" data-f="count" aria-label="عدد الدرجات"></td>'+
    '<td><input type="number" min="0.01" step="any" value="'+fmt(k.max)+'" data-ch="catField" data-id="'+k.id+'" data-f="max" aria-label="الدرجة الكاملة"></td>'+
    '<td><button type="button" class="btn ghost sm" data-act="delCat" data-id="'+k.id+'">حذف</button></td></tr>';}).join('');
  var clsCard=c?'<section class="card"><div class="cardhead"><h2>إعدادات الفصل</h2>'+classPick()+'</div><div class="fgrid">'+
    '<label class="f">اسم الفصل<input value="'+esc(c.name)+'" data-ch="clsField" data-f="name"></label>'+
    '<label class="f">المادة<input value="'+esc(c.subject)+'" data-ch="clsField" data-f="subject"></label>'+
    '<label class="f">مقاعد في الصف الواحد<input type="number" min="2" max="10" value="'+c.cols+'" data-ch="clsField" data-f="cols"></label>'+
    '<label class="f">عدد الصفوف<input type="number" min="1" max="12" value="'+c.rows+'" data-ch="clsField" data-f="rows"></label></div>'+
    '<div class="row" style="margin-top:14px"><button type="button" class="btn" data-act="newClass">+ فصل جديد</button><button type="button" class="btn danger" data-act="delClass">حذف هذا الفصل</button></div></section>':'<section class="card"><h2>الفصول</h2><p class="muted" style="margin-top:6px">لا توجد فصول بعد.</p><div class="row"><button type="button" class="btn pri" data-act="newClass">+ فصل جديد</button></div></section>';
  return '<div class="head"><h1>الإعدادات</h1></div>'+
    '<section class="card"><div class="cardhead"><h2>أنواع الدرجات</h2></div><p class="muted">حدّد نوع الدرجة وكم درجة تُسجَّل منه، والدرجة الكاملة لكل درجة. تظهر هذه الأنواع في الإدخال السريع والإدخال اليدوي وفي التصدير.</p>'+
    '<div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>نوع الدرجة</th><th>عدد الدرجات</th><th>الدرجة الكاملة لكل درجة</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="row" style="margin-top:12px"><button type="button" class="btn pri" data-act="addCat">+ إضافة نوع درجة</button></div></section>'+
    clsCard+
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

/* ---------- export ---------- */
function buildExport(c,scope,sid,type,withAtt){
  var cats=S.settings.cats;
  var all=sortedStudents(c);
  var one=scope==='student'?all.find(function(s){return s.id===sid;}):null;
  var list=one?[one]:all;
  var safe=function(x){return String(x).replace(/[\\\/:*?"<>|]+/g,'').trim().replace(/\s+/g,'-');};
  var name=safe(c.name)+'-'+(type==='all'?'كل-الدرجات':'متوسط-الدرجات')+'-'+(one?safe(one.name):'كل-الطلاب');
  var head=[],rows=[];
  if(type==='all'){
    head=['الفصل','المادة','الطالب','رقم الطالب','نوع الدرجة','رقم الدرجة','درجة الطالب','الدرجة النهائية','النسبة %','التاريخ','ملاحظة'];
    var order=function(id){var i=cats.findIndex(function(k){return k.id===id;});return i<0?999:i;};
    list.forEach(function(s){
      var gs=s.grades.slice().sort(function(a,b){return order(a.cat)-order(b.cat)||((a.slot==null?999:a.slot)-(b.slot==null?999:b.slot))||String(a.date).localeCompare(String(b.date));});
      if(!gs.length)rows.push([c.name,c.subject,s.name,s.num,'','','','','','','']);
      gs.forEach(function(g){var k=catById(g.cat);rows.push([c.name,c.subject,s.name,s.num,k?k.name:'(نوع محذوف)',g.slot!=null?g.slot+1:'',g.score,g.max,r1(g.score/g.max*100),g.date,g.note]);});
    });
  }else if(one){
    head=['التصنيف','عدد الدرجات','مجموع الدرجات','مجموع الدرجات النهائية','متوسط الدرجة','النسبة %'];
    var line=function(label,st){return [label,st.n,st.n?r2(st.sum):'',st.n?r2(st.max):'',st.n?r2(st.avg):'',st.n?r1(st.pct):''];};
    cats.forEach(function(k){rows.push(line(k.name,statsFor(one,k.id)));});
    rows.push(line('الإجمالي',statsFor(one)));
    if(withAtt){var a=attOf(c,one.id);
      rows.push(['','','','','','']);
      rows.push(['أيام الحضور',a.p,'','','','']);rows.push(['أيام الغياب',a.a,'','','','']);rows.push(['أيام التأخر',a.l,'','','','']);rows.push(['بعذر',a.e,'','','','']);
      rows.push(['نسبة الحضور %',a.rate==null?'':r1(a.rate),'','','','']);}
  }else{
    head=['الفصل','الطالب','رقم الطالب'];
    cats.forEach(function(k){head.push(k.name+' (متوسط)',k.name+' %');});
    head.push('مجموع الدرجات','مجموع النهايات','النسبة الإجمالية %');
    if(withAtt)head.push('أيام الحضور','أيام الغياب','أيام التأخر','بعذر','نسبة الحضور %');
    list.forEach(function(s){
      var r=[c.name,s.name,s.num];
      cats.forEach(function(k){var st=statsFor(s,k.id);r.push(st.n?r2(st.avg):'',st.n?r1(st.pct):'');});
      var t=statsFor(s);r.push(t.n?r2(t.sum):'',t.n?r2(t.max):'',t.n?r1(t.pct):'');
      if(withAtt){var a=attOf(c,s.id);r.push(a.p,a.a,a.l,a.e,a.rate==null?'':r1(a.rate));}
      rows.push(r);
    });
    if(rows.length){
      var avg=[c.name,'متوسط الفصل',''];
      for(var i=3;i<head.length;i++){var nums=rows.map(function(r){return r[i];}).filter(function(v){return typeof v==='number';});avg.push(nums.length?r2(nums.reduce(function(a,b){return a+b;},0)/nums.length):'');}
      rows.push(avg);
    }
  }
  return {head:head,rows:rows,name:name};
}
function toCsv(head,rows){
  var cell=function(v){
    if(v==null)return '';
    var s=String(v);
    if(typeof v==='string'&&/^[=+\-@\t\r]/.test(s))s="'"+s;
    return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
  };
  return [head].concat(rows).map(function(r){return r.map(cell).join(',');}).join('\r\n');
}
function showText(name,text){
  modal('<h2>انسخ البيانات</h2><p class="muted" style="margin:6px 0 10px">تعذر التنزيل المباشر هنا. انسخ النص والصقه في ملف باسم '+esc(name)+' أو في Excel.</p><textarea id="csvOut" readonly>'+esc(text)+'</textarea><div class="row"><button type="button" class="btn pri" data-act="copyText">نسخ</button><button type="button" class="btn ghost" data-act="mcancel">إغلاق</button></div>');
  var t=$('#csvOut');if(t)t.select();
}
async function copyTextOf(text,ta){
  try{await navigator.clipboard.writeText(text);toast('تم النسخ');}
  catch(e){if(ta){ta.focus();ta.select();}toast('حدّد النص وانسخه يدوياً');}
}
var STANDALONE=!(window.claude&&window.claude.use);
function blobDownload(name,text,bom){
  var type=/\.json$/.test(name)?'application/json':'text/csv';
  var blob=new Blob([(bom===false?'':'﻿')+text],{type:type+';charset=utf-8'});
  var url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(url);if(a.remove)a.remove();},1500);
}
async function saveFile(name,text,bom){
  if(STANDALONE){
    try{blobDownload(name,text,bom);toast('تم تنزيل الملف');return;}catch(e){showText(name,text);return;}
  }
  var dl=null;
  try{if(window.claude&&window.claude.use)dl=await window.claude.use('downloads');}catch(e){dl=null;}
  if(dl){
    try{await dl.save({filename:name,data:(bom===false?'':'﻿')+text});toast('تم تجهيز الملف');return;}
    catch(e){if(e&&e.code==='declined')return;}
  }
  showText(name,text);
}
function exportFromBtn(t){
  var c=curClass();if(!c)return null;
  var scope=t.getAttribute('data-scope'),sid=t.getAttribute('data-sid')||null;
  return buildExport(c,scope,sid,U.exType,U.exAtt);
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
  else if(g){g.score=score;g.max=k.max;g.date=today();}
  else s.grades.push({id:uid(),cat:k.id,slot:slot,score:score,max:k.max,date:today(),note:''});
  markClass(c.id);
}
function applyPad(score){
  var c=curClass(),s=byId(c,U.student),k=catById(U.pad.cat);if(!s||!k)return;
  if(score!=null&&(!(score>=0)||score>k.max)){toast('الدرجة يجب أن تكون بين 0 و '+fmt(k.max));return;}
  setSlot(c,s,k,U.pad.slot,score);
  if(score==null){renderKeep();return;}
  var n=Math.max(k.count,U.pad.slot+1),next=-1;
  for(var i=U.pad.slot+1;i<n;i++){if(!s.grades.some(function(g){return g.cat===k.id&&g.slot===i;})){next=i;break;}}
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
      else{U.student=sid;U.seg='grades';U.pad=null;render(true);}
      break;}
    case 'addAt':studentModal(c,null,+t.getAttribute('data-seat'));break;
    case 'openStudent':U.student=t.getAttribute('data-id');U.seg='grades';U.pad=null;render(true);break;
    case 'stBack':U.student=null;U.pad=null;render(true);break;
    case 'stNav':U.student=t.getAttribute('data-id');U.pad=null;render(true);break;
    case 'seg':U.seg=t.getAttribute('data-s');U.pad=null;renderKeep();break;
    case 'gmode':U.gmode=t.getAttribute('data-m');U.pad=null;renderKeep();break;
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
    case 'exScope':U.exScope=t.getAttribute('data-s');renderKeep();break;
    case 'doExport':{var ex=exportFromBtn(t);if(ex)await saveFile(ex.name+'.csv',toCsv(ex.head,ex.rows));break;}
    case 'copyExport':{var ex2=exportFromBtn(t);if(ex2)await copyTextOf(toCsv(ex2.head,ex2.rows));break;}
    case 'copyText':{var ta=$('#csvOut');await copyTextOf(ta?ta.value:'',ta);break;}
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
    case 'exOpt':U[t.getAttribute('data-k')]=t.type==='checkbox'?t.checked:t.value;renderKeep();break;
    case 'exStudent':U.exStudent=t.value;renderKeep();break;
    case 'manualCat':{var kk=catById(t.value);U.mcat=t.value;U.mmax=null;if(kk&&t.form)t.form.elements.max.value=fmt(kk.max);break;}
    case 'catField':{
      var cat=catById(t.getAttribute('data-id')),f=t.getAttribute('data-f');if(!cat)break;
      if(f==='name'){var v=t.value.trim();if(!v){t.value=cat.name;break;}cat.name=v;}
      else if(f==='count'){cat.count=clampI(t.value,1,30,cat.count);t.value=cat.count;}
      else if(f==='max'){var m=parseFloat(t.value);if(!(m>0)){t.value=fmt(cat.max);break;}cat.max=m;}
      markSettings();break;}
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
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('#modal').hidden)closeModal();});
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
connectDb();
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
