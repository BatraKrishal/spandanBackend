import { Request, Response } from "express";
import { Participant } from "../models/participant.model";
import { User } from "../models/user.model";

export const registerParticipant = async (req: Request, res: Response) => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Fetch user email from DB
    const user = await User.findById(userId).select("email").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const {
      name,
      college,
      otherCollege,
      branch,
      otherBranch,
      year,
      event,
      teamLeader,
      teamMembers,
    } = req.body;

    if (!name || !college || !branch || !year || !event) {
      return res.status(400).json({
        success: false,
        message: "Name, college, branch, year, and event are required.",
      });
    }

    // Resolve effective college and branch values
    const effectiveCollege = college === "Others" ? otherCollege?.trim() || college : college;
    const effectiveBranch = branch === "Others" ? otherBranch?.trim() || branch : branch;

    if (college === "Others" && !otherCollege?.trim()) {
      return res.status(400).json({ success: false, message: "Please specify your college." });
    }
    if (branch === "Others" && !otherBranch?.trim()) {
      return res.status(400).json({ success: false, message: "Please specify your branch." });
    }

    const newParticipant = new Participant({
      userId,
      email: user.email,
      name,
      college: effectiveCollege,
      otherCollege: college === "Others" ? otherCollege : undefined,
      branch: effectiveBranch,
      otherBranch: branch === "Others" ? otherBranch : undefined,
      year,
      event,
      teamLeader,
      teamMembers: Array.isArray(teamMembers) ? teamMembers : [],
    });

    await newParticipant.save();

    return res.status(201).json({
      success: true,
      message: "Successfully registered for the event",
      participant: newParticipant,
    });
  } catch (error: any) {
    console.error("Error in registering participant:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during registration.",
    });
  }
};
