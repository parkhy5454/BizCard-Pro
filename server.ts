import express from 'express';

const app = express();
const PORT = Number(process.env.PORT) || 8080;

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'BizCard-Pro server is running',
    version: 'v1',
    time: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`✅ Server started successfully`);
  console.log(`📌 Environment: ${process.env.NODE_ENV}`);
});

console.log('✅ Express app created');
