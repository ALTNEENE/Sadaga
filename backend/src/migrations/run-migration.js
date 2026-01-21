import pool from '../config/db.config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    try {
        console.log('🔄 Running database migration...');

        // Read the migration SQL file
        const migrationPath = path.join(__dirname, 'add_profile_columns.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Execute the migration
        await pool.query(sql);

        console.log('✅ Migration completed successfully!');
        console.log('   - Added address column to users table');
        console.log('   - Added balance column to users table');
        console.log('   - Added rating column to users table');
        console.log('   - Created portfolio_images table');

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runMigration();
