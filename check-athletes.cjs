'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{}};vm.createContext(context);
for(const f of ['athlete-sheets.js','athlete-vector.js','athlete-demos.js','moves.js'])vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),context);
const {MOVE_LIBRARY,ATHLETE_SHEETS,renderMoveAnimation,athleteMotionInfo}=context.window;
const ids=['squat','pushup','lunge','plank','mountain-climber','crunch','side-plank','wall-sit','side-leg-raise','knee-pushup','shoulder-tap','russian-twist','jumping-jack','high-knees','squat-jump'];
assert.deepEqual(Array.from(MOVE_LIBRARY,m=>m.id),ids);
assert.equal(Object.keys(ATHLETE_SHEETS).length,5);
for(const m of MOVE_LIBRARY){
 assert.equal(m.place,undefined);assert.equal(m.cues.length,3);
 for(const c of ['spongebob','patrick']){
  const svg=renderMoveAnimation(m.id,c);const still=renderMoveAnimation(m.id,c,true);assert(!still.includes('<animate'));assert(!still.includes('<animateTransform'));assert(!svg.includes('NaN'));assert(!svg.includes('cute-action-demo'));assert(!svg.includes('cute-squat'));
  assert(athleteMotionInfo(m.id).available);assert(!svg.includes('动作演示待补充'));
  if(ATHLETE_SHEETS[m.id]){
   const s=ATHLETE_SHEETS[m.id];assert(fs.existsSync('dist/assets/'+s.file));assert.equal(s.width,s.height*2);
   assert(svg.includes('data-move="'+m.id+'"'));assert(svg.includes('data-character="'+c+'"'));assert(svg.includes('calcMode="discrete"'));assert(svg.includes('prefers-reduced-motion'));
   assert(svg.includes('y="'+(c==='patrick'?-s.height/2:0)+'"'));
  }else{assert(svg.includes('athlete-vector'));if(m.id!=='wall-sit')assert(svg.includes('<animate'));assert(svg.includes('prefers-reduced-motion'));}
 }
}
assert(/地垫|地面/.test(athleteMotionInfo('pushup').gaze));
assert(/地面/.test(athleteMotionInfo('plank').gaze));
assert(!fs.readFileSync('dist/index.html','utf8').includes('src="cute-moves.js"'));
console.log('15 moves / 30 character variants: 5 sprite sheets + 10 joint animations, natural gaze and all available states passed.');
