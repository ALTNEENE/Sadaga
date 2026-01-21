-- Fix longitude and latitude column types
-- Migration: fix_location_columns.sql

-- Change longitude to DECIMAL
ALTER TABLE users 
ALTER COLUMN longitude TYPE DECIMAL(10, 7) USING longitude::DECIMAL;

-- Change latitude to DECIMAL
ALTER TABLE users 
ALTER COLUMN latitude TYPE DECIMAL(10, 7) USING latitude::DECIMAL;

COMMENT ON COLUMN users.longitude IS 'User longitude coordinate';
COMMENT ON COLUMN users.latitude IS 'User latitude coordinate';
