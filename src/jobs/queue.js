const Job = require('./job');

class JobQueue {
  constructor() {
    this.activeWorkers = new Map(); // workerId -> jobIds
  }

  async enqueue(jobData) {
    if (!jobData.id || !jobData.command) {
      throw new Error('Job must have id and command');
    }

    return await Job.create(jobData);
  }

  async acquireJobs(workerId, count = 1) {
    return await Job.acquireNextPendingJob(workerId, count);
  }

  async releaseJob(jobId, workerId) {
    const job = await Job.findById(jobId);
    if (job) {
      await job.releaseLock();
    }
    
    if (this.activeWorkers.has(workerId)) {
      const jobs = this.activeWorkers.get(workerId);
      const index = jobs.indexOf(jobId);
      if (index > -1) {
        jobs.splice(index, 1);
      }
    }
  }

  async getStats() {
    const db = require('../db/database');
    const result = await db.query(`
      SELECT state, COUNT(*) as count 
      FROM jobs 
      GROUP BY state
    `);
    
    const stats = {};
    result.rows.forEach(row => {
      stats[row.state] = parseInt(row.count);
    });

    return stats;
  }

  async getDeadLetterJobs() {
    return await Job.findByState('dead');
  }

  trackJob(workerId, jobId) {
    if (!this.activeWorkers.has(workerId)) {
      this.activeWorkers.set(workerId, []);
    }
    this.activeWorkers.get(workerId).push(jobId);
  }

  getActiveJobsCount() {
    let total = 0;
    for (const [workerId, jobs] of this.activeWorkers) {
      total += jobs.length;
    }
    return total;
  }

  async cleanupStaleLocks() {
    const db = require('../db/database');
    const result = await db.query(`
      UPDATE jobs 
      SET locked_by = NULL, locked_at = NULL, state = 'pending'
      WHERE locked_at < NOW() - INTERVAL '5 minutes'
      AND state = 'processing'
      RETURNING id
    `);
    
    if (result.rows.length > 0) {
      console.log(`🔓 Cleaned up ${result.rows.length} stale locks`);
    }
    
    return result.rows.length;
  }
}

module.exports = new JobQueue();