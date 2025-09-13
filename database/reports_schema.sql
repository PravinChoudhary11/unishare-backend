-- Reports System Schema for Content Moderation
-- This schema handles user reports for content moderation in UniShare

-- Enable UUID extension for report IDs only
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Reports table for content moderation
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Report details
    type VARCHAR(50) NOT NULL, -- 'inappropriate_content', 'spam', 'harassment', 'scam', 'misinformation', 'fake_profile', 'other'
    category VARCHAR(50) NOT NULL, -- 'rideshare', 'marketplace', 'lost-found', 'user-profile', 'announcement'
    priority VARCHAR(10) DEFAULT 'medium', -- 'low', 'medium', 'high'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'reviewing', 'resolved', 'dismissed'
    
    -- Content and reason
    content_id VARCHAR(255), -- ID of the reported content (ride_id, ticket_id, etc.)
    content_type VARCHAR(50), -- 'ride', 'ticket', 'lost_item', 'user', 'comment'
    reason TEXT NOT NULL, -- Reason for the report
    description TEXT, -- Additional description from reporter
    
    -- Users involved (using TEXT to match existing users table)
    reported_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user TEXT REFERENCES users(id) ON DELETE CASCADE,
    
    -- Evidence
    screenshots JSONB DEFAULT '[]', -- Array of screenshot URLs
    additional_evidence JSONB DEFAULT '{}', -- Additional evidence data
    
    -- Resolution
    resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    resolution_action TEXT, -- Action taken when resolved
    resolution_notes TEXT, -- Notes about the resolution
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_priority ON reports(priority);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
CREATE INDEX IF NOT EXISTS idx_reports_reported_by ON reports(reported_by);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON reports(reported_user);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_reports_content ON reports(content_id, content_type);

-- Create trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    
    -- Set resolved_at when status changes to resolved
    IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
        NEW.resolved_at = TIMEZONE('utc', NOW());
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW
    EXECUTE FUNCTION update_reports_updated_at();

-- Insert some sample reports for testing
INSERT INTO reports (
    type, category, priority, content_id, content_type, reason, description,
    reported_by, reported_user, screenshots
) VALUES
    (
        'inappropriate_content',
        'rideshare', 
        'high',
        'sample-ride-1',
        'ride',
        'Contains offensive language and inappropriate content',
        'User posted a ride with inappropriate language in description',
        (SELECT id FROM users LIMIT 1),
        (SELECT id FROM users OFFSET 1 LIMIT 1),
        '["screenshot1.jpg"]'
    ),
    (
        'spam',
        'marketplace',
        'medium', 
        'sample-ticket-1',
        'ticket',
        'Spam posting - same content posted multiple times',
        'User has posted the same ticket 5 times in different categories',
        (SELECT id FROM users LIMIT 1),
        (SELECT id FROM users OFFSET 1 LIMIT 1),
        '[]'
    ),
    (
        'scam',
        'marketplace',
        'high',
        'sample-ticket-2', 
        'ticket',
        'Suspected scam - fake photos and upfront payment requests',
        'User is asking for payment before meeting and photos look fake',
        (SELECT id FROM users LIMIT 1),
        (SELECT id FROM users OFFSET 1 LIMIT 1),
        '["fake_item.jpg"]'
    );

-- Row Level Security (RLS) Policies for reports table
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own reports
-- Note: Since user IDs are TEXT (CUID) but auth.uid() returns UUID, we'll need to handle this in the application layer
CREATE POLICY reports_user_own ON reports
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = reported_by 
            AND users.email = (
                SELECT email FROM users WHERE id = reported_by
            )
        )
    );

-- Policy for users to create reports
CREATE POLICY reports_user_create ON reports
    FOR INSERT
    WITH CHECK (true); -- Allow authenticated users to create reports

-- Policy for admins/moderators to view all reports
CREATE POLICY reports_admin_all ON reports
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.email IN (
                'itspracin750@gmail.com',
                'ask.gsinghr@gmail.com', 
                'mishrilalparihar30221@gmail.com',
                'sumanthjupudi22@gmail.com'
            )
        )
    );

-- View for report statistics
CREATE OR REPLACE VIEW report_stats AS
SELECT 
    status,
    priority,
    type,
    category,
    COUNT(*) as count,
    DATE(created_at) as report_date
FROM reports 
GROUP BY status, priority, type, category, DATE(created_at)
ORDER BY report_date DESC, count DESC;

-- Function to get report summary
CREATE OR REPLACE FUNCTION get_report_summary()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_reports', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'reviewing', COUNT(*) FILTER (WHERE status = 'reviewing'),
        'resolved', COUNT(*) FILTER (WHERE status = 'resolved'),
        'dismissed', COUNT(*) FILTER (WHERE status = 'dismissed'),
        'high_priority', COUNT(*) FILTER (WHERE priority = 'high'),
        'by_category', json_build_object(
            'rideshare', COUNT(*) FILTER (WHERE category = 'rideshare'),
            'marketplace', COUNT(*) FILTER (WHERE category = 'marketplace'),
            'lost_found', COUNT(*) FILTER (WHERE category = 'lost-found'),
            'user_profile', COUNT(*) FILTER (WHERE category = 'user-profile')
        )
    ) INTO result
    FROM reports;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-assign priority based on report type
CREATE OR REPLACE FUNCTION auto_assign_priority()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-assign high priority for serious violations
    IF NEW.type IN ('harassment', 'scam', 'inappropriate_content') THEN
        NEW.priority = 'high';
    ELSIF NEW.type IN ('spam', 'misinformation') THEN
        NEW.priority = 'medium';
    ELSE
        NEW.priority = 'low';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_assign_priority
    BEFORE INSERT ON reports
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_priority();

-- Grant necessary permissions
GRANT ALL ON reports TO authenticated;
GRANT ALL ON report_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_report_summary() TO authenticated;

COMMENT ON TABLE reports IS 'Content moderation reports submitted by users';
COMMENT ON COLUMN reports.type IS 'Type of violation reported';
COMMENT ON COLUMN reports.category IS 'Category of content being reported';
COMMENT ON COLUMN reports.priority IS 'Priority level for moderation queue';
COMMENT ON COLUMN reports.content_id IS 'ID of the specific content being reported';
COMMENT ON COLUMN reports.screenshots IS 'JSON array of screenshot file paths as evidence';