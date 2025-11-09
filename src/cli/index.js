const { Command } = require('commander');
const enqueueCommand = require('../commands/enqueue');
const workerCommand = require('../commands/worker');
const statusCommand = require('../commands/status');
const listCommand = require('../commands/list');
const dlqCommand = require('../commands/dlq');
const configCommand = require('../commands/config');

const program = new Command();

program
  .name('queuectl')
  .description('🚀 CLI-based background job queue system with PostgreSQL')
  .version('1.0.0');

// Enqueue command
program
  .command('enqueue <jobJson>')
  .description('Add a new job to the queue')
  .action(enqueueCommand);

// Worker commands
const worker = program.command('worker');
worker
  .command('start')
  .description('Start worker processes')
  .option('-c, --count <number>', 'Number of workers', '1')
  .action(workerCommand.start);

worker
  .command('stop')
  .description('Stop all worker processes gracefully')
  .action(workerCommand.stop);

// Status command
program
  .command('status')
  .description('Show summary of all job states & active workers')
  .action(statusCommand);

// List command
program
  .command('list')
  .description('List jobs by state')
  .option('-s, --state <state>', 'Filter by state')
  .option('-l, --limit <number>', 'Limit number of jobs', '100')
  .action(listCommand);

// DLQ commands
const dlq = program.command('dlq');
dlq
  .command('list')
  .description('List jobs in Dead Letter Queue')
  .action(dlqCommand.list);

dlq
  .command('retry <jobId>')
  .description('Retry a job from Dead Letter Queue')
  .action(dlqCommand.retry);

// Config commands
const config = program.command('config');
config
  .command('set <key> <value>')
  .description('Set configuration value')
  .action(configCommand.set);

config
  .command('get <key>')
  .description('Get configuration value')
  .action(configCommand.get);

config
  .command('list')
  .description('List all configuration values')
  .action(configCommand.list);

// Global error handling
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error.message);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error.message);
  process.exit(1);
});

// Parse command line arguments
program.parse();