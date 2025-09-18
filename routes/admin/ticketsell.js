// routes/admin/ticketsell.js - Admin ticketsell management (all data access)
const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const supabase = require('../../config/supabase');

// GET /admin/ticketsell - Get all tickets (admin view)
router.get('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin fetching all ticketsell entries:', req.user.email);

    const { data: tickets, error } = await supabase
      .from('ticketsell')
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
        message: 'Failed to fetch ticketsell entries',
        details: error.message
      });
    }

    console.log(`✅ Admin fetched ${tickets?.length || 0} ticketsell entries`);
    
    res.json({
      success: true,
      data: tickets || [],
      message: `Found ${tickets?.length || 0} ticketsell entries`,
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin get ticketsell route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /admin/ticketsell/:id - Get specific ticket (admin view)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const ticketId = req.params.id;
    console.log('👑 Admin fetching ticketsell entry:', ticketId);

    const { data: ticket, error } = await supabase
      .from('ticketsell')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('id', ticketId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Ticketsell entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch ticketsell entry',
        details: error.message
      });
    }

    console.log('✅ Admin fetched ticketsell entry:', ticketId);
    
    res.json({
      success: true,
      data: ticket
    });

  } catch (error) {
    console.error('❌ Error in admin get ticketsell entry route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /admin/ticketsell - Admin create ticket (can specify any user)
router.post('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin creating ticketsell entry:', req.user.email);

    const ticketData = {
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: ticket, error } = await supabase
      .from('ticketsell')
      .insert([ticketData])
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
        message: 'Failed to create ticketsell entry',
        details: error.message
      });
    }

    console.log('✅ Admin created ticketsell entry successfully:', ticket.id);
    
    res.status(201).json({
      success: true,
      data: ticket,
      message: 'Ticketsell entry created successfully',
      createdBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin create ticketsell route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /admin/ticketsell/:id - Admin update any ticket
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const ticketId = req.params.id;
    console.log('👑 Admin updating ticketsell entry:', ticketId, 'by:', req.user.email);

    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data: updatedTicket, error } = await supabase
      .from('ticketsell')
      .update(updateData)
      .eq('id', ticketId)
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
          message: 'Ticketsell entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update ticketsell entry',
        details: error.message
      });
    }

    console.log('✅ Admin updated ticketsell entry successfully:', ticketId);
    
    res.json({
      success: true,
      data: updatedTicket,
      message: 'Ticketsell entry updated successfully',
      updatedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin update ticketsell route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /admin/ticketsell/:id - Admin delete any ticket
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const ticketId = req.params.id;
    console.log('👑 Admin deleting ticketsell entry:', ticketId, 'by:', req.user.email);

    const { data: deletedTicket, error } = await supabase
      .from('ticketsell')
      .delete()
      .eq('id', ticketId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Ticketsell entry not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete ticketsell entry',
        details: error.message
      });
    }

    console.log('✅ Admin deleted ticketsell entry successfully:', ticketId);
    
    res.json({
      success: true,
      message: 'Ticketsell entry deleted successfully',
      data: deletedTicket,
      deletedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin delete ticketsell route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;