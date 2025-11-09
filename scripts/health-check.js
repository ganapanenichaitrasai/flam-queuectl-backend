const db = require('../src/db/database');

async function healthCheck() {
  console.log('🏥 Running system health check...\n');
  
  try {
    // Check database connection
    console.log('1. Checking database connection...');
    const health = await db.healthCheck();
    
    if (health.healthy) {
      console.log('   ✅ Database connection: OK');
      console.log(`   📊 Database time: ${health.time}`);
    } else {
      console.log('   ❌ Database connection: FAILED');
      console.log(`   Error: ${health.error}`);
      return false;
    }

    // Check tables exist
    console.log('2. Checking database tables...');
    const tablesResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name IN ('jobs', 'config')
    `);

    const expectedTables = ['jobs', 'config'];
    const foundTables = tablesResult.rows.map(row => row.table_name);
    
    expectedTables.forEach(table => {
      if (foundTables.includes(table)) {
        console.log(`   ✅ Table '${table}': EXISTS`);
      } else {
        console.log(`   ❌ Table '${table}': MISSING`);
      }
    });

    // Check configuration
    console.log('3. Checking default configuration...');
    const configResult = await db.query('SELECT key, value FROM config');
    
    const requiredConfig = ['max_retries', 'exponential_base', 'worker_count', 'concurrency_per_worker'];
    const foundConfig = configResult.rows.map(row => row.key);
    
    requiredConfig.forEach(configKey => {
      if (foundConfig.includes(configKey)) {
        const value = configResult.rows.find(row => row.key === configKey).value;
        console.log(`   ✅ Config '${configKey}': ${value}`);
      } else {
        console.log(`   ❌ Config '${configKey}': MISSING`);
      }
    });

    console.log('\n🎉 Health check completed! System is ready.');
    return true;

  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

if (require.main === module) {
  healthCheck();
}

module.exports = healthCheck;