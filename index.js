const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Log the frontend URL for debugging
console.log("Frontend URL:", process.env.FRONTEND_URL);

// Configure Socket.IO with CORS settings
const io = socketIo(server, {
  cors: {
    origin: "*", // Use environment variable or default to localhost
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json()); // To parse JSON requests

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("MongoDB connection error:", err));

// Message schema and model
const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);

// Track connected users
const users = {};

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("register", (username) => {
    if (!users[username]) {
      socket.username = username;
      users[username] = socket;
      socket.emit("registered", username);
      socket.broadcast.emit(
        "user-connected",
        `${username} has joined the chat`
      );
    }
  });

  socket.on("load-messages", async () => {
    const messages = await Message.find({
      $or: [{ sender: socket.username }, { receiver: socket.username }],
    })
      .sort({ timestamp: 1 })
      .limit(50);
    socket.emit("chat-history", messages);
  });

  socket.on("private-message", async ({ receiver, text }) => {
    const message = { sender: socket.username, receiver, text };
    const receiverSocket = users[receiver];

    await Message.create(message);

    if (receiverSocket) {
      receiverSocket.emit("message", message);
    }

    socket.emit("message", { ...message, sender: "You" });
  });

  socket.on("disconnect", () => {
    delete users[socket.username];
    socket.broadcast.emit(
      "user-disconnected",
      `${socket.username} has left the chat`
    );
  });
});

// Server listening
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
