import type { JobQueue } from "@listingboost/generation";

export class RecordingQueue implements JobQueue {
  readonly messages: Array<{ jobId: string; delaySeconds: number }> = [];
  async send(jobId: string, delaySeconds = 0): Promise<void> {
    this.messages.push({ jobId, delaySeconds });
  }
  take(): Array<{ jobId: string; delaySeconds: number }> {
    return this.messages.splice(0, this.messages.length);
  }
}
