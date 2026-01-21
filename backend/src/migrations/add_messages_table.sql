-- Create request_messages table for chat functionality
CREATE TABLE IF NOT EXISTS request_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexes for fast retrieval
    CONSTRAINT request_messages_request_id_fkey FOREIGN KEY (request_id) REFERENCES service_requests(id),
    CONSTRAINT request_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_request_messages_request_id ON request_messages(request_id);
CREATE INDEX IF NOT EXISTS idx_request_messages_created_at ON request_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_messages_request_created ON request_messages(request_id, created_at);

-- Update request_status enum to include all states
DO $$ 
BEGIN
    -- Check if the type exists and alter it
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_status') THEN
        -- Drop the old type and recreate with all statuses
        ALTER TYPE request_status RENAME TO request_status_old;
        
        CREATE TYPE request_status AS ENUM (
            'pending',
            'accepted',
            'on_the_way',
            'arrived',
            'completed',
            'cancelled'
        );
        
        -- Update the column to use the new type
        ALTER TABLE service_requests 
            ALTER COLUMN status TYPE request_status 
            USING status::text::request_status;
        
        -- Drop the old type
        DROP TYPE request_status_old;
    ELSE
        -- Create the type if it doesn't exist
        CREATE TYPE request_status AS ENUM (
            'pending',
            'accepted',
            'on_the_way',
            'arrived',
            'completed',
            'cancelled'
        );
    END IF;
END $$;

-- Add a column to track when the request was sent to technician (for auto-rejection timer)
ALTER TABLE service_requests 
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP DEFAULT NOW();

-- Add a column to track rejection reason
ALTER TABLE service_requests 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON TABLE request_messages IS 'Stores chat messages between clients and technicians for service requests';
COMMENT ON COLUMN request_messages.request_id IS 'Reference to the service request';
COMMENT ON COLUMN request_messages.sender_id IS 'User who sent the message (client or technician)';
COMMENT ON COLUMN request_messages.message IS 'Message content';
COMMENT ON COLUMN service_requests.sent_at IS 'Timestamp when request was sent to technician (for auto-rejection timer)';
COMMENT ON COLUMN service_requests.rejection_reason IS 'Reason provided by technician when rejecting';
