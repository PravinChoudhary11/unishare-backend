const express = require('express');
const multer = require('multer');
const supabase = require('../../config/supabase');
const { requireAuth } = require('../../middleware/requireAuth');

const router = express.Router();

// Security middleware to ensure users can only access their own profile data
const requireOwnProfile = async (req, res, next) => {
  try {
    const userId = req.userId;
    const targetUserId = req.params.userId || req.body.user_id;
    
    // If no target user ID is specified, they're accessing their own profile
    if (!targetUserId) {
      return next();
    }
    
    // Ensure user can only access their own profile for write operations
    if (targetUserId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only modify your own profile',
        error_code: 'FORBIDDEN_ACCESS'
      });
    }
    
    next();
  } catch (error) {
    console.error('Error in requireOwnProfile middleware:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      details: error.message
    });
  }
};

// Rate limiting helper to prevent abuse
const rateLimitTracker = new Map();
const checkRateLimit = (req, res, next) => {
  const userId = req.userId || req.ip;
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  const maxRequests = 30; // Max 30 requests per minute per user
  
  if (!rateLimitTracker.has(userId)) {
    rateLimitTracker.set(userId, { count: 1, resetTime: now + windowMs });
    return next();
  }
  
  const userLimit = rateLimitTracker.get(userId);
  
  if (now > userLimit.resetTime) {
    // Reset the window
    rateLimitTracker.set(userId, { count: 1, resetTime: now + windowMs });
    return next();
  }
  
  if (userLimit.count >= maxRequests) {
    return res.status(429).json({
      success: false,
      message: 'Rate limit exceeded. Please try again later.',
      error_code: 'RATE_LIMITED',
      retry_after: Math.ceil((userLimit.resetTime - now) / 1000)
    });
  }
  
  userLimit.count++;
  next();
};

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

// Helper function to validate phone number format
const validatePhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return { valid: true }; // Phone is optional
  
  // Remove all non-digit characters for validation
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  
  // Check if it's a valid length (10-15 digits)
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return {
      valid: false,
      error: 'Phone number must be between 10-15 digits'
    };
  }
  
  // Check for valid characters (digits, spaces, hyphens, dots, parentheses, plus sign)
  const validCharsRegex = /^[\+\d\s\-\.\(\)]+$/;
  if (!validCharsRegex.test(phoneNumber.trim())) {
    return {
      valid: false,
      error: 'Phone number can only contain digits, spaces, hyphens, dots, parentheses, and plus sign'
    };
  }
  
  // Ensure it starts with a digit or plus sign
  const trimmed = phoneNumber.trim();
  if (!/^[\+\d\(]/.test(trimmed)) {
    return {
      valid: false,
      error: 'Phone number must start with a digit, plus sign, or opening parenthesis'
    };
  }
  
  return { valid: true };
};

// Helper function to validate campus name format
const validateCampusName = (campusName) => {
  if (!campusName) return { valid: true }; // Campus name is optional
  
  const trimmed = campusName.trim();
  
  // Check length (2-100 characters)
  if (trimmed.length < 2 || trimmed.length > 100) {
    return {
      valid: false,
      error: 'Campus name must be between 2-100 characters'
    };
  }
  
  // Check for valid characters (letters, numbers, spaces, hyphens, dots, commas, ampersands, apostrophes, parentheses)
  const validCharsRegex = /^[a-zA-Z0-9\s\-\.\,\&'()]+$/;
  if (!validCharsRegex.test(trimmed)) {
    return {
      valid: false,
      error: 'Campus name can only contain letters, numbers, spaces, hyphens, dots, commas, ampersands, apostrophes, and parentheses'
    };
  }
  
  // Ensure it starts with a letter or number (not special characters)
  if (!/^[a-zA-Z0-9]/.test(trimmed)) {
    return {
      valid: false,
      error: 'Campus name must start with a letter or number'
    };
  }
  
  // Ensure it doesn't end with special characters (except parentheses)
  if (!/[a-zA-Z0-9)]$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Campus name must end with a letter, number, or closing parenthesis'
    };
  }
  
  return { valid: true };
};

// GET /api/profile - Get current user's profile (authenticated users only)
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;

    // Security: Users can only access their own profile data
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId) // This ensures they only get their own profile
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
          phone_number: null,
          campus_name: null,
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

// GET /api/profile/:customUserId - Get user profile by custom user ID (PUBLIC READ-ONLY)
router.get('/:customUserId', checkRateLimit, async (req, res) => {
  try {
    const customUserId = req.params.customUserId;
    
    // Add @ if not present
    const formattedUserId = customUserId.startsWith('@') ? customUserId : '@' + customUserId;

    // PUBLIC ACCESS: Anyone can view basic profile info (no sensitive data)
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, bio, profile_image_url, custom_user_id, created_at') // Limited fields for public access
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

// POST/PUT /api/profile - Create or update user profile (AUTHENTICATED USERS - OWN PROFILE ONLY)
router.post('/', requireAuth, requireOwnProfile, checkRateLimit, upload.single('profileImage'), async (req, res) => {
  try {
    const userId = req.userId; // Always use authenticated user's ID
    const { display_name, bio, custom_user_id, phone_number, campus_name } = req.body;

    // SECURITY: Prevent any attempt to modify another user's profile
    // Even if someone tries to pass a different user_id in the body, we ignore it
    // and only use the authenticated user's ID from the session

    // Validate phone number if provided
    if (phone_number) {
      const phoneValidation = validatePhoneNumber(phone_number);
      if (!phoneValidation.valid) {
        return res.status(400).json({
          success: false,
          message: phoneValidation.error,
          error_code: 'INVALID_PHONE_NUMBER'
        });
      }
    }

    // Validate campus name if provided
    if (campus_name) {
      const campusValidation = validateCampusName(campus_name);
      if (!campusValidation.valid) {
        return res.status(400).json({
          success: false,
          message: campusValidation.error,
          error_code: 'INVALID_CAMPUS_NAME'
        });
      }
    }

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
        .select('user_id, display_name')
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
        return res.status(409).json({ // 409 Conflict
          success: false,
          message: `The username ${custom_user_id} is already taken`,
          error_code: 'USERNAME_TAKEN',
          details: `This custom user ID is already in use by another user`
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
      phone_number: phone_number || null,
      campus_name: campus_name || null,
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

// PUT /api/profile - Update user profile (AUTHENTICATED USERS - OWN PROFILE ONLY)
router.put('/', requireAuth, requireOwnProfile, checkRateLimit, upload.single('profileImage'), async (req, res) => {
  // Reuse the POST logic with enhanced security
  return router.handle({ ...req, method: 'POST' }, res);
});

// DELETE /api/profile/image - Delete profile image (AUTHENTICATED USERS - OWN PROFILE ONLY)
router.delete('/image', requireAuth, checkRateLimit, async (req, res) => {
  try {
    const userId = req.userId; // Always use authenticated user's ID

    // SECURITY: User can only delete their own profile image
    // Get existing profile (ensuring it belongs to the authenticated user)
    const { data: existingProfile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('profile_image_url')
      .eq('user_id', userId) // Only access their own profile
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

// GET /api/profile/search/:query - Search users by display name or custom user ID (PUBLIC with rate limiting)
router.get('/search/:query', checkRateLimit, async (req, res) => {
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

// GET /api/profile/check-availability/:customUserId - Check if custom user ID is available (PUBLIC with rate limiting)
router.get('/check-availability/:customUserId', checkRateLimit, async (req, res) => {
  try {
    const customUserId = req.params.customUserId;
    
    // Add @ if not present and validate format
    const formattedUserId = customUserId.startsWith('@') ? customUserId : '@' + customUserId;
    
    // Validate custom user ID format
    const validation = validateCustomUserId(formattedUserId);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        available: false,
        message: validation.error,
        error_code: 'INVALID_FORMAT'
      });
    }

    // Check if custom user ID is already taken
    const { data: existingUser, error: checkError } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, created_at')
      .eq('custom_user_id', formattedUserId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Database error checking availability:', checkError);
      return res.status(500).json({
        success: false,
        available: false,
        message: 'Failed to check availability',
        details: checkError.message
      });
    }

    const isAvailable = !existingUser;

    res.json({
      success: true,
      available: isAvailable,
      custom_user_id: formattedUserId,
      message: isAvailable 
        ? `${formattedUserId} is available!` 
        : `${formattedUserId} is already taken`,
      ...(existingUser && {
        taken_by: {
          display_name: existingUser.display_name || 'Anonymous User',
          taken_at: existingUser.created_at
        }
      })
    });

  } catch (error) {
    console.error('Error in /profile/check-availability route:', error);
    res.status(500).json({
      success: false,
      available: false,
      message: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/profile/suggest-username/:baseUsername - Suggest available usernames (PUBLIC with rate limiting)
router.get('/suggest-username/:baseUsername', checkRateLimit, async (req, res) => {
  try {
    const baseUsername = req.params.baseUsername.replace('@', ''); // Remove @ if present
    
    // Validate base username format (without @)
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(baseUsername)) {
      return res.status(400).json({
        success: false,
        message: 'Base username must contain 2-20 characters (letters, numbers, underscores only)',
        suggestions: []
      });
    }

    const suggestions = [];
    const baseWithAt = '@' + baseUsername;
    
    // Check if the base username is available
    const { data: baseExists } = await supabase
      .from('user_profiles')
      .select('custom_user_id')
      .eq('custom_user_id', baseWithAt)
      .single();
    
    if (!baseExists) {
      suggestions.push({
        username: baseWithAt,
        available: true,
        type: 'original'
      });
    }

    // Generate alternative suggestions
    const alternatives = [
      `${baseUsername}_`,
      `${baseUsername}1`,
      `${baseUsername}2`,
      `${baseUsername}3`,
      `${baseUsername}_1`,
      `${baseUsername}_2`,
      `_${baseUsername}`,
      `${baseUsername}123`,
      `${baseUsername}_${new Date().getFullYear()}`,
      `${baseUsername}_user`
    ];

    // Check availability for each suggestion
    for (const alt of alternatives) {
      if (suggestions.length >= 10) break; // Limit to 10 suggestions
      
      const altWithAt = '@' + alt;
      if (altWithAt.length <= 21) { // Respect length constraint
        
        const { data: exists } = await supabase
          .from('user_profiles')
          .select('custom_user_id')
          .eq('custom_user_id', altWithAt)
          .single();
        
        if (!exists) {
          suggestions.push({
            username: altWithAt,
            available: true,
            type: 'suggestion'
          });
        }
      }
    }

    res.json({
      success: true,
      base_username: baseWithAt,
      base_available: !baseExists,
      suggestions: suggestions,
      message: `Found ${suggestions.length} available username suggestions`
    });

  } catch (error) {
    console.error('Error in /profile/suggest-username route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      suggestions: [],
      details: error.message
    });
  }
});

module.exports = router;