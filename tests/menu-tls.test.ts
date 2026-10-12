import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { menuPoolConfig } from "../server/menu-store.js";
import { SUPABASE_ROOT_CA } from "../server/supabase-ca.js";

test("Supabase URL options cannot discard the trusted CA or disable verification", () => {
  for (const host of ["aws-0-ap-south-1.pooler.supabase.com", "db.example.supabase.co"]) {
    const client = new pg.Client(menuPoolConfig(`postgresql://user:password@${host}:6543/postgres?sslmode=require&application_name=pos`));
    const ssl = client.ssl;
    assert.ok(ssl && typeof ssl === "object");
    assert.equal(ssl.rejectUnauthorized, true);
    assert.ok(Array.isArray(ssl.ca) && ssl.ca.includes(SUPABASE_ROOT_CA));
  }
});

test("only Supabase hosts receive its CA; other remote hosts retain verified TLS", () => {
  const ssl = menuPoolConfig("postgresql://user:password@db.example.com/postgres?sslmode=disable").ssl;
  assert.deepEqual(ssl, { rejectUnauthorized: true });
  const deceptive = menuPoolConfig("postgresql://user:password@pooler.supabase.com.example.com/postgres").ssl;
  assert.deepEqual(deceptive, { rejectUnauthorized: true });
  assert.equal(menuPoolConfig("postgresql://user@127.0.0.1/postgres").ssl, false);
});
