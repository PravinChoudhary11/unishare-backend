const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

passport.use(
  new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // console.log('Google profile:', profile); // Debug log
      
      let user = await prisma.user.findUnique({ 
        where: { googleId: profile.id } 
      });
      
      if (!user) {
        user = await prisma.user.create({
          data: {
            googleId: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName,
            picture: profile.photos[0].value,
            lastLogin: new Date()
          }
        });
        console.log('Created new user:', user.id);
      } else {
        // Update last login
        user = await prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() }
        });
        console.log('Updated existing user:', user.id);
      }
      
      return done(null, user);
    } catch (err) {
      console.error('Passport strategy error:', err);
      return done(err, null);
    }
  })
);

passport.serializeUser((user, done) => {
  console.log('Serializing user:', user.id);
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    console.log('Deserializing user:', id);
    done(null, user);
  } catch (err) {
    console.error('Deserialize error:', err);
    done(err, null);
  }
});