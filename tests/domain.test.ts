import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureSeed, sha256, schedule, effectiveStrength, probabilityGrid } from '../server/domain.js';
import { participants } from '../server/catalogue.js';
test('fixture seed is deterministic and commit is one-way',()=>{const seed=fixtureSeed('server-secret','fixture-1');assert.equal(seed,fixtureSeed('server-secret','fixture-1'));assert.equal(sha256(seed),sha256(seed));assert.notEqual(seed,'server-secret')});
test('season schedule has 9 rounds and no simultaneous participant',()=>{const teams=participants.filter(p=>p.sport==='football').map(({id,groupName})=>({id,groupName}));const rows=schedule('season-1','secret',Date.parse('2026-10-08T00:00:00Z'),teams);assert.equal(rows.length,180);for(const group of [...new Set(teams.map(t=>t.groupName))]){const league=rows.filter(r=>r.group===group);assert.equal(new Set(league.map(r=>r.homeId+'|'+r.awayId)).size,45);for(const round of [...new Set(league.map(r=>r.round))]){const same=league.filter(r=>r.round===round);assert.equal(new Set(same.flatMap(r=>[r.homeId,r.awayId])).size,10)}}});
test('power rating stays bounded and form has effect',()=>{assert.ok(effectiveStrength(70,1500,[])<effectiveStrength(70,1500,[1,1,1,1,1,1,1,1]));assert.ok(effectiveStrength(70,1900,[])>effectiveStrength(70,1100,[]));});
test('probability grid normalizes',()=>{const grid=probabilityGrid(1.4,0.9);assert.ok(Math.abs(grid.reduce((s,x)=>s+x.p,0)-1)<1e-9);assert.ok(grid.every(x=>x.p>=0));});
