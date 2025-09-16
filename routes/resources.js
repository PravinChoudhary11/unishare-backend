const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const requireAdmin = require('../middleware/requireAdmin');

// Validation helper
const validateResourceData = (data) => {
  const errors = [];
  
  if (!data.title || !data.title.trim()) {
    errors.push('Title is required');
  }
  
  if (!data.url || !data.url.trim()) {
    errors.push('URL is required');
  }
  
  if (!data.category || !data.category.trim()) {
    errors.push('Category is required');
  }
  
  const validCategories = ['academics', 'tools', 'campus', 'docs', 'media'];
  if (data.category && !validCategories.includes(data.category)) {
    errors.push('Invalid category. Must be one of: ' + validCategories.join(', '));
  }
  
  return errors;
};

// GET /admin/resources - Public endpoint to list active resources
router.get('/', async (req, res) => {
  try {
    const { category, includeInactive } = req.query;
    
    let query = supabase
      .from('resources')
      .select('*')
      .order('created_at', { ascending: false });
    
    // For admin users, allow viewing inactive resources
    if (includeInactive === 'true' && req.isAuthenticated() && req.user) {
      // Check if user is admin (same logic as requireAdmin middleware)
      const { ADMIN_EMAILS } = require('../config/admin');
      const isAdmin = ADMIN_EMAILS.includes(req.user.email);
      if (!isAdmin) {
        query = query.eq('active', true); // Non-admin users only see active
      }
      // Admin users see all resources (no active filter)
    } else {
      // Public users only see active resources
      query = query.eq('active', true);
    }
    
    // Filter by category if provided
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to fetch resources' });
    }
    
    res.json(data || []);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/resources/suggestions - Public endpoint for users to suggest resources
router.post('/suggestions', async (req, res) => {
  try {
    const { title, desc, category, type, url, tags } = req.body;
    
    // Validate input
    const validationErrors = validateResourceData({ title, url, category });
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }
    
    // Process tags
    let processedTags = [];
    if (tags) {
      if (typeof tags === 'string') {
        processedTags = tags.split(',').map(tag => tag.trim()).filter(Boolean);
      } else if (Array.isArray(tags)) {
        processedTags = tags.filter(Boolean);
      }
    }
    
    // Create resource data for suggestion (always inactive, needs admin approval)
    const resourceData = {
      title: title.trim(),
      desc: desc ? desc.trim() : '',
      category,
      type: type || 'link',
      url: url.trim(),
      tags: processedTags,
      active: false // Suggestions start as inactive and need admin approval
    };
    
    const { data, error } = await supabase
      .from('resources')
      .insert(resourceData)
      .select()
      .single();
    
    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to submit resource suggestion' });
    }
    
    res.status(201).json({
      message: 'Resource suggestion submitted successfully! It will be reviewed by administrators.',
      suggestion: data
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/resources - Admin only endpoint to create resource
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, desc, category, type, url, tags, active } = req.body;
    
    // Validate input
    const validationErrors = validateResourceData({ title, url, category });
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }
    
    // Process tags
    let processedTags = [];
    if (tags) {
      if (typeof tags === 'string') {
        processedTags = tags.split(',').map(tag => tag.trim()).filter(Boolean);
      } else if (Array.isArray(tags)) {
        processedTags = tags.filter(Boolean);
      }
    }
    
    const resourceData = {
      title: title.trim(),
      desc: desc ? desc.trim() : '',
      category,
      type: type || 'link',
      url: url.trim(),
      tags: processedTags,
      active: active !== undefined ? Boolean(active) : true
    };
    
    const { data, error } = await supabase
      .from('resources')
      .insert(resourceData)
      .select()
      .single();
    
    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to create resource' });
    }
    
    res.status(201).json(data);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /admin/resources/:id - Admin only endpoint to update resource
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, desc, category, type, url, tags, active } = req.body;
    
    // Validate input
    const validationErrors = validateResourceData({ title, url, category });
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }
    
    // Process tags
    let processedTags = [];
    if (tags) {
      if (typeof tags === 'string') {
        processedTags = tags.split(',').map(tag => tag.trim()).filter(Boolean);
      } else if (Array.isArray(tags)) {
        processedTags = tags.filter(Boolean);
      }
    }
    
    const resourceData = {
      title: title.trim(),
      desc: desc ? desc.trim() : '',
      category,
      type: type || 'link',
      url: url.trim(),
      tags: processedTags,
      active: active !== undefined ? Boolean(active) : true,
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('resources')
      .update(resourceData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to update resource' });
    }
    
    if (!data) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /admin/resources/:id - Admin only endpoint to delete resource
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('resources')
      .delete()
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to delete resource' });
    }
    
    if (!data) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    
    res.json({ message: 'Resource deleted successfully', id: data.id });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/resources/suggestions - Admin only endpoint to view pending suggestions
router.get('/suggestions', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('resources')
      .select('*')
      .eq('active', false)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to fetch resource suggestions' });
    }
    
    res.json({
      message: `Found ${data.length} pending resource suggestions`,
      suggestions: data || []
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /admin/resources/:id/approve - Admin only endpoint to approve a suggestion
router.patch('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Update the resource to be active (approved)
    const { data, error } = await supabase
      .from('resources')
      .update({ 
        active: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('active', false) // Only approve if it's currently inactive
      .select()
      .single();
    
    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to approve resource suggestion' });
    }
    
    if (!data) {
      return res.status(404).json({ error: 'Suggestion not found or already approved' });
    }
    
    res.json({ 
      message: 'Resource suggestion approved successfully!',
      resource: data 
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /admin/resources/:id/toggle - Admin only endpoint to toggle active status
router.patch('/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // First get the current resource to know its active state
    const { data: currentResource, error: fetchError } = await supabase
      .from('resources')
      .select('active')
      .eq('id', id)
      .single();
    
    if (fetchError || !currentResource) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    
    // Toggle the active state
    const newActiveState = !currentResource.active;
    
    const { data, error } = await supabase
      .from('resources')
      .update({ 
        active: newActiveState,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to toggle resource status' });
    }
    
    res.json({ 
      message: `Resource ${newActiveState ? 'activated' : 'deactivated'} successfully`,
      resource: data 
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/resources/categories - Public endpoint to get available categories
router.get('/categories', async (req, res) => {
  try {
    const categories = [
      { key: 'academics', label: 'Academics' },
      { key: 'tools', label: 'Tools' },
      { key: 'campus', label: 'Campus' },
      { key: 'docs', label: 'Docs' },
      { key: 'media', label: 'Media' }
    ];
    
    res.json(categories);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;