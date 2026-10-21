const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { Strategy: FacebookStrategy } = require('passport-facebook');

const readOAuthValue = (name) => process.env[name]?.trim() || '';

const PROVIDERS = {
  google: {
    clientId: readOAuthValue('GOOGLE_CLIENT_ID'),
    clientSecret: readOAuthValue('GOOGLE_CLIENT_SECRET'),
    callbackUrl: readOAuthValue('GOOGLE_CALLBACK_URL'),
    scope: ['profile', 'email'],
  },
  facebook: {
    clientId: readOAuthValue('FACEBOOK_APP_ID'),
    clientSecret: readOAuthValue('FACEBOOK_APP_SECRET'),
    callbackUrl: readOAuthValue('FACEBOOK_CALLBACK_URL'),
    scope: ['email'],
  },
};

let initialized = false;

const isProviderConfigured = (provider) => {
  const config = PROVIDERS[provider];
  return Boolean(config?.clientId && config?.clientSecret && config?.callbackUrl);
};

const getProviderConfig = (provider) => PROVIDERS[provider] || null;

const toProviderProfile = (provider, profile) => {
  const email = profile.emails?.find((item) => item?.value)?.value || profile._json?.email || null;
  const firstName = profile.name?.givenName || profile._json?.given_name || profile._json?.first_name || null;
  const lastName = profile.name?.familyName || profile._json?.family_name || profile._json?.last_name || null;

  return {
    provider,
    subject: profile.id,
    email,
    // Google supplies this claim explicitly. Meta only returns an email after the
    // user grants the permission, so MWOS never generates a substitute email.
    emailVerified: provider === 'google'
      ? (profile._json?.email_verified === true || profile._json?.email_verified === 'true')
      : Boolean(email),
    firstName,
    lastName,
  };
};

const initializeOAuth = () => {
  if (initialized) return;
  initialized = true;

  if (isProviderConfigured('google')) {
    const config = getProviderConfig('google');
    passport.use('google', new GoogleStrategy(
      {
        clientID: config.clientId,
        clientSecret: config.clientSecret,
        callbackURL: config.callbackUrl,
      },
      (_accessToken, _refreshToken, profile, done) => done(null, toProviderProfile('google', profile))
    ));
  }

  if (isProviderConfigured('facebook')) {
    const config = getProviderConfig('facebook');
    passport.use('facebook', new FacebookStrategy(
      {
        clientID: config.clientId,
        clientSecret: config.clientSecret,
        callbackURL: config.callbackUrl,
        profileFields: ['id', 'email', 'first_name', 'last_name', 'name'],
      },
      (_accessToken, _refreshToken, profile, done) => done(null, toProviderProfile('facebook', profile))
    ));
  }
};

module.exports = {
  passport,
  getProviderConfig,
  initializeOAuth,
  isProviderConfigured,
};
