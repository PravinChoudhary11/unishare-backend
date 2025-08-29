// config/passport.js - FIXED VERSION with better error handling
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const supabase = require('./supabase');

passport.use(
  new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('🔐 Google OAuth callback received for:', profile.displayName);
      console.log('Profile ID:', profile.id);
      
      // Check if user exists
      const { data: existingUser, error: findError } = await supabase
        .from('users')
        .select('*')
        .eq('google_id', profile.id)
        .maybeSingle(); // Use maybeSingle instead of single to avoid errors
      
      if (findError) {
        console.error('❌ Error finding user:', findError);
        return done(findError, null);
      }
      
      let user;
      
      if (!existingUser) {
        // Generate unique user ID
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log('👤 Creating new user:', userId);
        
        const userData = {
          id: userId,
          google_id: profile.id,
          email: profile.emails?.[0]?.value,
          name: profile.displayName,
          picture: profile.photos?.[0]?.value,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_login: new Date().toISOString()
        };
        
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert(userData)
          .select()
          .single();
        
        if (createError) {
          console.error('❌ Error creating user:', createError);
          return done(createError, null);
        }
        
        user = newUser;
        console.log('✅ Created new user successfully:', user.id);
      } else {
        console.log('👤 Found existing user:', existingUser.id);
        
        // Update last login
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({ 
            last_login: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            // Update profile info in case it changed
            name: profile.displayName,
            picture: profile.photos?.[0]?.value
          })
          .eq('id', existingUser.id)
          .select()
          .single();
        
        if (updateError) {
          console.error('❌ Error updating user:', updateError);
          // Still return existing user if update fails
          user = existingUser;
        } else {
          user = updatedUser;
        }
        
        console.log('✅ User login updated successfully:', user.id);
      }
      
      console.log('🔑 Passport strategy returning user:', user.id);
      return done(null, user);
      
    } catch (err) {
      console.error('❌ Passport strategy error:', err);
      return done(err, null);
    }
  })
);

passport.serializeUser((user, done) => {
  console.log('📦 Serializing user to session:', user.id);
  // Only store the user ID in the session
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    console.log('📦 Deserializing user from session:', id);
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    
    if (error) {
      console.error('❌ Error deserializing user:', error);
      return done(error, null);
    }
    
    if (!user) {
      console.error('❌ User not found during deserialization:', id);
      return done(null, false);
    }
    
    console.log('✅ Successfully deserialized user:', user.id);
    done(null, user);
    
  } catch (err) {
    console.error('❌ Deserialize error:', err);
    done(err, null);
  }
});

module.exports = passport;