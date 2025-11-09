const db = require('../db/database');

const configCommands = {
  set: async function(key, value) {
    try {
      const validKeys = ['max_retries', 'exponential_base', 'worker_count', 'concurrency_per_worker'];
      
      if (!validKeys.includes(key)) {
        console.error(`❌ Error: Invalid config key. Must be one of: ${validKeys.join(', ')}`);
        process.exit(1);
      }

      // Validate values
      if (key === 'max_retries' || key === 'worker_count' || key === 'concurrency_per_worker') {
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 1) {
          console.error(`❌ Error: ${key} must be a positive integer`);
          process.exit(1);
        }
      }

      if (key === 'exponential_base') {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue < 1) {
          console.error(`❌ Error: ${key} must be a number >= 1`);
          process.exit(1);
        }
      }

      await db.query(`
        INSERT INTO config (key, value, updated_at) 
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
      `, [key, value]);

      console.log(`✅ Configuration updated: ${key} = ${value}`);
    } catch (error) {
      console.error(`❌ Error setting config: ${error.message}`);
      process.exit(1);
    }
  },

  get: async function(key) {
    try {
      const result = await db.query('SELECT value FROM config WHERE key = $1', [key]);

      if (result.rows.length > 0) {
        console.log(`${key} = ${result.rows[0].value}`);
      } else {
        console.error(`❌ Config key '${key}' not found`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error getting config: ${error.message}`);
      process.exit(1);
    }
  },

  list: async function() {
    try {
      const result = await db.query('SELECT key, value, updated_at FROM config ORDER BY key');
      
      if (result.rows.length === 0) {
        console.log('No configuration found');
        return;
      }

      console.log('Current configuration:');
      result.rows.forEach(row => {
        console.log(`  ${row.key} = ${row.value} (updated: ${new Date(row.updated_at).toLocaleString()})`);
      });
    } catch (error) {
      console.error(`❌ Error listing config: ${error.message}`);
      process.exit(1);
    }
  }
};

module.exports = configCommands;