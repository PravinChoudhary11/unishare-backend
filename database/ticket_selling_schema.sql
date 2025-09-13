-- Database schema for ticket selling functionality
-- Run this SQL in your Supabase SQL editor or database management tool

-- 0. Create Supabase Storage bucket for ticket images (run this first)
-- Go to Storage > Create bucket in Supabase dashboard:
-- Bucket name: ticket-images
-- Make it public: true
-- Or run this SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('ticket-images', 'ticket-images', true);

-- 1. Create tickets table
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'event', -- 'event', 'travel', 'other'
    event_type VARCHAR(50) DEFAULT 'concert', -- 'concert', 'sports', 'travel', etc.
    event_date TIMESTAMP,
    venue TEXT,
    location VARCHAR(100),
    quantity_available INTEGER NOT NULL DEFAULT 1,
    ticket_type VARCHAR(50) DEFAULT 'Standard',
    description TEXT,
    contact_info JSONB, -- Store contact methods as JSON
    image_url VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'sold', 'expired'
    
    -- Travel-specific fields
    origin VARCHAR(100),
    destination VARCHAR(100),
    transport_mode VARCHAR(50), -- 'bus', 'train', 'flight', 'carpool'
    travel_date TIMESTAMP,
    
    -- Other category fields
    item_type VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create ticket_views table for tracking views
CREATE TABLE IF NOT EXISTS ticket_views (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticket_id, user_id)
);

-- 3. Create ticket_inquiries table for buyer inquiries
CREATE TABLE IF NOT EXISTS ticket_inquiries (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'replied', 'closed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_location ON tickets(location);
CREATE INDEX IF NOT EXISTS idx_tickets_event_date ON tickets(event_date);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);

CREATE INDEX IF NOT EXISTS idx_ticket_views_ticket_id ON ticket_views(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_views_user_id ON ticket_views(user_id);

CREATE INDEX IF NOT EXISTS idx_ticket_inquiries_ticket_id ON ticket_inquiries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_inquiries_user_id ON ticket_inquiries(user_id);

-- 5. Create function to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 6. Create triggers for automatic timestamp updates
CREATE TRIGGER update_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_inquiries_updated_at
    BEFORE UPDATE ON ticket_inquiries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 7. Enable Row Level Security (RLS) if using Supabase
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_inquiries ENABLE ROW LEVEL SECURITY;

-- 8. Create RLS policies for tickets table
-- Users can view all active tickets
CREATE POLICY "Anyone can view active tickets" ON tickets
    FOR SELECT USING (status = 'active');

-- Users can only insert/update/delete their own tickets
CREATE POLICY "Users can manage own tickets" ON tickets
    FOR ALL USING (auth.uid()::text = user_id);

-- 9. Create RLS policies for ticket_views table
-- Users can view any ticket and create views
CREATE POLICY "Anyone can create ticket views" ON ticket_views
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can view ticket views" ON ticket_views
    FOR SELECT USING (true);

-- 10. Create RLS policies for ticket_inquiries table
-- Users can create inquiries and view their own inquiries
CREATE POLICY "Users can create inquiries" ON ticket_inquiries
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can view own inquiries" ON ticket_inquiries
    FOR SELECT USING (auth.uid()::text = user_id);

-- Ticket owners can view inquiries about their tickets
CREATE POLICY "Ticket owners can view inquiries" ON ticket_inquiries
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tickets 
            WHERE tickets.id = ticket_inquiries.ticket_id 
            AND tickets.user_id = auth.uid()::text
        )
    );

-- 11. Sample data for testing (optional)
-- INSERT INTO tickets (user_id, title, price, category, event_type, event_date, venue, location, quantity_available, description, contact_info)
-- VALUES 
-- ('your-user-uuid-here', 'Concert: Taylor Swift - Eras Tour', 8500.00, 'event', 'concert', '2024-12-15 19:00:00', 'DY Patil Stadium', 'Mumbai', 2, 'Amazing seats in premium section', '{"mobile": "+91 98765 43210", "email": "seller@example.com"}'),
-- ('your-user-uuid-here', 'Mumbai to Pune AC Bus', 550.00, 'travel', 'travel', '2024-10-05 06:30:00', 'Mumbai → Pune', 'Pune', 1, 'AC Volvo seat available', '{"mobile": "+91 98765 43210"}');

-- Verification queries
-- SELECT COUNT(*) as total_tickets FROM tickets;
-- SELECT category, COUNT(*) as count FROM tickets GROUP BY category;
-- SELECT * FROM tickets WHERE user_id = 'your-user-uuid-here';