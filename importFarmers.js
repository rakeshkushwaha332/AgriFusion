const mongoose = require('mongoose');
const csv = require('csv-parser');
const fs = require('fs');
const Farmer = require('./models/Farmer');

mongoose.connect('mongodb://127.0.0.1:27017/agrifusion', {
  serverSelectionTimeoutMS: 5000,
}).then(() => {
  console.log("🌱 Connected to MongoDB");
  importCSV();
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

function importCSV() {
  const farmers = [];
  fs.createReadStream('./public/assets/india_crop_locations.csv')
    .pipe(csv())
    .on('data', (row) => {
      if (row.latitude && row.longitude && row.farmerId) {
        farmers.push({
          state: row.state,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          crops: row.crops,
          farmerId: row.farmerId
        });
      }
    })
    .on('end', async () => {
      await Farmer.deleteMany(); // optional: clean old
      await Farmer.insertMany(farmers);
      console.log(`✅ Imported ${farmers.length} farmers`);
      process.exit();
    });
}

