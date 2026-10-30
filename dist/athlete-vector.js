/* Deterministic 3-D kinematics, orthographic projection and explicit contact constraints.
   This is a teaching animation rig; it does not integrate forces or claim a dynamics simulation. */
(function(global){
 'use strict';
 let serial=0;
 const IDS=['squat','lunge','mountain-climber','wall-sit','side-leg-raise','shoulder-tap','russian-twist','high-knees','squat-jump','jumping-jack'];
 const LABELS={squat:'深蹲',lunge:'交替弓步','mountain-climber':'登山跑','wall-sit':'靠墙深蹲','side-leg-raise':'侧卧抬腿','shoulder-tap':'平板肩碰','russian-twist':'俄罗斯转体','high-knees':'高抬腿','squat-jump':'深蹲跳','jumping-jack':'开合跳'};
 const C={spongebob:{skin:'#F2D54E',light:'#FFE66B',shadow:'#D9B940',ink:'#8B712F',shorts:'#9D6949',shortDark:'#795239',trim:'#FCF8E9',shoe:'#30352E',shoeLight:'#53594B'},patrick:{skin:'#EF999E',light:'#FFAFB0',shadow:'#DD818C',ink:'#AD6672',shorts:'#A8CF53',shortDark:'#89AD43',trim:'#CBDF83',shoe:'#849A8B',shoeLight:'#B1C1B3'}};
 const DUR={squat:6.4,lunge:9.6,'mountain-climber':5.6,'wall-sit':7.2,'side-leg-raise':6.4,'shoulder-tap':7.2,'russian-twist':6.4,'high-knees':4.8,'squat-jump':5.6,'jumping-jack':4.8};
 const STATIC={
  squat:{time:.5,view:'斜侧面',caption:'脚跟踩稳，臀部向后下坐，膝盖顺着脚尖。'},
  lunge:{time:.25,view:'斜侧面',caption:'前脚全掌承重，后脚前掌着地，屈膝后推地站回。'},
  'mountain-climber':{time:0,view:'侧面',caption:'双手留在肩下，一侧收膝，骨盆保持平稳。'},
  'wall-sit':{time:0,view:'侧面',caption:'背臀靠墙，全脚掌着地，在舒适高度保持呼吸。'},
  'side-leg-raise':{time:.5,view:'侧卧斜前方',caption:'肩髋上下叠放，上腿伸直小幅抬高，骨盆不后倒。'},
  'shoulder-tap':{time:.25,view:'侧后方',caption:'双脚分开支撑，一手轻碰对侧肩，骨盆尽量不动。'},
  'russian-twist':{time:.25,view:'斜前方',caption:'双脚着地，胸廓小幅转动，头颈自然跟随。'},
  'jumping-jack':{time:.25,view:'正面',caption:'手脚同步向两侧打开，合回时轻屈膝缓冲。'},
  'high-knees':{time:0,view:'斜侧面',caption:'躯干直立，一侧提膝，对侧手臂前摆，轻柔落地。'},
  'squat-jump':{time:.5,view:'斜侧面',caption:'落地时脚掌缓冲，髋膝轻屈，站稳后再做下一次。'}
 };
 const L={thigh:58,shin:60,upper:37,fore:35};
 const rad=n=>n*Math.PI/180,rnd=n=>Math.round(n*1000)/1000;
 const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 const len=a=>Math.hypot(...a),dist=(a,b)=>len(sub(a,b)),unit=a=>mul(a,1/(len(a)||1)),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
 const cross=(a,b)=>v(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]);
 const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),ease=n=>{n=clamp(n);return n*n*(3-2*n);};
 const v=(x,y,z=0)=>[x,y,z],sides=[-1,1];
 const tilt=a=>v(Math.sin(rad(a)),Math.cos(rad(a)),0);
 const forward=(a,face=1)=>v(Math.cos(rad(a))*face,-Math.sin(rad(a))*face,0);
 function basis(p,pelvis=false){
  if(p.sideLying)return {u:v(-1,0,0),f:v(0,0,1),l:v(0,1,0)};
  const a=pelvis?p.pelvisTilt:p.tilt,u=unit(add(tilt(a),v(0,0,pelvis?0:(p.bodyLeanZ||0)/78))),f=forward(a,p.face),l=unit(sub(v(0,0,1),mul(u,u[2]))),yaw=rad(pelvis?0:p.yaw);
  return {u,f:add(mul(f,Math.cos(yaw)),mul(l,Math.sin(yaw))),l:add(mul(l,Math.cos(yaw)),mul(f,-Math.sin(yaw)))};
 }
 function camera(id){if(typeof id==='object'){if(id.camera)return id.camera;id=id.id;}return {yaw:rad(id==='russian-twist'?52:id==='jumping-jack'?72:id==='shoulder-tap'?38:24),pitch:rad(id==='russian-twist'?18:id==='shoulder-tap'?12:id==='side-leg-raise'?5:7),scale:1.04};}
 function project(a,cam){const c=Math.cos(cam.yaw),s=Math.sin(cam.yaw),depth=a[0]*s+a[2]*c;return [rnd(240+(a[0]*c-a[2]*s)*cam.scale),rnd(320-(a[1]*Math.cos(cam.pitch)-depth*Math.sin(cam.pitch))*cam.scale)];}
 function offset(p,b,x,y,z=0){return add(p,add(add(mul(b.f,x),mul(b.u,y)),mul(b.l,z)));}
 function ik(a,b,l1,l2,hint){
  const delta=sub(b,a),d=len(delta),u=unit(delta),along=(d*d+l1*l1-l2*l2)/(2*(d||.001)),n=unit(sub(hint,mul(u,dot(hint,u))));
  const h=Math.sqrt(Math.max(0,l1*l1-along*along));return add(a,add(mul(u,along),mul(n,h)));
 }
 function foot(ankle,angle=0,contact='air',f=v(1,0,0),up=v(0,1,0)){
  const c=Math.cos(rad(angle)),s=Math.sin(rad(angle)),axis=add(mul(f,c),mul(up,s)),rise=add(mul(up,c),mul(f,-s));
  return {ankle,angle,contact,f:axis,up:rise,l:unit(cross(axis,rise)),heel:add(ankle,add(mul(axis,-8),mul(rise,-8))),toe:add(ankle,add(mul(axis,19),mul(rise,-8)))};
 }
 const flat=(x,z)=>foot(v(x,8,z),0,'flat');
 function toe(x,z,angle=-55){const f=v(Math.cos(rad(angle)),Math.sin(rad(angle)),0),u=v(-Math.sin(rad(angle)),Math.cos(rad(angle)),0);return foot(add(v(x,0,z),add(mul(f,-19),mul(u,8))),angle,'toe');}
 function pose(id){return {id,root:v(0,125),tilt:0,pelvisTilt:0,face:1,yaw:0,feet:[flat(0,-17),flat(0,17)],hands:null,armHints:[v(1,0,-.25),v(1,0,.25)],legHints:[v(1,0),v(1,0)],extraContacts:[],back:false,sideLying:false,flight:false};}
 function origins(p){const b=basis(p),pb=basis(p,true);return {hips:sides.map(s=>offset(p.root,pb,0,0,s*12)),shoulders:sides.map(s=>offset(p.root,b,0,78,s*25))};}
 function hang(p){const b=basis(p),o=origins(p);p.hands=o.shoulders.map((q,i)=>add(q,add(mul(b.u,-67),mul(b.f,8))));}
 function clasp(p,height=58,reach=48){const b=basis(p);p.hands=sides.map(s=>offset(p.root,b,reach,height,s*3));p.armHints=sides.map(s=>add(mul(b.f,-.2),mul(b.l,s)));}
 function gaitArms(p,drive){const b=basis(p),o=origins(p);p.fixedArms=o.shoulders.map((sh,i)=>{const a=(i===1?-drive:drive),upper=8+37*a,fore=98+37*a;const el=add(sh,add(mul(b.f,Math.sin(rad(upper))*L.upper),mul(b.u,-Math.cos(rad(upper))*L.upper)));return [sh,el,add(el,add(mul(b.f,Math.sin(rad(fore))*L.fore),mul(b.u,-Math.cos(rad(fore))*L.fore)))];});p.hands=p.fixedArms.map(x=>x[2]);}
 function evaluate(id,time){
  let t=((time%1)+1)%1;const p=pose(id),cycle=t*4,q=Math.floor(cycle),u=cycle-q,e=ease(u);
  if(id==='squat'){
   const k=t<.5?ease(t*2):ease((1-t)*2);p.root=v(-35*k,125-55*k);p.tilt=35*k;p.pelvisTilt=8*k;
   const b=basis(p),o=origins(p);p.hands=o.shoulders.map((sh,i)=>mix(add(sh,add(mul(b.u,-67),mul(b.f,8))),add(p.root,v(78,60,sides[i]*3)),k));p.armHints=sides.map(s=>v(1,-.2,s*.7));
  }
  if(id==='lunge'){
   const half=t<.5?t*2:(t-.5)*2,leg=t<.5?1:0,ret=half>.5,a=ret?(1-half)*2:half*2;
   const prep=ease(a/.12),step=ease((a-.12)/.40),lower=ease((a-.52)/.48);p.root=v(-20*step-8*lower,125-prep-26*step-28*lower,-sides[leg]*15*prep*(1-lower));p.tilt=25*step-7*lower;p.pelvisTilt=3*lower;
   const z=sides[leg]*17,angle=-55*lower;
   if(a<.52){const ankle=v(-89*step,8+Math.sin(Math.PI*step)*24,z);p.feet[leg]=foot(ankle,angle,'air');if(step<.0001)p.feet[leg]=flat(0,z);}
   else p.feet[leg]=toe(-70,z,angle);
   clasp(p,54,40);
  }
  if(id==='wall-sit'){
   p.root=v(0,68);p.fixedLegs=sides.map(s=>[v(0,68,s*12),v(58,68,s*12),v(58,8,s*12)]);p.feet=sides.map(s=>flat(58,s*12));clasp(p,54,25);
   p.extraContacts=[v(-20,0,-20),v(-20,0,20)];p.wall=true;
  }
  if(id==='high-knees'){
   const drive=Math.cos(t*2*Math.PI),amount=Math.abs(drive),leg=drive>=0?1:0,a=ease((amount-.25)/.75);
   p.root[1]=123;p.root[2]=-sides[leg]*17*ease(amount/.25);const origin=origins(p).hips[leg],knee=add(origin,v(L.thigh,0));
   const ankle=mix(v(0,8,sides[leg]*17),add(knee,v(0,-L.shin)),a);p.feet[leg]=foot(ankle,0,a<.0001?'flat':'air');
   gaitArms(p,drive);
  }
  if(id==='mountain-climber'||id==='shoulder-tap'){
   p.root=v(0,58);p.tilt=-80;p.pelvisTilt=-80;p.face=-1;p.back=id==='shoulder-tap';p.legHints=[v(0,-1),v(0,-1)];p.armHints=[v(1,0,-.2),v(1,0,.2)];
   const wide=id==='shoulder-tap'?44:17,end=id==='shoulder-tap'?108:112;p.feet=sides.map(s=>toe(end,s*wide,-65));p.hands=sides.map(s=>v(-80,4,s*(id==='shoulder-tap'?25:29)));
   if(id==='mountain-climber'){
    const drive=Math.cos(t*2*Math.PI),leg=drive>=0?1:0,k=ease(Math.abs(drive)),neutral=p.feet[leg].ankle,tuck=v(14.46,29.37,sides[leg]*17);
    p.feet[leg]=foot(mix(neutral,tuck,k),-65+50*k,k<.00001?'toe':'air');
   }else{
    // Each tap occupies a half cycle: load, lift to the other shoulder, return.
    const a=(t%.5)*2,amount=Math.sin(Math.PI*a)**2,leg=t<.5?1:0;p.bodyLeanZ=-sides[leg]*12*amount;
    const o=origins(p),target=add(o.shoulders[1-leg],mul(basis(p).f,6));p.hands[leg]=mix(p.hands[leg],target,amount);p.tapping=amount>.999?leg:-1;
   }
  }
  if(id==='side-leg-raise'){
   p.root=v(0,29);p.sideLying=true;p.face=1;p.tilt=-90;p.pelvisTilt=-90;
   const k=(1-Math.cos(t*2*Math.PI))/2,angle=28*k,hips=origins(p).hips;
   const dirs=[v(1,0),v(Math.cos(rad(angle)),Math.sin(rad(angle)))];p.fixedLegs=hips.map((h,i)=>{const knee=add(h,mul(dirs[i],L.thigh));return [h,knee,add(knee,mul(dirs[i],L.shin))];});
   p.feet=p.fixedLegs.map((x,i)=>foot(x[2],0,'air',v(0,0,1),mul(dirs[i],-1)));
   p.hands=[v(-144,9,0),v(-42,4,30)];p.armHints=[v(-1,1,0),v(1,-1,.2)];
   p.extraContacts=[v(-140,0,-8),v(-75,0,8),v(8,0,-15),v(8,0,15),v(-36,0,32)];
  }
  if(id==='russian-twist'){
   p.root=v(0,8);p.tilt=-16;p.pelvisTilt=0;p.yaw=-32*Math.sin(t*2*Math.PI);p.feet=sides.map(s=>flat(78,s*18));p.legHints=[v(0,1),v(0,1)];clasp(p,48,34);
   p.extraContacts=[v(-20,0,-20),v(20,0,-20),v(20,0,20),v(-20,0,20)];
  }
  if(id==='squat-jump'){
   let crouch=0,air=0,angle=0;
   if(t<.095){const a=ease(t/.095);crouch=1-a;p.root=v(-35+47.5*a,70+55*a);}
   else if(t<.12){const a=ease((t-.095)/.025);p.root=v(12.5+2.5*a,125+4.5*a);angle=-15*a;}
   else if(t<.38){const a=(t-.12)/.26;air=4*a*(1-a);p.root=v(15,129.5+35*air);angle=-15;p.flight=true;}
   else if(t<.54){const a=(t-.38)/.16;if(a<.30){const roll=ease(a/.30);angle=-15*(1-roll);p.root=v(15,129.5-5*roll);}else{crouch=ease((a-.30)/.70);p.root=v(15-50*crouch,124.5-54.5*crouch);}}
   else if(t<.75){const a=ease((t-.54)/.21);crouch=1-a;p.root=v(-35*crouch,70+55*a);}
   else{crouch=ease((t-.75)/.25);p.root=v(-35*crouch,125-55*crouch);}
   p.tilt=35*crouch;p.pelvisTilt=8*crouch;
   if(p.flight)p.feet=sides.map(s=>{const start=toe(19,s*17,-15).ankle;return foot(add(start,v(0,p.root[1]-129.5)),angle,'air');});
   else if(angle)p.feet=sides.map(s=>toe(19,s*17,angle));
   const b=basis(p),o=origins(p),raise=p.flight?.8+.2*air:t>=.38&&t<.48?.8*(1-ease((t-.38)/.10)):t>=.095&&t<.12?.8*ease((t-.095)/.025):0;p.hands=o.shoulders.map((sh,i)=>mix(offset(p.root,b,60,46,sides[i]*5),add(sh,add(mul(b.u,64),mul(b.f,22))),raise));p.armHints=sides.map(s=>v(1,.2,s*.5));
  }
  if(id==='jumping-jack'){
   const open=(1-Math.cos(t*4*Math.PI))/2,local=(t%.25)/.25,air=18*Math.sin(Math.PI*local)**2,spread=17+40*open;
   p.root[1]=8+Math.sqrt(117*117-(spread-12)**2)+air;p.flight=air>1e-7;p.feet=sides.map(s=>foot(v(0,8+air,s*spread),0,p.flight?'air':'flat'));
   const b=basis(p),o=origins(p),a=165*open,fore=a+8;p.fixedArms=o.shoulders.map((sh,i)=>{const s=sides[i],el=add(sh,add(mul(b.u,-Math.cos(rad(a))*L.upper),mul(b.l,s*Math.sin(rad(a))*L.upper)));return [sh,el,add(el,add(mul(b.u,-Math.cos(rad(fore))*L.fore),mul(b.l,s*Math.sin(rad(fore))*L.fore)))];});p.hands=p.fixedArms.map(x=>x[2]);
  }
  if(!p.hands)hang(p);return p;
 }
 function skeleton(p){
  const o=origins(p),legs=p.fixedLegs||o.hips.map((h,i)=>[h,ik(h,p.feet[i].ankle,L.thigh,L.shin,p.legHints[i]),p.feet[i].ankle]);
  const arms=p.fixedArms||o.shoulders.map((sh,i)=>[sh,ik(sh,p.hands[i],L.upper,L.fore,p.armHints[i]),p.hands[i]]);return {legs,arms};
 }
 function contacts(p){const points=p.extraContacts.slice();for(const f of p.feet){if(f.contact==='flat')for(const x of [f.heel,f.toe])for(const z of [-6,6])points.push(add(x,v(0,0,z)));else if(f.contact==='toe')for(const x of [-5,3])for(const z of [-6,6])points.push(add(f.toe,v(x,0,z)));}
  if(p.id==='mountain-climber'||p.id==='shoulder-tap')for(const h of p.hands)if(h[1]<4.01)for(const x of [-7,7])for(const z of [-6,6])points.push(add(h,v(x,-4,z)));return points;
 }
 function centerOfMass(p,bones){let total=0,out=v(0,0,0);const mass=(pt,w)=>{out=add(out,mul(pt,w));total+=w;},b=basis(p);mass(offset(p.root,b,0,46),.34);mass(p.root,.14);mass(offset(p.root,b,0,111),.08);
  for(let i=0;i<2;i++){mass(mix(bones.arms[i][0],bones.arms[i][1],.44),.028);mass(mix(bones.arms[i][1],bones.arms[i][2],.44),.022);mass(mix(bones.legs[i][0],bones.legs[i][1],.44),.10);mass(mix(bones.legs[i][1],bones.legs[i][2],.44),.05);mass(mix(p.feet[i].heel,p.feet[i].toe,.5),.02);}return mul(out,1/total);
 }
 function convexHull(points){const pts=points.map(p=>[p[0],p[2]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);const half=arr=>{const h=[];for(const a of arr){while(h.length>1&&cross(h[h.length-2],h[h.length-1],a)<=0)h.pop();h.push(a);}return h;};if(pts.length<3)return pts;return half(pts).slice(0,-1).concat(half(pts.slice().reverse()).slice(0,-1));}
 function supportMargin(com,hull){if(hull.length<3)return -Infinity;let margin=Infinity;for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length],edge=[b[0]-a[0],b[1]-a[1]];margin=Math.min(margin,(edge[0]*(com[2]-a[1])-edge[1]*(com[0]-a[0]))/(Math.hypot(...edge)||1));}return margin;}
 function audit(p){const bones=skeleton(p),com=centerOfMass(p,bones),support=contacts(p),hull=convexHull(support);return {...p,bones,com,support,hull,supportMargin:p.flight?null:supportMargin(com,hull)};}
 function ani(attr,values,on,duration){if(!on||values.every(x=>String(x)===String(values[0])))return '';return `<animate attributeName="${attr}" values="${values.join(';')}" keyTimes="${values.map((_,i)=>rnd(i/(values.length-1))).join(';')}" dur="${duration}s" repeatCount="indefinite" calcMode="linear"/>`;}
 function transform(type,values,on,duration){if(!on||values.every(x=>String(x)===String(values[0])))return '';return `<animateTransform attributeName="transform" type="${type}" values="${values.join(';')}" keyTimes="${values.map((_,i)=>rnd(i/(values.length-1))).join(';')}" dur="${duration}s" repeatCount="indefinite" calcMode="linear"/>`;}
 function path(paths,fill,stroke,width,on,duration,extra=''){return `<path d="${paths[0]}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ani('d',paths,on,duration)}</path>`;}
 function polygon(points){return 'M'+points.map(a=>a.map(rnd).join(' ')).join('L')+'Z';}
 function smoothPolygon(points){const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2),xy=a=>a.map(rnd).join(' ');let d='M'+xy(mid(points[points.length-1],points[0]));for(let i=0;i<points.length;i++)d+='Q'+xy(points[i])+' '+xy(mid(points[i],points[(i+1)%points.length]));return d+'Z';}
 function muscle(a,b,r1,r2,bulge){const d=Math.hypot(b[0]-a[0],b[1]-a[1])||1,u=[(b[0]-a[0])/d,(b[1]-a[1])/d],n=[-u[1],u[0]],m=[(a[0]+b[0])/2,(a[1]+b[1])/2],q=(p,r)=>[rnd(p[0]+n[0]*r),rnd(p[1]+n[1]*r)].join(' '),cap=(p,r)=>[rnd(p[0]+u[0]*r),rnd(p[1]+u[1]*r)].join(' ');return `M${q(a,r1)}Q${q(m,bulge)} ${q(b,r2)}Q${cap(b,r2*.65)} ${q(b,-r2)}Q${q(m,-bulge)} ${q(a,-r1)}Q${cap(a,-r1*.5)} ${q(a,r1)}Z`;}
 function localGroup(frames,body,on,duration){const cam=camera(frames[0]),positions=frames.map(p=>project(offset(p.root,basis(p),0,112),cam).join(' ')),angles=frames.map(p=>{const a=project(add(p.root,basis(p).u),cam),b=project(p.root,cam);return rnd(Math.atan2(a[1]-b[1],a[0]-b[0])*180/Math.PI+90);});return `<g transform="translate(${positions[0]})">${transform('translate',positions,on,duration)}<g transform="rotate(${angles[0]})">${transform('rotate',angles,on,duration)}<g transform="translate(0 112)">${body}</g></g></g>`;}
   function profileHead(character,palette,face,back){
    const c=palette;
    if(character==='spongebob'){
      const front=back?'':`<ellipse cx="11" cy="-117" rx="8" ry="10" fill="#fff" stroke="#5A593C" stroke-width="1.3"/><ellipse cx="13" cy="-116" rx="4.6" ry="6" fill="#62B5CC" stroke="#356C82" stroke-width=".8"/><ellipse cx="14" cy="-115.6" rx="2.6" ry="4.2" fill="#26383B"/><circle cx="12.5" cy="-119" r="1.5" fill="#fff"/><path d="M16-115Q32-117 29-109Q26-104 17-106" fill="${c.light}" stroke="${c.ink}" stroke-width="1.2"/><path d="M4-102Q12-94 21-102" fill="none" stroke="#8B6C34" stroke-width="1.4"/><path d="M10-99v5h4v-5m1 0v5h4v-6" fill="#fff" stroke="${c.ink}" stroke-width=".8"/><path d="M6-127l-2-4m9 3v-5m6 5 2-4" stroke="#51523E" stroke-width="1.5" stroke-linecap="round"/>`;
      return `<g transform="scale(${face} 1)"><path d="M-17-135Q-22-137-21-130L-22-121Q-19-117-22-113L-21-103Q-23-96-17-96Q-12-93-7-96Q-1-94 4-96Q10-94 15-97L17-108Q15-112 18-118L16-131Q18-136 12-134Q6-138 0-134Q-7-137-12-134Z" fill="${c.light}" stroke="${c.ink}" stroke-width="1.5"/><g fill="#B4AB42"><ellipse cx="-14" cy="-127" rx="3" ry="4"/><ellipse cx="-15" cy="-105" rx="2.5" ry="3"/><circle cx="-5" cy="-130" r="2.3"/><ellipse cx="-5" cy="-101" rx="2.3" ry="1.5"/></g>${front}</g>`;
    }
    return `<g transform="scale(${face} 1)"><path d="M-15-95Q-22-105-17-119L-9-142Q-6-150-1-143L12-119Q19-107 18-99Q5-91-15-95Z" fill="${c.skin}" stroke="${c.ink}" stroke-width="1.5"/><path d="M-8-135l2-4m-10 25-1 4" stroke="#D77D89" stroke-width="2" stroke-linecap="round"/>${back?'':`<path d="M3-128l9 2" stroke="#64554B" stroke-width="2.3" stroke-linecap="round"/><ellipse cx="8" cy="-116" rx="8" ry="10" fill="#fff" stroke="#795B54" stroke-width="1.2"/><ellipse cx="10.5" cy="-114" rx="2.5" ry="4.2" fill="#303632"/><path d="M3-102Q11-96 18-103" fill="none" stroke="#995664" stroke-width="1.5"/>`}</g>`;
  }
  function frontalHead(character,palette,turns,on,duration){
    const c=palette,shift=turns.map(t=>rnd(t*.25)),width=turns.map(t=>rnd(1-Math.abs(t)/300));
    const xy=(base,scale=1)=>turns.map(t=>rnd(base+t*scale));
    const eye=(base)=>{const xs=xy(base,.22),rx=turns.map(t=>rnd(7.5-(Math.sign(base)===Math.sign(t)?Math.abs(t)/14:0)));return `<ellipse cx="${xs[0]}" cy="-118" rx="${rx[0]}" ry="9.5" fill="#fff" stroke="${c.ink}" stroke-width="1.1">${ani('cx',xs,on,duration)}${ani('rx',rx,on,duration)}</ellipse><ellipse cx="${xs[0]}" cy="-117" rx="${character==='spongebob'?4.1:2.4}" ry="5.2" fill="${character==='spongebob'?'#64BBD2':'#343B35'}" stroke="${character==='spongebob'?'#3A7B93':'none'}" stroke-width=".7">${ani('cx',xy(base,.31),on,duration)}</ellipse>`;};
    const sponge=`<path d="M-20-138q-5 2-3 7l-1 11q3 5 0 9l1 10q-2 5 4 5l10 1q5-2 10 0l12-1q9 2 9-6l1-12q-2-5 0-10l-1-11q1-5-4-4l-12-1q-5 2-10 0Z" fill="${c.light}" stroke="${c.ink}" stroke-width="1.5"/><g fill="#B9AE44"><ellipse cx="-17" cy="-131" rx="2.8" ry="3.5"/><circle cx="16" cy="-133" r="2.5"/><ellipse cx="-17" cy="-103" rx="3" ry="2"/><circle cx="18" cy="-105" r="2.5"/></g>`;
    const star=`<path d="M-19-96Q-25-111-17-125L-7-148Q-3-156 3-146L17-124Q26-108 21-97Q1-91-19-96Z" fill="${c.skin}" stroke="${c.ink}" stroke-width="1.5"/><path d="M-13-132l-2 4M17-104l1-3" stroke="#D77D89" stroke-width="2"/>`;
    const mouth=turns.map(t=>`M${rnd(-9+t*.2)}-103Q${rnd(2+t*.3)}-96 ${rnd(13+t*.2)}-104`),nose=turns.map(t=>`M${rnd(-1+t*.2)}-116Q${rnd(7+t*.4)}-120 ${rnd(8+t*.4)}-112Q${rnd(8+t*.4)}-107 ${rnd(2+t*.2)}-108`);
    return `<g transform="scale(${width[0]} 1)">${transform('scale',width.map(x=>`${x} 1`),on,duration)}`+(character==='spongebob'?sponge:star)+eye(-9)+eye(9)+(character==='spongebob'?path(nose,c.light,c.ink,1,on,duration):'')+path(mouth,'none',c.ink,1.4,on,duration)+(character==='spongebob'?'<path d="M-5-100v5H0v-5m2 0v5h5v-6" fill="#fff" stroke="#937D41" stroke-width=".7"/>':'')+'</g>';
  }

 function head(frames,character,on,duration){const p=frames[0],c=C[character],front=p.modelView==='front'||p.modelView==='quarter'||p.id==='russian-twist'||p.id==='jumping-jack'||p.sideLying;const art=front?frontalHead(character,c,frames.map(p=>p.sideLying?-24:p.modelView==='quarter'?-20:p.yaw),on,duration):profileHead(character,c,p.face,p.back);return localGroup(frames,`<g transform="translate(0 -112) scale(1.12) translate(0 112)">${art}</g>`,on,duration);}
 function section(p,cam,y,width,depth,pelvis=false){const b=basis(p,pelvis),center=offset(p.root,b,0,y),screenU=sub(project(add(center,b.u),cam),project(center,cam)),normal=unit([-screenU[1],screenU[0]]),pf=sub(project(add(center,b.f),cam),project(center,cam)),pl=sub(project(add(center,b.l),cam),project(center,cam)),a=dot(pf,normal),z=dot(pl,normal),den=Math.hypot(depth*a,width*z)||1,r=add(mul(b.f,depth*depth*a/den),mul(b.l,width*width*z/den));return [project(sub(center,r),cam),project(add(center,r),cam)];}
 function bodyOutline(p,cam,pelvis=false){const sizes=pelvis?[[19,19,15],[0,20,p.wall?20:18],[-8,17,15]]:[[17,19,14],[38,22,17],[58,32,23],[70,33,22],[78,27,18]],s=sizes.map(a=>section(p,cam,...a,pelvis)),xy=a=>a.join(' '),b=basis(p,pelvis);if(pelvis){const top=project(offset(p.root,b,0,21),cam),bottom=project(offset(p.root,b,0,-8),cam);return `M${xy(s[0][0])}Q${xy(s[1][0])} ${xy(s[2][0])}Q${xy(bottom)} ${xy(s[2][1])}Q${xy(s[1][1])} ${xy(s[0][1])}Q${xy(top)} ${xy(s[0][0])}Z`;}const neck=section(p,cam,82,9,8);return `M${xy(s[0][0])}Q${xy(s[1][0])} ${xy(s[2][0])}Q${xy(s[3][0])} ${xy(s[4][0])}Q${xy(neck[0])} ${xy(project(offset(p.root,b,0,81),cam))}Q${xy(neck[1])} ${xy(s[4][1])}Q${xy(s[3][1])} ${xy(s[2][1])}Q${xy(s[1][1])} ${xy(s[0][1])}Q${xy(project(offset(p.root,b,0,15),cam))} ${xy(s[0][0])}Z`;}
 function anatomyArt(frames,character,on,duration){
  const c=C[character],cam=camera(frames[0]);let art='';
  const make=fn=>frames.map(p=>{const b=basis(p),P=(x,y,z)=>project(offset(p.root,b,x,y,z),cam).join(' ');return fn(P,p);});
  if(frames[0].back){
   for(const s of sides)art+=path(make(P=>`M${P(-16,77,s*3)}Q${P(-18,76,s*20)} ${P(-18,65,s*28)}Q${P(-19,53,s*23)} ${P(-15,35,s*12)}Q${P(-15,53,s*4)} ${P(-16,77,s*3)}Z`),c.shadow,c.ink,.85,on,duration,'opacity=".45"');
   art+=path(make(P=>`M${P(-17,76,0)}Q${P(-18,55,0)} ${P(-14,27,0)}M${P(-17,65,-19)}Q${P(-20,58,0)} ${P(-17,65,19)}`),'none',c.ink,1,on,duration,'opacity=".65"');
  }else{
   for(const s of sides)art+=path(make(P=>`M${P(18,74,s*2)}Q${P(18,78,s*15)} ${P(18,72,s*25)}Q${P(23,65,s*30)} ${P(24,58,s*20)}Q${P(23,54,s*9)} ${P(20,59,s*2)}Z`),c.light,c.ink,.9,on,duration,'opacity=".75"');
   for(const y of [48,39,30])for(const s of sides)art+=path(make(P=>`M${P(17,y+4,s)}Q${P(18,y+6,s*8)} ${P(17,y+3,s*12)}L${P(16,y-2,s*11)}Q${P(16,y-5,s*5)} ${P(16,y-2,s)}Z`),c.light,c.ink,.8,on,duration,'opacity=".6"');
   art+=path(make(P=>`M${P(20,74,0)}L${P(21,60,0)}M${P(18,53,0)}Q${P(17,37,0)} ${P(15,23,0)}M${P(18,52,-21)}Q${P(15,37,-16)} ${P(13,25,-15)}M${P(18,52,21)}Q${P(15,37,16)} ${P(13,25,15)}`),'none',c.ink,.9,on,duration,'opacity=".65"');
  }
  const spots=character==='spongebob'?[[16,70,-20,2.3],[18,55,19,2.6],[15,30,-14,1.7],[-18,60,17,2.1],[17,43,15,1.5]]:[[18,68,-18,1.3],[16,34,13,1.3]];
  for(const [x,y,z,r] of spots){const ps=frames.map(p=>project(offset(p.root,basis(p),p.back?-Math.abs(x):x,y,z),cam));art+=`<ellipse cx="${ps[0][0]}" cy="${ps[0][1]}" rx="${r}" ry="${r*.7}" fill="${character==='spongebob'?'#B8A837':'#D67884'}" opacity=".5">${ani('cx',ps.map(x=>x[0]),on,duration)}${ani('cy',ps.map(x=>x[1]),on,duration)}</ellipse>`;}
  return art;
 }
 function details(p,cam,back=false){const b=basis(p),draw=(coords)=>'M'+coords.map(a=>project(offset(p.root,b,...a),cam).join(' ')).join('L');return back?draw([[0,70,-20],[0,58,0],[0,70,20]])+draw([[0,68,0],[0,29,0]]):draw([[17,69,-22],[19,62,-11],[19,61,0],[19,62,11],[17,69,22]])+draw([[17,55,-14],[17,52,0],[17,55,14]])+draw([[15,48,0],[13,25,0]])+draw([[14,43,-9],[15,41,0],[14,43,9]])+draw([[13,33,-8],[14,31,0],[13,33,8]]);}
 function tube(frames,bones,index,character,on,duration,shorts=false){const c=C[character],cam=camera(frames[0]),far=index===0;const paths=frames.map((p,j)=>{const b=bones[j].legs[index],a=project(b[0],cam),end=project(shorts?mix(b[0],b[1],.43):b[1],cam);return muscle(a,end,shorts?16:14.4,shorts?14.7:9.4,shorts?17:19);});let out=path(paths,shorts?(far?c.shortDark:c.shorts):(far?c.shadow:c.skin),c.ink,1.25,on,duration,`data-part="${shorts?'shorts-leg':'thigh'}-${far?'far':'near'}"`);if(shorts){out+=path(frames.map((p,j)=>{const b=bones[j].legs[index],h=project(mix(b[0],b[1],.43),cam),a=project(b[0],cam),d=unit(sub(h,a)),n=[-d[1],d[0]];return `M${add(h,mul(n,13)).join(' ')}Q${add(h,mul(d,3)).join(' ')} ${add(h,mul(n,-13)).join(' ')}`;}),'none',character==='spongebob'?'#FFF6E5':c.shortDark,character==='spongebob'?2:1.3,on,duration);}return out;}
 function leg(frames,bones,index,character,on,duration){const c=C[character],cam=camera(frames[0]),far=index===0;return tube(frames,bones,index,character,on,duration)+path(frames.map((p,j)=>muscle(project(bones[j].legs[index][1],cam),project(bones[j].legs[index][2],cam),9.6,5.3,14.3)),far?c.shadow:c.skin,c.ink,1.2,on,duration)+path(frames.map((p,j)=>muscle(project(mix(bones[j].legs[index][0],bones[j].legs[index][1],.2),cam),project(mix(bones[j].legs[index][0],bones[j].legs[index][1],.78),cam),5,3,7)),c.light,'none',0,on,duration,'opacity=".28"')+footArt(frames,index,character,on,duration);}
 function footArt(frames,index,character,on,duration){const c=C[character],cam=camera(frames[0]),far=index===0;const shape=(p,points)=>polygon(points.map(([x,y,z])=>project(offset(p.feet[index].ankle,{f:p.feet[index].f,u:p.feet[index].up,l:p.feet[index].l},x,y,z),cam)));
  const hull=points=>{points=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);const half=pts=>{const out=[];for(const a of pts){while(out.length>1&&cross(out[out.length-2],out[out.length-1],a)<=0)out.pop();out.push(a);}return out;};return half(points).slice(0,-1).concat(half(points.slice().reverse()).slice(0,-1));};
  const shoe=path(frames.map(p=>{const f=p.feet[index],points=[];for(const z of [-6,6])for(const [x,y] of [[-11,-8],[-12,-2],[-8,4],[-1,4],[7,0],[17,-2],[22,-6],[21,-8]])points.push(project(offset(f.ankle,{f:f.f,u:f.up,l:f.l},x,y,z),cam));return smoothPolygon(hull(points));}),far?c.shoe:c.shoeLight,'#58634E',1.1,on,duration);
  const sole=path(frames.map(p=>{const f=p.feet[index];return 'M'+project(add(f.heel,mul(f.l,5)),cam).join(' ')+'L'+project(add(f.toe,mul(f.l,5)),cam).join(' ');}), 'none','#F6F6E9',2,on,duration);
  let sock='';if(character==='spongebob')sock=path(frames.map((p,j)=>{const sk=skeleton(p).legs[index],a=project(mix(sk[2],sk[1],.25),cam),b=project(sk[2],cam);return muscle(a,b,4.6,4.6,4.6);}), '#FCFCED',c.ink,.65,on,duration);
  const laces=path(frames.map(p=>{const f=p.feet[index],P=(x,y)=>project(offset(f.ankle,{f:f.f,u:f.up,l:f.l},x,y,5),cam).join(' ');return `M${P(-2,1)}L${P(3,-2)}M${P(2,0)}L${P(7,-3)}M${P(6,-1)}L${P(11,-4)}`;}),'none','#F1F2E6',.9,on,duration);
  return sock+shoe+sole+laces;
 }
 function arm(frames,bones,index,character,on,duration){
  const c=C[character],cam=camera(frames[0]),fill=index?c.skin:c.shadow;
  const part=segment=>path(frames.map((p,j)=>muscle(project(bones[j].arms[index][segment],cam),project(bones[j].arms[index][segment+1],cam),segment?7.8:12.3,segment?4.9:7.3,segment?10.4:15.5)),fill,c.ink,1.25,on,duration);
  const hands=frames.map(p=>project(p.hands[index],cam));let out=part(0)+part(1);
  out+=path(frames.map((p,j)=>muscle(project(mix(bones[j].arms[index][0],bones[j].arms[index][1],.12),cam),project(mix(bones[j].arms[index][0],bones[j].arms[index][1],.7),cam),8,5,11)),c.light,c.ink,.7,on,duration,'opacity=".48"');
  out+=path(frames.map((p,j)=>muscle(project(bones[j].arms[index][0],cam),project(mix(bones[j].arms[index][0],bones[j].arms[index][1],.32),cam),12.6,9.8,15)),fill,c.ink,1,on,duration);
  const grounded=frames[0].hands[index][1]<10&&['mountain-climber','shoulder-tap','side-leg-raise'].includes(frames[0].id);
  out+=path(hands.map(a=>{const P=(x,y)=>`${rnd(a[0]+x)} ${rnd(a[1]+y)}`;return grounded?`M${P(-7,-4)}Q${P(-1,-6)} ${P(5,-3)}L${P(13,-2)}Q${P(16,0)} ${P(12,2)}L${P(4,4)}Q${P(-5,6)} ${P(-9,2)}Q${P(-10,-1)} ${P(-7,-4)}Z`:`M${P(-5,-5)}Q${P(1,-8)} ${P(6,-5)}Q${P(10,-4)} ${P(9,0)}L${P(7,5)}Q${P(1,8)} ${P(-5,5)}Q${P(-9,3)} ${P(-7,0)}Q${P(-10,-2)} ${P(-5,-5)}Z`;}),c.light,c.ink,1,on,duration,'data-part="hand"');
  out+=path(hands.map(a=>{const P=(x,y)=>`${rnd(a[0]+x)} ${rnd(a[1]+y)}`;return grounded?`M${P(4,-1)}L${P(12,-1)}M${P(3,1)}L${P(11,1)}M${P(-5,-1)}Q${P(-1,-3)} ${P(2,0)}`:`M${P(-3,-4)}Q${P(-4,-1)} ${P(-2,1)}M${P(0,-5)}L${P(0,0)}M${P(3,-4)}L${P(3,0)}M${P(-6,1)}Q${P(-2,-1)} ${P(0,3)}L${P(-2,5)}`;}),'none',c.ink,.65,on,duration,'opacity=".8"');
  return out;
 }
 function pelvis(frames,character,on,duration){const c=C[character],cam=camera(frames[0]);const shell=path(frames.map(p=>bodyOutline(p,cam,true)),c.shorts,c.ink,1.3,on,duration,'data-part="pelvis"');const belt=path(frames.map(p=>{const s=section(p,cam,18,16,13,true);return 'M'+s[0].join(' ')+'L'+s[1].join(' ');}),character==='spongebob'?c.trim:c.shortDark,character==='spongebob'?c.trim:c.shortDark,character==='spongebob'?4:2,on,duration);
  return shell+belt;
 }
 function shortMark(frames,bones,character,on,duration){const c=C[character],cam=camera(frames[0]);if(character==='spongebob'){if(frames[0].back)return '';return path(frames.map(p=>{const b=basis(p,true);return polygon([[15,12,-2],[16,7,0],[17,12,2],[17,17,0]].map(a=>project(offset(p.root,b,...a),cam)));}), '#DC624C','#9D4D3E',.65,on,duration);}
  return path(frames.map((p,j)=>{const leg=bones[j].legs[1],center=add(mix(leg[0],leg[1],.23),mul(basis(p,true).l,14)),axis=unit(sub(leg[1],leg[0])),f=basis(p,true).f;const pts=[];for(let k=0;k<10;k++){const a=k*Math.PI/5,r=k%2?3.8:8.5;pts.push(project(add(center,add(mul(axis,Math.cos(a)*r),mul(f,Math.sin(a)*r))),cam));}return smoothPolygon(pts);}), '#AE7FC0','none',0,on,duration);
 }
 function scene(frames,character,on,duration){
  const c=C[character],cam=camera(frames[0]),bones=frames.map(skeleton);
  const neck=path(frames.map(p=>muscle(project(offset(p.root,basis(p),0,77),cam),project(offset(p.root,basis(p),0,97),cam),7,6.4,7)),c.skin,c.ink,1.2,on,duration,'data-part="neck"');
  const waist=path(frames.map(p=>{const top=section(p,cam,26,19,14),bottom=section(p,cam,15,19,15,true);return polygon([top[0],top[1],bottom[1],bottom[0]]);}),c.skin,c.ink,1.2,on,duration,'data-part="waist-connection"');
  return leg(frames,bones,0,character,on,duration)+tube(frames,bones,0,character,on,duration,true)+leg(frames,bones,1,character,on,duration)+arm(frames,bones,0,character,on,duration)+neck+waist+path(frames.map(p=>bodyOutline(p,cam)),c.skin,c.ink,1.4,on,duration,'data-part="torso"')+anatomyArt(frames,character,on,duration)+pelvis(frames,character,on,duration)+tube(frames,bones,1,character,on,duration,true)+shortMark(frames,bones,character,on,duration)+head(frames,character,on,duration)+arm(frames,bones,1,character,on,duration);
 }
 function framesFor(id,dense=false){if(!IDS.includes(id))return null;const n=typeof dense==='number'?Math.max(4,Math.floor(dense)):dense?64:4;return Array.from({length:n+1},(_,i)=>audit(evaluate(id,i/n)));}
 global.ATHLETE_VECTOR_IDS=Object.freeze(IDS.slice());
 global.ATHLETE_STATIC_IDS=global.ATHLETE_VECTOR_IDS;
 global.ATHLETE_STATIC_INFO=Object.freeze(Object.fromEntries(IDS.map(id=>[id,Object.freeze({...STATIC[id],static:true})])));
 global.getAthleteVectorFrames=(id,dense=false)=>{const frames=framesFor(id,dense);return frames?{duration:DUR[id],model:'constrained-kinematics',lengths:{...L},frames}:null;};
 global.renderAthleteVector=function(id,character='spongebob'){if(!IDS.includes(id))return '';character=character==='patrick'?'patrick':'spongebob';const cam=camera(id),uid=`athlete-kinematic-${++serial}`,f0=[evaluate(id,STATIC[id].time)],duration=DUR[id];
  const floor=polygon([v(-180,0,-65),v(180,0,-65),v(180,0,65),v(-180,0,65)].map(a=>project(a,cam))),wall=id==='wall-sit'?`<path d="${polygon([v(-20,0,-35),v(-20,240,-35),v(-20,240,35),v(-20,0,35)].map(a=>project(a,cam)))}" fill="#DDE2D5" stroke="#A9B59F" stroke-width="2"/>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="move-demo athlete-vector athlete-keypose" data-move="${id}" data-character="${character}" data-static="true" data-vector="true" data-model="constrained-kinematics" viewBox="0 0 480 360" role="img" aria-labelledby="${uid}"><title id="${uid}">${character==='patrick'?'派大星':'海绵宝宝'}示范${LABELS[id]}。${STATIC[id].caption}</title><rect width="480" height="360" rx="15" fill="#F5F1E8"/><path d="${floor}" fill="#D9E1CE" stroke="#AFBEA3" stroke-width="1"/>${wall}<g class="athlete-keypose-body">${scene(f0,character,false,duration)}</g></svg>`;
 };
 global.renderAthleteModelViews=function(character='spongebob'){
  character=character==='patrick'?'patrick':'spongebob';const views=[['正面',90,'front'],['侧面',0,'side'],['背面',-90,'back'],['斜侧面',55,'quarter']],uid=`athlete-model-${++serial}`;
  const panels=views.map(([name,yaw,view],i)=>{const p=pose('prototype');p.modelView=view;p.back=view==='back';p.camera={yaw:rad(yaw),pitch:rad(5),scale:1.04};hang(p);return `<g data-view="${view}" transform="translate(${i%2*480} ${Math.floor(i/2)*400})"><rect x="6" y="6" width="468" height="386" rx="22" fill="#F5F1E8" stroke="#DBDED1"/>${scene([p],character,false,1)}<text x="240" y="377" text-anchor="middle" fill="#374B3E" font-family="Microsoft YaHei, sans-serif" font-size="19">${name}</text></g>`;}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="athlete-model-views" data-character="${character}" viewBox="0 0 960 800" role="img" aria-labelledby="${uid}"><title id="${uid}">${character==='patrick'?'派大星':'海绵宝宝'}运动员模型：正面、侧面、背面与斜侧面。</title>${panels}</svg>`;
 };
})(window);
