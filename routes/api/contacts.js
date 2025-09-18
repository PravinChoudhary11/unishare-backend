// routes/api/contacts.js - Public contacts API
const express = require('express');
const router = express.Router();
const supabase = require('../../config/supabase');

// GET /api/contacts - Get active contacts (public access)
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    
    let query = supabase
      .from('contacts')
      .select('id, name, role, emails, phones, category, location, hours, created_at')
      .eq('active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data: contacts, error } = await query;

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch contacts',
        details: error.message
      });
    }

    res.json({
      success: true,
      data: contacts || [],
      message: `Found ${contacts?.length || 0} contacts`
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

// GET /api/contacts/:id - Get specific contact (public access)
router.get('/:id', async (req, res) => {
  try {
    const contactId = req.params.id;

    // Validate that ID is numeric
    if (!/^\d+$/.test(contactId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID format. ID must be numeric.'
      });
    }

    const { data: contact, error } = await supabase
      .from('contacts')
      .select('id, name, role, emails, phones, category, location, hours, created_at')
      .eq('id', contactId)
      .eq('active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Contact not found or not active'
        });
      }
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch contact',
        details: error.message
      });
    }

    res.json({
      success: true,
      data: contact
    });

  } catch (error) {
    console.error('❌ Error in get contact route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/contacts/search/:term - Search contacts by name, role, or category
router.get('/search/:term', async (req, res) => {
  try {
    const searchTerm = req.params.term;

    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, name, role, emails, phones, category, location, hours, created_at')
      .eq('active', true)
      .or(`name.ilike.%${searchTerm}%,role.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`)
      .order('name', { ascending: true });

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to search contacts',
        details: error.message
      });
    }

    res.json({
      success: true,
      data: contacts || [],
      searchTerm: searchTerm,
      message: `Found ${contacts?.length || 0} contacts matching "${searchTerm}"`
    });

  } catch (error) {
    console.error('❌ Error in search contacts route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;