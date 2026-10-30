'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('dist/athlete-vector.js','utf8'),context);
const {ATHLETE_VECTOR_IDS:ids,renderAthleteVector:render,getAthleteVectorFrames:getFrames}=context.window;
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i])),equal=(a,b)=>distance(a,b)<1e-8;
const flex=points=>{const a=points[0].map((n,i)=>n-points[1][i]),b=points[2].map((n,i)=>n-points[1][i]);return 180-Math.acos(Math.max(-1,Math.min(1,a.reduce((s,n,i)=>s+n*b[i],0)/(Math.hypot(...a)*Math.hypot(...b)))))*180/Math.PI;};
assert.equal(ids.length,10);assert.equal(new Set(ids).size,10);
const report=[];
for(const id of ids){
 const s=getFrames(id,1024),f=s.frames;assert.equal(f.length,1025);let boneError=0,penetration=0,minMargin=Infinity,maxKneeFlex=0,maxElbowFlex=0;
 for(const [frame,p] of f.entries()){
  for(const [bones,lengths] of [[p.bones.arms,[37,35]],[p.bones.legs,[58,60]]])for(const limb of bones)for(let part=0;part<2;part++)boneError=Math.max(boneError,Math.abs(distance(limb[part],limb[part+1])-lengths[part]));
  maxKneeFlex=Math.max(maxKneeFlex,...p.bones.legs.map(flex));maxElbowFlex=Math.max(maxElbowFlex,...p.bones.arms.map(flex));
  assert(Math.abs(distance(p.bones.legs[0][0],p.bones.legs[1][0])-24)<1e-8,`${id} pelvis width changed`);
  for(const foot of p.feet){penetration=Math.min(penetration,foot.heel[1],foot.toe[1]);if(foot.contact==='flat')assert(Math.abs(foot.heel[1])<1e-8&&Math.abs(foot.toe[1])<1e-8,`${id} flat sole not grounded`);if(foot.contact==='toe')assert(Math.abs(foot.toe[1])<1e-8&&foot.heel[1]>=-1e-8,`${id} rear heel points downward`);}
  if(!p.flight)minMargin=Math.min(minMargin,p.supportMargin);
  else assert.equal(p.support.length,0,`${id} airborne frame has false support`);
  if(id==='squat')for(let leg=0;leg<2;leg++)assert(equal(p.feet[leg].ankle,f[0].feet[leg].ankle),'squat foot slides');
  if(id==='wall-sit')assert(equal(p.root,f[0].root)&&p.wall,'wall sit moves away from support');
  if(id==='russian-twist')for(let leg=0;leg<2;leg++)for(let joint=0;joint<3;joint++)assert(equal(p.bones.legs[leg][joint],f[0].bones.legs[leg][joint]),'twist lower body moves');
  if(id==='mountain-climber')for(let hand=0;hand<2;hand++)assert(equal(p.hands[hand],f[0].hands[hand]),'climber hand slides');
 }
 assert(boneError<1e-7,`${id} segments stretch ${boneError}`);assert(penetration> -1e-7,`${id} foot below floor ${penetration}`);assert(minMargin>=0,`${id} center of mass outside support ${minMargin}`);
 assert(maxKneeFlex<=155&&maxElbowFlex<=160,`${id} excessive knee/elbow flexion`);
 const taps=getFrames('shoulder-tap').frames;if(id==='shoulder-tap'){assert(distance(taps[1].hands[1],taps[1].bones.arms[0][0])<6.01);assert(distance(taps[3].hands[0],taps[3].bones.arms[1][0])<6.01);}
 for(const c of ['spongebob','patrick']){const svg=render(id,c);assert(svg.startsWith('<svg'));assert(!/NaN|Infinity|undefined/.test(svg));assert(svg.includes('data-model="constrained-kinematics"'));assert(svg.includes('data-part="pelvis"'));assert(svg.includes('data-part="shorts-leg-far"'));assert(svg.includes('data-part="shorts-leg-near"'));for(let phase=0;phase<4;phase++){const still=render(id,c,phase);assert(!still.includes('<animate'));assert.equal((still.match(/data-part="pelvis"/g)||[]).length,1,'still scene duplicated');}}
 report.push({id,frames:f.length,boneError:Number(boneError.toExponential(2)),floorPenetration:penetration,minSupportMargin:Number(minMargin.toFixed(3)),maxKneeFlex:Number(maxKneeFlex.toFixed(2)),maxElbowFlex:Number(maxElbowFlex.toFixed(2))});
}
console.log(JSON.stringify({model:'deterministic 3-D kinematics, not a force simulation',checks:report},null,2));
fs.writeFileSync('../vector-kinematic-checks.json',JSON.stringify(report,null,2));
if(process.argv.includes('--render')){
 const sharp=require(process.env.SHARP_MODULE_PATH || 'sharp');
 sharp.cache(false);sharp.concurrency(1);
 (async()=>{for(const c of ['spongebob','patrick']){await sharp(Buffer.from(context.window.renderAthleteModelViews(c))).png().toFile(`../athlete-model-${c}.png`);}
 for(let group=0;group<2;group++){
  const parts=[];for(let j=0;j<5;j++)for(let c=0;c<2;c++){const image=await sharp(Buffer.from(render(ids[group*5+j],c?'patrick':'spongebob'))).png().toBuffer();parts.push({input:image,left:c*480,top:j*360});}
  await sharp({create:{width:960,height:1800,channels:4,background:'#F5F1E8'}}).composite(parts).png().toFile(`../athlete-static-review-${group+1}.png`);
 }
 })().catch(e=>{console.error(e);process.exitCode=1});
}
