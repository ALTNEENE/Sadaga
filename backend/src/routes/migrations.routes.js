import express from 'express';
import pool from '../config/db.config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Migration endpoint (should be protected in production!)
router.post('/run-messages-migration', async (req, res) => {
    try {
        console.log('📝 Running request_messages migration...');

        const migrationSQL = fs.readFileSync(
            path.join(__dirname, '..', 'migrations', 'add_messages_table.sql'),
            'utf8'
        );

        await pool.query(migrationSQL);

        console.log('✅ Migration completed successfully!');

        res.json({
            success: true,
            message: 'Migration applied successfully',
            tables: [
                'request_messages (created)',
                'service_requests.rejection_reason (added)',
                'service_requests.sent_at (added)',
                'request_status enum (updated)'
            ]
        });
    } catch (error) {
        console.error('❌ Migration failed:', error);
        res.status(500).json({
            success: false,
            message: 'Migration failed',
            error: error.message
        });
    }
});

export default router;
