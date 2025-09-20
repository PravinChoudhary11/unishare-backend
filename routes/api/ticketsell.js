const express = require('express');
const supabase = require('../../config/supabase');
const { requireAuth, optionalAuth, requireTicketOwnershipOrAdmin } = require('../../middleware/requireAuth');

const router = express.Router();

// Helper function to format contact info
const formatContactInfo = (contacts) => {
  const contactInfo = {};
  if (Array.isArray(contacts)) {
    contacts.forEach(contact => {
      if (contact.value && contact.value.trim()) {
        contactInfo[contact.type] = contact.value.trim();
      }
    });
  }
  return contactInfo;
};

// Helper function to validate ticket data
const validateTicketData = (data) => {
  const errors = [];

  if (!data.title || !data.title.trim()) {
    errors.push('Title is required');
  }

  if (!data.price || isNaN(data.price) || parseFloat(data.price) <= 0) {
    errors.push('Valid price is required');
  }

  if (!data.quantity_available || parseInt(data.quantity_available) <= 0) {
    errors.push('Valid quantity is required');
  }

  if (!data.category) {
    errors.push('Category is required');
  }

  // Category-specific validations
  if (data.category === 'event') {
    if (!data.venue || !data.venue.trim()) {
      errors.push('Venue is required for events');
    }
    if (!data.location || !data.location.trim()) {
      errors.push('City is required for events');
    }
    if (!data.event_date) {
      errors.push('Event date is required');
    }
  }

  if (data.category === 'travel') {
    if (!data.origin || !data.origin.trim()) {
      errors.push('Origin is required for travel tickets');
    }
    if (!data.destination || !data.destination.trim()) {
      errors.push('Destination is required for travel tickets');
    }
    if (!data.travel_date) {
      errors.push('Travel date is required');
    }
  }

  if (data.category === 'other') {
    if (!data.location || !data.location.trim()) {
      errors.push('Location is required');
    }
  }

  // Validate contact info
  if (!data.contact_info || Object.keys(data.contact_info).length === 0) {
    errors.push('At least one contact method is required');
  }

  return errors;
};


// GET /api/tickets/my - Get current user's tickets
router.get('/my', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📋 Fetching tickets for user:', userId);

    const { data: tickets, error } = await supabase
      .from('tickets')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching user tickets:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch your tickets',
        details: error.message
      });
    }

    // Calculate stats for each ticket (views, inquiries)
    const processedTickets = await Promise.all(
      tickets.map(async (ticket) => {
        // Get view count
        const { count: viewCount } = await supabase
          .from('ticket_views')
          .select('*', { count: 'exact', head: true })
          .eq('ticket_id', ticket.id);

        // Get inquiry count
        const { count: inquiryCount } = await supabase
          .from('ticket_inquiries')
          .select('*', { count: 'exact', head: true })
          .eq('ticket_id', ticket.id);

        return {
          ...ticket,
          views: viewCount || 0,
          inquiries: inquiryCount || 0
        };
      })
    );

    console.log(`✅ Fetched ${tickets.length} tickets for user ${userId}`);
    res.json({
      success: true,
      data: processedTickets
    });

  } catch (error) {
    console.error('❌ Error in /my route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /api/tickets/create - Create new ticket listing
router.post('/create', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    let ticketData;

    // Parse ticket data - handle both direct and nested formats
    try {
      if (typeof req.body === 'object' && req.body !== null) {
        // If body has a ticketData field, use that
        if (req.body.ticketData) {
          ticketData = typeof req.body.ticketData === 'string' 
            ? JSON.parse(req.body.ticketData) 
            : req.body.ticketData;
        } else {
          // Otherwise use the body directly
          ticketData = req.body;
        }
      } else {
        ticketData = JSON.parse(req.body);
      }
      console.log('📋 Parsed ticket data:', JSON.stringify(ticketData, null, 2));
    } catch (parseError) {
      console.error('❌ JSON parsing error:', parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket data format'
      });
    }

    // Check if ticketData is empty
    if (!ticketData || (typeof ticketData === 'object' && Object.keys(ticketData).length === 0)) {
      console.error('❌ Empty ticket data received');
      return res.status(400).json({
        success: false,
        message: 'No ticket data received. Please ensure you are sending the data in the request body.'
      });
    }

    // Format contact info if it's an array
    if (Array.isArray(ticketData.contacts)) {
      ticketData.contact_info = formatContactInfo(ticketData.contacts);
    }

    // Validate ticket data
    const validationErrors = validateTicketData(ticketData);
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:', validationErrors);
      return res.status(400).json({
        success: false,
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    // Prepare ticket data for database
    const dbTicketData = {
      user_id: userId,
      title: ticketData.title.trim(),
      price: parseFloat(ticketData.price),
      category: ticketData.category,
      event_type: ticketData.event_type || 'other',
      event_date: ticketData.event_date,
      venue: ticketData.venue?.trim() || null,
      location: ticketData.location?.trim() || null,
      quantity_available: parseInt(ticketData.quantity_available),
      ticket_type: ticketData.ticket_type || 'Standard',
      description: ticketData.description?.trim() || null,
      contact_info: ticketData.contact_info,
      status: 'active',
      // Travel-specific fields
      origin: ticketData.origin?.trim() || null,
      destination: ticketData.destination?.trim() || null,
      transport_mode: ticketData.transport_mode || null,
      travel_date: ticketData.travel_date || null,
      // Other category fields
      item_type: ticketData.item_type || null
    };

    // Insert into database
    const { data: newTicket, error } = await supabase
      .from('tickets')
      .insert([dbTicketData])
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .single();

    if (error) {
      console.error('❌ Database error creating ticket:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create ticket listing',
        details: error.message
      });
    }

    console.log('✅ Ticket created successfully:', newTicket.id);
    res.status(201).json({
      success: true,
      data: newTicket,
      message: 'Ticket listing created successfully'
    });

  } catch (error) {
    console.error('❌ Error in /create route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /api/tickets/:id - Update ticket listing
router.put('/:id', requireAuth, requireTicketOwnershipOrAdmin(), async (req, res) => {
  try {
    const ticketId = req.params.id;
    const userId = req.userId;

    let ticketData;

    // Parse ticket data - handle both direct and nested formats
    try {
      if (typeof req.body === 'object' && req.body !== null) {
        // If body has a ticketData field, use that
        if (req.body.ticketData) {
          ticketData = typeof req.body.ticketData === 'string' 
            ? JSON.parse(req.body.ticketData) 
            : req.body.ticketData;
        } else {
          // Otherwise use the body directly
          ticketData = req.body;
        }
      } else {
        ticketData = JSON.parse(req.body);
      }
      console.log('📋 Parsed ticket data:', JSON.stringify(ticketData, null, 2));
    } catch (parseError) {
      console.error('❌ JSON parsing error:', parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket data format'
      });
    }

    // Format contact info if it's an array
    if (Array.isArray(ticketData.contacts)) {
      ticketData.contact_info = formatContactInfo(ticketData.contacts);
    }

    // Validate ticket data
    const validationErrors = validateTicketData(ticketData);
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:', validationErrors);
      return res.status(400).json({
        success: false,
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    // Prepare update data
    const updateData = {
      title: ticketData.title.trim(),
      price: parseFloat(ticketData.price),
      category: ticketData.category,
      event_type: ticketData.event_type || 'other',
      event_date: ticketData.event_date,
      venue: ticketData.venue?.trim() || null,
      location: ticketData.location?.trim() || null,
      quantity_available: parseInt(ticketData.quantity_available),
      ticket_type: ticketData.ticket_type || 'Standard',
      description: ticketData.description?.trim() || null,
      contact_info: ticketData.contact_info,
      // Travel-specific fields
      origin: ticketData.origin?.trim() || null,
      destination: ticketData.destination?.trim() || null,
      transport_mode: ticketData.transport_mode || null,
      travel_date: ticketData.travel_date || null,
      // Other category fields
      item_type: ticketData.item_type || null,
      updated_at: new Date().toISOString()
    };

    // Update in database (ownership already verified by middleware)
    const { data: updatedTicket, error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', ticketId)
      .eq('user_id', userId)
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .single();

    if (error) {
      console.error('❌ Database error updating ticket:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update ticket listing',
        details: error.message
      });
    }

    console.log('✅ Ticket updated successfully:', ticketId);
    res.json({
      success: true,
      data: updatedTicket,
      message: 'Ticket listing updated successfully'
    });

  } catch (error) {
    console.error('❌ Error in /:id PUT route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /api/tickets/:id - Delete ticket listing
router.delete('/:id', requireAuth, requireTicketOwnershipOrAdmin(), async (req, res) => {
  try {
    const ticketId = req.params.id;
    const userId = req.userId;


    const { data: existingTicket, error: fetchError } = await supabase
      .from('tickets')
      .select('title')
      .eq('id', ticketId)
      .single();

    if (fetchError || !existingTicket) {
      console.error('❌ Error fetching ticket for deletion:', fetchError);
      return res.status(404).json({
        success: false,
        message: 'Ticket not found or you do not have permission to delete it'
      });
    }

    // Delete ticket from database (ownership/admin access already verified by middleware)
    const { error: deleteError } = await supabase
      .from('tickets')
      .delete()
      .eq('id', ticketId);

    if (deleteError) {
      console.error('❌ Database error deleting ticket:', deleteError);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete ticket listing',
        details: deleteError.message
      });
    }

    console.log('✅ Ticket deleted successfully:', ticketId);
    res.json({
      success: true,
      message: `Ticket "${existingTicket.title}" deleted successfully`
    });

  } catch (error) {
    console.error('❌ Error in /:id DELETE route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/tickets/:id - Get single ticket details
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const userId = req.userId; // Will be null if not authenticated
    console.log('🔍 Fetching ticket:', ticketId, userId ? `by user: ${userId}` : '(anonymous)');

    const { data: ticket, error } = await supabase
      .from('tickets')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('id', ticketId)
      .eq('status', 'active') // Only show active tickets
      .single();

    if (error || !ticket) {
      console.log('❌ Ticket not found:', ticketId);
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Increment view count if user is authenticated and not the owner
    if (userId && userId !== ticket.user_id) {
      await supabase
        .from('ticket_views')
        .upsert({
          ticket_id: ticketId,
          user_id: userId,
          viewed_at: new Date().toISOString()
        }, { onConflict: 'ticket_id,user_id' });
      console.log('📊 Recorded view for user:', userId);
    }

    console.log('✅ Ticket fetched successfully:', ticketId);
    res.json({
      success: true,
      data: ticket
    });

  } catch (error) {
    console.error('❌ Error in /:id GET route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /api/tickets/:id/inquire - Send inquiry about a ticket
router.post('/:id/inquire', requireAuth, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const userId = req.userId;
    const { message } = req.body;
    console.log('💬 Creating inquiry for ticket:', ticketId, 'by user:', userId);

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Inquiry message is required'
      });
    }

    // Check if ticket exists and is active
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('user_id, title, status')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      console.log('❌ Ticket not found for inquiry:', ticketId);
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    if (ticket.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'This ticket is no longer available'
      });
    }

    // Don't allow users to inquire about their own tickets
    if (ticket.user_id === userId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot inquire about your own ticket'
      });
    }

    // Create inquiry
    const { data: inquiry, error } = await supabase
      .from('ticket_inquiries')
      .insert([{
        ticket_id: ticketId,
        user_id: userId,
        message: message.trim(),
        status: 'pending'
      }])
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .single();

    if (error) {
      console.error('❌ Error creating inquiry:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send inquiry',
        details: error.message
      });
    }

    console.log('✅ Inquiry created successfully:', inquiry.id);
    res.status(201).json({
      success: true,
      data: inquiry,
      message: 'Inquiry sent successfully'
    });

  } catch (error) {
    console.error('❌ Error in /:id/inquire route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/tickets - Fetch all tickets (PUBLIC with optional auth)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.userId; // Will be null if not authenticated
    console.log('📋 Fetching tickets', userId ? `for user: ${userId}` : '(anonymous)');
    
    const {
      category,
      event_type,
      location,
      min_price,
      max_price,
      search,
      sort = 'created_at',
      order = 'desc',
      limit = 50,
      offset = 0
    } = req.query;

    let query = supabase
      .from('tickets')
      .select(`
        *,
        users:user_id (
          id,
          name
        )
      `)
      .eq('status', 'active'); // Only show active tickets

    // Apply filters
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    
    if (event_type && event_type !== 'all') {
      query = query.eq('event_type', event_type);
    }
    
    if (location && location.trim()) {
      query = query.ilike('location', `%${location.trim()}%`);
    }
    
    if (min_price && !isNaN(min_price)) {
      query = query.gte('price', parseFloat(min_price));
    }
    
    if (max_price && !isNaN(max_price)) {
      query = query.lte('price', parseFloat(max_price));
    }
    
    if (search && search.trim()) {
      query = query.or(`title.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%,venue.ilike.%${search.trim()}%`);
    }

    // Apply sorting
    const validSortColumns = ['created_at', 'price', 'title', 'event_date'];
    const validOrders = ['asc', 'desc'];
    
    if (validSortColumns.includes(sort) && validOrders.includes(order)) {
      query = query.order(sort, { ascending: order === 'asc' });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    // Apply pagination
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const offsetNum = parseInt(offset) || 0;
    
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data: tickets, error, count } = await query;

    if (error) {
      console.error('❌ Database error fetching tickets:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch tickets',
        details: error.message
      });
    }

    console.log(`✅ Fetched ${tickets?.length || 0} tickets`);
    res.json({
      success: true,
      data: tickets || [],
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: count
      }
    });

  } catch (error) {
    console.error('❌ Error fetching tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/tickets/stats - Get user's ticket statistics
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📊 Fetching stats for user:', userId);

    // Get ticket counts by status
    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('id, status')
      .eq('user_id', userId);

    if (ticketsError) {
      console.error('❌ Error fetching ticket stats:', ticketsError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        details: ticketsError.message
      });
    }

    const ticketIds = tickets.map(t => t.id);

    // Get total views and inquiries in parallel
    const [viewsResult, inquiriesResult] = await Promise.all([
      // Get total views
      supabase
        .from('ticket_views')
        .select('*', { count: 'exact', head: true })
        .in('ticket_id', ticketIds),
      
      // Get total inquiries
      supabase
        .from('ticket_inquiries')
        .select('*', { count: 'exact', head: true })
        .in('ticket_id', ticketIds)
    ]);

    const stats = {
      active_listings: tickets.filter(t => t.status === 'active').length,
      sold_tickets: tickets.filter(t => t.status === 'sold').length,
      expired_tickets: tickets.filter(t => t.status === 'expired').length,
      total_listings: tickets.length,
      total_views: viewsResult.count || 0,
      total_inquiries: inquiriesResult.count || 0
    };

    console.log('✅ Stats calculated for user:', userId);
    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Error in /stats route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});



module.exports = router;