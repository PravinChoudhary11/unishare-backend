const express = require('express');
const supabase = require('../../config/supabase');
const { requireAuth, optionalAuth, requireShareRideOwnershipOrAdmin } = require('../../middleware/requireAuth');

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

// Helper function to validate ride data
const validateRideData = (data) => {
  const errors = [];

  if (!data.from || !data.from.trim()) {
    errors.push('Starting location is required');
  }

  if (!data.to || !data.to.trim()) {
    errors.push('Destination is required');
  }

  if (!data.date) {
    errors.push('Date is required');
  }

  if (!data.time) {
    errors.push('Time is required');
  }

  if (!data.vehicle || !data.vehicle.trim()) {
    errors.push('Vehicle information is required');
  }

  if (!data.price || isNaN(data.price) || parseFloat(data.price) <= 0) {
    errors.push('Valid price is required');
  }

  if (!data.seats || isNaN(data.seats) || parseInt(data.seats) <= 0) {
    errors.push('Valid number of seats is required');
  }

  // Validate date and time is in the future
  if (data.date && data.time) {
    const rideDateTime = new Date(`${data.date} ${data.time}`);
    if (rideDateTime <= new Date()) {
      errors.push('Ride date and time must be in the future');
    }
  }

  // Validate contact info
  if (!data.contact_info || Object.keys(data.contact_info).length === 0) {
    errors.push('At least one contact method is required');
  }

  return errors;
};

// Helper function to validate ride request data
const validateRideRequestData = (data) => {
  const errors = [];

  if (!data.message || !data.message.trim()) {
    errors.push('Message is required');
  }

  if (!data.seatsRequested || isNaN(data.seatsRequested) || parseInt(data.seatsRequested) <= 0) {
    errors.push('Valid number of seats requested is required');
  }

  if (!data.contactMethod || !data.contactMethod.trim()) {
    errors.push('Preferred contact method is required');
  }

  return errors;
};

// GET /api/shareride/my - Get current user's posted rides
router.get('/my', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('🚗 Fetching rides for user:', userId);

    const { data: rides, error } = await supabase
      .from('shared_rides')
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
      console.error('❌ Database error fetching user rides:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch your rides',
        details: error.message
      });
    }

    // Calculate stats for each ride (requests, bookings)
    const processedRides = await Promise.all(
      rides.map(async (ride) => {
        // Get request count
        const { count: requestCount } = await supabase
          .from('ride_requests')
          .select('*', { count: 'exact', head: true })
          .eq('ride_id', ride.id);

        // Get confirmed bookings count
        const { count: confirmedCount } = await supabase
          .from('ride_requests')
          .select('*', { count: 'exact', head: true })
          .eq('ride_id', ride.id)
          .eq('status', 'confirmed');

        return {
          ...ride,
          total_requests: requestCount || 0,
          confirmed_bookings: confirmedCount || 0,
          available_seats: Math.max(0, ride.seats - (confirmedCount || 0))
        };
      })
    );

    console.log(`✅ Fetched ${rides.length} rides for user ${userId}`);
    res.json({
      success: true,
      data: processedRides
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

// GET /api/shareride/my/requests - Get ride requests for user's posted rides
router.get('/my/requests', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📋 Fetching ride requests for user:', userId);

    // Get all ride requests for rides posted by this user
    const { data: requests, error } = await supabase
      .from('ride_requests')
      .select(`
        *,
        requester:requester_id (
          id,
          name,
          email,
          picture
        ),
        ride:ride_id (
          id,
          from_location,
          to_location,
          date,
          time,
          price,
          seats
        )
      `)
      .eq('ride.user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching ride requests:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch ride requests',
        details: error.message
      });
    }

    console.log(`✅ Fetched ${requests?.length || 0} requests for user ${userId}`);
    res.json({
      success: true,
      data: requests || []
    });

  } catch (error) {
    console.error('❌ Error in /my/requests route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /api/shareride/create - Create new ride posting
router.post('/create', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('🚗 Creating new ride for user:', userId);

    const rideData = req.body;

    // Format contact info if it's an array
    if (Array.isArray(rideData.contacts)) {
      rideData.contact_info = formatContactInfo(rideData.contacts);
    }

    // Validate ride data
    const validationErrors = validateRideData(rideData);
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:', validationErrors);
      return res.status(400).json({
        success: false,
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    // Prepare ride data for database
    const dbRideData = {
      user_id: userId,
      driver_name: rideData.driver || req.user?.name || 'Anonymous',
      from_location: rideData.from.trim(),
      to_location: rideData.to.trim(),
      date: rideData.date,
      time: rideData.time,
      seats: parseInt(rideData.seats),
      available_seats: parseInt(rideData.seats), // Initially all seats available
      price: parseFloat(rideData.price),
      vehicle_info: rideData.vehicle.trim(),
      description: rideData.description?.trim() || null,
      contact_info: rideData.contact_info,
      status: 'active', // active, completed, cancelled
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Insert into database
    const { data: newRide, error } = await supabase
      .from('shared_rides')
      .insert([dbRideData])
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
      console.error('❌ Database error creating ride:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create ride posting',
        details: error.message
      });
    }

    console.log('✅ Ride created successfully:', newRide.id);
    res.status(201).json({
      success: true,
      data: newRide,
      message: 'Ride posted successfully'
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

// GET /api/shareride - Search and find rides (PUBLIC with optional auth)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.userId; // Will be null if not authenticated
    console.log('🔍 Searching rides', userId ? `for user: ${userId}` : '(anonymous)');
    
    const {
      from,
      to,
      date,
      seatsNeeded = 1,
      sort = 'created_at',
      order = 'desc',
      limit = 50,
      offset = 0
    } = req.query;

    let query = supabase
      .from('shared_rides')
      .select(`
        *,
        users:user_id (
          id,
          name
        )
      `)
      .eq('status', 'active') // Only show active rides
      .gte('available_seats', parseInt(seatsNeeded)); // Must have enough seats

    // Apply filters
    if (from && from.trim()) {
      query = query.ilike('from_location', `%${from.trim()}%`);
    }
    
    if (to && to.trim()) {
      query = query.ilike('to_location', `%${to.trim()}%`);
    }
    
    if (date) {
      query = query.eq('date', date);
    }

    // Filter out rides in the past
    const now = new Date().toISOString();
    query = query.or(`date.gt.${now.split('T')[0]},and(date.eq.${now.split('T')[0]},time.gt.${now.split('T')[1].split('.')[0]})`);

    // Optional: Don't show user their own rides in search (uncomment to exclude own rides)
    // if (userId) {
    //   query = query.neq('user_id', userId);
    // }

    // Apply sorting
    const validSortColumns = ['created_at', 'date', 'time', 'price'];
    const validOrders = ['asc', 'desc'];
    
    if (validSortColumns.includes(sort) && validOrders.includes(order)) {
      query = query.order(sort, { ascending: order === 'asc' });
    } else {
      query = query.order('date', { ascending: true }).order('time', { ascending: true });
    }

    // Apply pagination
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const offsetNum = parseInt(offset) || 0;
    
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data: rides, error, count } = await query;

    if (error) {
      console.error('❌ Database error searching rides:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to search rides',
        details: error.message
      });
    }

    console.log(`✅ Found ${rides?.length || 0} rides`);
    res.json({
      success: true,
      data: rides || [],
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: count
      }
    });

  } catch (error) {
    console.error('❌ Error searching rides:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/shareride/:id - Get single ride details
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const rideId = req.params.id;
    const userId = req.userId; // Will be null if not authenticated
    console.log('🔍 Fetching ride:', rideId, userId ? `by user: ${userId}` : '(anonymous)');

    const { data: ride, error } = await supabase
      .from('shared_rides')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email,
          picture
        )
      `)
      .eq('id', rideId)
      .single();

    if (error || !ride) {
      console.log('❌ Ride not found:', rideId);
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    // Get confirmed bookings count to calculate available seats
    const { count: confirmedCount } = await supabase
      .from('ride_requests')
      .select('*', { count: 'exact', head: true })
      .eq('ride_id', rideId)
      .eq('status', 'confirmed');

    // Add calculated fields
    const enhancedRide = {
      ...ride,
      confirmed_bookings: confirmedCount || 0,
      available_seats: Math.max(0, ride.seats - (confirmedCount || 0))
    };

    console.log('✅ Ride fetched successfully:', rideId);
    res.json({
      success: true,
      data: enhancedRide
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

// POST /api/shareride/:id/request - Request to join a ride
router.post('/:id/request', requireAuth, async (req, res) => {
  try {
    const rideId = req.params.id;
    const userId = req.userId;
    const requestData = req.body;
    
    console.log('📞 Creating ride request for ride:', rideId, 'by user:', userId);

    // Validate request data
    const validationErrors = validateRideRequestData(requestData);
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:', validationErrors);
      return res.status(400).json({
        success: false,
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    // Check if ride exists and is active
    const { data: ride, error: rideError } = await supabase
      .from('shared_rides')
      .select('user_id, driver_name, from_location, to_location, date, time, seats, available_seats, status')
      .eq('id', rideId)
      .single();

    if (rideError || !ride) {
      console.log('❌ Ride not found for request:', rideId);
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    if (ride.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'This ride is no longer active'
      });
    }

    // Check if user is trying to request their own ride
    if (ride.user_id === userId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot request your own ride'
      });
    }

    // Check if user already has a request for this ride
    const { data: existingRequest } = await supabase
      .from('ride_requests')
      .select('id, status')
      .eq('ride_id', rideId)
      .eq('requester_id', userId)
      .single();

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: `You already have a ${existingRequest.status} request for this ride`
      });
    }

    // Check if enough seats are available
    const seatsRequested = parseInt(requestData.seatsRequested);
    if (ride.available_seats < seatsRequested) {
      return res.status(400).json({
        success: false,
        message: `Only ${ride.available_seats} seats available, but ${seatsRequested} requested`
      });
    }

    // Create the ride request
    const dbRequestData = {
      ride_id: rideId,
      requester_id: userId,
      driver_id: ride.user_id,
      message: requestData.message.trim(),
      seats_requested: seatsRequested,
      contact_method: requestData.contactMethod.trim(),
      pickup_location: requestData.pickupLocation?.trim() || null,
      status: 'pending', // pending, confirmed, declined, cancelled
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: newRequest, error } = await supabase
      .from('ride_requests')
      .insert([dbRequestData])
      .select(`
        *,
        requester:requester_id (
          id,
          name,
          email,
          picture
        ),
        driver:driver_id (
          id,
          name,
          email
        ),
        ride:ride_id (
          id,
          from_location,
          to_location,
          date,
          time,
          price
        )
      `)
      .single();

    if (error) {
      console.error('❌ Error creating ride request:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send ride request',
        details: error.message
      });
    }

    console.log('✅ Ride request created successfully:', newRequest.id);
    res.status(201).json({
      success: true,
      data: newRequest,
      message: 'Ride request sent successfully'
    });

  } catch (error) {
    console.error('❌ Error in /:id/request route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /api/shareride/requests/:requestId/respond - Respond to a ride request (for drivers)
router.put('/requests/:requestId/respond', requireAuth, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const userId = req.userId;
    const { action, message } = req.body; // action: 'confirm' or 'decline'
    
    console.log('📞 Responding to ride request:', requestId, 'by user:', userId, 'action:', action);

    if (!['confirm', 'decline'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "confirm" or "decline"'
      });
    }

    // Get the request with ride details
    const { data: request, error: requestError } = await supabase
      .from('ride_requests')
      .select(`
        *,
        ride:ride_id (
          id,
          user_id,
          seats,
          available_seats
        )
      `)
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.log('❌ Ride request not found:', requestId);
      return res.status(404).json({
        success: false,
        message: 'Ride request not found'
      });
    }

    // Check if current user is the driver
    if (request.ride.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only respond to requests for your own rides'
      });
    }

    // Check if request is still pending
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'This request has already been responded to'
      });
    }

    let updateData = {
      status: action === 'confirm' ? 'confirmed' : 'declined',
      response_message: message?.trim() || null,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // If confirming, check if enough seats are available
    if (action === 'confirm') {
      if (request.ride.available_seats < request.seats_requested) {
        return res.status(400).json({
          success: false,
          message: 'Not enough seats available for this request'
        });
      }

      // Update available seats in the ride
      const newAvailableSeats = request.ride.available_seats - request.seats_requested;
      await supabase
        .from('shared_rides')
        .update({ 
          available_seats: newAvailableSeats,
          updated_at: new Date().toISOString()
        })
        .eq('id', request.ride_id);
    }

    // Update the request
    const { data: updatedRequest, error } = await supabase
      .from('ride_requests')
      .update(updateData)
      .eq('id', requestId)
      .select(`
        *,
        requester:requester_id (
          id,
          name,
          email,
          picture
        ),
        ride:ride_id (
          id,
          from_location,
          to_location,
          date,
          time,
          price
        )
      `)
      .single();

    if (error) {
      console.error('❌ Database error responding to request:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to respond to ride request',
        details: error.message
      });
    }

    console.log('✅ Ride request responded to successfully:', requestId);
    res.json({
      success: true,
      data: updatedRequest,
      message: `Ride request ${action}ed successfully`
    });

  } catch (error) {
    console.error('❌ Error in /requests/:requestId/respond route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /api/shareride/:id - Update ride (for drivers to modify their posted rides)
router.put('/:id', requireAuth, requireShareRideOwnershipOrAdmin(), async (req, res) => {
  try {
    const rideId = req.params.id;
    const userId = req.userId;
    const rideData = req.body;
    
    console.log('✏️ Updating ride:', rideId, 'by user:', userId);

    // Format contact info if it's an array
    if (Array.isArray(rideData.contacts)) {
      rideData.contact_info = formatContactInfo(rideData.contacts);
    }

    // Validate ride data
    const validationErrors = validateRideData(rideData);
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:', validationErrors);
      return res.status(400).json({
        success: false,
        message: validationErrors[0],
        errors: validationErrors
      });
    }

    // Get current ride to check confirmed bookings
    // Note: Ownership/admin access already verified by middleware
    const { data: currentRide, error: fetchError } = await supabase
      .from('shared_rides')
      .select('seats, available_seats')
      .eq('id', rideId)
      .single();

    if (fetchError || !currentRide) {
      console.error('❌ Error fetching ride for update:', fetchError);
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    // Calculate how many seats are booked
    const bookedSeats = currentRide.seats - currentRide.available_seats;
    const newTotalSeats = parseInt(rideData.seats);

    // Ensure new seat count doesn't go below booked seats
    if (newTotalSeats < bookedSeats) {
      return res.status(400).json({
        success: false,
        message: `Cannot reduce seats below ${bookedSeats} (already booked)`
      });
    }

    // Prepare update data
    const updateData = {
      from_location: rideData.from.trim(),
      to_location: rideData.to.trim(),
      date: rideData.date,
      time: rideData.time,
      seats: newTotalSeats,
      available_seats: newTotalSeats - bookedSeats,
      price: parseFloat(rideData.price),
      vehicle_info: rideData.vehicle.trim(),
      description: rideData.description?.trim() || null,
      contact_info: rideData.contact_info,
      updated_at: new Date().toISOString()
    };

    // Update in database (ownership/admin access already verified by middleware)
    const { data: updatedRide, error } = await supabase
      .from('shared_rides')
      .update(updateData)
      .eq('id', rideId)
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
      console.error('❌ Database error updating ride:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update ride',
        details: error.message
      });
    }

    console.log('✅ Ride updated successfully:', rideId);
    res.json({
      success: true,
      data: updatedRide,
      message: 'Ride updated successfully'
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

// PATCH /api/shareride/:id - Partially update ride (for drivers to modify specific fields)
router.patch('/:id', requireAuth, requireShareRideOwnershipOrAdmin(), async (req, res) => {
  try {
    const rideId = req.params.id;
    const userId = req.userId;
    const updates = req.body;
    
    console.log('🔧 Partially updating ride:', rideId, 'by user:', userId);
    console.log('📝 Fields to update:', Object.keys(updates));

    // Get current ride data first
    const { data: currentRide, error: fetchError } = await supabase
      .from('shared_rides')
      .select('*')
      .eq('id', rideId)
      .single();

    if (fetchError || !currentRide) {
      console.error('❌ Error fetching ride for update:', fetchError);
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    // Build update object with only provided fields
    const updateData = {
      updated_at: new Date().toISOString()
    };

    // Handle each possible field update
    if (updates.from !== undefined) {
      if (!updates.from || !updates.from.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Starting location cannot be empty'
        });
      }
      updateData.from_location = updates.from.trim();
    }

    if (updates.to !== undefined) {
      if (!updates.to || !updates.to.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Destination cannot be empty'
        });
      }
      updateData.to_location = updates.to.trim();
    }

    if (updates.date !== undefined) {
      if (!updates.date) {
        return res.status(400).json({
          success: false,
          message: 'Date cannot be empty'
        });
      }
      updateData.date = updates.date;
    }

    if (updates.time !== undefined) {
      if (!updates.time) {
        return res.status(400).json({
          success: false,
          message: 'Time cannot be empty'
        });
      }
      updateData.time = updates.time;
    }

    // Validate date and time if either is being updated
    if (updates.date !== undefined || updates.time !== undefined) {
      const checkDate = updates.date || currentRide.date;
      const checkTime = updates.time || currentRide.time;
      
      if (checkDate && checkTime) {
        const rideDateTime = new Date(`${checkDate} ${checkTime}`);
        if (rideDateTime <= new Date()) {
          return res.status(400).json({
            success: false,
            message: 'Ride date and time must be in the future'
          });
        }
      }
    }

    if (updates.vehicle !== undefined) {
      if (!updates.vehicle || !updates.vehicle.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Vehicle information cannot be empty'
        });
      }
      updateData.vehicle_info = updates.vehicle.trim();
    }

    if (updates.price !== undefined) {
      if (!updates.price || isNaN(updates.price) || parseFloat(updates.price) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid price is required'
        });
      }
      updateData.price = parseFloat(updates.price);
    }

    if (updates.seats !== undefined) {
      const newSeats = parseInt(updates.seats);
      if (!newSeats || newSeats <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid number of seats is required'
        });
      }

      // Calculate how many seats are booked
      const bookedSeats = currentRide.seats - currentRide.available_seats;
      
      // Ensure new seat count doesn't go below booked seats
      if (newSeats < bookedSeats) {
        return res.status(400).json({
          success: false,
          message: `Cannot reduce seats below ${bookedSeats} (already booked)`
        });
      }

      updateData.seats = newSeats;
      updateData.available_seats = newSeats - bookedSeats;
    }

    if (updates.description !== undefined) {
      updateData.description = updates.description?.trim() || null;
    }

    if (updates.contacts !== undefined) {
      const contactInfo = formatContactInfo(updates.contacts);
      if (Object.keys(contactInfo).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one contact method is required'
        });
      }
      updateData.contact_info = contactInfo;
    }

    if (updates.contact_info !== undefined) {
      if (!updates.contact_info || Object.keys(updates.contact_info).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one contact method is required'
        });
      }
      updateData.contact_info = updates.contact_info;
    }

    // Check if any fields were actually provided for update
    const fieldsToUpdate = Object.keys(updateData).filter(key => key !== 'updated_at');
    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update'
      });
    }

    // Update in database
    const { data: updatedRide, error } = await supabase
      .from('shared_rides')
      .update(updateData)
      .eq('id', rideId)
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
      console.error('❌ Database error updating ride:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update ride',
        details: error.message
      });
    }

    console.log('✅ Ride partially updated successfully:', rideId);
    res.json({
      success: true,
      data: updatedRide,
      message: `Ride updated successfully (${fieldsToUpdate.length} field${fieldsToUpdate.length === 1 ? '' : 's'} modified)`,
      updated_fields: fieldsToUpdate
    });

  } catch (error) {
    console.error('❌ Error in /:id PATCH route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /api/shareride/:id - Delete ride
router.delete('/:id', requireAuth, requireShareRideOwnershipOrAdmin(), async (req, res) => {
  try {
    const rideId = req.params.id;
    const userId = req.userId;
    console.log('🗑️ Deleting ride:', rideId, 'by user:', userId);

    // Get ride details before deletion
    // Note: Ownership/admin access already verified by middleware
    const { data: existingRide, error: fetchError } = await supabase
      .from('shared_rides')
      .select('driver_name, from_location, to_location, date, time')
      .eq('id', rideId)
      .single();

    if (fetchError || !existingRide) {
      console.error('❌ Error fetching ride for deletion:', fetchError);
      return res.status(404).json({
        success: false,
        message: 'Ride not found'
      });
    }

    // Cancel all pending requests for this ride
    await supabase
      .from('ride_requests')
      .update({ 
        status: 'cancelled',
        response_message: 'Ride was deleted by driver',
        updated_at: new Date().toISOString()
      })
      .eq('ride_id', rideId)
      .in('status', ['pending', 'confirmed']);

    // Actually delete the ride record (admin/owner access already verified)
    const { error: deleteError } = await supabase
      .from('shared_rides')
      .delete()
      .eq('id', rideId);

    if (deleteError) {
      console.error('❌ Database error deleting ride:', deleteError);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete ride',
        details: deleteError.message
      });
    }

    console.log('✅ Ride deleted successfully:', rideId);
    res.json({
      success: true,
      message: `Ride from ${existingRide.from_location} to ${existingRide.to_location} deleted successfully`
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

// GET /api/shareride/stats - Get user's ride statistics
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📊 Fetching ride stats for user:', userId);

    // Get ride counts by status
    const { data: rides, error: ridesError } = await supabase
      .from('shared_rides')
      .select('id, status, date')
      .eq('user_id', userId);

    if (ridesError) {
      console.error('❌ Error fetching ride stats:', ridesError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        details: ridesError.message
      });
    }

    const rideIds = rides.map(ride => ride.id);

    // Get request statistics
    const [requestsResult, bookingsResult] = await Promise.all([
      // Get total requests received
      supabase
        .from('ride_requests')
        .select('*', { count: 'exact', head: true })
        .in('ride_id', rideIds),
      
      // Get confirmed bookings
      supabase
        .from('ride_requests')
        .select('*', { count: 'exact', head: true })
        .in('ride_id', rideIds)
        .eq('status', 'confirmed')
    ]);

    // Get requests made by user (as passenger)
    const { count: requestsMade } = await supabase
      .from('ride_requests')
      .select('*', { count: 'exact', head: true })
      .eq('requester_id', userId);

    const now = new Date();
    const stats = {
      // As driver
      total_rides_posted: rides.length,
      active_rides: rides.filter(ride => ride.status === 'active').length,
      completed_rides: rides.filter(ride => ride.status === 'completed').length,
      cancelled_rides: rides.filter(ride => ride.status === 'cancelled').length,
      upcoming_rides: rides.filter(ride => 
        ride.status === 'active' && new Date(ride.date) >= now
      ).length,
      
      // Requests and bookings
      total_requests_received: requestsResult.count || 0,
      total_bookings_confirmed: bookingsResult.count || 0,
      
      // As passenger
      total_requests_made: requestsMade || 0
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