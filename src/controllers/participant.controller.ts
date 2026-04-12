import { Request, Response } from "express";
import { Participant } from "../models/participant.model";

export const registerParticipant = async (req: Request, res: Response) => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { name, branch, year, event, teamMembers, teamLeader } = req.body;

    if (!name || !branch || !year || !event) {
      return res.status(400).json({ 
        success: false, 
        message: "Name, branch, year, and event are required." 
      });
    }

    const newParticipant = new Participant({
      userId,
      name,
      branch,
      year,
      event,
      teamMembers,
      teamLeader,
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
