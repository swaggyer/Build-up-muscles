/* Approved A athlete artwork: actual pose illustrations, never a rotated frontal mascot. */
(function(global){
  'use strict';
  let serial=0;
  const names={spongebob:'海绵宝宝',patrick:'派大星'};
  const meta={
    squat:{view:'侧面',gaze:'头颈自然延伸，目视身体前方。',phases:['站稳','向后下坐','舒适下蹲','呼气站起']},
    pushup:{view:'侧面',gaze:'视线朝地垫，头颈、躯干和脚跟保持自然直线。',phases:['高平板','屈肘下落','胸部接近地垫','推回起点']},
    lunge:{view:'侧面',gaze:'头颈保持中立，视线沿前脚朝向。',phases:['站稳','后撤下蹲','收回站稳','换腿后撤']},
    plank:{view:'侧面',gaze:'眼睛看向两前臂之间的地面，避免抬头找镜头。',phases:['前臂支撑','自然吸气','稳定呼气','保持姿势']},
    'mountain-climber':{view:'侧面',gaze:'目视地垫，骨盆保持平稳。',phases:['一侧收膝','回到平板','另一侧收膝','回到平板']},
    crunch:{view:'侧面',gaze:'视线随肩部轻抬朝斜上方，不转头找镜头。',phases:['仰卧屈膝','轻抬肩胛','小幅收紧','缓慢放下']},
    'side-plank':{view:'侧面支撑',gaze:'头颈随躯干保持自然方向，身体不为露脸而翻转。',phases:['侧向支撑','稳定呼吸','保持髋部','继续保持']},
    'wall-sit':{view:'侧面',gaze:'背部靠墙，头颈中立，视线朝前。',phases:['靠墙支撑','稳定吸气','保持高度','稳定呼气']},
    'side-leg-raise':{view:'侧卧',gaze:'肩髋叠放，头部由下侧手臂支撑，视线自然。',phases:['侧卧叠放','缓慢抬腿','小幅停留','缓慢落下']},
    'knee-pushup':{view:'侧面',gaze:'眼睛朝地垫，肩、髋、膝保持自然连线。',phases:['双膝支撑','屈肘下落','低位控制','呼气推起']},
    'shoulder-tap':{view:'侧后方',gaze:'身体面朝地面，抬手碰对侧肩，头部不追随镜头。',phases:['双手支撑','一手碰对肩','双手落回','另一手碰对肩']},
    'russian-twist':{view:'斜前方',gaze:'胸廓与头部小幅同向转动，视线跟随身体。',phases:['坐稳','小幅向左','回到中间','小幅向右']},
    'jumping-jack':{view:'正面',gaze:'身体直立、自然目视前方；正面便于看清双侧开合。',phases:['并拢站稳','手脚打开','合回缓冲','再次打开']},
    'high-knees':{view:'侧面',gaze:'躯干直立，视线朝身体前方，不后仰找镜头。',phases:['一侧提膝','稳定落地','另一侧提膝','稳定落地']},
    'squat-jump':{view:'侧面',gaze:'头颈自然跟随躯干，目视前方落地区域。',phases:['浅蹲蓄力','小幅跳起','柔和落地','稳定站立']}
  };
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const char=c=>c==='patrick'?'patrick':'spongebob';
  const usable=id=>!!global.ATHLETE_SHEETS?.[id]||global.ATHLETE_VECTOR_IDS?.includes(id);
  global.athleteMotionInfo=id=>({...meta[id],...global.ATHLETE_STATIC_INFO?.[id],available:usable(id)});
  global.renderAthletePortrait=function(character='spongebob'){
    const c=char(character),uid=`athlete-a-portrait-${++serial}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" class="athlete-portrait" viewBox="0 0 600 680" role="img" aria-labelledby="${uid}"><title id="${uid}">A 方案${names[c]}运动员形象</title><defs><clipPath id="${uid}-clip"><rect width="600" height="680"/></clipPath></defs><g clip-path="url(#${uid}-clip)"><image href="assets/athlete-a-model.webp" width="1536" height="1024" x="${c==='patrick'?-850:-90}" y="0"/></g></svg>`;
  };
  global.renderAthleteDuo=function(){
    const uid=`athlete-duo-${++serial}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" class="buddy-hero-image athlete-duo" viewBox="0 0 1040 680" role="img" aria-label="A 方案海绵宝宝与派大星运动搭子"><defs><clipPath id="${uid}-l"><rect width="520" height="680"/></clipPath><clipPath id="${uid}-r"><rect x="520" width="520" height="680"/></clipPath></defs><g clip-path="url(#${uid}-l)"><image href="assets/athlete-a-model.webp" width="1536" height="1024" x="-90"/></g><g clip-path="url(#${uid}-r)"><image href="assets/athlete-a-model.webp" width="1536" height="1024" x="-400"/></g></svg>`;
  };
  global.renderAthleteMove=function(id,character='spongebob',still=false){
    const c=char(character),sheet=global.ATHLETE_SHEETS?.[id],info=meta[id]||meta.squat;
    if(global.ATHLETE_STATIC_IDS?.includes(id))return global.renderAthleteVector(id,c);
    if(!sheet&&global.ATHLETE_VECTOR_IDS?.includes(id))return global.renderAthleteVector(id,c,still?0:undefined);
    if(!sheet)return `<div class="animation-unavailable" role="group" aria-label="此动作的 A 方案演示尚未完成"><div class="pending-portrait">${global.renderAthletePortrait(c)}</div><span class="pending-label">动作演示待补充</span></div>`;
    const uid=`athlete-a-move-${++serial}`,w=sheet.width/4,h=sheet.height/2,row=c==='patrick'?-h:0,dur=id==='plank'||id==='side-plank'?6.4:4.8;
    const picture=motion=>`<image href="assets/${esc(sheet.file)}" x="0" y="${row}" width="${sheet.width}" height="${sheet.height}">${motion?`<animate attributeName="x" values="0;${-w};${-w*2};${-w*3};0" keyTimes="0;.25;.5;.75;1" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>`:''}</image>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" class="move-demo athlete-sprite" data-move="${id}" data-character="${c}" data-duration="${dur}" data-cell-width="${w}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${uid}"><title id="${uid}">${names[c]} A 方案动作演示，${info.view}视角。${info.gaze}</title><defs><clipPath id="${uid}-clip"><rect width="${w}" height="${h}"/></clipPath></defs><style>.athlete-sprite .athlete-static{display:none}.is-paused .athlete-sprite .athlete-motion{display:none}.is-paused .athlete-sprite .athlete-static{display:block}@media(prefers-reduced-motion:reduce){.athlete-sprite .athlete-motion{display:none}.athlete-sprite .athlete-static{display:block}}</style><g clip-path="url(#${uid}-clip)"><g class="athlete-motion">${picture(!still)}</g><g class="athlete-static">${picture(false)}</g></g></svg>`;
  };
})(window);
