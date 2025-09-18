// routes/admin/rooms.js - Admin rooms management (all data access)
const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const supabase = require('../../config/supabase');

// GET /admin/rooms - Get all rooms (admin view)
router.get('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin fetching all rooms entries:', req.user.email);

    const { data: rooms, error } = await supabase
      .from('rooms')
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
        message: 'Failed to fetch rooms entries',
        details: error.message
      });
    }

    console.log(`✅ Admin fetched ${rooms?.length || 0} rooms entries`);
    
    res.json({
      success: true,
      data: rooms || [],
      message: `Found ${rooms?.length || 0} rooms entries`,
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin get rooms route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /admin/rooms/:id - Get specific room (admin view)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const roomId = req.params.id;
    console.log('👑 Admin fetching rooms entry:', roomId);

    const { data: room, error } = await supabase
      .from('rooms')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('id', roomId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Rooms entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch rooms entry',
        details: error.message
      });
    }

    console.log('✅ Admin fetched rooms entry:', roomId);
    
    res.json({
      success: true,
      data: room
    });

  } catch (error) {
    console.error('❌ Error in admin get rooms entry route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /admin/rooms - Admin create room (can specify any user)
router.post('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin creating rooms entry:', req.user.email);

    const roomData = {
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: room, error } = await supabase
      .from('rooms')
      .insert([roomData])
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
        message: 'Failed to create rooms entry',
        details: error.message
      });
    }

    console.log('✅ Admin created rooms entry successfully:', room.id);
    
    res.status(201).json({
      success: true,
      data: room,
      message: 'Rooms entry created successfully',
      createdBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin create rooms route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /admin/rooms/:id - Admin update any room
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const roomId = req.params.id;
    console.log('👑 Admin updating rooms entry:', roomId, 'by:', req.user.email);

    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data: updatedRoom, error } = await supabase
      .from('rooms')
      .update(updateData)
      .eq('id', roomId)
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
          message: 'Rooms entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update rooms entry',
        details: error.message
      });
    }

    console.log('✅ Admin updated rooms entry successfully:', roomId);
    
    res.json({
      success: true,
      data: updatedRoom,
      message: 'Rooms entry updated successfully',
      updatedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin update rooms route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /admin/rooms/:id - Admin delete any room
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const roomId = req.params.id;
    console.log('👑 Admin deleting rooms entry:', roomId, 'by:', req.user.email);

    const { data: deletedRoom, error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Rooms entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete rooms entry',
        details: error.message
      });
    }

    console.log('✅ Admin deleted rooms entry successfully:', roomId);
    
    res.json({
      success: true,
      message: 'Rooms entry deleted successfully',
      data: deletedRoom,
      deletedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin delete rooms route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;