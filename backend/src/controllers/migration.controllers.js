import pool from '../config/db.config.js';

export const runProfileMigration = async (req, res) => {
    try {
        console.log('🔄 Running profile columns migration...');

        // Add address column if it doesn't exist
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS address VARCHAR(500)
        `);

        // Add balance column if it doesn't exist
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS balance DECIMAL(10, 2) DEFAULT 0.00
        `);

        // Add rating column if it doesn't exist
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS rating DECIMAL(3, 2) DEFAULT 0.00
        `);

        // Create portfolio_images table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS portfolio_images (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                image_url TEXT NOT NULL,
                title VARCHAR(255),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create index on user_id
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_portfolio_user_id ON portfolio_images(user_id)
        `);

        console.log('✅ Migration completed successfully!');

        return res.status(200).json({
            success: true,
            message: 'Migration completed successfully',
            changes: [
                'Added address column to users table',
                'Added balance column to users table',
                'Added rating column to users table',
                'Created portfolio_images table',
                'Created index on portfolio_images.user_id'
            ]
        })
    } catch (error) {
        console.error('❌ Migration failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Migration failed',
            error: error.message
        });
    }
};

export const runPushTokensMigration = async (req, res) => {
    try {
        console.log('🔄 Running push tokens migration...');

        // Create push_tokens table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS push_tokens (
                id SERIAL PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id)
            )
        `);

        // Create index on user_id for faster lookups
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id)
        `);

        console.log('✅ Push tokens migration completed successfully!');

        return res.status(200).json({
            success: true,
            message: 'Push tokens migration completed successfully',
            changes: [
                'Created push_tokens table',
                'Created index on push_tokens.user_id'
            ]
        });
    } catch (error) {
        console.error('❌ Push tokens migration failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Push tokens migration failed',
            error: error.message
        });
    }
};

export const runLocationFixMigration = async (req, res) => {
    try {
        console.log('🔄 Running location columns fix migration...');

        // Alter longitude column
        await pool.query(`
            ALTER TABLE users 
            ALTER COLUMN longitude TYPE DECIMAL(10, 7) USING longitude::DEC IMAL
        `);

        // Alter latitude column
        await pool.query(`
            ALTER TABLE users 
            ALTER COLUMN latitude TYPE DECIMAL(10, 7) USING latitude::DECIMAL
        `);

        console.log('✅ Location columns fix migration completed successfully!');

        return res.status(200).json({
            success: true,
            message: 'Location columns fix migration completed successfully',
            changes: [
                'Altered longitude column to DECIMAL',
                'Altered latitude column to DECIMAL'
            ]
        });
    } catch (error) {
        console.error('❌ Location columns fix migration failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Location columns fix migration failed',
            error: error.message
        });
    }
};

export const runMessagesMigration = async (req, res) => {
    try {
        console.log('🔄 Running request messages migration...');

        // Create request_messages table for chat functionality
        await pool.query(`
            CREATE TABLE IF NOT EXISTS request_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                request_id UUID NOT NULL,
                sender_id UUID NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                
                CONSTRAINT request_messages_request_id_fkey 
                    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
                CONSTRAINT request_messages_sender_id_fkey 
                    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Add indexes for better query performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_request_messages_request_id 
                ON request_messages(request_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_request_messages_created_at 
                ON request_messages(created_at DESC)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_request_messages_request_created 
                ON request_messages(request_id, created_at)
        `);

        // Add rejection_reason column to service_requests
        await pool.query(`
            ALTER TABLE service_requests 
            ADD COLUMN IF NOT EXISTS rejection_reason TEXT
        `);

        // Add sent_at column for auto-rejection timer
        await pool.query(`
            ALTER TABLE service_requests 
            ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP DEFAULT NOW()
        `);

        console.log('✅ Request messages migration completed successfully!');

        return res.status(200).json({
            success: true,
            message: 'Request messages migration completed successfully',
            changes: [
                'Created request_messages table (separate table for chat)',
                'Added rejection_reason column to service_requests',
                'Added sent_at column to service_requests',
                'Created 3 indexes for optimal query performance'
            ]
        });
    } catch (error) {
        console.error('❌ Request messages migration failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Request messages migration failed',
            error: error.message
        });
    }
};

export const runCreditsMigration = async (req, res) => {
    try {
        console.log('🔄 Running credits system migration...');

        // Add credits column to users table
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0
        `);

        // Add index for filtering technicians by credits
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_credits ON users(credits) WHERE role = 'TECHNICIAN'
        `);

        // Create credit_packages table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS credit_packages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                credits INTEGER NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create credit_purchase_requests table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS credit_purchase_requests (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                package_id UUID NOT NULL REFERENCES credit_packages(id),
                amount DECIMAL(10, 2) NOT NULL,
                credits INTEGER NOT NULL,
                payment_proof_url TEXT NOT NULL,
                transaction_id VARCHAR(50),
                transaction_date TIMESTAMP,
                extracted_amount DECIMAL(10, 2),
                extracted_recipient VARCHAR(255),
                extracted_transaction_id VARCHAR(50),
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
                rejection_reason TEXT,
                verified_by UUID REFERENCES users(id),
                verified_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create credit_transactions table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS credit_transactions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                amount INTEGER NOT NULL,
                type VARCHAR(20) NOT NULL CHECK (type IN ('purchase', 'deduction', 'refund', 'admin_adjustment')),
                reference_id UUID,
                description TEXT,
                balance_before INTEGER NOT NULL,
                balance_after INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_credit_purchase_user ON credit_purchase_requests(user_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_credit_purchase_status ON credit_purchase_requests(status)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(type)
        `);

        // Insert default credit packages
        await pool.query(`
            INSERT INTO credit_packages (name, credits, price, is_active) VALUES
            ('باقة صغيرة', 10, 5000.00, true),
            ('باقة متوسطة', 25, 12000.00, true),
            ('باقة كبيرة', 50, 22000.00, true),
            ('باقة ممتازة', 100, 40000.00, true)
            ON CONFLICT DO NOTHING
        `);

        console.log('✅ Credits system migration completed successfully!');

        return res.status(200).json({
            success: true,
            message: 'Credits system migration completed successfully',
            changes: [
                'Added credits column to users table',
                'Created credit_packages table',
                'Created credit_purchase_requests table',
                'Created credit_transactions table',
                'Added 4 indexes for optimal query performance',
                'Inserted 4 default credit packages'
            ]
        });
    } catch (error) {
        console.error('❌ Credits system migration failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Credits system migration failed',
            error: error.message
        });
    }
};
