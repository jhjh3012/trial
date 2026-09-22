import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, licenceTransfersTable } from "@workspace/db";

const router: IRouter = Router();

const cardFields = [
  "photo",
  "fullName",
  "licenceNumber",
  "expiryDate",
  "licenceType",
  "permitClass",
  "dateOfBirth",
  "address",
  "addressLine2",
  "signature",
  "signaturePhoto",
  "permitStatus",
  "issueDate",
  "p1EndDate",
  "proficiency",
  "otherDetails",
  "cardNumber",
  "ageStatus",
] as const;

function normalizedKeyword(value: unknown) {
  if (typeof value !== "string") return null;
  const keyword = value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  if (keyword.length < 3 || keyword.length > 64) return null;
  return keyword;
}

function keywordHash(keyword: string) {
  return createHash("sha256").update(keyword).digest("hex");
}

function validatedCard(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const payload: Record<string, string> = {};
  for (const field of cardFields) {
    if (typeof source[field] !== "string") return null;
    payload[field] = source[field];
  }
  return payload;
}

router.post("/licence-transfers/save", async (req, res) => {
  const keyword = normalizedKeyword(req.body?.keyword);
  const payload = validatedCard(req.body?.card);
  if (!keyword || !payload) {
    return res.status(400).json({ message: "Enter a valid keyword and complete licence details." });
  }

  await db
    .insert(licenceTransfersTable)
    .values({ keywordHash: keywordHash(keyword), payload })
    .onConflictDoUpdate({
      target: licenceTransfersTable.keywordHash,
      set: { payload, updatedAt: new Date() },
    });

  return res.json({ message: "Licence details saved to this keyword." });
});

router.post("/licence-transfers/load", async (req, res) => {
  const keyword = normalizedKeyword(req.body?.keyword);
  if (!keyword) {
    return res.status(400).json({ message: "Enter a valid keyword." });
  }

  const [saved] = await db
    .select({ payload: licenceTransfersTable.payload })
    .from(licenceTransfersTable)
    .where(eq(licenceTransfersTable.keywordHash, keywordHash(keyword)))
    .limit(1);

  if (!saved) {
    return res.status(404).json({ message: "No saved licence details were found for that keyword." });
  }

  return res.json({ card: saved.payload });
});

router.post("/licence-verifications", async (req, res) => {
  const payload = validatedCard(req.body?.card);
  if (!payload) {
    return res.status(400).json({ message: "Complete licence details are required." });
  }

  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + 120_000).toISOString();
  await db.insert(licenceTransfersTable).values({
    keywordHash: keywordHash(`verification:${token}`),
    payload: { ...payload, __expiresAt: expiresAt },
  });

  return res.status(201).json({ token, expiresAt });
});

router.get("/licence-verifications/:token", async (req, res) => {
  const token = req.params.token;
  if (!/^[A-Za-z0-9_-]{24}$/.test(token)) {
    return res.status(400).json({ message: "Invalid verification link." });
  }

  const [saved] = await db
    .select({ payload: licenceTransfersTable.payload })
    .from(licenceTransfersTable)
    .where(eq(licenceTransfersTable.keywordHash, keywordHash(`verification:${token}`)))
    .limit(1);

  if (!saved) {
    return res.status(404).json({ message: "Verification details were not found." });
  }
  const expiresAt = Date.parse(saved.payload.__expiresAt || "");
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return res.status(410).json({ message: "This verification QR code has expired." });
  }

  const payload = validatedCard(saved.payload);
  if (!payload) {
    return res.status(500).json({ message: "Saved verification details are invalid." });
  }
  return res.json({ card: payload });
});

export default router;