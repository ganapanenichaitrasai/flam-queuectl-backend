const workerManager = require('../jobs/worker');

const workerCommands = {
  start: async function(options) {
    const count = parseInt(options.count);
    if (isNaN(count) || count < 1) {
      console.error('❌ Error: Count must be a positive number');
      process.exit(1);
    }
    
    await workerManager.startWorkers(count);
  },

  stop: async function() {
    await workerManager.stopWorkers();
  }
};

module.exports = workerCommands;