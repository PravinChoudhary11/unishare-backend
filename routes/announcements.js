const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const requireAdmin = require('../middleware/requireAdmin');

// GET all announcements
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, announcements: data });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST a new announcement (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, body, priority, tags, active, expiresAt } = req.body;

    const { data, error } = await supabase
      .from('announcements')
      .insert([{
        title,
        body,
        priority,
        tags,
        active,
        expires_at: expiresAt,
        user_id: req.user.id
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PATCH an announcement (Admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, body, priority, tags, active, expiresAt } = req.body;

    const { data, error } = await supabase
      .from('announcements')
      .update({
        title,
        body,
        priority,
        tags,
        active,
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE an announcement (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Announcement deleted' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
