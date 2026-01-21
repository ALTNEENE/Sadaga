import pool from './src/config/db.config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyMigration() {
    try {
        console.log('📝 Reading migration file...');
        const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'src', 'migrations', 'add_messages_table.sql'),
            'utf8'
        );

        console.log('🔄 Applying migration...');
        await pool.query(migrationSQL);

        console.log('✅ Migration applied successfully!');
        console.log('');
        console.log('Created:');
        console.log('  - request_messages table');
        console.log('  - rejection_reason column in service_requests');
        console.log('  - sent_at column in service_requests');
        console.log('  - Updated request_status enum');

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

applyMigration();
