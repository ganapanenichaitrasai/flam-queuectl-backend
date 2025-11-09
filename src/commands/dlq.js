const Job = require('../jobs/job');

const dlqCommands = {
  list: async function() {
    try {
      const deadJobs = await Job.findByState('dead');
      
      if (deadJobs.length === 0) {
        console.log('No jobs in Dead Letter Queue');
        return;
      }

      console.log(`💀 Dead Letter Queue (${deadJobs.length} jobs):`);
      deadJobs.forEach(job => {
        console.log(JSON.stringify(job.toJSON(), null, 2));
        console.log('---');
      });
    } catch (error) {
      console.error(`❌ Error listing DLQ: ${error.message}`);
      process.exit(1);
    }
  },

  retry: async function(jobId) {
    try {
      const job = await Job.findById(jobId);
      
      if (!job) {
        console.error(`❌ Error: Job ${jobId} not found`);
        process.exit(1);
      }

      if (job.state !== 'dead') {
        console.error(`❌ Error: Job ${jobId} is not in Dead Letter Queue (current state: ${job.state})`);
        process.exit(1);
      }

      await job.retryFromDLQ();
      console.log(`✅ Job ${jobId} moved from DLQ back to pending queue`);
    } catch (error) {
      console.error(`❌ Error retrying job from DLQ: ${error.message}`);
      process.exit(1);
    }
  }
};

module.exports = dlqCommands;