// routes/admin/itemsell.js - Admin itemsell management (all data access)
const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const supabase = require('../../config/supabase');

// GET /admin/itemsell - Get all items (admin view)
router.get('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin fetching all itemsell entries:', req.user.email);

    const { data: items, error } = await supabase
      .from('itemsell')
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
        message: 'Failed to fetch itemsell entries',
        details: error.message
      });
    }

    console.log(`✅ Admin fetched ${items?.length || 0} itemsell entries`);
    
    res.json({
      success: true,
      data: items || [],
      message: `Found ${items?.length || 0} itemsell entries`,
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin get itemsell route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /admin/itemsell/:id - Get specific item (admin view)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const itemId = req.params.id;
    console.log('👑 Admin fetching itemsell entry:', itemId);

    const { data: item, error } = await supabase
      .from('itemsell')
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
          message: 'Itemsell entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch itemsell entry',
        details: error.message
      });
    }

    console.log('✅ Admin fetched itemsell entry:', itemId);
    
    res.json({
      success: true,
      data: item
    });

  } catch (error) {
    console.error('❌ Error in admin get itemsell entry route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /admin/itemsell - Admin create item (can specify any user)
router.post('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin creating itemsell entry:', req.user.email);

    const itemData = {
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: item, error } = await supabase
      .from('itemsell')
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
        message: 'Failed to create itemsell entry',
        details: error.message
      });
    }

    console.log('✅ Admin created itemsell entry successfully:', item.id);
    
    res.status(201).json({
      success: true,
      data: item,
      message: 'Itemsell entry created successfully',
      createdBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin create itemsell route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /admin/itemsell/:id - Admin update any item
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const itemId = req.params.id;
    console.log('👑 Admin updating itemsell entry:', itemId, 'by:', req.user.email);

    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data: updatedItem, error } = await supabase
      .from('itemsell')
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
          message: 'Itemsell entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update itemsell entry',
        details: error.message
      });
    }

    console.log('✅ Admin updated itemsell entry successfully:', itemId);
    
    res.json({
      success: true,
      data: updatedItem,
      message: 'Itemsell entry updated successfully',
      updatedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin update itemsell route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /admin/itemsell/:id - Admin delete any item
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const itemId = req.params.id;
    console.log('👑 Admin deleting itemsell entry:', itemId, 'by:', req.user.email);

    const { data: deletedItem, error } = await supabase
      .from('itemsell')
      .delete()
      .eq('id', itemId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Itemsell entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete itemsell entry',
        details: error.message
      });
    }

    console.log('✅ Admin deleted itemsell entry successfully:', itemId);
    
    res.json({
      success: true,
      message: 'Itemsell entry deleted successfully',
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
    console.error('❌ Error in admin delete itemsell route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;