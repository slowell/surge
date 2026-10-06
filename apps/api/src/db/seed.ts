// `pnpm db:seed`: demo members and drops. Idempotent: fixed ids, so re-running inserts nothing new.
// Re-running refreshes the time windows of drops that haven't started yet. A started drop's window is frozen
// (migration 0002), so it's left alone; reset the database for fresh demo times.
// All sponsors and rewards are invented (CLAUDE.md branding rules).
import { CreateDropRequest } from "@surge/shared";
import pg from "pg";

const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

const members = [
  { id: "00000000-0000-4000-8000-000000000001", handle: "fan_avery", tier: "plus" },
  { id: "00000000-0000-4000-8000-000000000002", handle: "fan_jordan", tier: "free" },
  { id: "00000000-0000-4000-8000-000000000003", handle: "fan_riley", tier: "free" },
  { id: "00000000-0000-4000-8000-000000000004", handle: "fan_casey", tier: "plus" },
];

const drops = [
  {
    id: "00000000-0000-4000-9000-000000000001",
    input: {
      title: "Launch Week Live Drop",
      sponsor: "Lumen Soda Co.",
      rewardName: "Glow-in-the-dark enamel pin",
      rewardImageUrl: "https://placehold.co/600x600/png?text=Enamel+Pin",
      totalQty: 10_000,
      startsAt: minutes(-5),
      endsAt: minutes(120),
      challenge: {
        question: "In today's video, what color was the mascot's scarf?",
        options: ["Teal", "Orange", "Purple", "Gold"],
        answerIndex: 0,
      },
    },
  },
  {
    id: "00000000-0000-4000-9000-000000000002",
    input: {
      title: "Behind the Scenes Drop",
      sponsor: "Parcel & Pine Outfitters",
      rewardName: "Members-only canvas tote",
      rewardImageUrl: "https://placehold.co/600x600/png?text=Canvas+Tote",
      totalQty: 500,
      startsAt: minutes(15),
      endsAt: minutes(75),
      challenge: {
        question: "How many cameras were on set in the behind-the-scenes clip?",
        options: ["One", "Two", "Three", "Five"],
        answerIndex: 2,
      },
      challengeSource: "ai_assisted" as const,
    },
  },
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env, or set it in the environment.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query("BEGIN");

  for (const m of members) {
    await client.query("INSERT INTO members (id, handle, tier) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [
      m.id,
      m.handle,
      m.tier,
    ]);
  }

  const outcome = { inserted: 0, refreshed: 0, keptStarted: 0 };
  for (const d of drops) {
    // Seed data goes through the same contract as POST /admin/drops.
    const drop = CreateDropRequest.parse(d.input);
    const { question, options, answerIndex } = drop.challenge;
    const { rows } = await client.query<{ inserted: boolean }>(
      `INSERT INTO drops (id, title, sponsor, reward_name, reward_image_url, total_qty, starts_at, ends_at, challenge, challenge_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at
         -- A started drop's window is frozen (migration 0002), so only refresh drops that haven't started.
         WHERE drops.starts_at > now()
       RETURNING (xmax = 0) AS inserted`,
      [
        d.id,
        drop.title,
        drop.sponsor,
        drop.rewardName,
        drop.rewardImageUrl,
        drop.totalQty,
        drop.startsAt,
        drop.endsAt,
        JSON.stringify({ question, options, answer_index: answerIndex }),
        drop.challengeSource,
      ],
    );
    const row = rows[0];
    if (!row) outcome.keptStarted++;
    else if (row.inserted) outcome.inserted++;
    else outcome.refreshed++;
  }

  await client.query("COMMIT");
  console.log(
    `Seeded ${members.length} members. Drops: ${outcome.inserted} inserted, ${outcome.refreshed} refreshed, ` +
      `${outcome.keptStarted} already started (window frozen; reset the database for fresh demo times).`,
  );
} catch (err) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(`Seed failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
