// Simple database connection test using Prisma
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log('Testing database connection...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^@]+@/, ':****@'));
    
    // Try to connect and run a simple query
    const result = await prisma.$queryRaw`SELECT 1+1 as result`;
    console.log('✅ Database connection successful!');
    console.log('Test query result:', result);
    
    // Check for Session table
    const sessionCount = await prisma.session.count();
    console.log(`Found ${sessionCount} sessions in database`);
    
    // Check for other tables
    const customerCount = await prisma.customer.count();
    console.log(`Found ${customerCount} customers in database`);
    
  } catch (error) {
    console.error('❌ Database connection FAILED!');
    console.error('Error:', error.message);
    
    if (error.message.includes("Can't reach database server")) {
      console.error('\nPossible causes:');
      console.error('1. Database server is down or paused');
      console.error('2. Connection string is incorrect');
      console.error('3. Network/firewall blocking connection');
      console.error('4. Database credentials are wrong');
    }
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();