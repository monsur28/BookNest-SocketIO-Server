const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

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

// Track connected users and agents
const users = {}; // { username: socketId }
const agents = {}; // { agentName: socketId }
const agentsList = [
  "Abul Monsur Mohammad Kachru",
  "Md Fahim Hossain",
  "Mohammad Azad",
];

// Helper function to emit active users to agents
function emitActiveUsersToAgents() {
  const activeUsers = Object.keys(users);
  for (const agentSocketId of Object.values(agents)) {
    io.to(agentSocketId).emit("update-user-list", activeUsers);
  }
}

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Register users or agents
  socket.on("register", (username) => {
    socket.username = username;
    if (agentsList.includes(username)) {
      agents[username] = socket.id;
      emitActiveUsersToAgents(); // Update agents with active users
    } else {
      users[username] = socket.id;
      io.emit("update-user-list", Object.keys(users)); // Update all clients with active users
    }

    console.log("Connected Users:", users); // Debug log
    console.log("Connected Agents:", agents); // Debug log

    socket.emit("registered", username);
    socket.broadcast.emit("user-connected", `${username} has joined the chat`);
  });

  // Load chat history for the current user
  socket.on("load-messages", async () => {
    const messages = await Message.find({
      $or: [{ sender: socket.username }, { receiver: socket.username }],
    })
      .sort({ timestamp: 1 })
      .limit(50);
    socket.emit("chat-history", messages);
  });

  // Handle private messages
  socket.on("private-message", async ({ receiver, text }) => {
    const message = { sender: socket.username, receiver, text };

    // Save message to the database
    const newMessage = new Message(message);
    await newMessage.save();

    // If the receiver is "all," send to all users
    if (receiver === "all") {
      io.emit("message", message);
    } else {
      // Send to the specific receiver if online
      const receiverSocketId = users[receiver] || agents[receiver] || null;
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("message", message);
        console.log(`Message sent to ${receiver}:`, message); // Debug log
      } else {
        console.log(`Receiver ${receiver} not connected`); // Debug log
      }
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    if (agents[socket.username]) {
      delete agents[socket.username];
    } else {
      delete users[socket.username];
    }

    io.emit("update-user-list", Object.keys(users));
    io.emit("user-disconnected", `${socket.username} has left the chat`);
    console.log("Client disconnected:", socket.id);
  });
});

// Server listening
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
