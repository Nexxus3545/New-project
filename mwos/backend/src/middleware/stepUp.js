const { verifyStepUpToken, normalizePurpose } = require('../utils/security');

const getStepUpTokenFromRequest = (req) => (
  req.headers['x-step-up-token']
  || req.body?.stepUpToken
  || req.query?.stepUpToken
  || null
);

const buildStepUpError = (req, message, code = 'STEP_UP_REQUIRED') => ({
  success: false,
  message,
  requestId: req.requestId || null,
  code,
});

const requireStepUp = (purpose = 'critical') => {
  const normalizedPurpose = normalizePurpose(purpose);

  return (req, res, next) => {
    try {
      const token = getStepUpTokenFromRequest(req);
      const stepUp = verifyStepUpToken(token, {
        userId: req.user.id,
        purpose: normalizedPurpose,
      });

      req.stepUp = stepUp;
      next();
    } catch (err) {
      return res.status(403).json(buildStepUpError(
        req,
        err.message || 'Step-up authentication required',
        err.message?.includes('purpose') ? 'STEP_UP_PURPOSE_MISMATCH' : 'STEP_UP_REQUIRED'
      ));
    }
  };
};

const resolveStepUpContext = (req, purpose = 'critical') => {
  const normalizedPurpose = normalizePurpose(purpose);
  const token = getStepUpTokenFromRequest(req);
  const stepUp = verifyStepUpToken(token, {
    userId: req.user.id,
    purpose: normalizedPurpose,
  });

  req.stepUp = stepUp;
  return stepUp;
};

module.exports = {
  getStepUpTokenFromRequest,
  requireStepUp,
  resolveStepUpContext,
};
