import assert from 'node:assert/strict';
import { isRecord } from '../src/scripts/admin-types.ts';
import { validatePalette, type ThemePalette } from '../src/data/theme.ts';
export function parseBody(body: unknown): Record<string, unknown> { assert.equal(typeof body, 'string'); if(typeof body !== 'string') throw new Error('Expected JSON string'); const value: unknown=JSON.parse(body); assert.ok(isRecord(value)); return value; }
export function readPalette(value: unknown): ThemePalette { assert.ok(validatePalette(value)); return value; }
export function jsonObject(value: unknown): Record<string, unknown> { assert.ok(isRecord(value)); return value; }
export function jsonArray(value: unknown): unknown[] { assert.ok(Array.isArray(value)); return value; }
export function readOrder(value: unknown): Record<string, unknown> & {items: {id: number; position: number}[]} { const object=jsonObject(value); return {...object, items:jsonArray(object.items).map(entry => {const row=jsonObject(entry); assert.equal(typeof row.id,'number'); assert.equal(typeof row.position,'number'); if(typeof row.id !== 'number' || typeof row.position !== 'number') throw new Error('Invalid order row'); return {...row,id:row.id,position:row.position};})}; }
export function deferredResponse() { let done: ((value: Response) => void) | undefined, fail: ((reason: unknown) => void) | undefined; const promise=new Promise<Response>((resolve,reject)=>{done=resolve;fail=reject;}); return {promise, resolve(value: Response){assert.ok(done);done(value);}, reject(reason: unknown){assert.ok(fail);fail(reason);}}; }
