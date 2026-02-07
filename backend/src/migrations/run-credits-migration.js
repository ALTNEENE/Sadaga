import pool from '../config/db.config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    try {
        console.log('🔄 Running credits system migration...');

        // Read the migration SQL file
        const migrationPath = path.join(__dirname, 'add_credits_system.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Execute the migration
        await pool.query(sql);

        console.log('✅ Migration completed successfully!');
        console.log('   - Added credits column to users table');
        console.log('   - Created credit_packages table');
        console.log('   - Created credit_purchase_requests table');
        console.log('   - Created credit_transactions table');
        console.log('   - Inserted default credit packages');

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runMigration();
