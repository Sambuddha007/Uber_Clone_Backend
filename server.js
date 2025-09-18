import express from "express";
import mongoose from "mongoose";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// MongoDB model
const rideSchema = new mongoose.Schema({
  pickup: String,
  dropoff: String,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now },
});
const Ride = mongoose.model("Ride", rideSchema);

// REST endpoint to create a ride
app.post("/api/rides", async (req, res) => {
  try {
    const { pickup, dropoff } = req.body;
    const ride = new Ride({ pickup, dropoff });
    await ride.save();

    // emit to any admin/dashboard listeners
    io.emit("newRide", ride);

    res.json(ride);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create ride" });
  }
});

// Socket.io for joining rides
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("joinRide", (rideId) => {
    socket.join(rideId);
    console.log(`Socket ${socket.id} joined ride ${rideId}`);
  });

  // Example: driver accepts ride
  socket.on("updateRide", async ({ rideId, status }) => {
    const ride = await Ride.findByIdAndUpdate(
      rideId,
      { status },
      { new: true }
    );
    io.to(rideId).emit("rideUpdate", ride);
  });
});

mongoose
  .connect("mongodb://127.0.0.1:27017/uberclone")
  .then(() => {
    server.listen(5000, () => {
      console.log("Backend running on http://localhost:5000");
    });
  })
  .catch((err) => console.error(err));

app.get("/", (req, res) => {
  res.send("🚖 Uber Clone Backend is running");
});

// Haversine formula for distance in km
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Fare estimation endpoint
app.post("/api/fare", (req, res) => {
  const { pickup, dropoff } = req.body;
  if (
    !pickup ||
    !dropoff ||
    typeof pickup.latitude !== "number" ||
    typeof pickup.longitude !== "number" ||
    typeof dropoff.latitude !== "number" ||
    typeof dropoff.longitude !== "number"
  ) {
    return res.status(400).json({ error: "Invalid coordinates" });
  }

  const distance = haversineDistance(
    pickup.latitude,
    pickup.longitude,
    dropoff.latitude,
    dropoff.longitude
  );
  const fare = 2 + distance * 1; // $2 base + $1/km

  res.json({ distance, fare });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
