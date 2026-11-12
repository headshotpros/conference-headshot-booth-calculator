import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
async function route(path){
 let source=ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 source=source.replace('import { Resend } from "resend";','const Resend=globalThis.__plannerResend;').replace(/import \{ syncPlannerInquiry \} from "[^"]+";/,'const syncPlannerInquiry=globalThis.__plannerSync;');
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
test('quote and requested-call flows import and keep emails; budgeting alone does not create inquiry',async()=>{
 const env={...process.env},originalFetch=global.fetch;let sends=[],imports=[];
 global.__plannerResend=class{emails={send:async(input)=>{sends.push(input);return {data:{id:'test-id'}};}};};
 global.__plannerSync=async(input)=>{imports.push(input);return '<p>Ready in app</p>';};
 try{
 process.env.RESEND_API_KEY='unit';process.env.FROM_EMAIL='unit@example.invalid';process.env.MAILERCLOUD_API_KEY='unit';global.fetch=async()=>Response.json({});
 const quote=await route('../app/api/quote-request/route.ts');const body={submissionId:'conference-quote-test-0001',name:'Jane',company:'QA',email:'jane@example.invalid',phone:'555-0100',eventWhen:'2027-01-20',eventWhere:'Phoenix',boothType:'COMPANY',estimateLow:1000,estimateHigh:2000,hoursLabel:'4 hours',paceLabel:'Standard',stations:2,capacityLow:80,capacityHigh:100,days:1,hoursPerDay:4};
 assert.equal((await quote.POST(new Request('https://test/api/quote-request',{method:'POST',body:JSON.stringify(body)}))).status,200);assert.equal(imports.length,1);assert.equal(sends.length,2);assert.match(sends[0].html,/Ready in app/);assert.equal(imports[0].payload.eventWhen,'2027-01-20');
 const estimate=await route('../app/api/estimate/route.ts');sends=[];imports=[];
 const call={...body,firstName:'Jane',intent:'ready_for_call',expectedHeadshotsLabel:'50',recommendedStations:2,disclaimerText:'Estimate only'};
 assert.equal((await estimate.POST(new Request('https://test/api/estimate',{method:'POST',body:JSON.stringify(call)}))).status,200);assert.equal(imports.length,1);assert.equal(sends.length,2);assert.match(sends[1].html,/Ready in app/);
 sends=[];imports=[];await estimate.POST(new Request('https://test/api/estimate',{method:'POST',body:JSON.stringify({...call,intent:'budgeting'})}));assert.equal(imports.length,0);assert.equal(sends.length,2);
 }finally{process.env=env;global.fetch=originalFetch;delete global.__plannerResend;delete global.__plannerSync;}
});
