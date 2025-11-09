const Job = require('../jobs/job');

async function listCommand(options) {
  try {
    let jobs;
    
    if (options.state) {
      const validStates = ['pending', 'processing', 'completed', 'failed', 'dead'];
      if (!validStates.includes(options.state)) {
        console.error(`❌ Error: Invalid state. Must be one of: ${validStates.join(', ')}`);
        process.exit(1);
      }
      jobs = await Job.findByState(options.state, parseInt(options.limit));
    } else {
      jobs = await Job.getAll(parseInt(options.limit));
    }

    if (jobs.length === 0) {
      console.log('No jobs found');
      return;
    }

    console.log(`Found ${jobs.length} job(s):`);
    jobs.forEach(job => {
      console.log(JSON.stringify(job.toJSON(), null, 2));
      console.log('---');
    });
  } catch (error) {
    console.error(`❌ Error listing jobs: ${error.message}`);
    process.exit(1);
  }
}

module.exports = listCommand;