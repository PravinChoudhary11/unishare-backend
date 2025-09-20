const express = require('express');
const multer = require('multer');
const supabase = require('../../config/supabase');
const { requireAuth } = require('../../middleware/requireAuth');

const router = express.Router();

// Configure multer for profile image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Helper function to upload profile image to Supabase Storage
const uploadProfileImage = async (userId, imageBuffer, filename) => {
  try {
    // Create profile-images bucket if it doesn't exist
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === 'profile-images');
    
    if (!bucketExists) {
      console.log('Creating profile-images bucket...');
      const { data: bucket, error: bucketError } = await supabase.storage.createBucket('profile-images', {
        public: true,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        fileSizeLimit: 5242880 // 5MB
      });
      
      if (bucketError) {
        console.error('ERROR: Error creating bucket:', bucketError);
        throw bucketError;
      }
      console.log('Created profile-images bucket successfully');
    }

    const fileName = `profile-${userId}-${Date.now()}-${filename}`;
    console.log('Uploading profile image to:', fileName);

    const { data: urlData, error } = await supabase.storage
      .from('profile-images')
      .upload(fileName, imageBuffer, {
        contentType: 'image/*',
        upsert: true
      });

    if (error) {
      console.error('Storage upload error:', error);
      throw error;
    }

    // Get public URL
    const { data: publicUrl } = supabase.storage
      .from('profile-images')
      .getPublicUrl(fileName);

    console.log('Profile image uploaded successfully:', publicUrl.publicUrl);
    return publicUrl.publicUrl;

  } catch (error) {
    console.error('Profile image upload helper error:', error);
    throw error;
  }
};

// Helper function to delete old profile image
const deleteOldProfileImage = async (imageUrl) => {
  try {
    if (!imageUrl) return;
    
    // Extract filename from URL
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    
    if (fileName && fileName.startsWith('profile-')) {
      await supabase.storage
        .from('profile-images')
        .remove([fileName]);
      console.log('Deleted old profile image:', fileName);
    }
  } catch (error) {
    console.error('Error deleting old profile image:', error);
    // Don't throw error, just log it
  }
};

// Helper function to validate custom user ID format
const validateCustomUserId = (customUserId) => {
  if (!customUserId) return { valid: false, error: 'Custom user ID is required' };
  
  // Must start with @ and contain only alphanumeric characters and underscores
  const regex = /^@[a-zA-Z0-9_]{2,20}$/;
  
  if (!regex.test(customUserId)) {
    return {
      valid: false,
      error: 'Custom user ID must start with @ and contain 3-21 characters (letters, numbers, underscores only)'
    };
  }
  
  // Check for reserved usernames
  const reserved = ['@admin', '@system', '@support', '@help', '@api', '@www', '@mail'];
  if (reserved.includes(customUserId.toLowerCase())) {
    return {
      valid: false,
      error: 'This username is reserved and cannot be used'
    };
  }
  
  return { valid: true };
};

// GET /api/profile - Get current user's profile
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Database error fetching profile:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch profile',
        details: error.message
      });
    }

    // If no profile exists, return default values
    if (!profile) {
      return res.json({
        success: true,
        data: {
          user_id: userId,
          display_name: null,
          bio: null,
          profile_image_url: null,
          custom_user_id: null,
          created_at: null,
          updated_at: null
        },
        message: 'Profile not found, using default values'
      });
    }

    res.json({
      success: true,
      data: profile,
      message: 'Profile fetched successfully'
    });

  } catch (error) {
    console.error('Error in /profile GET route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/profile/:customUserId - Get user profile by custom user ID (public)
router.get('/:customUserId', async (req, res) => {
  try {
    const customUserId = req.params.customUserId;
    
    // Add @ if not present
    const formattedUserId = customUserId.startsWith('@') ? customUserId : '@' + customUserId;

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, bio, profile_image_url, custom_user_id, created_at')
      .eq('custom_user_id', formattedUserId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // Not found
        return res.status(404).json({
          success: false,
          message: 'User profile not found'
        });
      }
      
      console.error('Database error fetching profile:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch profile',
        details: error.message
      });
    }

    res.json({
      success: true,
      data: profile,
      message: 'Profile fetched successfully'
    });

  } catch (error) {
    console.error('Error in /profile/:customUserId GET route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// POST/PUT /api/profile - Create or update user profile
router.post('/', requireAuth, upload.single('profileImage'), async (req, res) => {
  try {
    const userId = req.userId;
    const { display_name, bio, custom_user_id } = req.body;

    // Validate custom user ID if provided
    if (custom_user_id) {
      const validation = validateCustomUserId(custom_user_id);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.error
        });
      }

      // Check if custom user ID is already taken by another user
      const { data: existingUser, error: checkError } = await supabase
        .from('user_profiles')
        .select('user_id')
        .eq('custom_user_id', custom_user_id)
        .neq('user_id', userId) // Exclude current user
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Database error checking custom user ID:', checkError);
        return res.status(500).json({
          success: false,
          message: 'Failed to validate custom user ID',
          details: checkError.message
        });
      }

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'This custom user ID is already taken'
        });
      }
    }

    // Get existing profile to check for old image
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('profile_image_url')
      .eq('user_id', userId)
      .single();

    let profileImageUrl = existingProfile?.profile_image_url || null;

    // Handle profile image upload
    if (req.file) {
      try {
        // Delete old image if exists
        if (existingProfile?.profile_image_url) {
          await deleteOldProfileImage(existingProfile.profile_image_url);
        }

        profileImageUrl = await uploadProfileImage(userId, req.file.buffer, req.file.originalname);
      } catch (uploadError) {
        console.error('Profile image upload failed:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload profile image',
          details: uploadError.message
        });
      }
    }

    // Prepare profile data
    const profileData = {
      user_id: userId,
      display_name: display_name || null,
      bio: bio || null,
      profile_image_url: profileImageUrl,
      custom_user_id: custom_user_id || null,
      updated_at: new Date().toISOString()
    };

    // If profile doesn't exist, add created_at
    if (!existingProfile) {
      profileData.created_at = new Date().toISOString();
    }

    // Upsert profile data
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .upsert(profileData, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Database error saving profile:', error);
      // If image was uploaded, try to clean it up
      if (req.file && profileImageUrl) {
        await deleteOldProfileImage(profileImageUrl);
      }
      return res.status(500).json({
        success: false,
        message: 'Failed to save profile',
        details: error.message
      });
    }

    console.log('Profile saved successfully:', userId);
    res.json({
      success: true,
      data: profile,
      message: 'Profile saved successfully'
    });

  } catch (error) {
    console.error('Error in /profile POST route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// PUT /api/profile - Update user profile (same as POST but more explicit)
router.put('/', requireAuth, upload.single('profileImage'), async (req, res) => {
  // Reuse the POST logic
  return router.handle({ ...req, method: 'POST' }, res);
});

// DELETE /api/profile/image - Delete profile image
router.delete('/image', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    // Get existing profile
    const { data: existingProfile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('profile_image_url')
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching profile:', fetchError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch profile',
        details: fetchError.message
      });
    }

    if (!existingProfile?.profile_image_url) {
      return res.status(400).json({
        success: false,
        message: 'No profile image to delete'
      });
    }

    // Delete image from storage
    await deleteOldProfileImage(existingProfile.profile_image_url);

    // Update profile to remove image URL
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        profile_image_url: null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Database error removing image URL:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update profile',
        details: updateError.message
      });
    }

    console.log('Profile image deleted successfully:', userId);
    res.json({
      success: true,
      message: 'Profile image deleted successfully'
    });

  } catch (error) {
    console.error('Error in /profile/image DELETE route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/profile/search/:query - Search users by display name or custom user ID
router.get('/search/:query', async (req, res) => {
  try {
    const query = req.params.query.trim();
    
    if (query.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, profile_image_url, custom_user_id, created_at')
      .or(`display_name.ilike.%${query}%,custom_user_id.ilike.%${query}%`)
      .limit(20)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error searching profiles:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to search profiles',
        details: error.message
      });
    }

    res.json({
      success: true,
      data: profiles || [],
      message: `Found ${profiles?.length || 0} matching profiles`
    });

  } catch (error) {
    console.error('Error in /profile/search route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;