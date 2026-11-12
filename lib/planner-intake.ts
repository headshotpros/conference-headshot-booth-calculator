import { createHash } from "node:crypto";

// Server-to-server only. Never expose the intake secret in the browser.
export async function syncPlannerInquiry(input: {source:"team_planner"|"conference_planner"; submissionId?:string; payload:unknown; recommendation?:unknown}) {
  const endpoint=process.env.PLANNER_INTAKE_URL;
  const secret=process.env.PLANNER_INTAKE_SECRET;
  const fallback='<p><strong>App import needs attention:</strong> This request could not be added to the clients app automatically. The complete request is saved in this email; please add it manually.</p>';
  if(!endpoint || !secret) {console.error("Planner app connection is not configured");return fallback;}
  const submissionId=input.submissionId && /^[a-zA-Z0-9_-]{16,100}$/.test(input.submissionId) ? input.submissionId : createHash("sha256").update(JSON.stringify(input.payload)+new Date().toISOString().slice(0,10)).digest("hex");
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${secret}`},body:JSON.stringify({...input,submissionId}),signal:AbortSignal.timeout(3500),cache:"no-store",redirect:"error"});
      if(response.ok){
        const result=await response.json() as {ok?:boolean;jobId?:string};
        if(result.ok && /^[0-9a-f-]{36}$/i.test(result.jobId??"")) return `<p><strong>Ready in your clients app:</strong> <a href="https://clients.headshotprosaz.com/jobs/${result.jobId}">Review this planning request</a>.</p>`;
      }
      if(response.status>=400 && response.status<500) break;
    }catch{/* Preserve email delivery even when the app is unavailable. */}
  }
  console.error("Planner request app import failed",{source:input.source,submissionId});
  return fallback;
}

