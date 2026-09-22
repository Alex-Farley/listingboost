import type { GenerationQueue, GenerationQueueMessage } from "./generation-queue";
import { GenerationWorker } from "./generation-worker";

export interface CloudflareQueueProducer {
  send(message: GenerationQueueMessage): Promise<unknown>;
}

export function createCloudflareGenerationQueue(queue: CloudflareQueueProducer): GenerationQueue {
  return {
    async send(message) {
      await queue.send(message);
    },
  };
}

export type GenerationQueueBatchMessage = {
  body: GenerationQueueMessage;
  retry(): void | Promise<void>;
};

export type GenerationQueueBatch = {
  messages: readonly GenerationQueueBatchMessage[];
};

export async function handleGenerationQueueBatch(
  batch: GenerationQueueBatch,
  worker: GenerationWorker,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await worker.handle(message.body);
    } catch {
      await message.retry();
    }
  }
}
