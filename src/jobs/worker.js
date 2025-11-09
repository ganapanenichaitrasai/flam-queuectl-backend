const { exec } = require('child_process');
const { promisify } = require('util');
const Job = require('./job');
const queue = require('./queue');
const db = require('../db/database');

const execAsync = promisify(exec);

class PostgreSQLWorker {
  constructor(id, concurrency = 3) {
    this.id = id;
    this.workerId = `worker-${id}-${process.pid}`;
    this.isRunning = false;
    this.concurrency = concurrency;
    this.activeJobs = new Map();
    this.processing = false;
    this.cleanupInterval = null;
    this.config = {};
  }

  async initialize() {
    this.config = await this.loadConfig();
    this.concurrency = parseInt(this.config.concurrency_per_worker) || 3;
  }

  async loadConfig() {
    const result = await db.query('SELECT key, value FROM config');
    const config = {};
    result.rows.forEach(row => {
      config[row.key] = row.value;
    });
    return config;
  }

  async start() {
    if (this.isRunning) return;
    
    await this.initialize();
    this.isRunning = true;
    
    console.log(`🚀 Worker ${this.id} started (concurrency: ${this.concurrency})`);
    
    this.processing = true;
    this.processJobs();
    
    this.cleanupInterval = setInterval(() => {
      queue.cleanupStaleLocks().catch(console.error);
    }, 30000);
  }

  stop() {
    this.isRunning = false;
    this.processing = false;
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    console.log(`🛑 Worker ${this.id} stopping (${this.activeJobs.size} active jobs)`);
    
    if (this.activeJobs.size === 0) {
      return Promise.resolve();
    }
    
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.activeJobs.size === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  async processJobs() {
    while (this.isRunning && this.processing) {
      try {
        const availableSlots = this.concurrency - this.activeJobs.size;
        
        if (availableSlots > 0) {
          const jobs = await queue.acquireJobs(this.workerId, availableSlots);
          
          for (const job of jobs) {
            this.processJob(job).catch(error => {
              console.error(`Worker ${this.id} job processing error:`, error.message);
            });
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Worker ${this.id} processing error:`, error.message);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async processJob(job) {
    this.activeJobs.set(job.id, job);
    queue.trackJob(this.workerId, job.id);

    console.log(`🔧 Worker ${this.id} processing job ${job.id}: ${job.command}`);

    try {
      const output = await this.executeCommand(job.command);
      await job.setOutput(output);
      await job.updateState('completed');
      console.log(`✅ Worker ${this.id} completed job ${job.id}`);
    } catch (error) {
      await this.handleJobFailure(job, error);
    } finally {
      await queue.releaseJob(job.id, this.workerId);
      this.activeJobs.delete(job.id);
    }
  }

  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  async handleJobFailure(job, error) {
    await job.incrementAttempts();
    
    if (job.attempts >= job.max_retries) {
      await job.updateState('dead', error.message);
      console.log(`💀 Job ${job.id} moved to DLQ after ${job.attempts} attempts`);
    } else {
      const base = parseInt(this.config.exponential_base || 2);
      const delaySeconds = Math.pow(base, job.attempts);
      const runAfter = new Date(Date.now() + delaySeconds * 1000);
      
      await job.setRunAfter(runAfter);
      await job.updateState('pending', error.message);
      
      console.log(`🔄 Job ${job.id} failed, retry in ${delaySeconds}s (attempt ${job.attempts}/${job.max_retries})`);
    }
  }

  getStatus() {
    return {
      id: this.id,
      workerId: this.workerId,
      isRunning: this.isRunning,
      activeJobs: Array.from(this.activeJobs.keys()),
      activeJobCount: this.activeJobs.size,
      concurrency: this.concurrency
    };
  }

  getActiveJobCount() {
    return this.activeJobs.size;
  }
}

class WorkerManager {
  constructor() {
    this.workers = new Map();
    this.workerCount = 0;
  }

  async startWorkers(count = 1) {
    await this.stopWorkers();

    const startPromises = [];
    for (let i = 0; i < count; i++) {
      const worker = new PostgreSQLWorker(i + 1);
      startPromises.push(worker.start());
      this.workers.set(i + 1, worker);
    }

    await Promise.all(startPromises);
    this.workerCount = count;
    console.log(`🎯 Started ${count} worker(s) with PostgreSQL backend`);
  }

  async stopWorkers() {
    const stopPromises = [];
    for (const [id, worker] of this.workers) {
      stopPromises.push(worker.stop());
    }
    
    await Promise.all(stopPromises);
    this.workers.clear();
    console.log('🛑 All workers stopped gracefully');
  }

  getWorkerStatus() {
    const status = [];
    for (const [id, worker] of this.workers) {
      status.push(worker.getStatus());
    }
    return status;
  }

  getTotalActiveJobs() {
    let total = 0;
    for (const [id, worker] of this.workers) {
      total += worker.getActiveJobCount();
    }
    return total;
  }
}

module.exports = new WorkerManager();