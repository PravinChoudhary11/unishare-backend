// routes/admin/shareride.js - Admin shareride management (all data access)
const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const supabase = require('../../config/supabase');

// GET /admin/shareride - Get all rides (admin view)
router.get('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin fetching all shareride entries:', req.user.email);

    const { data: rides, error } = await supabase
      .from('shareride')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch shareride entries',
        details: error.message
      });
    }

    console.log(`✅ Admin fetched ${rides?.length || 0} shareride entries`);
    
    res.json({
      success: true,
      data: rides || [],
      message: `Found ${rides?.length || 0} shareride entries`,
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin get shareride route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /admin/shareride/:id - Get specific ride (admin view)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const rideId = req.params.id;
    console.log('👑 Admin fetching shareride entry:', rideId);

    const { data: ride, error } = await supabase
      .from('shareride')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('id', rideId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Shareride entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch shareride entry',
        details: error.message
      });
    }

    console.log('✅ Admin fetched shareride entry:', rideId);
    
    res.json({
      success: true,
      data: ride
    });

  } catch (error) {
    console.error('❌ Error in admin get shareride entry route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /admin/shareride - Admin create ride (can specify any user)
router.post('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin creating shareride entry:', req.user.email);

    const rideData = {
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: ride, error } = await supabase
      .from('shareride')
      .insert([rideData])
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
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create shareride entry',
        details: error.message
      });
    }

    console.log('✅ Admin created shareride entry successfully:', ride.id);
    
    res.status(201).json({
      success: true,
      data: ride,
      message: 'Shareride entry created successfully',
      createdBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin create shareride route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /admin/shareride/:id - Admin update any ride
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const rideId = req.params.id;
    console.log('👑 Admin updating shareride entry:', rideId, 'by:', req.user.email);

    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data: updatedRide, error } = await supabase
      .from('shareride')
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
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Shareride entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update shareride entry',
        details: error.message
      });
    }

    console.log('✅ Admin updated shareride entry successfully:', rideId);
    
    res.json({
      success: true,
      data: updatedRide,
      message: 'Shareride entry updated successfully',
      updatedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin update shareride route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /admin/shareride/:id - Admin delete any ride
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const rideId = req.params.id;
    console.log('👑 Admin deleting shareride entry:', rideId, 'by:', req.user.email);

    const { data: deletedRide, error } = await supabase
      .from('shareride')
      .delete()
      .eq('id', rideId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Shareride entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete shareride entry',
        details: error.message
      });
    }

    console.log('✅ Admin deleted shareride entry successfully:', rideId);
    
    res.json({
      success: true,
      message: 'Shareride entry deleted successfully',
      data: deletedRide,
      deletedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin delete shareride route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;