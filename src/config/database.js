const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/miracore');

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Create initial super admin if doesn't exist
    await createInitialSuperAdmin();
    
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    console.log('Continuing without database connection for testing...');
    // process.exit(1); // Commented out for testing
  }
};

const createInitialSuperAdmin = async () => {
  try {
    const User = require('../models/User');
    const superAdminExists = await User.findOne({ role: 'super_admin' });
    
    if (!superAdminExists) {
      const superAdmin = new User({
        username: 'superadmin',
        email: 'superadmin@emkopo.tz',
        password: 'SuperAdmin123!', // Will be hashed by pre-save hook
        role: 'super_admin',
        fullName: 'System Super Administrator',
        phone: '+255000000000'
      });
      
      await superAdmin.save();
      console.log('Initial Super Admin created:');
      console.log('   Username: superadmin');
      console.log('   Password: SuperAdmin123!');
      console.log('   Change this password immediately!');
    }
  } catch (error) {
    console.error('Error creating initial super admin:', error);
  }
};

module.exports = connectDB;