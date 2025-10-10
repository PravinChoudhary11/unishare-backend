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

// Helper function to validate ticket request data
const validateTicketRequestData = (data) => {
  const errors = [];

  if (!data.message || !data.message.trim()) {
    errors.push('Message is required');
  } else if (data.message.trim().length < 10) {
    errors.push('Message must be at least 10 characters long');
  } else if (data.message.trim().length > 1000) {
    errors.push('Message must be less than 1000 characters');
  }

  if (!data.contactMethod || !data.contactMethod.trim()) {
    errors.push('Contact method is required');
  } else if (data.contactMethod.trim().length > 500) {
    errors.push('Contact method must be less than 500 characters');
  }

  if (!data.quantityRequested || isNaN(data.quantityRequested) || parseInt(data.quantityRequested) <= 0) {
    errors.push('Valid quantity requested is required');
  } else if (parseInt(data.quantityRequested) > 20) {
    errors.push('Cannot request more than 20 tickets at once');
  }

  // Optional validation for offered price
  if (data.offeredPrice && (isNaN(data.offeredPrice) || parseFloat(data.offeredPrice) < 0)) {
    errors.push('Offered price must be a valid positive number');
  }

  // Optional validation for pickup preference
  if (data.pickupPreference && data.pickupPreference.trim().length > 500) {
    errors.push('Pickup preference must be less than 500 characters');
  }

  return errors;
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

// ============================
// TICKET REQUEST SYSTEM
// ============================

// POST /api/tickets/:id/request - Request to buy tickets
router.post('/:id/request', requireAuth, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const userId = req.userId;
    const requestData = req.body;
    
    console.log('🎫 Creating ticket request for ticket:', ticketId, 'by user:', userId);

    // Validate request data
    const validationErrors = validateTicketRequestData(requestData);
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:', validationErrors);
      return res.status(400).json({
        success: false,
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    // Check if ticket exists and is available
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('user_id, title, price, quantity_available, category, venue, location')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      console.log('❌ Ticket not found for request:', ticketId);
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user is trying to request their own ticket
    if (ticket.user_id === userId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot request your own tickets'
      });
    }

    // Check if requested quantity is available
    const quantityRequested = parseInt(requestData.quantityRequested);
    if (quantityRequested > ticket.quantity_available) {
      return res.status(400).json({
        success: false,
        message: `Only ${ticket.quantity_available} tickets available, but you requested ${quantityRequested}`
      });
    }

    // Check if user already has a request for this ticket
    const { data: existingRequest } = await supabase
      .from('ticket_requests')
      .select('id, status')
      .eq('ticket_id', ticketId)
      .eq('requester_id', userId)
      .single();

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: `You already have a ${existingRequest.status} request for this ticket`
      });
    }

    // Create the ticket request
    const dbRequestData = {
      ticket_id: ticketId,
      requester_id: userId,
      seller_id: ticket.user_id,
      message: requestData.message.trim(),
      contact_method: requestData.contactMethod.trim(),
      quantity_requested: quantityRequested,
      offered_price: requestData.offeredPrice ? parseFloat(requestData.offeredPrice) : null,
      pickup_preference: requestData.pickupPreference?.trim() || null,
      status: 'pending', // pending, accepted, rejected, cancelled
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: newRequest, error } = await supabase
      .from('ticket_requests')
      .insert([dbRequestData])
      .select(`
        *,
        requester:requester_id (
          id,
          name,
          email,
          picture
        ),
        ticket:ticket_id (
          id,
          title,
          price,
          category,
          venue,
          location
        )
      `)
      .single();

    if (error) {
      console.error('❌ Database error creating ticket request:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create ticket request',
        details: error.message
      });
    }

    console.log('✅ Ticket request created successfully:', newRequest.id);
    res.status(201).json({
      success: true,
      message: 'Ticket request sent successfully',
      data: newRequest
    });

  } catch (e) {
    console.error('❌ Error creating ticket request:', e);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create ticket request',
      error: e.message 
    });
  }
});

// GET /api/tickets/my/requests - Get requests that users made TO MY tickets (requests I received as seller)
router.get('/my/requests', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📋 Fetching requests received on my tickets by user:', userId);

    // First get the user's ticket IDs
    const { data: userTickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('id')
      .eq('user_id', userId);

    if (ticketsError) {
      console.error('❌ Database error fetching user tickets:', ticketsError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch your tickets',
        details: ticketsError.message
      });
    }

    if (!userTickets || userTickets.length === 0) {
      console.log('✅ No tickets found for user, returning empty requests');
      return res.json({
        success: true,
        data: [],
        message: 'No requests found (you have no tickets posted)'
      });
    }

    const ticketIds = userTickets.map(ticket => ticket.id);

    // Get all ticket requests for these specific tickets only
    const { data: requests, error } = await supabase
      .from('ticket_requests')
      .select(`
        *,
        requester:requester_id (
          id,
          name,
          email,
          picture
        ),
        ticket:ticket_id (
          id,
          title,
          price,
          category,
          venue,
          location,
          quantity_available,
          user_id
        )
      `)
      .in('ticket_id', ticketIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching requests on my tickets:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch requests on your tickets',
        details: error.message
      });
    }

    // Security check: Filter out any requests that don't belong to user's tickets
    const filteredRequests = (requests || []).filter(req => 
      req.ticket && req.ticket.user_id === userId
    );

    console.log(`📊 Found ${filteredRequests.length} requests on user's tickets`);

    res.json({
      success: true,
      data: filteredRequests,
      count: filteredRequests.length
    });

  } catch (e) {
    console.error('❌ Error fetching ticket requests:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket requests',
      error: e.message
    });
  }
});

// GET /api/tickets/requests/sent - Get requests that I sent (as a buyer)
router.get('/requests/sent', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📋 Fetching ticket requests sent by user:', userId);

    const { data: requests, error } = await supabase
      .from('ticket_requests')
      .select(`
        *,
        ticket:ticket_id (
          id,
          title,
          price,
          category,
          venue,
          location,
          quantity_available
        ),
        seller:seller_id (
          id,
          name,
          email
        )
      `)
      .eq('requester_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching sent requests:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch your sent requests',
        details: error.message
      });
    }

    console.log(`📊 Found ${requests?.length || 0} requests sent by user`);

    res.json({
      success: true,
      data: requests || [],
      count: requests?.length || 0
    });

  } catch (e) {
    console.error('❌ Error fetching sent ticket requests:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sent ticket requests',
      error: e.message
    });
  }
});

// PUT /api/tickets/requests/:requestId/respond - Respond to a ticket request (for sellers)
router.put('/requests/:requestId/respond', requireAuth, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const userId = req.userId;
    const { status, responseMessage, agreedPrice, agreedQuantity } = req.body;

    console.log('📝 Responding to ticket request:', requestId, 'with status:', status);

    // Validate status
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "accepted" or "rejected"'
      });
    }

    // Get the request and verify ownership
    const { data: request, error: requestError } = await supabase
      .from('ticket_requests')
      .select(`
        *,
        ticket:ticket_id (
          id,
          title,
          user_id,
          quantity_available
        )
      `)
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.log('❌ Ticket request not found:', requestId);
      return res.status(404).json({
        success: false,
        message: 'Ticket request not found'
      });
    }

    // Check if user owns the ticket
    if (!request.ticket || request.ticket.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only respond to requests for your own tickets'
      });
    }

    // Check if request is still pending
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This request has already been ${request.status}`
      });
    }

    // If accepting, validate agreed quantity against availability
    if (status === 'accepted') {
      const finalQuantity = agreedQuantity ? parseInt(agreedQuantity) : request.quantity_requested;
      if (finalQuantity > request.ticket.quantity_available) {
        return res.status(400).json({
          success: false,
          message: `Cannot accept ${finalQuantity} tickets. Only ${request.ticket.quantity_available} available.`
        });
      }
    }

    // Update the request
    const updateData = {
      status: status,
      response_message: responseMessage?.trim() || null,
      agreed_price: status === 'accepted' && agreedPrice ? parseFloat(agreedPrice) : null,
      agreed_quantity: status === 'accepted' && agreedQuantity ? parseInt(agreedQuantity) : request.quantity_requested,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: updatedRequest, error: updateError } = await supabase
      .from('ticket_requests')
      .update(updateData)
      .eq('id', requestId)
      .select(`
        *,
        requester:requester_id (
          id,
          name,
          email
        ),
        ticket:ticket_id (
          id,
          title,
          price,
          category
        )
      `)
      .single();

    if (updateError) {
      console.error('❌ Database error updating ticket request:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update ticket request',
        details: updateError.message
      });
    }

    // If accepted, reduce the available quantity
    if (status === 'accepted') {
      const soldQuantity = updateData.agreed_quantity;
      const { error: ticketUpdateError } = await supabase
        .from('tickets')
        .update({ 
          quantity_available: request.ticket.quantity_available - soldQuantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', request.ticket_id);

      if (ticketUpdateError) {
        console.error('❌ Error updating ticket quantity:', ticketUpdateError);
        // Don't fail the request response, just log the error
      }
    }

    console.log(`✅ Ticket request ${status} successfully`);
    res.json({
      success: true,
      message: `Ticket request ${status} successfully`,
      data: updatedRequest
    });

  } catch (e) {
    console.error('❌ Error responding to ticket request:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to ticket request',
      error: e.message
    });
  }
});

// DELETE /api/tickets/requests/:requestId - Cancel a ticket request (for buyers)
router.delete('/requests/:requestId', requireAuth, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const userId = req.userId;

    console.log('🗑️ Cancelling ticket request:', requestId, 'by user:', userId);

    // Get the request and verify ownership
    const { data: request, error: requestError } = await supabase
      .from('ticket_requests')
      .select('id, requester_id, status')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.log('❌ Ticket request not found:', requestId);
      return res.status(404).json({
        success: false,
        message: 'Ticket request not found'
      });
    }

    // Check if user is the requester
    if (request.requester_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own requests'
      });
    }

    // Check if request can be cancelled
    if (request.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel an accepted request. Please contact the seller.'
      });
    }

    // Update status to cancelled instead of deleting
    const { error: updateError } = await supabase
      .from('ticket_requests')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('❌ Database error cancelling ticket request:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to cancel ticket request',
        details: updateError.message
      });
    }

    console.log('✅ Ticket request cancelled successfully');
    res.json({
      success: true,
      message: 'Ticket request cancelled successfully'
    });

  } catch (e) {
    console.error('❌ Error cancelling ticket request:', e);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel ticket request',
      error: e.message
    });
  }
});


module.exports = router;