// One-shot scheduler trigger. Useful when node-cron missed a tick or you
// want to test reminder/confirmation logic without waiting for the next slot.
// Usage:
//   npx tsx scripts/run-scheduler-once.ts

import { runSchedulerJobs } from "../src/lib/services/scheduler";

(async () => {
  console.log(`[${new Date().toISOString()}] Running scheduler once...`);
  await runSchedulerJobs();
  console.log(`[${new Date().toISOString()}] Done.`);
  process.exit(0);
})();
