import { Request, Response } from "express";
import { loginSchema, registerSchema } from "./auth.schema";
import { User } from "../../models/user.model";
import { checkPassword, hashPassword } from "../../lib/hash";
import { sendEmail } from "../../lib/email";
import {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from "../../lib/token";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { storeOAuthCode, consumeOAuthCode } from "../../lib/oauthCodes";
import { authenticator } from "otplib";

function getAppUrl() {
  return process.env.APP_URL || `http://localhost:${process.env.PORT}`;
}

function getGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    throw new Error("Google client id and secret both are missing");
  }

  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri,
  });
}

export async function registerHandler(req: Request, res: Response) {
  try {
    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid data!",
        errors: result.error.flatten(),
      });
    }

    const { name, email, password } = result.data;

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        message: "Email is already in use! Please try with a different email",
      });
    }

    const passwordHash = await hashPassword(password);

    const newlyCreatedUser = await User.create({
      email: normalizedEmail,
      passwordHash,
      role: "user",
      isEmailVerified: true, // auto-verified — no email verification required
      twoFactorEnabled: false,
      name,
    });

    return res.status(201).json({
      message: "User registered",
      user: {
        id: newlyCreatedUser.id,
        email: newlyCreatedUser.email,
        role: newlyCreatedUser.role,
        isEmailVerified: newlyCreatedUser.isEmailVerified,
      },
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function verifyEmailHandler(req: Request, res: Response) {
  const token = req.query.token as string | undefined;

  if (!token) {
    return res.status(400).json({ message: "Verification token is missing" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as {
      sub: string;
    };

    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (user.isEmailVerified) {
      return res.json({ message: "Email is already verified" });
    }

    user.isEmailVerified = true;
    await user.save();

    return res.json({ message: "Email is now verified! You can login" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function loginHandler(req: Request, res: Response) {
  try {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid data!",
        errors: result.error.flatten(),
      });
    }

    const { email, password, twoFactorCode } = result.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const ok = await checkPassword(password, user.passwordHash);

    if (!ok) {
      return res.status(400).json({ message: "Invalid password" });
    }

    // Email verification is bypassed — all users can log in immediately

    if (user.twoFactorEnabled) {
      if (!twoFactorCode || typeof twoFactorCode !== "string") {
        return res.status(400).json({
          message: "Two factor code is required",
        });
      }

      if (!user.twoFactorSecret) {
        return res.status(400).json({
          message: "Two factor miscofigured for this accounr",
        });
      }

      //  verify the code using otpLib

      const isValidCode = authenticator.check(
        twoFactorCode,
        user.twoFactorSecret
      );

      if (!isValidCode) {
        return res.status(400).json({
          message: "Invalid two factor code",
        });
      }
    }

    const accessToken = createAccessToken(
      user.id,
      user.role,
      user.tokenVersion
    );

    const refreshToken = createRefreshToken(user.id, user.tokenVersion);

    const isProd = process.env.NODE_ENV === "production";

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Send welcome/login email
    try {
      sendEmail(
        user.email,
        "Welcome to Spandan - New Login Detected",
        `<div style="font-family: sans-serif; p-4;">
          <h2>Welcome back to Spandan, ${user.name || 'User'}!</h2>
          <p>We just noticed a new login to your account. If this was you, you can safely ignore this email.</p>
          <p>Get ready for an amazing experience with the pulse of neon!</p>
          <br />
          <p>Best,<br/>The Spandan Team</p>
        </div>`
      ).catch(e => console.error("Could not send login email", e));
    } catch(err) {
      // ignore
    }

    return res.status(200).json({
      message: "Login successfully done",
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function refreshHandler(req: Request, res: Response) {
  try {
    const token = req.cookies?.refreshToken as string | undefined;

    if (!token) {
      return res.status(401).json({ message: "Refresh token missing" });
    }

    const payload = verifyRefreshToken(token);

    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      return res.status(401).json({ message: "Refresh token invalidated" });
    }

    const newAccessToken = createAccessToken(
      user.id,
      user.role,
      user.tokenVersion
    );

    const newRefreshToken = createRefreshToken(user.id, user.tokenVersion);

    const isProd = process.env.NODE_ENV === "production";

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Token refreshed",
      accessToken: newAccessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function logoutHandler(_req: Request, res: Response) {
  const isProd = process.env.NODE_ENV === "production";

  res.clearCookie("refreshToken", {
    path: "/",
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
  });

  return res.status(200).json({
    message: "Logged out",
  });
}

export async function forgotPasswordHandler(req: Request, res: Response) {
  const { email } = req.body as { email?: string };

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }
  const normalizedEmail = email.toLowerCase().trim();

  try {
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.json({
        message:
          "If an account with this email exists, we will send you a reset link",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    user.resetPasswordToken = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await user.save();

    const resetUrl = `${getAppUrl()}/auth/reset-password?token=${rawToken}`;

    await sendEmail(
      user.email,
      "Reset your password",
      `
        <p>You requested password reset.Click on the below link to reset the password</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        `
    );

    return res.json({
      message:
        "If an account with this email exists, we will send you a reset link",
    });
  } catch (e) {
    console.log(e);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const { token, password } = req.body as { token?: string; password?: string };

  if (!token) {
    return res.status(400).json({ message: "Reset token is missing" });
  }

  if (!password || password.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be atleast 6 char long" });
  }

  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { $gt: new Date() }, // expiry must be in future
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const newPasswordHash = await hashPassword(password);
    user.passwordHash = newPasswordHash;

    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    user.tokenVersion = user.tokenVersion + 1;

    await user.save();

    return res.json({
      message: "Password reset successfully!",
    });
  } catch (err) {
    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function googleAuthStartHandler(_req: Request, res: Response) {
  try {
    const client = getGoogleClient();

    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["openid", "email", "profile"],
    });

    return res.redirect(url);
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function googleAuthCallbackHandler(req: Request, res: Response) {
  const code = req.query.code as string | undefined;

  if (!code) {
    return res.status(400).json({
      message: "Missing code in callback",
    });
  }

  const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:5173";

  try {
    const client = getGoogleClient();

    const { tokens } = await client.getToken(code);

    if (!tokens.id_token) {
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }

    // Verify id_token and read user info from it
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID as string,
    });

    const payload = ticket.getPayload();

    const email = payload?.email;
    const emailVerified = payload?.email_verified;

    if (!email || !emailVerified) {
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }

    const normalizedEmail = email.toLowerCase().trim();

    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      const randomPassword = crypto.randomBytes(16).toString("hex");
      const passwordHash = await hashPassword(randomPassword);

      user = await User.create({
        email: normalizedEmail,
        name: payload?.name || payload?.given_name || "",
        passwordHash,
        role: "user",
        isEmailVerified: true,
        twoFactorEnabled: false,
      });
    } else {
      // Backfill name if missing (e.g. user registered before Google auth)
      if (!user.isEmailVerified) {
        user.isEmailVerified = true;
      }
      if (!user.name && (payload?.name || payload?.given_name)) {
        user.name = payload?.name || payload?.given_name || "";
      }
      await user.save();
    }

    // Send welcome/login email (fire-and-forget)
    sendEmail(
      user.email,
      "Welcome to Spandan - Access Granted",
      `<div style="font-family: sans-serif; padding: 16px;">
        <h2>Welcome to Spandan, ${user.name || "User"}!</h2>
        <p>You have successfully logged in using your Google Account.</p>
        <p>Get ready for an amazing experience with the pulse of neon!</p>
        <br />
        <p>Best,<br/>The Spandan Team</p>
      </div>`
    ).catch((e) => console.error("Could not send google login email", e));

    // Generate a short-lived one-time code instead of setting a cookie here.
    // Cookies set during a cross-site redirect chain are blocked by Brave and
    // increasingly by other browsers. The frontend will exchange this code via
    // a direct credentialed POST, which browsers treat as a legitimate request.
    const oauthCode = crypto.randomBytes(32).toString("hex");
    storeOAuthCode(oauthCode, { userId: user.id, tokenVersion: user.tokenVersion });

    return res.redirect(`${frontendUrl}?code=${oauthCode}`);
  } catch (err) {
    console.log(err);
    return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
  }
}

/**
 * POST /auth/exchange-code
 * Exchanges a short-lived one-time OAuth code for real tokens.
 * The refreshToken is set as an HttpOnly cookie (safe because this is a
 * direct credentialed CORS request, not a cross-site redirect).
 */
export async function exchangeCodeHandler(req: Request, res: Response) {
  const { code } = req.body as { code?: string };

  if (!code || typeof code !== "string") {
    return res.status(400).json({ message: "OAuth code is required" });
  }

  const codeData = consumeOAuthCode(code);

  if (!codeData) {
    return res.status(400).json({ message: "Invalid or expired OAuth code" });
  }

  try {
    const user = await User.findById(codeData.userId);

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    // Guard against stale codes (e.g. if tokenVersion changed since code was issued)
    if (user.tokenVersion !== codeData.tokenVersion) {
      return res.status(400).json({ message: "OAuth code is no longer valid" });
    }

    const accessToken = createAccessToken(user.id, user.role as "user" | "admin", user.tokenVersion);
    const refreshToken = createRefreshToken(user.id, user.tokenVersion);

    const isProd = process.env.NODE_ENV === "production";

    // Set the refreshToken cookie here — this is a direct credentialed XHR so
    // Brave (and other privacy-focused browsers) will accept and store the cookie.
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "OAuth exchange successful",
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function twoFASetuphandler(req: Request, res: Response) {
  const authReq = req as any;
  const authUser = authReq.user;

  if (!authUser) {
    return res.status(401).json({
      message: "Not authenticated",
    });
  }

  try {
    const user = await User.findById(authUser.id);
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const secret = authenticator.generateSecret();

    const issuer = "NodeAdvancedAuthApp";

    const otpAuthUrl = authenticator.keyuri(user.email, issuer, secret);

    user.twoFactorSecret = secret;
    user.twoFactorEnabled = false;

    await user.save();

    return res.json({
      message: "2FA setup is done",
      otpAuthUrl,
      secret,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

export async function twoFAVerifyHandler(req: Request, res: Response) {
  const authReq = req as any;
  const authUser = authReq.user;

  if (!authUser) {
    return res.status(401).json({
      message: "Not authenticated",
    });
  }

  const { code } = req.body as { code?: string };

  if (!code) {
    return res.status(400).json({
      message: "Two factor code is required",
    });
  }

  try {
    const user = await User.findById(authUser.id);
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (!user.twoFactorSecret) {
      return res.status(400).json({
        message: "You dont have 2fa setup yet.",
      });
    }

    const isValid = authenticator.check(code, user.twoFactorSecret);

    if (!isValid) {
      return res.status(400).json({
        message: "Invalid two factor code",
      });
    }

    user.twoFactorEnabled = true;
    await user.save();

    return res.json({
      message: "2FA enabled successfully",
      twoFactorEnabled: true,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
}
