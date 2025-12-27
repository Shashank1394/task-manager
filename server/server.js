import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Task from "./models/Task.js";
import authRoutes from "./routes/auth.js";
import { verifyToken } from "./middleware/auth.js";

dotenv.config();

const app = express();
app.use(
  cors({
    origin: "https://task-manager-shashank.vercel.app",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use("/auth", authRoutes);

// Connect DB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("Mongo error:", err));

// Get tasks (with search & filter)
app.get("/tasks", verifyToken, async (req, res) => {
  try {
    const { search = "", filter = "all" } = req.query;
    const query = { userId: req.userId };

    if (search) {
      query.text = { $regex: search, $options: "i" };
    }

    if (filter === "completed") query.completed = true;
    if (filter === "pending") query.completed = false;

    const tasks = await Task.find(query).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add task
app.post("/tasks", verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text.trim())
      return res.status(400).json({ error: "Task cannot be empty" });

    const task = await Task.create({ userId: req.userId, text });
    res.status(201).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Toggle completed
app.patch("/tasks/:id/toggle", verifyToken, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });

    task.completed = !task.completed;
    await task.save();
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Edit task text
app.put("/tasks/:id", verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text.trim())
      return res.status(400).json({ error: "Task cannot be empty" });

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { text },
      { new: true, runValidators: true }
    );

    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete task
app.delete("/tasks/:id", verifyToken, async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!task)
      return res.status(403).json({ error: "Not allowed to delete this task" });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Clear completed tasks
app.delete("/tasks", verifyToken, async (req, res) => {
  try {
    await Task.deleteMany({ userId: req.userId, completed: true });
    res.json({ cleared: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get stats
app.get("/tasks/stats", verifyToken, async (req, res) => {
  try {
    const userQuery = { userId: req.userId };
    const total = await Task.countDocuments(userQuery);
    const completed = await Task.countDocuments({
      ...userQuery,
      completed: true,
    });
    const pending = total - completed;
    res.json({ total, completed, pending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server runnning on port ${process.env.PORT}`);
});
