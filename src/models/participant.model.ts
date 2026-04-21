import { Schema, model, Types } from "mongoose";

export interface ITeamMember {
  name: string;
  college: string;
  otherCollege?: string;
  branch: string;
  otherBranch?: string;
  year: string;
}

export interface IParticipant {
  userId: Types.ObjectId;
  email: string;
  name: string;
  college: string;
  otherCollege?: string;
  branch: string;
  otherBranch?: string;
  year: string;
  event: string;
  teamLeader?: string;
  teamMembers?: ITeamMember[];
}

const teamMemberSchema = new Schema<ITeamMember>(
  {
    name: { type: String, required: true, trim: true },
    college: { type: String, required: true, trim: true },
    otherCollege: { type: String, trim: true },
    branch: { type: String, required: true, trim: true },
    otherBranch: { type: String, trim: true },
    year: { type: String, required: true },
  },
  { _id: false }
);

const participantSchema = new Schema<IParticipant>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    college: {
      type: String,
      required: true,
      trim: true,
    },
    otherCollege: {
      type: String,
      trim: true,
    },
    branch: {
      type: String,
      required: true,
      trim: true,
    },
    otherBranch: {
      type: String,
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
    teamLeader: {
      type: String,
      trim: true,
    },
    teamMembers: {
      type: [teamMemberSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const Participant = model<IParticipant>("Participant", participantSchema);
