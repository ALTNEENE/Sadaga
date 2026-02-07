-- Add credits system to the database
-- Migration: add_credits_system.sql
-- Date: 2026-01-31

-- Add credits column to users table (separate from balance)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;

-- Add index for filtering technicians by credits
CREATE INDEX IF NOT EXISTS idx_users_credits ON users(credits) WHERE role = 'TECHNICIAN';

-- Create credit_packages table for dynamic pricing
CREATE TABLE IF NOT EXISTS credit_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    credits INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create credit_purchase_requests table for pending payment verifications
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
);

-- Create credit_transactions table to track all credit changes
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL, -- Positive for additions, negative for deductions
    type VARCHAR(20) NOT NULL CHECK (type IN ('purchase', 'deduction', 'refund', 'admin_adjustment')),
    reference_id UUID, -- Reference to purchase request or service request
    description TEXT,
    balance_before INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_credit_purchase_user ON credit_purchase_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchase_status ON credit_purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(type);

-- Insert default credit packages
INSERT INTO credit_packages (name, credits, price, is_active) VALUES
('باقة صغيرة', 10, 5000.00, true),
('باقة متوسطة', 25, 12000.00, true),
('باقة كبيرة', 50, 22000.00, true),
('باقة ممتازة', 100, 40000.00, true)
ON CONFLICT DO NOTHING;

-- Add comments for clarity
COMMENT ON COLUMN users.credits IS 'Number of credits available for technicians to accept requests';
COMMENT ON TABLE credit_packages IS 'Available credit packages for purchase with dynamic pricing';
COMMENT ON TABLE credit_purchase_requests IS 'Payment verification requests for credit purchases';
COMMENT ON TABLE credit_transactions IS 'Complete history of all credit additions and deductions';
