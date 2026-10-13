(function(root){
  'use strict';
  const DAY=86400000;
  const DAYS=['周一','周二','周三','周四','周五','周六','周日'];
  const mins=s=>{const [h,m]=s.split(':').map(Number);return h*60+m};
  const hhmm=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  const stamp=s=>Date.parse(`${s}T00:00:00Z`);
  const date=s=>new Date(s).toISOString().slice(0,10);
  const addDays=(s,n)=>date(stamp(s)+n*DAY);
  const weekOf=(s,start)=>Math.floor((stamp(s)-stamp(start))/(7*DAY))+1;
  function nowParts(d=new Date()){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
    return {date:`${parts.year}-${parts.month}-${parts.day}`,day:(new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`).getUTCDay()+6)%7,h:+parts.hour,m:+parts.minute,s:+parts.second,minute:+parts.hour*60+(+parts.minute)+(+parts.second)/60,time:`${parts.hour}:${parts.minute}:${parts.second}`};
  }
  function parseWeeks(s,max){
    const out=new Set();for(const bit of s.replace(/[，、]/g,',').split(',')){
      const match=bit.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!match)throw Error('周次格式应为 1-16 或 1-8,10,12-16。');
      const a=+match[1],b=+(match[2]||match[1]);if(a<1||b<a||b>max)throw Error(`周次必须在 1–${max} 周内，且范围从小到大。`);for(let i=a;i<=b;i++)out.add(i);
    }return [...out].sort((a,b)=>a-b);
  }
  function weeks(c,max){return parseWeeks(c.weeks,max).filter(w=>c.rule==='odd'?w%2===1:c.rule==='even'?w%2===0:true)}
  function sessions(c,data){
    let floor=0;const match=c.room.trim().match(/^[A-Za-z](\d{3})(?:\D|$)/);if(match)floor=Math.floor(+match[1]/100);
    return data.periods.slice(c.start-1,c.end).map((p,i)=>{const num=c.start+i;let shift=0;if(data.stagger&&(num===3||num===4)){if(floor>=1&&floor<=3)shift=-5;else if(floor>=4&&floor<=6)shift=10}return {start:mins(p.start)+shift,end:mins(p.end)+shift,num,stagger:!!shift}});
  }
  function phase(c,data,minute){const ss=sessions(c,data),total=ss.reduce((s,p)=>s+p.end-p.start,0);const elapsed=ss.reduce((s,p)=>s+Math.max(0,Math.min(minute,p.end)-p.start),0);let state=minute<ss[0].start?'upcoming':minute>=ss.at(-1).end?'finished':ss.some(p=>minute>=p.start&&minute<p.end)?'ongoing':'break';return {state,total,elapsed,percent:Math.min(100,Math.max(0,elapsed/total*100)),start:ss[0].start,end:ss.at(-1).end,sessions:ss};}
  function activeCourses(data,week,day){if(week<1||week>data.totalWeeks)return [];return data.courses.filter(c=>(day===undefined||c.day===day)&&weeks(c,data.totalWeeks).includes(week));}
  function conflict(a,b,data){if(a.day!==b.day||!weeks(a,data.totalWeeks).some(w=>weeks(b,data.totalWeeks).includes(w)))return false;return sessions(a,data).some(x=>sessions(b,data).some(y=>x.start<y.end&&x.end>y.start));}
  function validate(data){
    if(!data||!/^\d{4}-\d{2}-\d{2}$/.test(data.termStart)||!Number.isFinite(stamp(data.termStart))||date(stamp(data.termStart))!==data.termStart||new Date(stamp(data.termStart)).getUTCDay()!==1)throw Error('学期起始日期必须是有效的周一。');
    if(!Number.isInteger(data.totalWeeks)||data.totalWeeks<1||data.totalWeeks>52)throw Error('总周数必须在 1–52 之间。');
    if(!Array.isArray(data.periods)||data.periods.length>24)throw Error('节次数据不正确，最多支持 24 节。');
    for(let i=0;i<data.periods.length;i++){const p=data.periods[i];if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.end)||mins(p.end)<=mins(p.start)||(i&&mins(p.start)<mins(data.periods[i-1].end)))throw Error('节次需要按时间排列，结束晚于开始，且不能重叠。');}
    if(!Array.isArray(data.courses)||data.courses.length>500)throw Error('课程数据不正确。');
    const ids=new Set();for(const c of data.courses){if(typeof c.id!=='string'||ids.has(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>70||typeof c.room!=='string'||typeof c.teacher!=='string'||!Number.isInteger(c.day)||c.day<0||c.day>6||!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<1||c.end<c.start||c.end>data.periods.length||!['all','odd','even'].includes(c.rule)||!['sage','blue','peach','lavender','yellow'].includes(c.color))throw Error('课程字段不完整或超出节次范围。');ids.add(c.id);if(!weeks(c,data.totalWeeks).length)throw Error('课程的周次与单双周规则组合后不能为空。');}
    for(let i=0;i<data.courses.length;i++)for(let j=i+1;j<data.courses.length;j++)if(conflict(data.courses[i],data.courses[j],data))throw Error(`课程时间冲突：${data.courses[i].name} / ${data.courses[j].name}`);
    return data;
  }
  const defaults={version:1,termStart:'2026-08-31',totalWeeks:19,stagger:true,periods:[['08:00','08:50'],['09:00','09:50'],['10:10','11:00'],['11:10','12:00'],['14:00','14:50'],['15:00','15:50'],['16:10','17:00'],['17:10','18:00'],['19:00','19:50'],['20:00','20:50'],['21:00','21:50']].map(([start,end])=>({start,end})),courses:[]};
  const rows=[
    [0,1,2,'人工智能基础与应用','张伟','大数据技术与应用实验室414','6-11','all','blue'],
    [0,3,4,'大学体育Ⅰ（羽毛球）','张璐','场地待定','4-19','all','yellow'],
    [0,5,6,'高等数学A（上）','王宗','B330','4-17','all','sage'],
    [0,7,8,'形势与政策1','吴静','B107','4-6','all','lavender'],
    [0,9,10,'机械制图上','马晓丽','B108','4-15','all','peach'],
    [1,1,2,'机械工程通用英语Ⅰ','刘红梅','B224','4-11','all','blue'],
    [1,1,2,'机械工程通用英语Ⅰ','张玲','B224','12-19','all','blue'],
    [1,7,8,'思想道德与法治','李晓辉','虚拟教室X101','5-15','odd','lavender'],
    [1,9,10,'大学生心理健康','吴静','B304','4-11','all','yellow'],
    [2,1,2,'高等数学A（上）','王宗','B508','4-16','all','sage'],
    [2,3,4,'人工智能基础与应用','张伟','B310','4-13','all','blue'],
    [2,7,8,'劳动教育基础1','张凤波','B324','4','all','yellow'],
    [3,5,6,'工程化学基础','赵娟','B502','4-17','all','sage'],
    [3,9,10,'国家安全教育','吴静','B504','10-14','all','lavender'],
    [4,1,2,'高等数学A（上）','王宗','B126','4-16','all','sage'],
    [4,3,4,'机械工程通用英语Ⅰ','刘红梅','B109','4-11','all','blue'],
    [4,3,4,'机械工程通用英语Ⅰ','张玲','B109','12-19','all','blue'],
    [4,5,6,'思想道德与法治','李晓辉','B510','4-17','all','lavender'],
    [4,7,8,'机械制图上','马晓丽','B107','4-14','even','peach'],
    [4,7,8,'机械制图上','马晓丽','B116','5-15','odd','peach'],
    [4,9,10,'军事理论课','马甲','02-602','4-9','all','yellow']
  ];
  defaults.courses=rows.map(([day,start,end,name,teacher,room,weeks,rule,color],i)=>({id:`source-${i+1}`,day,start,end,name,teacher,room,weeks,rule,color}));
  const api={DAY,DAYS,mins,hhmm,stamp,date,addDays,weekOf,nowParts,parseWeeks,weeks,sessions,phase,activeCourses,conflict,validate,defaults};root.ScheduleCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
