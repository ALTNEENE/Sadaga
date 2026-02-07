import 'dotenv/config';
import pkg from 'pg';

const pool = new pkg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: true,
});

async function runCreditsMigration() {
    try {
        console.log('🔄 Running credits system migration...');

        // Add credits column to users table
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0
        `);
        console.log('✅ Added credits column to users table');

        // Add index for filtering technicians by credits
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_credits ON users(credits) WHERE role = 'TECHNICIAN'
        `);
        console.log('✅ Created index on credits column');

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
        console.log('✅ Created credit_packages table');

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
        console.log('✅ Created credit_purchase_requests table');

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
        console.log('✅ Created credit_transactions table');

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
        console.log('✅ Created 4 indexes for optimal query performance');

        // Insert default credit packages
        await pool.query(`
            INSERT INTO credit_packages (name, credits, price, is_active) VALUES
            ('باقة صغيرة', 10, 5000.00, true),
            ('باقة متوسطة', 25, 12000.00, true),
            ('باقة كبيرة', 50, 22000.00, true),
            ('باقة ممتازة', 100, 40000.00, true)
            ON CONFLICT DO NOTHING
        `);
        console.log('✅ Inserted 4 default credit packages');

        console.log('\n✅ Credits system migration completed successfully!');
        console.log('\nSummary of changes:');
        console.log('  - Added credits column to users table');
        console.log('  - Created credit_packages table');
        console.log('  - Created credit_purchase_requests table');
        console.log('  - Created credit_transactions table');
        console.log('  - Added 4 indexes for optimal query performance');
        console.log('  - Inserted 4 default credit packages');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Credits system migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runCreditsMigration();
