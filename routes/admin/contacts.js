// routes/admin/contacts.js - Admin contacts management (all data access)
const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const supabase = require('../../config/supabase');

// GET /admin/contacts - Get all contacts (admin view)
router.get('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin fetching all contacts:', req.user.email);

    const { data: contacts, error } = await supabase
      .from('contacts')
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
        message: 'Failed to fetch contacts',
        details: error.message
      });
    }

    console.log(`✅ Admin fetched ${contacts?.length || 0} contacts`);
    
    res.json({
      success: true,
      data: contacts || [],
      message: `Found ${contacts?.length || 0} contacts`,
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin get contacts route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /admin/contacts/:id - Get specific contact (admin view)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const contactId = req.params.id;
    console.log('👑 Admin fetching contact:', contactId);

    const { data: contact, error } = await supabase
      .from('contacts')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq('id', contactId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch contact',
        details: error.message
      });
    }

    console.log('✅ Admin fetched contact:', contactId);
    
    res.json({
      success: true,
      data: contact
    });

  } catch (error) {
    console.error('❌ Error in admin get contact route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST /admin/contacts - Admin create contact (can specify any user)
router.post('/', requireAdmin, async (req, res) => {
  try {
    console.log('👑 Admin creating contact:', req.user.email);

    const contactData = {
      ...req.body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: contact, error } = await supabase
      .from('contacts')
      .insert([contactData])
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
        message: 'Failed to create contact',
        details: error.message
      });
    }

    console.log('✅ Admin created contact successfully:', contact.id);
    
    res.status(201).json({
      success: true,
      data: contact,
      message: 'Contact created successfully',
      createdBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin create contact route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /admin/contacts/:id - Admin update any contact
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const contactId = req.params.id;
    console.log('👑 Admin updating contact:', contactId, 'by:', req.user.email);

    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data: updatedContact, error } = await supabase
      .from('contacts')
      .update(updateData)
      .eq('id', contactId)
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
          message: 'Contact not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update contact',
        details: error.message
      });
    }

    console.log('✅ Admin updated contact successfully:', contactId);
    
    res.json({
      success: true,
      data: updatedContact,
      message: 'Contact updated successfully',
      updatedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin update contact route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// DELETE /admin/contacts/:id - Admin delete any contact
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const contactId = req.params.id;
    console.log('👑 Admin deleting contact:', contactId, 'by:', req.user.email);

    const { data: deletedContact, error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contactId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete contact',
        details: error.message
      });
    }

    console.log('✅ Admin deleted contact successfully:', contactId);
    
    res.json({
      success: true,
      message: 'Contact deleted successfully',
      data: deletedContact,
      deletedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in admin delete contact route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;