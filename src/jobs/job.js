const db = require('../db/database');

class Job {
  constructor(data) {
    this.id = data.id;
    this.command = data.command;
    this.state = data.state || 'pending';
    this.attempts = data.attempts || 0;
    this.max_retries = data.max_retries || 3;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.run_after = data.run_after;
    this.error_message = data.error_message;
    this.output = data.output;
    this.locked_by = data.locked_by;
    this.locked_at = data.locked_at;
    this.completed_at = data.completed_at;
  }

  static async create(jobData) {
    try {
      const result = await db.query(`
        INSERT INTO jobs (id, command, max_retries, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        RETURNING *
      `, [jobData.id, jobData.command, jobData.max_retries || 3]);

      return new Job(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error(`Job with id ${jobData.id} already exists`);
      }
      throw new Error(`Failed to create job: ${error.message}`);
    }
  }

  static async findById(id) {
    const result = await db.query('SELECT * FROM jobs WHERE id = $1', [id]);
    return result.rows[0] ? new Job(result.rows[0]) : null;
  }

  static async findByState(state, limit = null) {
    let query = 'SELECT * FROM jobs WHERE state = $1 ORDER BY created_at ASC';
    const params = [state];
    
    if (limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(limit);
    }
    
    const result = await db.query(query, params);
    return result.rows.map(row => new Job(row));
  }

  static async getAll(limit = 100) {
    const result = await db.query(
      'SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows.map(row => new Job(row));
  }

  static async acquireNextPendingJob(workerId, count = 1) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(`
        SELECT * FROM jobs 
        WHERE state = 'pending' 
        AND run_after <= NOW()
        AND (locked_by IS NULL OR locked_at < NOW() - INTERVAL '5 minutes')
        ORDER BY created_at ASC 
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `, [count]);
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return [];
      }
      
      const jobs = [];
      for (const row of result.rows) {
        const updateResult = await client.query(`
          UPDATE jobs 
          SET locked_by = $1, locked_at = NOW(), state = 'processing', updated_at = NOW()
          WHERE id = $2
          RETURNING *
        `, [workerId, row.id]);
        
        jobs.push(new Job(updateResult.rows[0]));
      }
      
      await client.query('COMMIT');
      return jobs;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateState(newState, errorMessage = null) {
    const updateFields = ['state = $1', 'updated_at = NOW()'];
    const params = [newState, this.id];
    
    if (errorMessage !== null) {
      updateFields.push('error_message = $3');
      params.push(errorMessage);
    }
    
    if (newState === 'completed') {
      updateFields.push('completed_at = NOW()');
    }

    const query = `UPDATE jobs SET ${updateFields.join(', ')} WHERE id = $2 RETURNING *`;
    
    const result = await db.query(query, params);
    Object.assign(this, result.rows[0]);
  }

  async incrementAttempts() {
    const result = await db.query(`
      UPDATE jobs 
      SET attempts = attempts + 1, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [this.id]);
    
    Object.assign(this, result.rows[0]);
  }

  async setRunAfter(timestamp) {
    const result = await db.query(`
      UPDATE jobs 
      SET run_after = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [timestamp, this.id]);
    
    Object.assign(this, result.rows[0]);
  }

  async setOutput(output) {
    const result = await db.query(`
      UPDATE jobs 
      SET output = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [output, this.id]);
    
    Object.assign(this, result.rows[0]);
  }

  async retryFromDLQ() {
    const result = await db.query(`
      UPDATE jobs 
      SET state = 'pending', attempts = 0, error_message = NULL, 
          run_after = NOW(), updated_at = NOW(), completed_at = NULL
      WHERE id = $1
      RETURNING *
    `, [this.id]);
    
    Object.assign(this, result.rows[0]);
  }

  async releaseLock() {
    const result = await db.query(`
      UPDATE jobs 
      SET locked_by = NULL, locked_at = NULL
      WHERE id = $1
      RETURNING *
    `, [this.id]);
    
    Object.assign(this, result.rows[0]);
  }

  toJSON() {
    return {
      id: this.id,
      command: this.command,
      state: this.state,
      attempts: this.attempts,
      max_retries: this.max_retries,
      created_at: this.created_at,
      updated_at: this.updated_at,
      error_message: this.error_message,
      output: this.output,
      locked_by: this.locked_by,
      locked_at: this.locked_at,
      completed_at: this.completed_at
    };
  }
}

module.exports = Job;