require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { testConnection } = require('./config/database');
const { setupSwagger } = require('./config/swagger');
const routes = require('./routes/index');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8081',
      /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
      /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many login attempts, please try again later' },
});

app.use(limiter);
app.use('/api/auth/login', authLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.get('/health', async (_req, res) => {
  const dbOk = await testConnection().catch(() => false);
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    service: 'MWOS Backend',
    version: '1.1.0',
    timestamp: new Date().toISOString(),
    database: dbOk ? 'connected' : 'disconnected',
  });
});

setupSwagger(app);
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

const start = async () => {
  console.log('\nTMC Copino MWOS Backend');
  console.log('============================');

  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('\nCannot start without database. Please check PostgreSQL.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`\nServer running on http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`API: http://localhost:${PORT}/api`);
    console.log(`Swagger: http://localhost:${PORT}/api/docs`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });
};

start();

module.exports = app;
