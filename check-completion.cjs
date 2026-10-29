'use strict';

// Run the app's actual completion functions and set-click branch against an
// in-memory log. This leaves browser data, the DOM, timers and media untouched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'dist/app.js'), 'utf8');
const lines = source.split(/\r?\n/);
const functionNames = ['moveDone', 'initializeExerciseLog', 'toggleMoveCompletion', 'begin', 'showSession'];
const functions = functionNames.map(name => {
  const line = lines.find(value => value.trimStart().startsWith(`function ${name}(`));
  assert.ok(line, `Cannot locate app function ${name}; update the test hook if formatting changed.`);
  return line;
}).join('\n');
const setStart = source.indexOf('if(b.dataset.set!==undefined&&session)');
const setEnd = source.indexOf('const a=b.dataset.action', setStart);
assert.ok(setStart >= 0 && setEnd > setStart, 'Cannot locate the actual per-set click branch.');
const setClick = `function handleSet(b){${source.slice(setStart, setEnd)}}`;
const TODAY = '2026-10-30';
const plain = value => JSON.parse(JSON.stringify(value));

function harness(initialLog = {}) {
  const log = { workout: false, meals: [], water: 0, ...initialLog };
  const context = {
    today: TODAY,
    selectedDate: TODAY,
    timer: null,
    session: null,
    currentPlan: {
      type: 'strength', title: '全身燃脂 · 基础组合',
      moves: [
        { id: 'squat', sets: 2, reps: '10 次', rest: 90 },
        { id: 'knee-pushup', sets: 3, reps: '10 次', rest: 90 }
      ]
    },
    saved: [], celebrations: [], modal: null,
    requireProfile: () => true,
    entry: () => log,
    editEntry: () => log,
    plan: () => context.currentPlan,
    save: () => context.saved.push(plain(log)),
    render: () => {},
    celebrateMove: id => context.celebrations.push(id),
    clearInterval: () => {},
    toast: () => {},
    openModal: (title, subtitle, html) => { context.modal = { title, subtitle, html }; },
    move: id => ({ id, name: id, cues: ['保持稳定。'] }),
    buddyToggle: () => '',
    mascotName: () => '海绵宝宝',
    mascot: () => 'spongebob',
    mascotArt: () => '',
    demo: () => '',
    demoControls: () => '',
    escape: value => String(value)
  };
  vm.createContext(context);
  vm.runInContext(`${functions}\n${setClick}`, context, { filename: 'app-completion-test-hooks.js' });
  const clickSet = index => context.handleSet({ dataset: { set: String(index) } });
  const setButtons = () => [...context.modal.html.matchAll(/<button\b[^>]*\bdata-set="(\d+)"[^>]*>/g)]
    .map(match => ({ index: Number(match[1]), disabled: /\sdisabled(?=\s|>)/.test(match[0]) }));
  return { log, context, clickSet, setButtons };
}

// Legacy all-day records migrate once; an explicit map is authoritative even
// when an ID is absent, so newly added exercises do not inherit a false tick.
{
  const { log, context } = harness({ workout: true, title: '全身燃脂 · 基础组合' });
  assert.equal(context.moveDone('squat'), true);
  log.exerciseCompletions = { squat: true };
  assert.equal(context.moveDone('knee-pushup'), false);
  log.exerciseCompletions.squat = false;
  assert.equal(context.moveDone('squat'), false);
}

// A whole-exercise tick writes its required set count. Undo clears that count,
// invalidates the aggregate, preserves the other move and does not celebrate.
{
  const { log, context } = harness();
  context.toggleMoveCompletion('squat');
  assert.equal(log.setsCompleted.squat, 2);
  assert.equal(log.workout, false);
  context.toggleMoveCompletion('knee-pushup');
  assert.equal(log.setsCompleted['knee-pushup'], 3);
  assert.equal(log.workout, true);
  assert.equal(log.title, context.currentPlan.title);
  const celebrations = context.celebrations.length;
  context.toggleMoveCompletion('squat');
  assert.equal(context.moveDone('squat'), false);
  assert.equal(log.setsCompleted.squat, 0);
  assert.equal(log.workout, false);
  assert.equal(log.exerciseCompletions['knee-pushup'], true);
  assert.equal(log.setsCompleted['knee-pushup'], 3);
  assert.equal(context.celebrations.length, celebrations);
  context.toggleMoveCompletion('squat');
  assert.equal(log.workout, true);
  assert.equal(context.saved.at(-1).workout, true);
}

// Clicking a displayed missing ID now records it as done, and the next click
// really undoes it. There is no legacy fallback that forces the tick to stay on.
{
  const { log, context } = harness({
    workout: true, title: '全身燃脂 · 基础组合',
    exerciseCompletions: { squat: true }, setsCompleted: { squat: 2 }
  });
  assert.equal(context.moveDone('knee-pushup'), false);
  context.toggleMoveCompletion('knee-pushup');
  assert.equal(log.exerciseCompletions['knee-pushup'], true);
  context.toggleMoveCompletion('knee-pushup');
  assert.equal(log.exerciseCompletions['knee-pushup'], false);
  assert.equal(log.setsCompleted['knee-pushup'], 0);
  assert.equal(log.workout, false);
}

// Use the actual session branch, including a 3-set movement, and confirm the
// LAST set immediately persists the same aggregate state as whole-move ticks.
{
  const { log, context, clickSet, setButtons } = harness();
  context.begin();
  assert.ok(context.session);
  clickSet(1); // Cannot skip an uncompleted set.
  assert.equal(context.saved.length, 0);
  assert.deepEqual(plain(context.session.completed), { 0: 0, 1: 0 });
  clickSet(0);
  assert.equal(log.setsCompleted.squat, 1);
  assert.equal(log.exerciseCompletions.squat, false);
  assert.equal(log.workout, false);
  assert.deepEqual(setButtons(), [{ index: 0, disabled: true }, { index: 1, disabled: false }]);
  clickSet(1);
  assert.equal(log.exerciseCompletions.squat, true);
  assert.equal(log.workout, false);
  assert.ok(setButtons().every(button => button.disabled));
  context.session.index = 1;
  context.showSession();
  clickSet(0);
  assert.deepEqual(setButtons(), [
    { index: 0, disabled: true }, { index: 1, disabled: false }, { index: 2, disabled: true }
  ]);
  clickSet(1);
  assert.equal(log.workout, false);
  clickSet(2);
  assert.equal(log.setsCompleted['knee-pushup'], 3);
  assert.equal(log.exerciseCompletions['knee-pushup'], true);
  assert.equal(log.workout, true, 'The final set must sync all-day completion without requiring finish().');
  assert.equal(log.title, context.currentPlan.title);
  assert.equal(context.saved.at(-1).workout, true);
  assert.ok(setButtons().every(button => button.disabled));
  // Closing and using the daily circle to undo must also work after per-set entry.
  context.session = null;
  context.toggleMoveCompletion('squat');
  assert.equal(log.workout, false);
  assert.equal(log.setsCompleted.squat, 0);
  context.begin();
  assert.deepEqual(plain(context.session.completed), { 0: 0, 1: 3 });
}

// Past-day circles remain read-only and do not persist any new values.
{
  const { log, context } = harness();
  context.selectedDate = '2026-10-29';
  const before = plain(log);
  context.toggleMoveCompletion('squat');
  assert.deepEqual(log, before);
  assert.equal(context.saved.length, 0);
}

console.log('Completion: explicit-map precedence, tick/undo, legacy migration, sequential sets, aggregate sync and resume passed.');
