import { Queue } from 'bullmq';

// Time out before enqueueing: a caller must never receive a failure while a
// delayed queue.add can still create a job after the connection recovers.
export async function waitForQueueReady(queue: Pick<Queue, 'waitUntilReady'>, timeoutMs = 3000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      queue.waitUntilReady(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Görev kuyruğu hazır değil')), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
