import test from 'node:test';
import assert from 'node:assert/strict';
import { countdown, serverOffset } from '../src/clock.js';
test('season countdown uses server offset and decreases with controlled time',()=>{const client=1_000_000;const server=client+5_000;const offset=serverOffset(new Date(server).toISOString(),client);const end=new Date(server+3_661_000).toISOString();assert.equal(countdown(end,client,offset),'01:01:01');assert.equal(countdown(end,client+1_000,offset),'01:01:00');});
test('countdown clamps after season end',()=>{const now=Date.parse('2026-10-08T12:00:00Z');assert.equal(countdown('2026-10-08T11:59:59Z',now,0),'00:00:00');});
