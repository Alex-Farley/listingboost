import { describe, expect, test } from "bun:test";
import { GenerationWorker, type GenerationProviderResolver } from "../src/lib/generation-worker";
import type { GenerationJobRecord } from "../src/lib/generation-job";
import type { GenerationJobStore } from "../src/lib/generation-orchestrator";
import type { GenerationProvider } from "../src/lib/generation-provider";

const job: GenerationJobRecord = {
  id: "job-1", campaignId: "campaign-1", campaignAssetId: "asset-1", assetKey: "hero",
  state: "queued", attempt: 0, idempotencyKey: "campaign-1:hero:0",
  specification: { id:"hero", kind:"image", aspectRatio:"4:5", resolution:"2k", references:[], outputCount:1 },
  strategy: { specificationId:"hero", providerKey:"fake", modelKey:"model", maxAttempts:2 },
  createdAt:"2026-09-20T10:00:00Z", updatedAt:"2026-09-20T10:00:00Z",
};
class Store implements GenerationJobStore {
  current=job;
  async findByIdempotencyKey(key:string){ return key===job.idempotencyKey ? this.current : null; }
  async create(){ throw new Error("unused"); }
  async update(id:string, update:Parameters<GenerationJobStore["update"]>[1]){
    this.current={...this.current,...update,updatedAt:"2026-09-20T10:01:00Z"};
    return this.current;
  }
}
class Provider implements GenerationProvider {
  providerKey="fake";
  async submit(){ return {providerJobId:"provider-job",state:"queued" as const}; }
  async getStatus(){ return {state:"running" as const,outputs:[]}; }
}
describe("generation worker",()=>{
  test("loads request from durable job state and reconciles through the provider",async()=>{
    const store=new Store(); const provider=new Provider();
    const resolver:GenerationProviderResolver={resolve(key){expect(key).toBe("fake");return provider;}};
    const result=await new GenerationWorker(store,resolver).handle({generationJobId:"job-1",idempotencyKey:job.idempotencyKey});
    expect(result.state).toBe("running");
  });
  test("rejects queue messages that do not match durable identity",async()=>{
    const store=new Store(); const resolver={resolve:()=>new Provider()};
    await expect(new GenerationWorker(store,resolver).handle({generationJobId:"wrong",idempotencyKey:job.idempotencyKey})).rejects.toThrow("not found");
  });
  test("does not dispatch terminal jobs again",async()=>{
    const store=new Store(); store.current={...job,state:"succeeded"};
    let resolved=false; const resolver={resolve:()=>{resolved=true;return new Provider();}};
    const result=await new GenerationWorker(store,resolver).handle({generationJobId:"job-1",idempotencyKey:job.idempotencyKey});
    expect(result.state).toBe("succeeded"); expect(resolved).toBe(false);
  });
});
