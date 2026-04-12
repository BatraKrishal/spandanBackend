import { Schema, model, Types } from "mongoose";

export interface IParticipant {
  userId: Types.ObjectId;
  name: string;
  branch: string;
  year: string;
  event: string;
  teamMembers?: string;
  teamLeader?: string;
}

const participantSchema = new Schema<IParticipant>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    branch: {
      type: String,
      required: true,
      trim: true,
    },
    year: {
      type: String,
      required: true,
    },
    event: {
      type: String,
      required: true,
    },
    teamMembers: {
      type: String,
      trim: true,
    },
    teamLeader: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Participant = model<IParticipant>("Participant", participantSchema);
