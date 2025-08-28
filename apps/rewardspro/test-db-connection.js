// Test database connection
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function testConnection() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Attempting to connect to database...');
    console.log('Database URL:', process.env.DATABASE_URL?.replace(/:[^@]+@/, ':****@')); // Hide password
    
    await client.connect();
    console.log('✅ Successfully connected to database!');
    
    // Test query
    const result = await client.query('SELECT NOW()');
    console.log('Current database time:', result.rows[0].now);
    
    // Check if tables exist
    const tables = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `);
    console.log('Tables found:', tables.rows.map(r => r.tablename));
    
    await client.end();
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();