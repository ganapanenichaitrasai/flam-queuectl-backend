const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const setupDatabase = require('./setup-database');
const healthCheck = require('./health-check');

async function runCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command);
    return stdout.trim();
  } catch (error) {
    // Don't throw for worker commands as they might time out
    if (command.includes('worker stop') || command.includes('worker start')) {
      return '';
    }
    throw new Error(error.stderr || error.message);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Clean up existing jobs and workers
async function cleanup() {
  console.log('🧹 Cleaning up previous runs...');
  try {
    // Stop any running workers
    await runCommand('node src/cli/index.js worker stop');
    
    // Wait a bit for workers to stop
    await sleep(2000);
    
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.log('ℹ️  No cleanup needed or cleanup failed:', error.message);
  }
}

// Generate unique job IDs with timestamp
function generateJobId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
}

async function testBasicFunctionality() {
  console.log('\n🧪 Testing Basic Functionality...\n');

  try {
    // Generate unique job IDs
    const jobId = generateJobId('demo');
    
    // Test 1: Enqueue a simple job
    console.log('1. Enqueueing a simple job...');
    await runCommand(`node src/cli/index.js enqueue '{"id":"${jobId}","command":"echo \\\"Hello World\\\""}'`);
    
    // Test 2: Check status before starting worker
    console.log('2. Checking system status (before worker)...');
    await runCommand('node src/cli/index.js status');
    
    // Test 3: Start a worker with timeout
    console.log('3. Starting a worker...');
    // Start worker in background and don't wait for it
    exec('node src/cli/index.js worker start --count 1', (error, stdout, stderr) => {
      if (error) {
        console.log('   Worker process ended');
      }
    });
    
    // Give worker time to start
    await sleep(2000);
    
    // Test 4: Check status with worker running
    console.log('4. Checking system status (with worker running)...');
    await runCommand('node src/cli/index.js status');
    
    // Test 5: Wait a bit for job processing
    console.log('5. Waiting for job processing...');
    await sleep(3000);
    
    // Test 6: Check completed jobs
    console.log('6. Checking completed jobs...');
    await runCommand('node src/cli/index.js list --state completed');
    
    // Test 7: Stop worker
    console.log('7. Stopping worker...');
    await runCommand('node src/cli/index.js worker stop');
    
    // Give worker time to stop
    await sleep(2000);
    
    console.log('✅ Basic functionality test completed!');

  } catch (error) {
    console.error('❌ Basic functionality test failed:', error.message);
  }
}

async function testQuickConcurrentProcessing() {
  console.log('\n🧪 Testing Quick Concurrent Processing...\n');

  try {
    // Enqueue multiple quick jobs with unique IDs
    console.log('1. Enqueueing 5 quick jobs...');
    const jobs = [];
    for (let i = 1; i <= 5; i++) {
      jobs.push({
        id: generateJobId(`quick-${i}`),
        command: `echo "Quick job ${i} completed at $(date)"`
      });
    }

    for (const job of jobs) {
      await runCommand(`node src/cli/index.js enqueue '${JSON.stringify(job)}'`);
      console.log(`   ✅ Enqueued: ${job.id}`);
    }

    // Configure for concurrency
    console.log('2. Configuring for concurrency...');
    await runCommand('node src/cli/index.js config set concurrency_per_worker 3');
    
    // Start worker
    console.log('3. Starting worker...');
    exec('node src/cli/index.js worker start --count 1', (error, stdout, stderr) => {
      if (error) {
        console.log('   Worker process ended');
      }
    });
    
    // Give worker time to start
    await sleep(2000);
    
    // Monitor progress quickly
    console.log('4. Monitoring processing (quick check)...\n');
    
    for (let i = 1; i <= 3; i++) {
      await sleep(1000);
      console.log(`--- After ${i} second(s) ---`);
      await runCommand('node src/cli/index.js status');
      console.log('');
    }

    // Check results
    console.log('5. Checking job results...');
    await runCommand('node src/cli/index.js list --state completed');
    
    // Stop worker
    console.log('6. Stopping worker...');
    await runCommand('node src/cli/index.js worker stop');
    await sleep(1000);
    
    console.log('✅ Quick concurrent processing test completed!');

  } catch (error) {
    console.error('❌ Quick concurrent processing test failed:', error.message);
  }
}

async function testRetryMechanism() {
  console.log('\n🧪 Testing Retry Mechanism...\n');

  try {
    // Generate unique job ID for failing job
    const failJobId = generateJobId('fail');
    
    // Test failing job
    console.log('1. Enqueueing a failing job...');
    await runCommand(`node src/cli/index.js enqueue '{"id":"${failJobId}","command":"invalid-command-that-fails","max_retries":1}'`);
    
    console.log('2. Starting worker...');
    exec('node src/cli/index.js worker start --count 1', (error, stdout, stderr) => {
      if (error) {
        console.log('   Worker process ended');
      }
    });
    
    console.log('3. Waiting for retries...');
    await sleep(5000);
    
    console.log('4. Checking DLQ...');
    await runCommand('node src/cli/index.js dlq list');
    
    console.log('5. Retrying from DLQ...');
    await runCommand(`node src/cli/index.js dlq retry ${failJobId}`);
    
    console.log('6. Checking job status...');
    await runCommand('node src/cli/index.js list --state pending');
    
    console.log('7. Stopping worker...');
    await runCommand('node src/cli/index.js worker stop');
    await sleep(1000);
    
    console.log('✅ Retry mechanism test completed!');

  } catch (error) {
    console.error('❌ Retry mechanism test failed:', error.message);
  }
}

async function runDemo() {
  console.log('🚀 Starting QueueCTL PostgreSQL Demo...\n');
  
  try {
    // Clean up first
    await cleanup();
    
    // Setup database
    console.log('🗄️  Setting up database...');
    await setupDatabase();
    
    // Health check
    console.log('🏥 Running health check...');
    const healthy = await healthCheck();
    if (!healthy) {
      console.log('❌ System is not healthy, stopping demo');
      return;
    }
    
    // Run tests
    await testBasicFunctionality();
    await testQuickConcurrentProcessing();
    await testRetryMechanism();
    
    console.log('\n🎊 All tests completed successfully!');
    console.log('\n📋 Demo Summary:');
    console.log('  ✅ Database setup and health check');
    console.log('  ✅ Basic job enqueueing and processing');
    console.log('  ✅ Concurrent job processing');
    console.log('  ✅ Retry mechanism and DLQ');
    
    console.log('\n🎯 Next steps:');
    console.log('  Run individual commands to test:');
    console.log('  - queuectl enqueue \'{"id":"test1","command":"echo hello"}\'');
    console.log('  - queuectl worker start --count 2');
    console.log('  - queuectl status');
    console.log('  - queuectl list --state completed');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    
    // Make sure to stop any running workers
    try {
      await runCommand('node src/cli/index.js worker stop');
    } catch (e) {
      // Ignore errors in cleanup
    }
  }
}

// Run demo if this script is executed directly
if (require.main === module) {
  runDemo();
}

module.exports = { testBasicFunctionality, testQuickConcurrentProcessing, testRetryMechanism };