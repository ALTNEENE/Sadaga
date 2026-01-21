-- Add missing columns to users table for profile functionality
-- Migration: add_profile_columns.sql
-- Date: 2026-01-09

-- Add address column if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS address VARCHAR(500);

-- Add balance column if it doesn't exist (for wallet functionality)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS balance DECIMAL(10, 2) DEFAULT 0.00;

-- Add rating column if it doesn't exist (for technician ratings)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS rating DECIMAL(3, 2) DEFAULT 0.00;

-- Create portfolio_images table if it doesn't exist
CREATE TABLE IF NOT EXISTS portfolio_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    title VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on user_id for faster portfolio queries
CREATE INDEX IF NOT EXISTS idx_portfolio_user_id ON portfolio_images(user_id);

-- Add comments for clarity
COMMENT ON COLUMN users.address IS 'User physical address';
COMMENT ON COLUMN users.balance IS 'User wallet balance in SDG';
COMMENT ON COLUMN users.rating IS 'Average rating for technicians (0.00 to 5.00)';
COMMENT ON TABLE portfolio_images IS 'Portfolio images for technicians to showcase their work';
