// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config(); // Load .env file

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);

const users = {}; // Track connected users

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("register", (username) => {
    console.log(`${username} has joined the chat`);
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

  // Load chat history for the current user
  socket.on("load-messages", async () => {
    const messages = await Message.find({
      $or: [{ sender: socket.username }, { receiver: socket.username }],
    })
      .sort({ timestamp: 1 })
      .limit(50); // Load recent 50 messages
    socket.emit("chat-history", messages);
  });

  socket.on("private-message", async ({ receiver, text }) => {
    const message = { sender: socket.username, receiver, text };
    const receiverSocket = users[receiver];

    // Store message in MongoDB
    await Message.create(message);

    // Emit to the receiver if online, otherwise store only
    if (receiverSocket) {
      receiverSocket.emit("message", message);
    }

    // Send back to sender
    socket.emit("message", { ...message, sender: "You" });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    delete users[socket.username];
    socket.broadcast.emit(
      "user-disconnected",
      `${socket.username} has left the chat`
    );
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
