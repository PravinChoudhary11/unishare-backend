// config/passport.js
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
      // console.log('Google profile:', profile); // Debug log
      
      // Check if user exists
      const { data: existingUser, error: findError } = await supabase
        .from('users')
        .select('*')
        .eq('google_id', profile.id)
        .single();
      
      if (findError && findError.code !== 'PGRST116') { // PGRST116 = no rows found
        throw findError;
      }
      
      let user;
      
      if (!existingUser) {
        // Generate a simple ID (you can use uuid if preferred)
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create new user
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            id: userId,
            google_id: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName,
            picture: profile.photos[0].value,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_login: new Date().toISOString()
          })
          .select()
          .single();
        
        if (createError) throw createError;
        
        user = newUser;
        // console.log('Created new user:', user.id);
      } else {
        // Update last login and updated_at
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({ 
            last_login: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingUser.id)
          .select()
          .single();
        
        if (updateError) throw updateError;
        
        user = updatedUser;
        // console.log('Updated existing user:', user.id);
      }
      
      return done(null, user);
    } catch (err) {
      // console.error('Passport strategy error:', err);
      return done(err, null);
    }
  })
);

passport.serializeUser((user, done) => {
  // console.log('Serializing user:', user.id);
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    // console.log('Deserializing user:', id);
    done(null, user);
  } catch (err) {
    // console.error('Deserialize error:', err);
    done(err, null);
  }
});
