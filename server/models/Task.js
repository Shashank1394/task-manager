import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("Task", TaskSchema);
