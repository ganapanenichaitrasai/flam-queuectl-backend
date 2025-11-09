const Job = require('../jobs/job');
const queue = require('../jobs/queue');

async function enqueueCommand(jobJson) {
  try {
    const jobData = JSON.parse(jobJson);
    
    // Validate required fields
    if (!jobData.id || !jobData.command) {
      console.error('Error: Job must have "id" and "command" fields');
      process.exit(1);
    }

    const job = await queue.enqueue(jobData);
    console.log('✅ Job enqueued successfully:');
    console.log(JSON.stringify(job.toJSON(), null, 2));
  } catch (error) {
    console.error(`❌ Error enqueuing job: ${error.message}`);
    process.exit(1);
  }
}

module.exports = enqueueCommand;