// Test manual session creation
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
});

async function testSessionCreation() {
  try {
    console.log('Testing session creation...\n');
    
    // Test 1: Check if Session table exists
    console.log('1. Checking if Session table exists...');
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'Session'
    `;
    console.log('Session table exists:', tables.length > 0 ? '✅ Yes' : '❌ No');
    
    // Test 2: Try to create a test session
    console.log('\n2. Attempting to create a test session...');
    const testSessionId = `test_${crypto.randomBytes(16).toString('hex')}`;
    const testShop = 'test-shop.myshopify.com';
    
    try {
      const session = await prisma.session.create({
        data: {
          id: testSessionId,
          shop: testShop,
          state: 'test_state',
          isOnline: false,
          scope: 'read_products,write_products',
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
          accessToken: 'test_access_token_' + crypto.randomBytes(16).toString('hex'),
        },
      });
      
      console.log('✅ Session created successfully!');
      console.log('Session ID:', session.id);
      console.log('Shop:', session.shop);
      
      // Clean up test session
      await prisma.session.delete({
        where: { id: testSessionId },
      });
      console.log('✅ Test session cleaned up');
      
    } catch (error) {
      console.error('❌ Failed to create session:', error.message);
      if (error.code === 'P2002') {
        console.error('   → Unique constraint violation (session ID already exists)');
      } else if (error.code === 'P2003') {
        console.error('   → Foreign key constraint violation');
      } else if (error.code === 'P2025') {
        console.error('   → Record not found');
      }
      console.error('\nFull error:', error);
    }
    
    // Test 3: List existing sessions
    console.log('\n3. Checking existing sessions...');
    const existingSessions = await prisma.session.findMany({
      select: {
        id: true,
        shop: true,
        isOnline: true,
        expires: true,
      },
      take: 5,
    });
    
    console.log(`Found ${existingSessions.length} sessions:`);
    existingSessions.forEach(s => {
      console.log(`  - ${s.shop} (${s.isOnline ? 'online' : 'offline'}), expires: ${s.expires || 'never'}`);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Check database connection first
async function checkConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully\n');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

async function main() {
  const connected = await checkConnection();
  if (connected) {
    await testSessionCreation();
  }
}

main();