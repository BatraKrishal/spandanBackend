import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRouter from "./routes/auth.routes";
import userRouter from "./routes/user.routes";
import adminRouter from "./routes/admin.routes";
import participantRouter from "./routes/participant.routes";

const app = express();

app.set("trust proxy", 1);

app.use(cors({
  origin: [process.env.APP_URL || "http://localhost:5173", "http://localhost:8080"],
  credentials: true
}));

app.use(express.json());

app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/user", userRouter);
app.use("/admin", adminRouter);
app.use("/participant", participantRouter);

export default app;
