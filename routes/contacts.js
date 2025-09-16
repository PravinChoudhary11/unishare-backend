// routes/contacts.js - Contact directory management routes
const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');

// Get all contacts (public endpoint - no auth required)
router.get('/public', async (req, res) => {
  try {
    console.log('📞 Public fetching contacts directory');

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('❌ Database error fetching public contacts:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch contacts',
        details: error.message
      });
    }

    console.log(`✅ Public fetched ${contacts?.length || 0} contacts`);
    
    res.json({
      success: true,
      contacts: contacts || [],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in public contacts route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Apply admin middleware to all admin routes below
router.use(requireAdmin);

// Get all contacts for admin
router.get('/', async (req, res) => {
  try {
    console.log('📞 Admin fetching contacts:', req.user.email);

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error fetching contacts:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch contacts',
        details: error.message
      });
    }

    console.log(`✅ Admin fetched ${contacts?.length || 0} contacts`);
    
    res.json({
      success: true,
      message: `Found ${contacts?.length || 0} contacts`,
      contacts: contacts || [],
      requestedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in get contacts route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Create new contact
router.post('/', async (req, res) => {
  try {
    const { 
      name, 
      role, 
      category, 
      phone, 
      email, 
      location, 
      hours, 
      active = true 
    } = req.body;

    // Validation
    if (!name || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name and role are required'
      });
    }

    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Category is required'
      });
    }

    console.log('📞 Admin creating contact:', req.user.email);

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    // Prepare phones and emails arrays
    const phones = phone ? [phone.trim()] : [];
    const emails = email ? [email.trim()] : [];

    const { data: contact, error } = await supabase
      .from('contacts')
      .insert([{
        name: name.trim(),
        role: role.trim(),
        category: category,
        phones: phones,
        emails: emails,
        location: location ? location.trim() : null,
        hours: hours ? hours.trim() : null,
        active: active,
        user_id: req.user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('❌ Database error creating contact:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create contact',
        details: error.message
      });
    }

    console.log('✅ Contact created successfully:', contact.id);
    
    res.status(201).json({
      success: true,
      message: 'Contact created successfully',
      contact: contact,
      createdBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in create contact route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Update existing contact
router.patch('/:id', async (req, res) => {
  try {
    const contactId = req.params.id;
    const { 
      name, 
      role, 
      category, 
      phone, 
      email, 
      location, 
      hours, 
      active 
    } = req.body;

    console.log('📞 Admin updating contact:', contactId, 'by:', req.user.email);

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    // Build update object with only provided fields
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) updateData.name = name.trim();
    if (role !== undefined) updateData.role = role.trim();
    if (category !== undefined) updateData.category = category;
    if (phone !== undefined) updateData.phones = phone ? [phone.trim()] : [];
    if (email !== undefined) updateData.emails = email ? [email.trim()] : [];
    if (location !== undefined) updateData.location = location ? location.trim() : null;
    if (hours !== undefined) updateData.hours = hours ? hours.trim() : null;
    if (active !== undefined) updateData.active = active;

    const { data: updatedContact, error } = await supabase
      .from('contacts')
      .update(updateData)
      .eq('id', contactId)
      .select()
      .single();

    if (error) {
      console.error('❌ Database error updating contact:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update contact',
        details: error.message
      });
    }

    if (!updatedContact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    console.log('✅ Contact updated successfully:', contactId);
    
    res.json({
      success: true,
      message: 'Contact updated successfully',
      contact: updatedContact,
      updatedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in update contact route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Delete contact
router.delete('/:id', async (req, res) => {
  try {
    const contactId = req.params.id;

    console.log('📞 Admin deleting contact:', contactId, 'by:', req.user.email);

    // Import supabase here to avoid circular dependencies
    const supabase = require('../config/supabase');

    const { data: deletedContact, error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contactId)
      .select()
      .single();

    if (error) {
      console.error('❌ Database error deleting contact:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete contact',
        details: error.message
      });
    }

    if (!deletedContact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    console.log('✅ Contact deleted successfully:', contactId);
    
    res.json({
      success: true,
      message: 'Contact deleted successfully',
      contact: deletedContact,
      deletedBy: {
        email: req.user.email,
        name: req.user.name,
        id: req.user.id
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in delete contact route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;