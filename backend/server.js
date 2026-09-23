const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { initSchema } = require('./config/database');

const authRoutes = require('./routes/auth');
const classRoutes = require('./routes/classes');
const studentRoutes = require('./routes/students');
const markRoutes = require('./routes/marks');
const attendanceRoutes = require('./routes/attendance');
const cleanlinessRoutes = require('./routes/cleanliness');
const remarkRoutes = require('./routes/remarks');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
    origin: '*',
    credentials: true
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize DB schema on start
initSchema().then(() => {
    console.log('Database initialized.');
});

// Root test endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', system: 'TISS School Management System API' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/marks', markRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/cleanliness', cleanlinessRoutes);
app.use('/api/remarks', remarkRoutes);
app.use('/api/reports', reportRoutes);

// Serve Frontend Static Production Build
const frontendDist = path.resolve(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(frontendDist, 'index.html'));
    } else {
        res.status(404).json({ error: 'API endpoint not found' });
    }
});

// Start Express server
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 TISS School Portal Server is active!`);
    console.log(`🌐 Website URL: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
