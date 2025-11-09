const { Pool } = require('pg');
require('dotenv').config();

class PostgreSQLDatabase {
  constructor() {
    this.pool = null;
    this.initialized = false;
    this.init();
  }

  init() {
    try {
      const connectionString = process.env.DATABASE_URL || 
        `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

      this.pool = new Pool({
        connectionString,
        max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,
      });

      this.initialized = true;
      console.log('🔗 PostgreSQL connection pool initialized');

    } catch (error) {
      console.error('❌ PostgreSQL initialization failed:', error);
      throw error;
    }
  }

  async query(sql, params = []) {
    if (!this.initialized) {
      throw new Error('Database not initialized');
    }

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(sql, params);
        return result;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  async getClient() {
    if (!this.initialized) {
      throw new Error('Database not initialized');
    }
    return await this.pool.connect();
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.initialized = false;
      console.log('✅ PostgreSQL connection pool closed');
    }
  }

  // Health check
  async healthCheck() {
    try {
      const result = await this.query('SELECT NOW() as time');
      return { healthy: true, time: result.rows[0].time };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

module.exports = new PostgreSQLDatabase();