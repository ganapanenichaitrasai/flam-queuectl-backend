const queue = require('../jobs/queue');
const workerManager = require('../jobs/worker');

async function statusCommand() {
  try {
    const stats = await queue.getStats();
    const workers = workerManager.getWorkerStatus();
    const activeJobs = workerManager.getTotalActiveJobs();
    
    console.log('📊 === Queue Status ===');
    console.log(`Total jobs: ${Object.values(stats).reduce((a, b) => a + b, 0)}`);
    
    // Job states
    Object.entries(stats).forEach(([state, count]) => {
      console.log(`  ${state}: ${count}`);
    });
    
    console.log('\n👷 === Workers ===');
    if (workers.length === 0) {
      console.log('No active workers');
    } else {
      console.log(`Active workers: ${workers.length}`);
      console.log(`Currently processing: ${activeJobs} jobs`);
      
      workers.forEach(worker => {
        const jobInfo = worker.activeJobs.length > 0 
          ? `(processing: ${worker.activeJobs.join(', ')})` 
          : '(idle)';
        console.log(`  Worker ${worker.id}: ${worker.isRunning ? '🟢 running' : '🟡 stopping'} ${jobInfo}`);
      });
    }

    // System health
    console.log('\n💾 === System Info ===');
    console.log(`Database: PostgreSQL`);
    console.log(`Concurrency: ${workers.reduce((sum, w) => sum + w.concurrency, 0)} total slots`);

  } catch (error) {
    console.error(`❌ Error getting status: ${error.message}`);
    process.exit(1);
  }
}

module.exports = statusCommand;