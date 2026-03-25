const express = require("express");
const { Pool } = require("pg");
const Redis = require("ioredis");

const app = express();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,          // fix
  password: process.env.DB_PASSWORD,  // fix
  database: process.env.DB_NAME,      // fix
  port: 5432,
});

const redis = new Redis({ host: process.env.REDIS_HOST, port: 6379 });

app.get("/api/users", async (req, res) => {
  const db = await pool.connect(); // move out of try for proper scope

  try {
    const result = await db.query("SELECT NOW()");

    await redis.set("last_call", Date.now());
    res.json({ ok: true, time: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    db.release(); // ALWAYS release (fix leak)
  }
});

app.get("/status", async (req, res) => {
  try {
    await pool.query("SELECT 1");   // real health check
    await redis.ping();             // check Redis
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ status: "error" });
  }
});

app.listen(3000, () => console.log("API running on 3000"));
