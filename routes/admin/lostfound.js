// routes/admin/lostfound.js - Admin lostfound management (all data access)
const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const supabase = require('../../config/supabase');

// GET /admin/lostfound - Get all lostfound entries (admin view)
router.get('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin fetching all lostfound entries:', req.user.email);

    const { data: items, error } = await supabase
      .from('lostfound')
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
        message: 'Failed to fetch lostfound entries',
        details: error.message
      });
    }

    console.log(`✅ Admin fetched ${items?.length || 0} lostfound entries`);
    
    res.json({
      success: true,
      data: items || [],
      message: `Found ${items?.length || 0} lostfound entries`,
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin get lostfound route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /admin/lostfound/:id - Get specific lostfound entry (admin view)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const itemId = req.params.id;
    console.log('👑 Admin fetching lostfound entry:', itemId);

    const { data: item, error } = await supabase
      .from('lostfound')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('id', itemId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Lostfound entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch lostfound entry',
        details: error.message
      });
    }

    console.log('✅ Admin fetched lostfound entry:', itemId);
    
    res.json({
      success: true,
      data: item
    });

  } catch (error) {
    console.error('❌ Error in admin get lostfound entry route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /admin/lostfound - Admin create lostfound entry (can specify any user)
router.post('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin creating lostfound entry:', req.user.email);

    const itemData = {
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: item, error } = await supabase
      .from('lostfound')
      .insert([itemData])
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
        message: 'Failed to create lostfound entry',
        details: error.message
      });
    }

    console.log('✅ Admin created lostfound entry successfully:', item.id);
    
    res.status(201).json({
      success: true,
      data: item,
      message: 'Lostfound entry created successfully',
      createdBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin create lostfound route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /admin/lostfound/:id - Admin update any lostfound entry
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const itemId = req.params.id;
    console.log('👑 Admin updating lostfound entry:', itemId, 'by:', req.user.email);

    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data: updatedItem, error } = await supabase
      .from('lostfound')
      .update(updateData)
      .eq('id', itemId)
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
          message: 'Lostfound entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update lostfound entry',
        details: error.message
      });
    }

    console.log('✅ Admin updated lostfound entry successfully:', itemId);
    
    res.json({
      success: true,
      data: updatedItem,
      message: 'Lostfound entry updated successfully',
      updatedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin update lostfound route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /admin/lostfound/:id - Admin delete any lostfound entry
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const itemId = req.params.id;
    console.log('👑 Admin deleting lostfound entry:', itemId, 'by:', req.user.email);

    const { data: deletedItem, error } = await supabase
      .from('lostfound')
      .delete()
      .eq('id', itemId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Lostfound entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete lostfound entry',
        details: error.message
      });
    }

    console.log('✅ Admin deleted lostfound entry successfully:', itemId);
    
    res.json({
      success: true,
      message: 'Lostfound entry deleted successfully',
      data: deletedItem,
      deletedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin delete lostfound route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;