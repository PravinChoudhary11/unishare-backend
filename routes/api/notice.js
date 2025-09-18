// routes/api/notice.js - Public notice viewing API
const express = require('express');
const router = express.Router();
const supabase = require('../../config/supabase');

// GET /api/notice - Get active notices (public access)
router.get('/', async (req, res) => {
  try {
    const { data: notices, error } = await supabase
      .from('notices')
      .select('id, heading, body, priority, created_at')
      .eq('active', true)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notices',
        details: error.message
      });
    }

    res.json({
      success: true,
      notices: notices || [],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in get notices route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;