const { RDSDataClient, ExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } = require("@aws-sdk/client-rds-data");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class DataAPIMigrator {
  constructor() {
    // Check required environment variables
    const required = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AURORA_RESOURCE_ARN', 'AURORA_SECRET_ARN'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
      console.error(`\nPlease set these variables in your .env file or export them:`);
      missing.forEach(key => {
        console.error(`export ${key}="your-value"`);
      });
      process.exit(1);
    }

    this.client = new RDSDataClient({
      region: process.env.AWS_REGION || "eu-north-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    this.resourceArn = process.env.AURORA_RESOURCE_ARN;
    this.secretArn = process.env.AURORA_SECRET_ARN;
    this.database = process.env.AURORA_DATABASE_NAME || "rewardspro";
  }

  async runMigrations() {
    console.log("🚀 Starting Prisma migrations via AWS Data API...\n");
    console.log(`📍 Region: ${process.env.AWS_REGION || "eu-north-1"}`);
    console.log(`🗄️  Database: ${this.database}`);
    console.log(`🔧 Cluster: ${this.resourceArn.split(':').pop()}\n`);
    
    // Get all migration directories
    const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
    
    if (!fs.existsSync(migrationsDir)) {
      console.log("❌ No migrations directory found at prisma/migrations");
      return;
    }
    
    const migrations = fs.readdirSync(migrationsDir)
      .filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory())
      .filter(f => !f.startsWith("."))
      .sort();
    
    if (migrations.length === 0) {
      console.log("📭 No migrations found in prisma/migrations");
      return;
    }

    console.log(`📂 Found ${migrations.length} total migration(s)\n`);
    
    // Check which migrations are already applied
    const appliedMigrations = await this.getAppliedMigrations();
    const pendingMigrations = migrations.filter(m => !appliedMigrations.includes(m));
    
    if (pendingMigrations.length === 0) {
      console.log("✅ All migrations are already applied!");
      console.log("\nApplied migrations:");
      appliedMigrations.forEach(m => console.log(`  ✓ ${m}`));
      return;
    }
    
    console.log(`📋 ${appliedMigrations.length} migration(s) already applied`);
    console.log(`📦 ${pendingMigrations.length} pending migration(s) to apply:\n`);
    pendingMigrations.forEach(m => console.log(`  • ${m}`));
    console.log("");
    
    // Apply each pending migration
    for (const migration of pendingMigrations) {
      await this.applyMigration(migration);
    }
    
    console.log("\n🎉 All migrations completed successfully!");
  }

  async getAppliedMigrations() {
    try {
      // Check if migrations table exists
      const tableCheck = await this.executeStatement(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '_prisma_migrations'
        )`
      );
      
      if (!tableCheck[0]?.exists) {
        console.log("📝 Creating _prisma_migrations table...");
        
        // Create migrations table if it doesn't exist
        await this.executeStatement(`
          CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
            id VARCHAR(36) PRIMARY KEY,
            checksum VARCHAR(64) NOT NULL,
            finished_at TIMESTAMPTZ,
            migration_name VARCHAR(255) NOT NULL,
            logs TEXT,
            rolled_back_at TIMESTAMPTZ,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            applied_steps_count INTEGER NOT NULL DEFAULT 0
          )
        `);
        
        console.log("✅ Migrations table created\n");
        return [];
      }
      
      // Get applied migrations
      const result = await this.executeStatement(
        `SELECT migration_name FROM "_prisma_migrations" 
         WHERE rolled_back_at IS NULL 
         ORDER BY migration_name`
      );
      
      return result.map(r => r.migration_name);
    } catch (error) {
      console.error("⚠️  Error checking applied migrations:", error.message);
      console.log("   Assuming no migrations applied yet\n");
      return [];
    }
  }

  async applyMigration(migrationName) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 Applying migration: ${migrationName}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    const migrationPath = path.join(process.cwd(), "prisma", "migrations", migrationName, "migration.sql");
    
    if (!fs.existsSync(migrationPath)) {
      console.log(`  ⚠️  No migration.sql found, skipping...`);
      return;
    }
    
    const sql = fs.readFileSync(migrationPath, "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    
    console.log(`  📄 File: ${migrationPath}`);
    console.log(`  🔐 Checksum: ${checksum.substring(0, 8)}...`);
    console.log(`  📏 Size: ${sql.length} bytes\n`);
    
    // Start transaction
    console.log("  🔄 Starting transaction...");
    const { transactionId } = await this.client.send(new BeginTransactionCommand({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
    }));
    
    console.log(`  ✅ Transaction started (ID: ${transactionId.substring(0, 8)}...)\n`);
    
    try {
      // Split SQL into statements
      const statements = this.splitSqlStatements(sql);
      console.log(`  📝 Found ${statements.length} SQL statement(s) to execute\n`);
      
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i].trim();
        if (!stmt) continue;
        
        // Show preview of statement
        const preview = stmt.substring(0, 50).replace(/\n/g, ' ');
        console.log(`  [${i + 1}/${statements.length}] Executing: ${preview}${stmt.length > 50 ? '...' : ''}`);
        
        await this.client.send(new ExecuteStatementCommand({
          resourceArn: this.resourceArn,
          secretArn: this.secretArn,
          database: this.database,
          sql: stmt,
          transactionId,
        }));
        
        console.log(`        ✓ Statement executed successfully`);
      }
      
      console.log(`\n  📝 Recording migration in _prisma_migrations table...`);
      
      // Record migration
      const migrationId = crypto.randomUUID();
      await this.client.send(new ExecuteStatementCommand({
        resourceArn: this.resourceArn,
        secretArn: this.secretArn,
        database: this.database,
        sql: `INSERT INTO "_prisma_migrations" 
              (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
              VALUES (:id, :checksum, NOW(), :name, NULL, NULL, NOW(), :steps)`,
        parameters: [
          { name: "id", value: { stringValue: migrationId }},
          { name: "checksum", value: { stringValue: checksum }},
          { name: "name", value: { stringValue: migrationName }},
          { name: "steps", value: { longValue: statements.length }},
        ],
        transactionId,
      }));
      
      console.log(`  ✅ Migration recorded\n`);
      
      // Commit transaction
      console.log("  💾 Committing transaction...");
      await this.client.send(new CommitTransactionCommand({
        resourceArn: this.resourceArn,
        secretArn: this.secretArn,
        transactionId,
      }));
      
      console.log(`  ✅ Migration "${migrationName}" applied successfully!`);
    } catch (error) {
      // Rollback on error
      console.error(`\n  ❌ Error applying migration: ${error.message}\n`);
      console.log("  ⏮️  Rolling back transaction...");
      
      try {
        await this.client.send(new RollbackTransactionCommand({
          resourceArn: this.resourceArn,
          secretArn: this.secretArn,
          transactionId,
        }));
        console.log("  ✅ Transaction rolled back successfully");
      } catch (rollbackError) {
        console.error(`  ❌ Failed to rollback: ${rollbackError.message}`);
      }
      
      throw error;
    }
  }

  splitSqlStatements(sql) {
    // Advanced SQL statement splitter that handles:
    // - String literals with quotes
    // - Dollar-quoted strings (PostgreSQL)
    // - Comments
    // - Functions and procedures
    
    const statements = [];
    let current = "";
    let inString = false;
    let stringChar = null;
    let inDollarQuote = false;
    let dollarQuoteTag = null;
    let inLineComment = false;
    let inBlockComment = false;
    
    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];
      const nextChar = sql[i + 1];
      const prevChar = sql[i - 1];
      
      // Handle line comments
      if (!inString && !inDollarQuote && !inBlockComment && char === '-' && nextChar === '-') {
        inLineComment = true;
        current += char;
        continue;
      }
      
      if (inLineComment && char === '\n') {
        inLineComment = false;
        current += char;
        continue;
      }
      
      if (inLineComment) {
        current += char;
        continue;
      }
      
      // Handle block comments
      if (!inString && !inDollarQuote && !inLineComment && char === '/' && nextChar === '*') {
        inBlockComment = true;
        current += char;
        continue;
      }
      
      if (inBlockComment && char === '*' && nextChar === '/') {
        inBlockComment = false;
        current += char + nextChar;
        i++; // Skip next char
        continue;
      }
      
      if (inBlockComment) {
        current += char;
        continue;
      }
      
      // Handle dollar-quoted strings (PostgreSQL specific)
      if (!inString && !inDollarQuote && char === '$') {
        // Look for dollar quote tag
        let tag = '$';
        let j = i + 1;
        while (j < sql.length && sql[j] !== '$' && sql[j] !== ' ' && sql[j] !== '\n') {
          tag += sql[j];
          j++;
        }
        if (j < sql.length && sql[j] === '$') {
          tag += '$';
          inDollarQuote = true;
          dollarQuoteTag = tag;
          current += tag;
          i = j; // Skip to end of tag
          continue;
        }
      }
      
      if (inDollarQuote) {
        current += char;
        // Check if we're at the end of dollar quote
        if (char === '$') {
          const possibleEnd = sql.substring(i, i + dollarQuoteTag.length);
          if (possibleEnd === dollarQuoteTag) {
            inDollarQuote = false;
            dollarQuoteTag = null;
            current += sql.substring(i + 1, i + dollarQuoteTag.length);
            i += dollarQuoteTag.length - 1;
          }
        }
        continue;
      }
      
      // Handle regular string literals
      if (!inString && !inDollarQuote && (char === "'" || char === '"')) {
        inString = true;
        stringChar = char;
        current += char;
      } else if (inString && char === stringChar) {
        // Check for escaped quote
        if (nextChar === stringChar) {
          current += char + nextChar;
          i++; // Skip next char
        } else {
          inString = false;
          stringChar = null;
          current += char;
        }
      } else if (char === ';' && !inString && !inDollarQuote) {
        // End of statement
        if (current.trim()) {
          statements.push(current.trim());
        }
        current = "";
      } else {
        current += char;
      }
    }
    
    // Add last statement if exists
    if (current.trim()) {
      statements.push(current.trim());
    }
    
    return statements;
  }

  async executeStatement(sql, parameters = []) {
    try {
      const command = new ExecuteStatementCommand({
        resourceArn: this.resourceArn,
        secretArn: this.secretArn,
        database: this.database,
        sql,
        parameters,
        includeResultMetadata: true,
      });
      
      const response = await this.client.send(command);
      return this.formatResponse(response);
    } catch (error) {
      // Enhance error message with more context
      const enhancedError = new Error(`Data API Error: ${error.message}\nSQL: ${sql.substring(0, 100)}...`);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  formatResponse(response) {
    if (!response.records) return [];
    
    const columns = response.columnMetadata?.map(col => col.name) || [];
    
    return response.records.map(record => {
      const row = {};
      record.forEach((field, index) => {
        const columnName = columns[index];
        row[columnName] = this.extractValue(field);
      });
      return row;
    });
  }

  extractValue(field) {
    if (field.isNull) return null;
    if (field.stringValue !== undefined) return field.stringValue;
    if (field.longValue !== undefined) return field.longValue;
    if (field.doubleValue !== undefined) return field.doubleValue;
    if (field.booleanValue !== undefined) return field.booleanValue;
    if (field.blobValue !== undefined) return field.blobValue;
    if (field.arrayValue !== undefined) {
      return field.arrayValue.values?.map(v => this.extractValue(v));
    }
    return null;
  }

  // Helper method to test connection
  async testConnection() {
    console.log("🔌 Testing database connection...\n");
    
    try {
      const result = await this.executeStatement("SELECT version() as version, current_database() as database");
      
      if (result && result[0]) {
        console.log("✅ Successfully connected to database!");
        console.log(`   PostgreSQL: ${result[0].version}`);
        console.log(`   Database: ${result[0].database}\n`);
        return true;
      }
    } catch (error) {
      console.error("❌ Failed to connect to database:");
      console.error(`   ${error.message}\n`);
      return false;
    }
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  console.log("═══════════════════════════════════════════════");
  console.log("  AWS Aurora Data API Migration Tool");
  console.log("═══════════════════════════════════════════════\n");
  
  const migrator = new DataAPIMigrator();
  
  // Test connection first
  migrator.testConnection().then(connected => {
    if (connected) {
      // Run migrations
      return migrator.runMigrations();
    } else {
      console.error("Please check your AWS credentials and Aurora configuration.");
      process.exit(1);
    }
  }).catch(error => {
    console.error("\n❌ Migration failed:", error.message);
    if (error.originalError) {
      console.error("\nOriginal error:", error.originalError);
    }
    console.error("\nPlease check the error above and try again.");
    process.exit(1);
  });
}

module.exports = DataAPIMigrator;