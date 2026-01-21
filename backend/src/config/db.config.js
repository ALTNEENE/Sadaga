import pkg from 'pg'

const pool = new pkg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
})

export default pool

// import mongoose from "mongoose";

// const connectDatabase = async () => {
//   try {
//     await mongoose.connect(process.env.MONGO_URI, {
//       ssl: true,
//     });
//     console.log("Connected to Mongo database");
//   } catch (error) {
//     console.log("Error connecting to Mongo database", error);
//     process.exit(1);
//   }
// };

// export default connectDatabase;

