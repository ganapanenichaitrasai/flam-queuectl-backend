const { Client } = require('pg');
require('dotenv').config();

async function setupDatabase() {
  // Connect directly to our target database (skip creation)
  const connectionConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'queuectl_user',
    password: process.env.DB_PASSWORD || 'queuectl_password',
    database: process.env.DB_NAME || 'queuectl'
  };

  const client = new Client(connectionConfig);

  try {
    await client.connect();
    console.log('🔗 Connected to PostgreSQL database');

    // Create jobs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        command TEXT NOT NULL,
        state TEXT DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        run_after TIMESTAMP DEFAULT NOW(),
        error_message TEXT,
        output TEXT,
        locked_by TEXT,
        locked_at TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);
    console.log('✅ Jobs table created/verified');

    // Create config table
    await client.query(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Config table created/verified');

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
      CREATE INDEX IF NOT EXISTS idx_jobs_run_after ON jobs(run_after);
      CREATE INDEX IF NOT EXISTS idx_jobs_locked ON jobs(locked_by, locked_at);
      CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
    `);
    console.log('✅ Database indexes created/verified');

    // Insert default configuration
    await client.query(`
      INSERT INTO config (key, value) 
      VALUES 
        ('max_retries', '3'),
        ('exponential_base', '2'),
        ('worker_count', '1'),
        ('concurrency_per_worker', '3')
      ON CONFLICT (key) DO NOTHING
    `);
    console.log('✅ Default configuration inserted');

    console.log('🎉 Database setup completed successfully!');

  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    console.log('\n💡 Troubleshooting tips:');
    console.log('1. Make sure the database "queuectl" exists');
    console.log('2. Check your .env file credentials');
    console.log('3. Verify PostgreSQL is running');
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Run setup if this script is executed directly
if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase;