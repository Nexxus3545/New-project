const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'MWOS API',
      version: '1.1.0',
      description: 'Maternal Wellness and Operation System API documentation',
    },
    servers: [
      { url: 'http://localhost:5000/api', description: 'Local API v1' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: [],
};

const spec = swaggerJsdoc(options);

spec.paths = {
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Login',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string' },
                password: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Login success' } },
    },
  },
  '/auth/register': {
    post: { tags: ['Auth'], summary: 'Register', responses: { 201: { description: 'Created' } } },
  },
  '/auth/forgot-password': {
    post: { tags: ['Auth'], summary: 'Start password reset', responses: { 200: { description: 'Email sent' } } },
  },
  '/auth/reset-password': {
    post: { tags: ['Auth'], summary: 'Complete password reset', responses: { 200: { description: 'Password reset success' } } },
  },
  '/patients': {
    get: { tags: ['Patients'], summary: 'List patients', security: [{ bearerAuth: [] }] },
    post: { tags: ['Patients'], summary: 'Create patient', security: [{ bearerAuth: [] }] },
  },
  '/notifications': {
    get: { tags: ['Notifications'], summary: 'List user notifications', security: [{ bearerAuth: [] }] },
    post: { tags: ['Notifications'], summary: 'Create notification', security: [{ bearerAuth: [] }] },
  },
  '/reports/dashboard': {
    get: { tags: ['Reports'], summary: 'Dashboard metrics', security: [{ bearerAuth: [] }] },
  },
};

const setupSwagger = (app) => {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
  app.get('/api/openapi.json', (_req, res) => res.json(spec));
};

module.exports = { setupSwagger };
