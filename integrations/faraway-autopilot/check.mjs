import fs from 'node:fs';
import assert from 'node:assert/strict';

const text = fs.readFileSync(new URL('./autopilot.osc', import.meta.url), 'utf8');
const blocks = new Map();
for (const match of text.matchAll(/\{(macro|trigger):([^}]+)\}([\s\S]*?)\{end\}/g)) {
  blocks.set(match[2], match[3].split('\n').filter(line => !line.trim().startsWith("'")).join('\n')
    .match(/\([^)]*\)|\{[^}]*\}|[^\s]+/g) ?? []);
}
const declared = new Set(fs.readFileSync(new URL('./varlist.txt', import.meta.url), 'utf8').trim().split(/\s+/));
for (const token of text.matchAll(/\([LS]\.L\.(ap_[^)]+)\)/g)) assert(declared.has(token[1]), token[1]);
const existing = fs.readFileSync(new URL('../door/b0/door.osc', import.meta.url), 'latin1');
for (const name of ['trg_bus_dooraft', 'trg_bus_doorfront0', 'trg_bus_doorfront1', 'trg_bus_doorback23']) {
  assert(existing.includes(`{macro:${name}}`), name);
}
let vars;
const stack = [];
const binary = (fn) => { const b = stack.pop(), a = stack.pop(); assert(a !== undefined && b !== undefined, 'stack underflow'); stack.push(+fn(a, b)); };
function run(name) {
  const door = {trg_bus_doorfront0:'doorTarget_0', trg_bus_doorfront1:'doorTarget_1', trg_bus_doorback23:'doorTarget_23', trg_bus_dooraft:'bremse_halte_sw'};
  if (door[name]) { vars[door[name]] = +!vars[door[name]]; return; }
  const tokens = blocks.get(name);
  assert(tokens, `missing macro ${name}`);
  const active = [];
  for (const token of tokens) {
    if (token === '{if}') { active.push(active.every(Boolean) ? !!stack.pop() : false); continue; }
    if (token === '{else}') { active[active.length - 1] = !active.at(-1); continue; }
    if (token === '{endif}') { assert(active.length); active.pop(); continue; }
    if (!active.every(Boolean)) continue;
    const m = token.match(/^\(([LSM])\.([LS])\.(.+)\)$/);
    if (m) {
      if (m[1] === 'L') stack.push(m[2] === 'S' ? 0.1 : (vars[m[3]] ?? 0));
      if (m[1] === 'S') { assert(stack.length, token); vars[m[3]] = stack.at(-1); }
      if (m[1] === 'M') run(m[3]);
      continue;
    }
    const ops = {'+':(a,b)=>a+b, '-':(a,b)=>a-b, '*':(a,b)=>a*b, '=':(a,b)=>a===b,
      '>':(a,b)=>a>b, '<':(a,b)=>a<b, '>=':(a,b)=>a>=b, '<=':(a,b)=>a<=b,
      '&&':(a,b)=>!!a&&!!b, '||':(a,b)=>!!a||!!b, min:Math.min, max:Math.max};
    if (ops[token]) binary(ops[token]);
    else if (token === '!') stack.push(+!stack.pop());
    else if (token === 'abs') stack.push(Math.abs(stack.pop()));
    else if (token === 'sqrt') stack.push(Math.sqrt(stack.pop()));
    else { assert(Number.isFinite(Number(token)), token); stack.push(Number(token)); }
  }
  assert.equal(active.length, 0, 'unbalanced condition');
}
function frame() { stack.length = 0; run('ap_frame'); }
function ready() {
  vars = {ap_bridge_valid:1, AI:0, Velocity:0, elec_busbar_main:1, engine_on:1,
    antrieb_getr_aktugang:1, ap_nav_speed:25, ap_stop_distance:100, ap_stop_id:1};
  stack.length = 0; run('ap_toggle'); assert.equal(vars.ap_enabled, 1);
}
ready(); frame(); assert(vars.ap_throttle > 0); assert.equal(vars.ap_brake, 0);
vars.ap_stop_distance = 0.5; frame(); assert.equal(vars.ap_state, 2);
assert.equal(vars.ap_throttle, 0); assert.equal(vars.doorTarget_23, 1);
for (let i = 0; i < 120; i++) frame();
assert.equal(vars.ap_state, 2, 'waiting starts only after doors fully open');
for (const k of ['door_0','door_1','door_2','door_3']) vars[k] = 1;
for (let i = 0; i < 101; i++) frame();
assert.equal(vars.ap_state, 3); assert.equal(vars.doorTarget_23, 0);
assert.equal(vars.ap_throttle, 0, 'no departure with open doors');
for (const k of ['door_0','door_1','door_2','door_3']) vars[k] = 0;
frame(); assert.equal(vars.ap_state, 4); assert.equal(vars.bremse_halte_sw, 0);
assert(vars.ap_throttle > 0);
vars.ap_stop_id = 2; vars.ap_stop_distance = 100; frame(); assert.equal(vars.ap_state, 1);
vars.ap_bridge_valid = 0; frame(); assert.equal(vars.ap_fault, 1); assert.equal(vars.ap_brake, 1);
vars.ap_bridge_valid = 1; frame(); assert.equal(vars.ap_throttle, 0, 'fault remains latched');
ready(); vars.door_3 = 0.5; frame(); assert.equal(vars.ap_fault, 1); assert.equal(vars.ap_throttle, 0);
ready(); vars.ap_terminal = 1; vars.ap_stop_distance = 0;
for (const k of ['door_0','door_1','door_2','door_3']) vars[k] = 1;
for (let i = 0; i < 102; i++) frame();
assert.equal(vars.ap_state, 5); assert.equal(vars.ap_throttle, 0); assert.equal(vars.ap_brake, 1);
vars = {ap_bridge_valid:0}; stack.length = 0; run('ap_toggle'); assert.equal(vars.ap_enabled ?? 0, 0);
console.log('PASS: declarations, door macros, activation, stop, dwell, closure, departure, terminal, latched faults');
console.log('This subset interpreter does not verify the openOMSI VM, engine compilation or vehicle physics.');
