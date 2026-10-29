'use strict';
const assert = require('node:assert/strict');
require('./dist/engine.js');
const { estimate, schedule, plan, redistribute } = globalThis.FitEngine;
const profile = {
  sex: 'male', height: 175, weight: 70, age: 28, bodyFat: null,
  place: 'home', goal: 'recomp', activity: 1.35, trainDays: 2, restDays: 1,
  startDate: '2026-10-29', targetDate: '2026-12-24', posture: ['sitting'], screened: true
};
const male = estimate(profile);
assert.equal(male.eligible, true);
assert.equal(male.bmr, 1659);
assert.equal(male.tdee, 2240);
assert.equal(male.calories, 2240);
assert.equal(male.bodyFat, 17.7);
assert.equal(male.estimatedBodyFat, true);
assert.equal(estimate({ ...profile, sex: 'female' }).bmr, 1493);
assert.equal(estimate({ ...profile, bodyFat: 22 }).bodyFat, 22);
assert.equal(estimate({ ...profile, bodyFat: 22 }).estimatedBodyFat, false);
assert.equal(estimate({ ...profile, goal: 'fatloss' }).calories, 2016);
const typicalWoman = estimate({ ...profile, sex: 'female', height: 160, weight: 55, age: 30, activity: 1.35, goal: 'recomp' });
assert.equal(typicalWoman.eligible, true);
assert.equal(typicalWoman.bmr, 1239);
assert.equal(typicalWoman.calories, 1673);
assert.equal(estimate({ ...profile, sex: 'female', height: 160, weight: 55, age: 30, activity: 1.35, goal: 'fatloss' }).eligible, true);
const smallOlderWoman = estimate({ ...profile, sex: 'female', height: 130, weight: 32, age: 64, activity: 1.35, goal: 'fatloss' });
assert.equal(smallOlderWoman.eligible, false);
assert.ok(smallOlderWoman.calories < 1500);
assert.match(smallOlderWoman.reason, /本原型无法.*适用.*营养专业/);
assert.match(smallOlderWoman.reason, /不是通用安全线/);
const smallMan = estimate({ ...profile, sex: 'male', height: 160, weight: 55, age: 30, activity: 1.35, goal: 'fatloss' });
assert.equal(smallMan.eligible, false);
assert.ok(smallMan.calories < 1800);
assert.match(smallMan.reason, /不是通用安全线/);
assert.equal(plan({ ...profile, sex: 'female', height: 130, weight: 32, age: 64, activity: 1.35, goal: 'fatloss' }, '2026-10-29').type, 'rest');
for (const changes of [{ age: 17 }, { age: 65 }, { screened: false }, { bodyFat: 1 }, { bodyFat: 'abc' }, { weight: 45 }, { weight: 110 }, { sex: 'unknown' }]) {
  const estimateResult = estimate({ ...profile, ...changes });
  assert.equal(estimateResult.eligible, false, JSON.stringify(changes));
  assert.ok(estimateResult.reason.length > 0);
  assert.equal(estimateResult.calories, null);
}
assert.equal(schedule(profile, '2026-10-29').type, 'strength');
assert.equal(schedule(profile, '2026-10-30').type, 'active');
assert.equal(schedule(profile, '2026-10-31').type, 'rest');
assert.equal(schedule(profile, '2026-11-01').type, 'strength');
assert.equal(schedule(profile, '2026-10-28').beforeStart, true);
assert.throws(() => schedule(profile, '2026-02-30'), RangeError);
assert.throws(() => schedule({ ...profile, trainDays: 0 }, '2026-10-29'), RangeError);
const dstProfile = { ...profile, startDate: '2026-03-07' };
assert.equal(schedule(dstProfile, '2026-03-10').dayIndex, 3);
assert.equal(plan(profile, '2026-10-29').moves[0].id, 'squat');
assert.deepEqual(plan({ ...profile, place: 'gym' }, '2026-10-29'), plan(profile, '2026-10-29'));
assert.equal(plan(profile, '2026-10-31').moves.length, 0);
assert.equal(plan({ ...profile, screened: false }, '2026-10-29').type, 'rest');
assert.equal(plan(profile, '2026-10-31', [{ date: '2026-10-31', minutes: 10 }]).extraMinutes, 0);
const addedPlan = plan(profile, '2026-10-29', [{ date: '2026-10-29', minutes: 4 }, { date: '2026-10-29', minutes: 4 }]);
assert.equal(addedPlan.extraMinutes, 5);
assert.equal(addedPlan.minutes, 34);
assert.equal(addedPlan.walkMinutes, 10);
const activeAddedPlan = plan(profile, '2026-10-30', [{ date: '2026-10-30', minutes: 5 }]);
assert.equal(activeAddedPlan.extraMinutes, 5);
assert.equal(activeAddedPlan.minutes, 25);
assert.equal(activeAddedPlan.walkMinutes, 15);
const noMutationInput = [{ date: '2026-11-01', minutes: 3 }];
const prior = JSON.stringify(noMutationInput);
const current = redistribute(profile, '2026-10-29', 'current', noMutationInput);
assert.equal(JSON.stringify(noMutationInput), prior);
assert.equal(current.allocatedMinutes, 5);
assert.equal(current.remainingMinutes, 25);
assert.equal(current.extensionDays, 3);
assert.deepEqual(current.adjustments.find((item) => item.date === '2026-10-30'), { date: '2026-10-30', minutes: 5 });
assert.deepEqual(current.additions, [{ date: '2026-10-30', minutes: 5 }]);
const next = redistribute(profile, '2026-10-29', 'next', noMutationInput);
assert.equal(next.allocatedMinutes, 7);
assert.equal(next.remainingMinutes, 23);
for (const extra of next.adjustments) {
  assert.ok(extra.minutes <= 5);
  assert.equal(schedule(profile, extra.date).isTraining, true);
  assert.ok(extra.date > '2026-10-29');
}
assert.equal(redistribute(profile, '2026-10-31', 'next').allocatedMinutes, 0);
assert.equal(redistribute(profile, '2026-10-29', 'extend').extensionDays, 3);
assert.deepEqual(redistribute(profile, '2026-10-29', 'extend').additions, []);
const history = redistribute(profile, '2026-10-29', 'next', [], '2026-11-01');
assert.deepEqual(history.additions, [{ date: '2026-11-02', minutes: 5 }]);
assert.equal(history.additions.every((item) => item.date > '2026-11-01' && item.date > '2026-10-29'), true);
assert.deepEqual(redistribute(profile, '2026-10-29', 'current', [], '2026-11-01').additions, []);
const repeated = redistribute(profile, '2026-10-29', 'next', next.adjustments, '2026-10-29');
assert.equal(repeated.allocatedMinutes, 0);
assert.deepEqual(repeated.additions, []);
assert.equal(repeated.adjustments.every((item) => item.minutes <= 5), true);
assert.throws(() => redistribute(profile, '2026-10-29', 'next', [], '2026-02-30'), RangeError);
const four = { ...profile, trainDays: 4, restDays: 2 };
assert.deepEqual(Array.from({ length: 6 }, (_, i) => schedule(four, `2026-11-${String(4 + i).padStart(2, '0')}`).type), ['strength', 'active', 'strength', 'active', 'rest', 'rest']);
const dayFromIndex = n => new Date(Date.UTC(2026, 9, 29 + n)).toISOString().slice(0, 10);
const allowedMoveIds = new Set(['squat', 'pushup', 'lunge', 'plank', 'mountain-climber', 'crunch', 'side-plank', 'wall-sit', 'side-leg-raise', 'knee-pushup', 'shoulder-tap', 'russian-twist', 'jumping-jack', 'high-knees', 'squat-jump']);
for (let trainDays = 1; trainDays <= 4; trainDays++) {
  for (let restDays = 1; restDays <= 3; restDays++) {
    const p = { ...profile, trainDays, restDays };
    let previousStrength = -Infinity;
    const themes = [];
    for (let dayIndex = 0; dayIndex < 56; dayIndex++) {
      const d = plan(p, dayFromIndex(dayIndex));
      assert.ok(Number.isFinite(d.minutes) && d.minutes >= 0 && d.minutes <= 60);
      if (d.type === 'strength') {
        assert.ok(dayIndex - previousStrength >= 2, `adjacent strength days for ${trainDays}/${restDays}`);
        previousStrength = dayIndex;
        themes.push(d.theme);
        assert.ok(d.moves.length >= 4 && d.moves.length <= 5);
        assert.equal(d.minutes, d.warmupMinutes + d.strengthMinutes + d.cardio.targetMinutes + d.cooldownMinutes);
        assert.equal(d.warmupMinutes, 5);
        assert.equal(d.cooldownMinutes, 5);
        for (const m of d.moves) {
          assert.ok(allowedMoveIds.has(m.id), `unknown movement ${m.id}`);
          assert.ok(m.sets >= 1 && m.sets <= 3);
          assert.ok(m.rest >= 60 && m.rest <= 120);
          assert.ok(m.seconds > 0 || m.repetitions > 0);
          assert.ok(m.sides === 1 || m.sides === 2);
          assert.ok(!['squat-jump', 'jumping-jack'].includes(m.id), 'no impact jumping in default beginner plan');
        }
      } else if (d.type === 'active') {
        assert.deepEqual(d.moves, []);
        assert.equal(d.cardio.type, 'walking');
        assert.equal(d.cardio.recovery, true);
        assert.equal(d.minutes, d.warmupMinutes + d.cardio.targetMinutes + d.cooldownMinutes);
      } else {
        assert.equal(d.minutes, 0);
        assert.deepEqual(d.moves, []);
        assert.equal(d.cardio, null);
      }
    }
    assert.deepEqual(themes.slice(0, 4), ['full-body', 'lower-body', 'core', 'coordination']);
    assert.equal(new Set(themes.slice(0, 4)).size, 4);
  }
}

// Opting into regular experience does not silently opt into jumping.
const collectMoves = p => new Set(Array.from({ length: 12 }, (_, i) => plan(p, dayFromIndex(i)).moves.map(m => m.id)).flat());
for (const p of [{ ...profile, level: 'beginner', lowImpact: false }, { ...profile, level: 'regular' }, { ...profile, level: 'regular', lowImpact: true }]) {
  assert.equal(collectMoves(p).has('squat-jump'), false);
  assert.equal(collectMoves(p).has('jumping-jack'), false);
}
const regular = { ...profile, level: 'regular', lowImpact: false };
const regularMoves = collectMoves(regular);
assert.equal(regularMoves.has('squat-jump'), true);
assert.equal(regularMoves.has('jumping-jack'), true);
assert.equal(regularMoves.has('pushup'), true);
assert.equal(collectMoves(profile).has('knee-pushup'), true);
assert.ok(plan(regular, dayFromIndex(0)).minutes < 60);
assert.deepEqual(collectMoves({ ...regular, sex: 'female' }), regularMoves);

// User-facing count targets are at least 10, including EACH side; static
// supports retain their own seconds dose and are never relabelled as reps.
const staticIds = new Set(['plank', 'side-plank', 'wall-sit']);
const bilateralIds = new Set(['lunge', 'side-leg-raise', 'side-plank', 'russian-twist', 'shoulder-tap', 'mountain-climber', 'high-knees']);
let checkedDosePlans = 0;
for (const level of ['beginner', 'regular']) {
  for (const lowImpact of [true, false]) {
    for (let trainDays = 1; trainDays <= 4; trainDays++) {
      for (let restDays = 1; restDays <= 3; restDays++) {
        const p = { ...profile, level, lowImpact, trainDays, restDays };
        for (let dayIndex = 0; dayIndex < 56; dayIndex++) {
          const d = plan(p, dayFromIndex(dayIndex));
          checkedDosePlans++;
          assert.ok(d.minutes >= 0 && d.minutes <= 60, `${level} ${trainDays}/${restDays}: session stays practical`);
          for (const m of d.moves) {
            assert.ok(m.sets >= 2 && m.sets <= 3);
            assert.ok(m.rest >= 60 && m.rest <= 120);
            if (staticIds.has(m.id)) {
              assert.ok(Number.isInteger(m.seconds) && m.seconds >= 20 && m.seconds <= 30);
              assert.equal(m.repetitions, undefined);
              assert.match(m.reps, /秒$/);
            } else {
              assert.ok(Number.isInteger(m.repetitions) && m.repetitions >= 10, `too few ${m.id}: ${m.repetitions}`);
              assert.ok(m.repetitions <= 12, `bounded starting dose ${m.id}`);
              assert.equal(m.seconds, undefined);
              assert.match(m.reps, /次$/);
              assert.match(m.note, /可降低难度.*动作走样时结束/);
              if (level === 'beginner') {
                assert.equal(m.repetitions, 10);
                assert.equal(m.sets, 2);
              }
            }
            if (bilateralIds.has(m.id)) {
              assert.equal(m.sides, 2, `both sides must be counted for ${m.id}`);
              assert.match(m.reps, /^每侧 /);
            }
            if (['pushup', 'knee-pushup', 'lunge'].includes(m.id)) assert.ok(m.rest >= 90);
            if (['jumping-jack', 'squat-jump'].includes(m.id)) {
              assert.equal(level, 'regular');
              assert.equal(lowImpact, false);
              assert.equal(m.sets, 2);
              assert.equal(m.repetitions, 10);
              assert.ok(m.rest >= 90);
            }
            if (m.id === 'squat-jump') assert.equal(m.rest, 120);
          }
        }
      }
    }
  }
}
assert.ok(globalThis.FitEngine.planningNotes.some(n => /10 次起.*动作走样时结束/.test(n)));

// The public library doses follow the same count/time distinction. Loading the
// metadata does not call or replace the root-owned athlete rendering functions.
const fs = require('node:fs'), vm = require('node:vm');
const movementContext = { window: {} };
vm.createContext(movementContext);
vm.runInContext(fs.readFileSync('./dist/moves.js', 'utf8'), movementContext);
const library = movementContext.window.MOVE_LIBRARY;
assert.equal(library.length, 15);
for (const m of library) {
  const limits = m.reps.match(/\d+/g).map(Number);
  if (staticIds.has(m.id)) {
    assert.ok(m.seconds >= 20 && m.seconds <= 30);
    assert.match(m.reps, /秒$/);
  } else {
    assert.ok(limits.every(n => n >= 10), `library count below 10: ${m.id}`);
    assert.equal(m.seconds, undefined);
    assert.match(m.doseNote, /可降难度.*动作走样时结束/);
  }
}

// Cardio preferences change the aerobic block, not the resistance dose.
for (const type of ['walking', 'running', 'incline', 'stairs', 'swimming']) {
  const p = { ...profile, cardioPreference: type };
  const d = plan(p, dayFromIndex(0));
  assert.equal(d.cardio.type, type);
  assert.ok(d.cardio.targetMinutes >= 5 && d.cardio.targetMinutes <= 15);
  assert.equal(d.cardio.options.length, 5);
  assert.deepEqual(d.moves, plan(profile, dayFromIndex(0)).moves);
  const recovery = plan(p, dayFromIndex(1));
  assert.equal(recovery.cardio.type, type === 'swimming' ? 'swimming' : 'walking');
  assert.equal(recovery.cardio.recovery, true);
  assert.match(recovery.cardio.intensity, /轻松完整对话/);
}
assert.equal(plan({ ...profile, cardioPreference: 'invalid' }, dayFromIndex(0)).cardio.type, 'walking');
assert.equal(plan({ ...profile, screened: false }, dayFromIndex(0)).cardio, null);
assert.equal(plan(profile, '2026-10-28').cardio, null);
assert.ok(globalThis.FitEngine.trainingSources.every(s => s.title && /^https:\/\//.test(s.url) && s.note));
assert.ok(globalThis.FitEngine.trainingSources.some(s => /NHS/.test(s.title) && /专业依据/.test(s.title)));
assert.ok(globalThis.FitEngine.trainingSources.some(s => /ACE/.test(s.title) && /专业依据/.test(s.title)));
assert.ok(globalThis.FitEngine.trainingSources.some(s => /博主官方辅助/.test(s.title)));
assert.ok(globalThis.FitEngine.planningNotes.length >= 4);
console.log(`FitEngine: nutrition, dates, themes, recovery, cardio, adjustments and ${checkedDosePlans} plans with >=10 count targets passed.`);
