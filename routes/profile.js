// routes/profile.js - User Profile Management Routes
const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/requireAuth');
const path = require('path');

// Configure multer for avatar uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 2 * 1024 * 1024, // 2MB max for avatars
    files: 1 
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
    }
  }
});

// Validation helper
const validateProfileData = (data) => {
  const errors = [];
  
  if (data.display_name && data.display_name.trim().length < 2) {
    errors.push('Display name must be at least 2 characters long');
  }
  
  if (data.display_name && data.display_name.trim().length > 100) {
    errors.push('Display name must not exceed 100 characters');
  }
  
  if (data.bio && data.bio.length > 1000) {
    errors.push('Bio must not exceed 1000 characters');
  }
  
  if (data.phone && !/^\+?[\d\s-()]+$/.test(data.phone)) {
    errors.push('Invalid phone number format');
  }
  
  if (data.alternate_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.alternate_email)) {
    errors.push('Invalid email format');
  }
  
  if (data.instagram_handle && !/^[a-zA-Z0-9._]+$/.test(data.instagram_handle)) {
    errors.push('Invalid Instagram handle format');
  }
  
  if (data.linkedin_url && !data.linkedin_url.match(/^https?:\/\/(www\.)?linkedin\.com\/.+/)) {
    errors.push('Invalid LinkedIn URL');
  }
  
  if (data.website_url && !data.website_url.match(/^https?:\/\/.+/)) {
    errors.push('Invalid website URL format');
  }
  
  return errors;
};

// Upload avatar helper
const uploadAvatar = async (file, userId) => {
  if (!file) return null;
  
  try {
    const timestamp = Date.now();
    const fileExt = path.extname(file.originalname).toLowerCase();
    const fileName = `avatars/${userId}/${timestamp}${fileExt}`;

    console.log('Uploading avatar to:', fileName);

    const { data, error } = await supabase.storage
      .from('user-avatars')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Avatar upload error:', error);
      throw new Error(`Avatar upload failed: ${error.message}`);
    }

    const { data: urlData } = supabase.storage
      .from('user-avatars')
      .getPublicUrl(fileName);

    if (!urlData?.publicUrl) {
      throw new Error('Failed to generate avatar URL');
    }

    console.log('Avatar uploaded successfully:', urlData.publicUrl);
    return {
      url: urlData.publicUrl,
      path: fileName
    };
  } catch (error) {
    console.error('Avatar upload helper error:', error);
    throw error;
  }
};

// GET /profile/me - Get current user's profile
router.get('/me', requireAuth, async (req, res) => {
  try {
    console.log('Fetching profile for user:', req.userId);

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select(`
        *,
        auth_users:user_id (
          email,
          created_at
        )
      `)
      .eq('user_id', req.userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Database error fetching profile:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch profile',
        details: error.message
      });
    }

    // If no profile exists, create a basic one
    if (!profile) {
      console.log('No profile found, creating basic profile for user:', req.userId);
      
      const { data: newProfile, error: createError } = await supabase
        .from('user_profiles')
        .insert([{
          user_id: req.userId,
          display_name: req.user.name || 'User',
          google_avatar_url: req.user.picture || null
        }])
        .select(`
          *,
          auth_users:user_id (
            email,
            created_at
          )
        `)
        .single();

      if (createError) {
        console.error('Error creating profile:', createError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create profile'
        });
      }

      return res.json({
        success: true,
        data: newProfile
      });
    }

    console.log('Profile fetched successfully for user:', req.userId);
    res.json({
      success: true,
      data: profile
    });

  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /profile/me - Update current user's profile
router.put('/me', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    console.log('Updating profile for user:', req.userId);
    console.log('Has new avatar:', !!req.file);

    // Parse and validate profile data
    const profileData = {
      display_name: req.body.display_name,
      bio: req.body.bio,
      phone: req.body.phone,
      alternate_email: req.body.alternate_email,
      location: req.body.location,
      college: req.body.college,
      year: req.body.year,
      branch: req.body.branch,
      instagram_handle: req.body.instagram_handle,
      linkedin_url: req.body.linkedin_url,
      website_url: req.body.website_url,
      is_profile_public: req.body.is_profile_public === 'true' || req.body.is_profile_public === true,
      show_contact_info: req.body.show_contact_info === 'true' || req.body.show_contact_info === true,
      email_notifications: req.body.email_notifications === 'true' || req.body.email_notifications === true,
      push_notifications: req.body.push_notifications === 'true' || req.body.push_notifications === true
    };

    // Remove undefined/empty values
    Object.keys(profileData).forEach(key => {
      if (profileData[key] === undefined || profileData[key] === '') {
        delete profileData[key];
      }
    });

    // Validate the data
    const validationErrors = validateProfileData(profileData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Get current profile to handle avatar cleanup
    const { data: currentProfile } = await supabase
      .from('user_profiles')
      .select('avatar_url')
      .eq('user_id', req.userId)
      .single();

    // Upload new avatar if provided
    if (req.file) {
      try {
        const uploadResult = await uploadAvatar(req.file, req.userId);
        profileData.avatar_url = uploadResult.url;

        // Delete old avatar if it exists and is not the Google avatar
        if (currentProfile?.avatar_url && !currentProfile.avatar_url.includes('googleusercontent.com')) {
          try {
            const oldAvatarPath = currentProfile.avatar_url.split('/user-avatars/')[1];
            if (oldAvatarPath) {
              await supabase.storage.from('user-avatars').remove([oldAvatarPath]);
              console.log('Deleted old avatar:', oldAvatarPath);
            }
          } catch (deleteError) {
            console.warn('Failed to delete old avatar:', deleteError);
          }
        }
      } catch (uploadError) {
        return res.status(500).json({
          success: false,
          message: 'Avatar upload failed',
          details: uploadError.message
        });
      }
    }

    // Check if profile is becoming more complete
    const completionFields = ['display_name', 'bio', 'location', 'college', 'year'];
    const completedFields = completionFields.filter(field => 
      profileData[field] || (currentProfile && currentProfile[field])
    );
    
    if (completedFields.length >= 3) {
      profileData.profile_completed = true;
    }

    profileData.updated_at = new Date().toISOString();

    // Update the profile
    const { data: updatedProfile, error: updateError } = await supabase
      .from('user_profiles')
      .update(profileData)
      .eq('user_id', req.userId)
      .select(`
        *,
        auth_users:user_id (
          email,
          created_at
        )
      `)
      .single();

    if (updateError) {
      console.error('Database error updating profile:', updateError);
      
      // Clean up uploaded avatar if database update failed
      if (req.file && profileData.avatar_url) {
        try {
          const avatarPath = profileData.avatar_url.split('/user-avatars/')[1];
          await supabase.storage.from('user-avatars').remove([avatarPath]);
        } catch (cleanupError) {
          console.warn('Failed to cleanup avatar after database error:', cleanupError);
        }
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to update profile',
        details: updateError.message
      });
    }

    console.log('Profile updated successfully for user:', req.userId);
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedProfile
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /profile/stats - Get user's dashboard statistics
router.get('/stats', requireAuth, async (req, res) => {
  try {
    console.log('Fetching stats for user:', req.userId);

    // Fetch counts in parallel
    const [roomsResult, itemsResult] = await Promise.allSettled([
      supabase
        .from('rooms')
        .select('id', { count: 'exact' })
        .eq('user_id', req.userId),
      supabase
        .from('item_sell')
        .select('id', { count: 'exact' })
        .eq('user_id', req.userId)
    ]);

    const stats = {
      totalRooms: roomsResult.status === 'fulfilled' ? (roomsResult.value.count || 0) : 0,
      totalItems: itemsResult.status === 'fulfilled' ? (itemsResult.value.count || 0) : 0,
      profileViews: 0, // Placeholder for future implementation
      totalListings: 0
    };

    stats.totalListings = stats.totalRooms + stats.totalItems;

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      details: error.message
    });
  }
});

// GET /profile/dashboard - Get complete dashboard data
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    console.log('Fetching dashboard data for user:', req.userId);

    // Fetch all dashboard data in parallel
    const [profileResult, roomsResult, itemsResult] = await Promise.allSettled([
      supabase
        .from('user_profiles')
        .select(`
          *,
          auth_users:user_id (
            email,
            created_at
          )
        `)
        .eq('user_id', req.userId)
        .single(),
      supabase
        .from('rooms')
        .select('*')
        .eq('user_id', req.userId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('item_sell')
        .select('*')
        .eq('user_id', req.userId)
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    const dashboardData = {
      profile: null,
      rooms: [],
      items: [],
      stats: {
        totalRooms: 0,
        totalItems: 0,
        totalListings: 0,
        profileViews: 0
      },
      errors: []
    };

    // Handle profile data
    if (profileResult.status === 'fulfilled' && profileResult.value.data) {
      dashboardData.profile = profileResult.value.data;
    } else if (profileResult.reason?.code !== 'PGRST116') {
      dashboardData.errors.push('Failed to fetch profile data');
    }

    // Handle rooms data
    if (roomsResult.status === 'fulfilled' && roomsResult.value.data) {
      dashboardData.rooms = roomsResult.value.data;
      dashboardData.stats.totalRooms = roomsResult.value.data.length;
    } else {
      dashboardData.errors.push('Failed to fetch rooms data');
    }

    // Handle items data
    if (itemsResult.status === 'fulfilled' && itemsResult.value.data) {
      dashboardData.items = itemsResult.value.data;
      dashboardData.stats.totalItems = itemsResult.value.data.length;
    } else {
      dashboardData.errors.push('Failed to fetch items data');
    }

    dashboardData.stats.totalListings = dashboardData.stats.totalRooms + dashboardData.stats.totalItems;

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      details: error.message
    });
  }
});

// DELETE /profile/avatar - Delete current avatar
router.delete('/avatar', requireAuth, async (req, res) => {
  try {
    console.log('Deleting avatar for user:', req.userId);

    // Get current profile
    const { data: profile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('avatar_url')
      .eq('user_id', req.userId)
      .single();

    if (fetchError || !profile?.avatar_url) {
      return res.status(404).json({
        success: false,
        message: 'No avatar found'
      });
    }

    // Don't delete Google avatars
    if (profile.avatar_url.includes('googleusercontent.com')) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete Google avatar'
      });
    }

    // Delete from storage
    const avatarPath = profile.avatar_url.split('/user-avatars/')[1];
    if (avatarPath) {
      const { error: storageError } = await supabase.storage
        .from('user-avatars')
        .remove([avatarPath]);

      if (storageError) {
        console.warn('Failed to delete avatar from storage:', storageError);
      }
    }

    // Update profile to remove avatar URL
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ avatar_url: null })
      .eq('user_id', req.userId);

    if (updateError) {
      console.error('Failed to update profile:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update profile'
      });
    }

    console.log('Avatar deleted successfully for user:', req.userId);
    res.json({
      success: true,
      message: 'Avatar deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting avatar:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /profile/:userId - Get public profile by user ID
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('Fetching public profile for user:', userId);

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select(`
        display_name,
        bio,
        avatar_url,
        google_avatar_url,
        location,
        college,
        year,
        branch,
        instagram_handle,
        linkedin_url,
        website_url,
        created_at
      `)
      .eq('user_id', userId)
      .eq('is_profile_public', true)
      .eq('profile_completed', true)
      .single();

    if (error || !profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found or not public'
      });
    }

    res.json({
      success: true,
      data: profile
    });

  } catch (error) {
    console.error('Error fetching public profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// Multer error handling
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Avatar file too large. Maximum size is 2MB.'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field'
      });
    }
  }
  
  if (err.message.includes('Only JPEG, PNG, and WebP images are allowed')) {
    return res.status(400).json({
      success: false,
      message: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.'
    });
  }
  
  next(err);
});

module.exports = router;