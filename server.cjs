var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// instrument.ts
var import_config = require("dotenv/config");
var Sentry = __toESM(require("@sentry/node"), 1);
var SENTRY_DSN = process.env.SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
    tracesSampleRate: 0.1
    // 성능 추적은 10%만 샘플링 (에러 보고 자체는 100% 그대로 다 됨)
  });
  console.log("[Sentry] \uC5D0\uB7EC \uBAA8\uB2C8\uD130\uB9C1\uC774 \uD65C\uC131\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
} else {
  console.log("[Sentry] SENTRY_DSN \uD658\uACBD\uBCC0\uC218\uAC00 \uC5C6\uC5B4 \uC5D0\uB7EC \uBAA8\uB2C8\uD130\uB9C1\uC774 \uBE44\uD65C\uC131\uD654\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
}

// server.ts
var import_express = __toESM(require("express"), 1);
var import_helmet = __toESM(require("helmet"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_swagger_ui_express = __toESM(require("swagger-ui-express"), 1);
var import_swagger_jsdoc = __toESM(require("swagger-jsdoc"), 1);
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
var import_crypto2 = __toESM(require("crypto"), 1);
var import_genai = require("@google/genai");
var XLSX = __toESM(require("xlsx"), 1);
var import_archiver = __toESM(require("archiver"), 1);
var import_vite = require("vite");

// src/authLogic.ts
function scopeIdForUser(user) {
  if (user.type === "company") {
    const bNum = (user.businessNumber || "").trim();
    return `company:${bNum}`;
  }
  return `individual:${user.id}`;
}
function decideSignupRoleAndApproval(type, hasExistingCompanyUser) {
  if (type !== "company") {
    return { role: void 0, approvalStatus: void 0 };
  }
  if (hasExistingCompanyUser) {
    return { role: "member", approvalStatus: "pending" };
  }
  return { role: "admin", approvalStatus: "approved" };
}
function isEmailVerified(emailVerified) {
  return emailVerified !== false;
}

// src/groupUtils.ts
function getContactGroupIds(contact) {
  if (contact.groupIds && contact.groupIds.length > 0) return contact.groupIds;
  if (contact.groupId) return [contact.groupId];
  return [];
}

// src/rateLimiter.ts
var RateLimiter = class {
  constructor(options) {
    this.attempts = /* @__PURE__ */ new Map();
    this.maxAttempts = options.maxAttempts;
    this.windowMs = options.windowMs;
    this.lockoutMs = options.lockoutMs;
    this.now = options.now || (() => Date.now());
    this.cleanupIntervalId = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1e3);
  }
  // [추가] window를 벗어난 오래된 항목 삭제
  cleanup() {
    const now = this.now();
    const keysToDelete = [];
    this.attempts.forEach((entry, key) => {
      if (now - entry.firstAttemptAt > this.windowMs) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => {
      this.attempts.delete(key);
    });
    if (keysToDelete.length > 0) {
      console.log(`[RateLimiter] ${keysToDelete.length}\uAC1C\uC758 \uB9CC\uB8CC\uB41C \uD56D\uBAA9 \uC815\uB9AC \uC644\uB8CC`);
    }
  }
  // [추가] cleanup 인터벌 정리 (서버 종료 시)
  destroy() {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
    }
  }
  check(key) {
    const entry = this.attempts.get(key);
    if (!entry) return { allowed: true };
    const now = this.now();
    if (entry.lockedUntil && entry.lockedUntil > now) {
      return { allowed: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1e3) };
    }
    if (now - entry.firstAttemptAt > this.windowMs) {
      this.attempts.delete(key);
      return { allowed: true };
    }
    if (!this.lockoutMs && entry.count >= this.maxAttempts) {
      return { allowed: false, retryAfterSec: Math.ceil((entry.firstAttemptAt + this.windowMs - now) / 1e3) };
    }
    return { allowed: true };
  }
  // 실패(또는 시도) 1회를 기록한다. 로그인처럼 "실패만 센다"면 실패 시에만 호출하고,
  // 가입/비번찾기처럼 "요청 자체를 센다"면 매 요청마다 호출한다.
  registerAttempt(key) {
    const now = this.now();
    const entry = this.attempts.get(key);
    if (!entry || now - entry.firstAttemptAt > this.windowMs) {
      this.attempts.set(key, { count: 1, firstAttemptAt: now });
      return;
    }
    entry.count += 1;
    if (this.lockoutMs && entry.count >= this.maxAttempts) {
      entry.lockedUntil = now + this.lockoutMs;
    }
  }
  // 로그인 성공처럼, 성공하면 지금까지의 실패 기록을 지워야 하는 경우에 사용.
  reset(key) {
    this.attempts.delete(key);
  }
};

// src/billing.ts
var import_crypto = __toESM(require("crypto"), 1);
var TOSS_API_BASE = "https://api.tosspayments.com/v1";
function tossAuthHeader(secretKey) {
  return "Basic " + Buffer.from(`${secretKey}:`).toString("base64");
}
function generateCustomerKey() {
  return import_crypto.default.randomBytes(16).toString("hex");
}
function generateOrderId() {
  return import_crypto.default.randomBytes(10).toString("hex");
}
async function issueBillingKey(secretKey, authKey, customerKey) {
  const res = await fetch(`${TOSS_API_BASE}/billing/authorizations/issue`, {
    method: "POST",
    headers: {
      Authorization: tossAuthHeader(secretKey),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ authKey, customerKey })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || "\uCE74\uB4DC \uB4F1\uB85D(\uBE4C\uB9C1\uD0A4 \uBC1C\uAE09)\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
  }
  return data;
}
async function chargeBilling(secretKey, billingKey, params) {
  const res = await fetch(`${TOSS_API_BASE}/billing/${billingKey}`, {
    method: "POST",
    headers: {
      Authorization: tossAuthHeader(secretKey),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(params)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || "\uACB0\uC81C \uC2B9\uC778\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
  }
  return data;
}
function addOneMonth(from) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
}

// src/db/supabaseStore.ts
var import_supabase_js = require("@supabase/supabase-js");
var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[supabaseStore] SUPABASE_URL \uB610\uB294 SUPABASE_SERVICE_ROLE_KEY \uD658\uACBD\uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. .env \uD30C\uC77C\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694. (.env.example \uCC38\uACE0)"
  );
}
var supabase = (0, import_supabase_js.createClient)(
  SUPABASE_URL || "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY || "local-development-placeholder-key"
);
var CARD_IMAGES_BUCKET = "card-images";
async function getPlatformStats() {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase.from("scoped_items").select("scope_id, collection, updated_at");
    if (error) {
      console.error("getPlatformStats \uC870\uD68C \uC2E4\uD328:", error);
      return [];
    }
    const byScope = /* @__PURE__ */ new Map();
    for (const row of data || []) {
      const scopeId = row.scope_id;
      if (!scopeId) continue;
      if (!byScope.has(scopeId)) {
        byScope.set(scopeId, { scopeId, itemCounts: {}, totalItems: 0, lastActivity: null });
      }
      const entry = byScope.get(scopeId);
      entry.itemCounts[row.collection] = (entry.itemCounts[row.collection] || 0) + 1;
      entry.totalItems += 1;
      if (row.updated_at && (!entry.lastActivity || row.updated_at > entry.lastActivity)) {
        entry.lastActivity = row.updated_at;
      }
    }
    return Array.from(byScope.values());
  } catch (err) {
    console.error("getPlatformStats \uC608\uC678:", err);
    return [];
  }
}
async function uploadDataUrlImage(scopeId, dataUrl, keyHint, category = "cards") {
  if (!isSupabaseConfigured) return null;
  const match = dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!match) return null;
  const [, mime, base64Data] = match;
  const extFromMime = mime.split("/")[1] || "jpg";
  const ext = extFromMime === "jpeg" ? "jpg" : extFromMime;
  const safeScopeId = scopeId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeKeyHint = keyHint.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = `${category}/${safeScopeId}/${safeKeyHint}-${Date.now()}.${ext}`;
  try {
    const buffer = Buffer.from(base64Data, "base64");
    const { error } = await supabase.storage.from(CARD_IMAGES_BUCKET).upload(filePath, buffer, { contentType: mime, upsert: true });
    if (error) {
      console.error(`uploadDataUrlImage(${filePath}) error:`, error);
      return null;
    }
    const TEN_YEARS_IN_SECONDS = 60 * 60 * 24 * 365 * 10;
    const { data, error: signError } = await supabase.storage.from(CARD_IMAGES_BUCKET).createSignedUrl(filePath, TEN_YEARS_IN_SECONDS);
    if (signError) {
      console.error(`uploadDataUrlImage(${filePath}) \uC11C\uBA85 URL \uBC1C\uAE09 \uC2E4\uD328:`, signError);
      return null;
    }
    return data?.signedUrl || null;
  } catch (err) {
    console.error(`uploadDataUrlImage(${filePath}) exception:`, err);
    return null;
  }
}
async function uploadDataUrlFile(scopeId, dataUrl, keyHint, category = "attachments", originalFileName) {
  if (!isSupabaseConfigured) return null;
  const match = dataUrl.match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/);
  if (!match) return null;
  const [, mime, base64Data] = match;
  let ext = "bin";
  if (originalFileName && originalFileName.includes(".")) {
    const fromName = originalFileName.split(".").pop() || "";
    ext = fromName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "bin";
  } else {
    const extFromMime = (mime.split("/")[1] || "bin").split("+")[0].split(";")[0];
    ext = (extFromMime === "jpeg" ? "jpg" : extFromMime).replace(/[^a-z0-9]/gi, "").slice(0, 10) || "bin";
  }
  const safeScopeId = scopeId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeKeyHint = keyHint.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = `${category}/${safeScopeId}/${safeKeyHint}-${Date.now()}.${ext}`;
  try {
    const buffer = Buffer.from(base64Data, "base64");
    const { error } = await supabase.storage.from(CARD_IMAGES_BUCKET).upload(filePath, buffer, { contentType: mime, upsert: true });
    if (error) {
      console.error(`uploadDataUrlFile(${filePath}) error:`, error);
      return null;
    }
    const TEN_YEARS_IN_SECONDS = 60 * 60 * 24 * 365 * 10;
    const { data, error: signError } = await supabase.storage.from(CARD_IMAGES_BUCKET).createSignedUrl(filePath, TEN_YEARS_IN_SECONDS);
    if (signError) {
      console.error(`uploadDataUrlFile(${filePath}) \uC11C\uBA85 URL \uBC1C\uAE09 \uC2E4\uD328:`, signError);
      return null;
    }
    return data?.signedUrl || null;
  } catch (err) {
    console.error(`uploadDataUrlFile(${filePath}) exception:`, err);
    return null;
  }
}
async function ensureUsersSeeded(initialUsers2) {
  if (!isSupabaseConfigured) return;
  try {
    const { count, error: countError } = await supabase.from("app_users").select("id", { count: "exact", head: true });
    if (countError) throw countError;
    if (!count) {
      console.log("Seeding initial users to Supabase...");
      const rows = initialUsers2.map((u) => ({ id: u.id, data: u }));
      const { error } = await supabase.from("app_users").upsert(rows, { onConflict: "id" });
      if (error) throw error;
    }
  } catch (error) {
    console.error("Error seeding users:", error);
  }
}
async function ensureScopeInitialized(scopeId, initialData) {
  if (!isSupabaseConfigured) return;
  try {
    const { data: metaRow, error: metaError } = await supabase.from("scopes").select("scope_id").eq("scope_id", scopeId).maybeSingle();
    if (metaError) throw metaError;
    if (!metaRow) {
      const { count: existingCount, error: existingError } = await supabase.from("scoped_items").select("doc_id", { count: "exact", head: true }).eq("scope_id", scopeId);
      if (existingError) throw existingError;
      if (existingCount && existingCount > 0) {
        console.log(`Scope ${scopeId} already has data but no 'initialized' marker \u2014 backfilling marker without reseeding.`);
        await supabase.from("scopes").insert({ scope_id: scopeId, initialized: true });
        return;
      }
      console.log(`Seeding initial data for scope: ${scopeId}`);
      const { error: insertMetaError } = await supabase.from("scopes").insert({ scope_id: scopeId, initialized: true });
      if (insertMetaError) throw insertMetaError;
      const bulk = [];
      initialData.contacts.forEach((item) => bulk.push({ scope_id: scopeId, collection: "contacts", doc_id: item.id, data: item }));
      initialData.projects.forEach((item) => bulk.push({ scope_id: scopeId, collection: "projects", doc_id: item.id, data: item }));
      initialData.groups.forEach((item) => bulk.push({ scope_id: scopeId, collection: "groups", doc_id: item.id, data: item }));
      bulk.push({ scope_id: scopeId, collection: "myProfile", doc_id: "profile", data: initialData.myProfile });
      initialData.vehicles.forEach((item) => bulk.push({ scope_id: scopeId, collection: "vehicles", doc_id: item.id, data: item }));
      initialData.drivingLogs.forEach((item) => bulk.push({ scope_id: scopeId, collection: "drivingLogs", doc_id: item.id, data: item }));
      initialData.expenses.forEach((item) => bulk.push({ scope_id: scopeId, collection: "expenses", doc_id: item.id, data: item }));
      initialData.maintenances.forEach((item) => bulk.push({ scope_id: scopeId, collection: "maintenances", doc_id: item.id, data: item }));
      initialData.maintenanceIntervals.forEach((item) => bulk.push({ scope_id: scopeId, collection: "maintenanceIntervals", doc_id: item.id, data: item }));
      initialData.dailyLogs.forEach((item) => bulk.push({ scope_id: scopeId, collection: "dailyLogs", doc_id: item.id, data: item }));
      initialData.weeklyLogs.forEach((item) => bulk.push({ scope_id: scopeId, collection: "weeklyLogs", doc_id: item.id, data: item }));
      if (bulk.length) {
        const { error: bulkError } = await supabase.from("scoped_items").upsert(bulk, { onConflict: "scope_id,collection,doc_id", ignoreDuplicates: true });
        if (bulkError) throw bulkError;
      }
    }
  } catch (error) {
    console.error(`Error ensuring scope ${scopeId} is initialized:`, error);
  }
}
async function getScopedCollection(scopeId, collectionName) {
  if (!isSupabaseConfigured) return [];
  const PAGE_SIZE = 1e3;
  const allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from("scoped_items").select("data").eq("scope_id", scopeId).eq("collection", collectionName).order("doc_id", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`getScopedCollection(${scopeId}, ${collectionName}) error:`, error);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows.map((row) => row.data);
}
async function getScopedDoc(scopeId, collectionName, docId) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.from("scoped_items").select("data").eq("scope_id", scopeId).eq("collection", collectionName).eq("doc_id", docId).maybeSingle();
  if (error) {
    console.error(`getScopedDoc(${scopeId}, ${collectionName}, ${docId}) error:`, error);
    return null;
  }
  return data ? data.data : null;
}
async function setScopedDoc(scopeId, collectionName, item) {
  if (!isSupabaseConfigured) return true;
  const { error } = await supabase.from("scoped_items").upsert(
    { scope_id: scopeId, collection: collectionName, doc_id: item.id, data: item, updated_at: (/* @__PURE__ */ new Date()).toISOString() },
    { onConflict: "scope_id,collection,doc_id" }
  );
  if (error) {
    console.error(`setScopedDoc(${scopeId}, ${collectionName}, ${item.id}) error:`, error);
    return false;
  }
  return true;
}
async function setScopedDocs(scopeId, collectionName, items) {
  if (!isSupabaseConfigured) return true;
  if (!items.length) return true;
  const rows = items.map((item) => ({
    scope_id: scopeId,
    collection: collectionName,
    doc_id: item.id,
    data: item,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }));
  const { error } = await supabase.from("scoped_items").upsert(rows, { onConflict: "scope_id,collection,doc_id" });
  if (error) {
    console.error(`setScopedDocs(${scopeId}, ${collectionName}) error:`, error);
    return false;
  }
  return true;
}
async function setScopedProfile(scopeId, profile) {
  if (!isSupabaseConfigured) return true;
  const { error } = await supabase.from("scoped_items").upsert(
    { scope_id: scopeId, collection: "myProfile", doc_id: "profile", data: profile, updated_at: (/* @__PURE__ */ new Date()).toISOString() },
    { onConflict: "scope_id,collection,doc_id" }
  );
  if (error) {
    console.error(`setScopedProfile(${scopeId}) error:`, error);
    return false;
  }
  return true;
}
async function findProfileByShareSlug(slug) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.from("scoped_items").select("scope_id, data").eq("collection", "myProfile").eq("data->>shareSlug", slug).maybeSingle();
  if (error) {
    console.error(`findProfileByShareSlug(${slug}) error:`, error);
    return null;
  }
  if (!data) return null;
  return { scopeId: data.scope_id, profile: data.data };
}
async function deleteScopedDoc(scopeId, collectionName, docId) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("scoped_items").delete().eq("scope_id", scopeId).eq("collection", collectionName).eq("doc_id", docId);
  if (error) console.error(`deleteScopedDoc(${scopeId}, ${collectionName}, ${docId}) error:`, error);
}
async function replaceScopedCollection(scopeId, collectionName, items) {
  if (!isSupabaseConfigured) return;
  if (items.length === 0) {
    const { error: deleteError2 } = await supabase.from("scoped_items").delete().eq("scope_id", scopeId).eq("collection", collectionName);
    if (deleteError2) console.error(`replaceScopedCollection delete-all(${scopeId}, ${collectionName}) error:`, deleteError2);
    return;
  }
  const currentIds = items.map((item) => item.id);
  const { error: deleteError } = await supabase.from("scoped_items").delete().eq("scope_id", scopeId).eq("collection", collectionName).not("doc_id", "in", `(${currentIds.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(",")})`);
  if (deleteError) {
    console.error(`replaceScopedCollection delete-stale(${scopeId}, ${collectionName}) error:`, deleteError);
    return;
  }
  const rows = items.map((item) => ({
    scope_id: scopeId,
    collection: collectionName,
    doc_id: item.id,
    data: item,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }));
  const { error: upsertError } = await supabase.from("scoped_items").upsert(rows, { onConflict: "scope_id,collection,doc_id" });
  if (upsertError) console.error(`replaceScopedCollection upsert(${scopeId}, ${collectionName}) error:`, upsertError);
}
async function getUsers() {
  if (!isSupabaseConfigured) return [];
  const PAGE_SIZE = 1e3;
  const allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from("app_users").select("data").order("id", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("getUsers error:", error);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows.map((row) => row.data);
}
async function addUser(user) {
  if (!isSupabaseConfigured) return true;
  const { error } = await supabase.from("app_users").upsert({ id: user.id, data: user }, { onConflict: "id" });
  if (error) {
    console.error(`addUser(${user.id}) error:`, error);
    return false;
  }
  return true;
}
async function deleteUser(userId) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("app_users").delete().eq("id", userId);
  if (error) console.error(`deleteUser(${userId}) error:`, error);
}
async function deleteScopeCompletely(scopeId) {
  if (!isSupabaseConfigured) return;
  const { error: itemsError } = await supabase.from("scoped_items").delete().eq("scope_id", scopeId);
  if (itemsError) console.error(`deleteScopeCompletely(${scopeId}) scoped_items error:`, itemsError);
  const { error: scopeError } = await supabase.from("scopes").delete().eq("scope_id", scopeId);
  if (scopeError) console.error(`deleteScopeCompletely(${scopeId}) scopes error:`, scopeError);
}
async function saveSession(token, userId, expiresAt) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("app_sessions").upsert(
    { token, user_id: userId, expires_at: new Date(expiresAt).toISOString() },
    { onConflict: "token" }
  );
  if (error) console.error(`saveSession(${token.slice(0, 8)}...) error:`, error);
}
async function loadSession(token) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.from("app_sessions").select("token, user_id, expires_at").eq("token", token).maybeSingle();
  if (error) {
    console.error(`loadSession(${token.slice(0, 8)}...) error:`, error);
    return null;
  }
  if (!data) return null;
  return { token: data.token, userId: data.user_id, expiresAt: new Date(data.expires_at).getTime() };
}
async function deleteSession(token) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("app_sessions").delete().eq("token", token);
  if (error) console.error(`deleteSession(${token.slice(0, 8)}...) error:`, error);
}
async function deleteAllSessionsForUser(userId) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("app_sessions").delete().eq("user_id", userId);
  if (error) console.error(`deleteAllSessionsForUser(${userId}) error:`, error);
}
async function savePasswordResetToken(token, userId, expiresAt) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("password_reset_tokens").upsert(
    { token, user_id: userId, expires_at: new Date(expiresAt).toISOString() },
    { onConflict: "token" }
  );
  if (error) console.error(`savePasswordResetToken(${token.slice(0, 8)}...) error:`, error);
}
async function loadPasswordResetToken(token) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.from("password_reset_tokens").select("token, user_id, expires_at").eq("token", token).maybeSingle();
  if (error) {
    console.error(`loadPasswordResetToken(${token.slice(0, 8)}...) error:`, error);
    return null;
  }
  if (!data) return null;
  return { token: data.token, userId: data.user_id, expiresAt: new Date(data.expires_at).getTime() };
}
async function deletePasswordResetToken(token) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("password_reset_tokens").delete().eq("token", token);
  if (error) console.error(`deletePasswordResetToken(${token.slice(0, 8)}...) error:`, error);
}
async function deleteAllPasswordResetTokensForUser(userId) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("password_reset_tokens").delete().eq("user_id", userId);
  if (error) console.error(`deleteAllPasswordResetTokensForUser(${userId}) error:`, error);
}
async function logAudit(entry) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("audit_logs").insert({
    scope_id: entry.scopeId,
    actor_user_id: entry.actorUserId,
    actor_email: entry.actorEmail || null,
    action: entry.action,
    target_user_id: entry.targetUserId || null,
    target_email: entry.targetEmail || null,
    detail: entry.detail || null
  });
  if (error) console.error("logAudit error:", error);
}
async function getAuditLogs(scopeId, limit = 200) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("audit_logs").select("*").eq("scope_id", scopeId).order("created_at", { ascending: false }).limit(limit);
  if (error) {
    console.error(`getAuditLogs(${scopeId}) error:`, error);
    return [];
  }
  return data || [];
}
async function createReferral(opts) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("referrals").insert({
    referrer_user_id: opts.referrerUserId,
    referee_user_id: opts.refereeUserId,
    referee_email: opts.refereeEmail || null,
    referee_name: opts.refereeName || null,
    status: "pending"
  });
  if (error) console.error("createReferral error:", error);
}
async function markReferralRewarded(refereeUserId) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("referrals").update({ status: "rewarded", rewarded_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("referee_user_id", refereeUserId);
  if (error) console.error(`markReferralRewarded(${refereeUserId}) error:`, error);
}
async function getReferralsForUser(referrerUserId) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("referrals").select("*").eq("referrer_user_id", referrerUserId).order("created_at", { ascending: false });
  if (error) {
    console.error(`getReferralsForUser(${referrerUserId}) error:`, error);
    return [];
  }
  return data || [];
}

// server.ts
var __originalConsoleError = console.error.bind(console);
console.error = (...args) => {
  __originalConsoleError(...args);
  if (!SENTRY_DSN) return;
  try {
    const errorArg = args.find((a) => a instanceof Error);
    if (errorArg) {
      Sentry.captureException(errorArg, { extra: { logArgs: args.filter((a) => a !== errorArg).map(String) } });
    } else {
      Sentry.captureMessage(args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" "), "error");
    }
  } catch {
  }
};
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] \uCC98\uB9AC\uB418\uC9C0 \uC54A\uC740 \uC608\uC678:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] \uCC98\uB9AC\uB418\uC9C0 \uC54A\uC740 \uD504\uB85C\uBBF8\uC2A4 \uAC70\uBD80:", reason);
});
var PRIMARY_GEMINI_MODEL = "gemini-3.5-flash";
var FALLBACK_GEMINI_MODEL = "gemini-2.5-flash";
async function generateContentWithRetry(ai, params, maxRetries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      lastErr = err;
      const message = String(err?.message || err || "");
      const isQuotaExhausted = err?.status === 429 || err?.code === 429 || /RESOURCE_EXHAUSTED/i.test(message);
      if (isQuotaExhausted) throw err;
      const isTransient = err?.status === 503 || err?.code === 503 || /UNAVAILABLE|high demand|overloaded/i.test(message);
      if (!isTransient) throw err;
      if (attempt === maxRetries) {
        if (params?.model && params.model !== FALLBACK_GEMINI_MODEL) {
          console.warn(`[Gemini] ${params.model} \uBC18\uBCF5 \uACFC\uBD80\uD558\uB85C \uD3F4\uBC31 \uBAA8\uB378(${FALLBACK_GEMINI_MODEL})\uB85C \uB9C8\uC9C0\uB9C9 \uC2DC\uB3C4`);
          return await ai.models.generateContent({ ...params, model: FALLBACK_GEMINI_MODEL });
        }
        throw err;
      }
      const delayMs = 800 * (attempt + 1);
      console.warn(`[Gemini] \uC77C\uC2DC\uC801 \uC624\uB958\uB85C ${delayMs}ms \uD6C4 \uC7AC\uC2DC\uB3C4 (${attempt + 1}/${maxRetries}):`, message.slice(0, 200));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}
function validateImageSize(base64String, maxSizeMB = 5) {
  try {
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
    const binaryString = Buffer.from(base64Data, "base64").toString("binary");
    const sizeBytes = binaryString.length;
    const sizeMB = sizeBytes / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      return {
        valid: false,
        sizeMB: Math.round(sizeMB * 100) / 100,
        error: `\uC774\uBBF8\uC9C0 \uD06C\uAE30\uAC00 ${maxSizeMB}MB\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4 (\uD604\uC7AC: ${Math.round(sizeMB * 100) / 100}MB).`
      };
    }
    return { valid: true, sizeMB: Math.round(sizeMB * 100) / 100 };
  } catch (err) {
    return { valid: false, error: "\uC774\uBBF8\uC9C0 \uD06C\uAE30 \uAC80\uC99D \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." };
  }
}
function validatePasswordComplexity(password) {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "\uBE44\uBC00\uBC88\uD638\uAC00 \uC785\uB825\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." };
  }
  if (password.length < 8) {
    return { valid: false, error: "\uBE44\uBC00\uBC88\uD638\uB294 \uCD5C\uC18C 8\uC790 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4." };
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: "\uBE44\uBC00\uBC88\uD638\uC5D0\uB294 \uCD5C\uC18C 1\uAC1C\uC758 \uC22B\uC790(0-9)\uAC00 \uD3EC\uD568\uB418\uC5B4\uC57C \uD569\uB2C8\uB2E4." };
  }
  if (!/[!@#$%^&*_\-=+]/.test(password)) {
    return { valid: false, error: "\uBE44\uBC00\uBC88\uD638\uC5D0\uB294 \uCD5C\uC18C 1\uAC1C\uC758 \uD2B9\uC218\uBB38\uC790(!@#$%^&*_-=+)\uAC00 \uD3EC\uD568\uB418\uC5B4\uC57C \uD569\uB2C8\uB2E4." };
  }
  return { valid: true };
}
function toFriendlyAiErrorMessage(err) {
  const message = String(err?.message || err || "");
  const isQuotaExhausted = err?.status === 429 || err?.code === 429 || /RESOURCE_EXHAUSTED|exceeded your current quota/i.test(message);
  if (isQuotaExhausted) {
    return "AI \uC778\uC2DD \uC694\uCCAD\uC774 \uC77C\uC2DC\uC801\uC73C\uB85C \uB9CE\uC544 \uC7A0\uC2DC \uC9C0\uC5F0\uB418\uACE0 \uC788\uC2B5\uB2C8\uB2E4. 1\uBD84 \uC815\uB3C4 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.";
  }
  const isTransient = err?.status === 503 || err?.code === 503 || /UNAVAILABLE|high demand|overloaded/i.test(message);
  if (isTransient) {
    return "AI \uC11C\uBC84\uAC00 \uC77C\uC2DC\uC801\uC73C\uB85C \uD63C\uC7A1\uD569\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.";
  }
  const isSafety = /safety|blocked|SAFETY/i.test(message);
  if (isSafety) {
    return "\uC774\uBBF8\uC9C0\uB97C \uBD84\uC11D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uB978 \uC0AC\uC9C4\uC73C\uB85C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.";
  }
  return "AI \uC778\uC2DD \uC911 \uBB38\uC81C\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.";
}
var app = (0, import_express.default)();
var PORT = Number(process.env.PORT) || 3e3;
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ extended: true, limit: "50mb" }));
app.use((0, import_helmet.default)({
  contentSecurityPolicy: {
    reportOnly: true,
    directives: {
      defaultSrc: ["'self'"],
      // 카카오 지도 SDK, 카카오톡 공유 SDK, 토스페이먼츠 결제창, OpenCV.js CDN 폴백
      scriptSrc: ["'self'", "https://dapi.kakao.com", "https://t1.kakaocdn.net", "https://js.tosspayments.com", "https://docs.opencv.org"],
      // Pretendard 폰트(jsdelivr)와, React의 style={{...}} 인라인 스타일 속성 자체를 허용
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "data:"],
      // QR코드 생성 이미지, Supabase Storage(영수증/명함/서명 이미지), 카카오 지도 타일/아이콘,
      // base64(data:)·캔버스 캡처(blob:) 이미지
      imgSrc: ["'self'", "data:", "blob:", "https://api.qrserver.com", "https://*.supabase.co", "https://*.kakaocdn.net", "https://*.daumcdn.net"],
      // 카카오 지도/공유 SDK와 Supabase, 토스페이먼츠가 내부적으로 호출하는 API
      connectSrc: ["'self'", "https://dapi.kakao.com", "https://*.kakaocdn.net", "https://*.daumcdn.net", "https://*.supabase.co", "https://api.tosspayments.com"],
      frameSrc: ["'self'", "https://js.tosspayments.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  // 카카오/토스 등 외부 이미지·리소스에 CORP(Cross-Origin-Resource-Policy) 헤더가 없으면
  // 이 옵션이 로딩 자체를 막을 수 있어서 계속 꺼둔다.
  crossOriginEmbedderPolicy: false
}));
app.use((0, import_cors.default)({
  origin: (origin, callback) => {
    const allowedOrigins = [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:3001",
      process.env.APP_BASE_URL?.replace("https://", "").replace("http://", "").split("/")[0]
    ].filter(Boolean);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS policy: \uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC740 origin\uC785\uB2C8\uB2E4."));
    }
  },
  credentials: true,
  // 쿠키와 인증 정보 포함 허용
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-user-id", "x-cron-secret"],
  maxAge: 3600
  // preflight 캐시 시간(초)
}));
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});
var swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "BizCard API",
      version: "1.0.0",
      description: "BizCard - AI \uBA85\uD568 & CRM \uD1B5\uD569 \uC194\uB8E8\uC158 API \uBB38\uC11C"
    },
    servers: [
      {
        url: process.env.APP_BASE_URL || "http://localhost:3000",
        description: "\uD504\uB85C\uB355\uC158 \uC11C\uBC84"
      },
      {
        url: "http://localhost:3000",
        description: "\uAC1C\uBC1C \uC11C\uBC84"
      }
    ],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "sessionId",
          description: "\uC138\uC158 \uAE30\uBC18 \uC778\uC99D \uCFE0\uD0A4"
        }
      }
    }
  },
  apis: ["./server.ts"]
  // JSDoc 주석에서 API 정의 추출
};
var swaggerSpec = (0, import_swagger_jsdoc.default)(swaggerOptions);
app.use("/api-docs", import_swagger_ui_express.default.serve, import_swagger_ui_express.default.setup(swaggerSpec));
var SESSION_COOKIE_NAME = "bizcard_session";
var SESSION_TTL_LONG_MS = 30 * 24 * 60 * 60 * 1e3;
var SESSION_TTL_SHORT_MS = 24 * 60 * 60 * 1e3;
var sessions = /* @__PURE__ */ new Map();
async function createSession(userId, rememberMe = true) {
  const token = import_crypto2.default.randomBytes(32).toString("hex");
  const ttlMs = rememberMe ? SESSION_TTL_LONG_MS : SESSION_TTL_SHORT_MS;
  const expiresAt = Date.now() + ttlMs;
  sessions.set(token, { userId, expiresAt });
  await saveSession(token, userId, expiresAt);
  return { token, ttlMs };
}
async function invalidateAllSessionsForUser(userId) {
  for (const [token, session] of sessions.entries()) {
    if (session.userId === userId) sessions.delete(token);
  }
  await deleteAllSessionsForUser(userId);
}
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}
function isRequestSecure(req) {
  return req.protocol === "https" || req.get("x-forwarded-proto") === "https" || process.env.NODE_ENV === "production";
}
function setSessionCookie(req, res, token, ttlMs = SESSION_TTL_LONG_MS) {
  const secureFlag = isRequestSecure(req) ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttlMs / 1e3)}${secureFlag}`
  );
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
app.use(async (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  let session = token ? sessions.get(token) : void 0;
  if (!session && token && isSupabaseConfigured) {
    const stored = await loadSession(token);
    if (stored) {
      session = { userId: stored.userId, expiresAt: stored.expiresAt };
      sessions.set(token, session);
    }
  }
  if (session && session.expiresAt > Date.now()) {
    req.headers["x-user-id"] = session.userId;
  } else {
    if (token) {
      sessions.delete(token);
      deleteSession(token).catch(() => {
      });
    }
    delete req.headers["x-user-id"];
  }
  next();
});
var initialVehicles = [
  {
    id: "vh-1",
    modelName: "\uBCA4\uCE20 E300 4Matic",
    plateNumber: "12\uAC00 3456",
    owner: "\uBC15\uC601\uB85D",
    purchaseDate: "2025-03-10",
    initialMileage: 12400,
    currentMileage: 12500,
    fuelType: "gasoline",
    status: "active",
    createdAt: (/* @__PURE__ */ new Date("2025-03-10")).toISOString()
  },
  {
    id: "vh-2",
    modelName: "\uD604\uB300 \uADF8\uB79C\uC800 \uD558\uC774\uBE0C\uB9AC\uB4DC",
    plateNumber: "34\uB108 5678",
    owner: "\uC774\uC9C0\uBBFC",
    purchaseDate: "2026-01-15",
    initialMileage: 8385,
    currentMileage: 8400,
    fuelType: "hybrid",
    status: "active",
    createdAt: (/* @__PURE__ */ new Date("2026-01-15")).toISOString()
  },
  {
    id: "vh-3",
    modelName: "\uAE30\uC544 \uCE74\uB2C8\uBC1C",
    plateNumber: "56\uB354 7890",
    owner: "\uBC15\uC601\uB85D",
    purchaseDate: "2024-06-20",
    initialMileage: 25300,
    currentMileage: 25300,
    fuelType: "diesel",
    status: "active",
    createdAt: (/* @__PURE__ */ new Date("2024-06-20")).toISOString()
  },
  {
    id: "vh-4",
    modelName: "\uD14C\uC2AC\uB77C \uBAA8\uB378 Y",
    plateNumber: "78\uB7EC 9012",
    owner: "\uBC15\uC601\uB85D",
    purchaseDate: "2025-08-05",
    initialMileage: 11190,
    currentMileage: 11200,
    fuelType: "electric",
    status: "active",
    createdAt: (/* @__PURE__ */ new Date("2025-08-05")).toISOString()
  },
  {
    id: "vh-5",
    modelName: "\uC81C\uB124\uC2DC\uC2A4 G80",
    plateNumber: "90\uBA38 1234",
    owner: "\uD55C\uC0C1\uC6B0",
    purchaseDate: "2025-11-20",
    initialMileage: 15400,
    currentMileage: 15400,
    fuelType: "gasoline",
    status: "active",
    createdAt: (/* @__PURE__ */ new Date("2025-11-20")).toISOString()
  },
  {
    id: "vh-6",
    modelName: "\uD604\uB300 \uC544\uBC18\uB5BC",
    plateNumber: "45\uC11C 6789",
    owner: "\uD55C\uC0C1\uC6B0",
    purchaseDate: "2026-02-18",
    initialMileage: 4190,
    currentMileage: 4200,
    fuelType: "gasoline",
    status: "active",
    createdAt: (/* @__PURE__ */ new Date("2026-02-18")).toISOString()
  }
];
var initialDrivingLogs = [
  {
    id: "log-1",
    vehicleId: "vh-1",
    driverName: "\uBC15\uC601\uB85D",
    date: "2026-06-30",
    purpose: "\uAC70\uB798\uCC98 \uBBF8\uD305 (\uC0BC\uC131\uC804\uC790)",
    startMileage: 12475,
    endMileage: 12500,
    distance: 25,
    startPlace: "\uD68C\uC0AC \uBCF8\uC0AC",
    endPlace: "\uC0BC\uC131\uC804\uC790 \uC11C\uCD08\uC0AC\uC625",
    createdAt: (/* @__PURE__ */ new Date("2026-06-30T10:00:00")).toISOString()
  },
  {
    id: "log-2",
    vehicleId: "vh-2",
    driverName: "\uC774\uC9C0\uBBFC",
    date: "2026-06-29",
    purpose: "\uC678\uADFC (\uB124\uC774\uBC84 \uD074\uB77C\uC6B0\uB4DC)",
    startMileage: 8385,
    endMileage: 8400,
    distance: 15,
    startPlace: "\uD68C\uC0AC \uBCF8\uC0AC",
    endPlace: "\uB124\uC774\uBC84 \uBD84\uB2F9\uC0AC\uC625",
    createdAt: (/* @__PURE__ */ new Date("2026-06-29T14:30:00")).toISOString()
  },
  {
    id: "log-3",
    vehicleId: "vh-1",
    driverName: "\uBC15\uC601\uB85D",
    date: "2026-06-28",
    purpose: "\uD604\uC7A5 \uC2E4\uC0AC \uBC0F \uBE44\uC988\uB2C8\uC2A4 \uBBF8\uD305",
    startMileage: 12455,
    endMileage: 12475,
    distance: 20,
    startPlace: "\uD68C\uC0AC \uBCF8\uC0AC",
    endPlace: "\uCE74\uCE74\uC624 \uD310\uAD50\uC0AC\uC625",
    createdAt: (/* @__PURE__ */ new Date("2026-06-28T09:00:00")).toISOString()
  },
  {
    id: "log-4",
    vehicleId: "vh-6",
    driverName: "\uD55C\uC0C1\uC6B0",
    date: "2026-06-27",
    purpose: "\uC5C5\uBB34 \uAD00\uB828 \uBB3C\uD488 \uBC0F \uC18C\uBAA8\uD488 \uAD6C\uC785",
    startMileage: 4190,
    endMileage: 4200,
    distance: 10,
    startPlace: "\uD68C\uC0AC \uBCF8\uC0AC",
    endPlace: "\uC774\uB9C8\uD2B8 \uC790\uC591\uC810",
    createdAt: (/* @__PURE__ */ new Date("2026-06-27T16:00:00")).toISOString()
  },
  {
    id: "log-5",
    vehicleId: "vh-4",
    driverName: "\uBC15\uC601\uB85D",
    date: "2026-06-26",
    purpose: "\uC815\uAE30 \uC8FC\uC8FC\uCD1D\uD68C \uCC38\uC11D \uC758\uC804 \uBC0F \uC774\uB3D9",
    startMileage: 11190,
    endMileage: 11200,
    distance: 10,
    startPlace: "\uD68C\uC0AC \uBCF8\uC0AC",
    endPlace: "\uD3EC\uC2A4\uCF54\uC13C\uD130",
    createdAt: (/* @__PURE__ */ new Date("2026-06-26T11:00:00")).toISOString()
  }
];
var initialExpenses = [
  {
    id: "exp-1",
    vehicleId: "vh-1",
    date: "2026-06-29",
    category: "fuel",
    amount: 75e3,
    memo: "\uBCA4\uCE20 \uACE0\uAE09\uC720 \uC8FC\uC720 (SK\uC5D0\uB108\uC9C0)",
    createdAt: (/* @__PURE__ */ new Date("2026-06-29T18:30:00")).toISOString()
  },
  {
    id: "exp-2",
    vehicleId: "vh-1",
    date: "2026-06-30",
    category: "toll",
    amount: 4800,
    memo: "\uACBD\uBD80\uACE0\uC18D\uB3C4\uB85C \uD1B5\uD589\uB8CC \uD68C\uACC4 \uC815\uC0B0",
    createdAt: (/* @__PURE__ */ new Date("2026-06-30T11:15:00")).toISOString()
  },
  {
    id: "exp-3",
    vehicleId: "vh-2",
    date: "2026-06-28",
    category: "parking",
    amount: 12e3,
    memo: "\uAC15\uB0A8\uAD6C\uCCAD \uACF5\uC601\uC8FC\uCC28\uC7A5 \uC8FC\uCC28\uBE44",
    createdAt: (/* @__PURE__ */ new Date("2026-06-28T15:00:00")).toISOString()
  },
  {
    id: "exp-4",
    vehicleId: "vh-6",
    date: "2026-06-27",
    category: "toll",
    amount: 3200,
    memo: "\uC678\uACFD\uC21C\uD658\uB3C4\uB85C \uD1A8\uAC8C\uC774\uD2B8",
    createdAt: (/* @__PURE__ */ new Date("2026-06-27T17:00:00")).toISOString()
  },
  {
    id: "exp-5",
    vehicleId: "vh-3",
    date: "2026-06-25",
    category: "other",
    amount: 26749,
    memo: "\uCE74\uB2C8\uBC1C \uD504\uB9AC\uBBF8\uC5C4 \uC138\uCC28 \uBC0F \uC18C\uBAA8\uC131 \uD074\uB9AC\uB108 \uAD6C\uC785",
    createdAt: (/* @__PURE__ */ new Date("2026-06-25T14:00:00")).toISOString()
  }
];
var initialMaintenances = [
  {
    id: "maint-1",
    vehicleId: "vh-1",
    date: "2026-06-15",
    title: "\uC815\uAE30 \uC810\uAC80 (\uC5D4\uC9C4\uC624\uC77C \uBC0F \uD544\uD130 \uAD50\uCCB4)",
    cost: 18e4,
    mileage: 12e3,
    shopName: "\uBA54\uB974\uC138\uB370\uC2A4\uBCA4\uCE20 \uACF5\uC2DD \uAC15\uB0A8\uC11C\uBE44\uC2A4\uC13C\uD130",
    status: "completed",
    memo: "\uB2E4\uC74C \uC624\uC77C \uAD50\uD658 \uC608\uC815\uC77C: 22,000km \uC2DC\uC810",
    createdAt: (/* @__PURE__ */ new Date("2026-06-15")).toISOString()
  },
  {
    id: "maint-2",
    vehicleId: "vh-4",
    date: "2026-07-15",
    title: "\uD558\uC808\uAE30 \uC5D0\uC5B4\uCEE8 \uD56D\uADE0 \uD544\uD130 \uBC0F \uD0C0\uC774\uC5B4 \uC704\uCE58 \uAD50\uD658",
    cost: 35e3,
    mileage: 12e3,
    shopName: "\uD14C\uC2AC\uB77C \uACF5\uC2DD \uC131\uC218\uC11C\uBE44\uC2A4\uC13C\uD130",
    status: "scheduled",
    memo: "\uC0AC\uC804 \uC608\uC57D \uC644\uB8CC (14:00)",
    createdAt: (/* @__PURE__ */ new Date("2026-06-20")).toISOString()
  }
];
var initialMyProfile = {
  name: "\uBC15\uC601\uB85D",
  company: "BizCard",
  department: "\uAE00\uB85C\uBC8C \uC0AC\uC5C5\uCD1D\uAD04\uBCF8\uBD80",
  title: "\uB300\uD45C\uC774\uC0AC / CEO",
  phoneMobile: "010-5454-0000",
  phoneOffice: "02-545-0000",
  phoneFax: "02-545-0001",
  email: "parkyl5454@gmail.com",
  address: "\uC11C\uC6B8\uD2B9\uBCC4\uC2DC \uAC15\uB0A8\uAD6C \uD14C\uD5E4\uB780\uB85C 152 \uAC15\uB0A8\uD30C\uC774\uB0B8\uC2A4\uC13C\uD130 18\uCE35",
  snsUrl: "https://linkedin.com/in/bizcard-pro",
  website: "https://bizcard-pro.ai",
  memo: "\uC2A4\uB9C8\uD2B8 \uBA85\uD568 \uAD00\uB9AC & AI OCR \uC194\uB8E8\uC158 \uC804\uBB38\uAC00"
};
var initialProjects = [
  {
    id: "p-1",
    name: "\uC0BC\uC131\uC804\uC790 \uC628\uB514\uBC14\uC774\uC2A4 B2B \uACF5\uAE09 \uC81C\uC548",
    developer: "\uC0BC\uC131\uC804\uC790 (MX\uC0AC\uC5C5\uBD80)",
    contractor: "\uC2DC\uACF5\uD14C\uD06C",
    architect: "\uAC74\uC6D0\uAC74\uCD95",
    electricalDesigner: "\uD55C\uC77C\uC804\uAE30\uC124\uACC4",
    mechanicalDesigner: "\uC0BC\uC2E0\uC124\uACC4",
    supervisor: "\uD55C\uBBF8\uAE00\uB85C\uBC8C",
    operator: "BizCard",
    status: "progress",
    priority: "high",
    dueDate: new Date(Date.now() + 864e5 * 14).toISOString().split("T")[0],
    contactIds: ["c-2"],
    budget: "1\uC5B5 5\uCC9C\uB9CC\uC6D0",
    createdAt: new Date(Date.now() - 864e5 * 10).toISOString(),
    followUps: [
      {
        id: "f-1",
        projectId: "p-1",
        content: "\uC81C\uC548 \uD53C\uCE58\uB371 \uC218\uC815\uC548 \uC1A1\uBD80 \uC644\uB8CC (\uBCF4\uC548\uD300 \uC11C\uB958 \uCCA8\uBD80)",
        date: new Date(Date.now() - 864e5 * 2).toISOString().split("T")[0],
        status: "done"
      },
      {
        id: "f-2",
        projectId: "p-1",
        content: "\uB2F4\uB2F9 \uC784\uC6D0 \uB300\uBA74 \uD504\uB9AC\uC820\uD14C\uC774\uC158 \uBBF8\uD305",
        date: new Date(Date.now() + 864e5 * 5).toISOString().split("T")[0],
        status: "planned"
      }
    ]
  },
  {
    id: "p-2",
    name: "\uB124\uC774\uBC84 \uD074\uB77C\uC6B0\uB4DC API \uC5F0\uB3D9 \uD30C\uD2B8\uB108\uC2ED \uACC4\uC57D",
    developer: "\uB124\uC774\uBC84\uD074\uB77C\uC6B0\uB4DC (\uC8FC)",
    contractor: "\uC6B0\uBBF8\uAC74\uC124",
    architect: "\uD76C\uB9BC\uAC74\uCD95",
    electricalDesigner: "\uC138\uBA85\uC804\uAE30\uC5D4\uC9C0\uB2C8\uC5B4\uB9C1",
    mechanicalDesigner: "\uC6B0\uC6D0\uC5E0\uC564\uC774",
    supervisor: "\uAC74\uC6D0\uC5D4\uC9C0\uB2C8\uC5B4\uB9C1",
    operator: "\uB124\uC774\uBC84\uD074\uB77C\uC6B0\uB4DC \uC6B4\uC601\uBCF8\uBD80",
    status: "progress",
    priority: "high",
    dueDate: new Date(Date.now() + 864e5 * 7).toISOString().split("T")[0],
    contactIds: ["c-1"],
    budget: "8,000\uB9CC\uC6D0",
    createdAt: new Date(Date.now() - 864e5 * 15).toISOString(),
    followUps: [
      {
        id: "f-3",
        projectId: "p-2",
        content: "\uAE30\uC220 \uBBF8\uD305 \uC544\uC820\uB2E4 \uD655\uC815 \uBC0F \uC694\uAE08\uD45C \uCD5C\uC885 \uD611\uC758",
        date: new Date(Date.now() - 864e5 * 1).toISOString().split("T")[0],
        status: "done"
      }
    ]
  },
  {
    id: "p-3",
    name: "LG CNS \uC2A4\uB9C8\uD2B8 \uBB3C\uB958 \uC2DC\uBC94 \uAD6C\uCD95 \uC0AC\uC5C5",
    developer: "LG CNS",
    contractor: "GS\uAC74\uC124",
    architect: "\uCC3D\uC870\uAC74\uCD95",
    electricalDesigner: "\uB3D9\uC77C\uC804\uAE30\uC124\uACC4",
    mechanicalDesigner: "\uC0BC\uC6B0\uC5E0\uC564\uC774",
    supervisor: "\uD1A0\uD399\uC5D4\uC9C0\uB2C8\uC5B4\uB9C1",
    operator: "LG CNS \uBB3C\uB958\uC0AC\uC5C5\uBCF8\uBD80",
    status: "opportunity",
    priority: "medium",
    dueDate: new Date(Date.now() + 864e5 * 30).toISOString().split("T")[0],
    contactIds: ["c-5"],
    budget: "5,000\uB9CC\uC6D0",
    createdAt: new Date(Date.now() - 864e5 * 4).toISOString(),
    followUps: []
  }
];
var initialGroups = [
  { id: "g-vip", name: "\u2B50 VIP \uAC70\uB798\uCC98", color: "bg-amber-500 text-amber-950 border-amber-400" },
  { id: "g-client", name: "\u{1F4BC} \uBE44\uC988\uB2C8\uC2A4 \uD30C\uD2B8\uB108", color: "bg-blue-500 text-white border-blue-400" },
  { id: "g-tech", name: "\u{1F4BB} \uD14C\uD06C / \uAC1C\uBC1C", color: "bg-emerald-500 text-white border-emerald-400" },
  { id: "g-friend", name: "\u{1F91D} \uC9C0\uC778 / \uB124\uD2B8\uC6CC\uD0B9", color: "bg-purple-500 text-white border-purple-400" }
];
var initialContacts = [
  {
    id: "c-1",
    name: "\uAE40\uB3C4\uD604",
    company: "\uB124\uC774\uBC84 \uD074\uB77C\uC6B0\uB4DC",
    department: "AI \uD50C\uB7AB\uD3FC \uAC1C\uBC1C\uD300",
    title: "\uC218\uC11D \uC5F0\uAD6C\uC6D0",
    phoneMobile: "010-3456-7890",
    phoneOffice: "031-784-1114",
    phoneFax: "031-784-1115",
    email: "dohyun.kim@navercorp.com",
    address: "\uACBD\uAE30\uB3C4 \uC131\uB0A8\uC2DC \uBD84\uB2F9\uAD6C \uBD84\uB2F9\uB0B4\uACE1\uB85C 131 \uD14C\uD06C\uC6D0 \uD0C0\uC6CC",
    lat: 37.3948,
    lng: 127.1112,
    groupId: "g-tech",
    frontImage: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=80",
    backImage: "https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=600&q=80",
    memo: "\uD558\uC774\uD37C\uD074\uB85C\uBC14X B2B API \uC5F0\uB3D9 \uB17C\uC758. \uB2E4\uC74C \uB2EC \uBBF8\uD305 \uC608\uC815.",
    companyInfo: "\uAD6D\uB0B4 \uCD5C\uB300 \uADDC\uBAA8\uC758 \uCD08\uB300\uADDC\uBAA8 AI(\uD558\uC774\uD37C\uD074\uB85C\uBC14X) \uBC0F \uD074\uB77C\uC6B0\uB4DC \uC778\uD504\uB77C \uD50C\uB7AB\uD3FC \uAE30\uC5C5 (\uC804\uB144\uB3C4 \uB9E4\uCD9C\uC561 \uC57D 1\uC870 1,400\uC5B5\uC6D0)",
    createdAt: new Date(Date.now() - 864e5 * 5).toISOString(),
    callHistory: [
      {
        id: "call-1",
        contactId: "c-1",
        type: "incoming",
        timestamp: new Date(Date.now() - 36e5 * 4).toISOString(),
        duration: "6\uBD84 42\uCD08",
        note: "API \uC2A4\uD399 \uBB38\uC11C \uBA54\uC77C\uB85C \uC1A1\uBD80 \uC694\uCCAD\uBC1B\uC74C"
      },
      {
        id: "call-2",
        contactId: "c-1",
        type: "outgoing",
        timestamp: new Date(Date.now() - 864e5 * 2).toISOString(),
        duration: "12\uBD84 10\uCD08",
        note: "\uAE30\uC220 \uBBF8\uD305 \uC544\uC820\uB2E4 \uC870\uC728"
      }
    ]
  },
  {
    id: "c-2",
    name: "\uC774\uC11C\uC5F0",
    company: "\uC0BC\uC131\uC804\uC790",
    department: "DX\uBD80\uBB38 \uBAA8\uBC14\uC77C\uACBD\uD5D8(MX)\uC0AC\uC5C5\uBD80",
    title: "\uCC45\uC784 \uD504\uB85C\uB355\uD2B8 \uB9E4\uB2C8\uC800",
    phoneMobile: "010-9876-5432",
    phoneOffice: "02-2255-0114",
    phoneFax: "02-2255-0115",
    email: "seoyeon.lee@samsung.com",
    address: "\uC11C\uC6B8\uD2B9\uBCC4\uC2DC \uC11C\uCD08\uAD6C \uC11C\uCD08\uB300\uB85C74\uAE38 11 \uC0BC\uC131\uC804\uC790 \uC11C\uCD08\uC0AC\uC625",
    lat: 37.4967,
    lng: 127.0276,
    groupId: "g-client",
    frontImage: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80",
    memo: "\uAC24\uB7ED\uC2DC \uC628\uB514\uBC14\uC774\uC2A4 \uBA85\uD568 \uC2A4\uCE94 \uC194\uB8E8\uC158 \uB3C4\uC785 \uD611\uC758 \uC911.",
    companyInfo: "\uC0BC\uC131\uADF8\uB8F9 \uACC4\uC5F4\uC758 \uAE00\uB85C\uBC8C \uC804\uC790\uC81C\uD488 \uBC0F \uBC18\uB3C4\uCCB4 \uC81C\uC870 \uBD80\uB3D9\uC758 1\uC704 \uB300\uAE30\uC5C5 (\uC804\uB144\uB3C4 \uB9E4\uCD9C\uC561 \uC57D 258\uC870\uC6D0)",
    createdAt: new Date(Date.now() - 864e5 * 4).toISOString(),
    callHistory: []
  },
  {
    id: "c-3",
    name: "\uC815\uBBFC\uC6B0",
    company: "\uCE74\uCE74\uC624",
    department: "\uB85C\uCEEC\uC11C\uBE44\uC2A4 \uAE30\uD68D\uD300",
    title: "\uD30C\uD2B8\uC7A5",
    phoneMobile: "010-1234-5678",
    phoneOffice: "02-1577-3754",
    phoneFax: "02-1577-3755",
    email: "minwoo.jung@kakaocorp.com",
    address: "\uC81C\uC8FC\uD2B9\uBCC4\uC790\uCE58\uB3C4 \uC81C\uC8FC\uC2DC \uCCA8\uB2E8\uB85C 242",
    lat: 33.4724,
    lng: 126.5794,
    groupId: "g-tech",
    frontImage: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80",
    memo: "\uCE74\uCE74\uC624 \uB9F5 API \uACE0\uB3C4\uD654 \uBC0F \uBE44\uC988\uB2C8\uC2A4 \uBA85\uD568 \uB3D9\uAE30\uD654 \uC5F0\uB3D9 \uC81C\uC548 \uC608\uC815.",
    companyInfo: "\uB300\uD55C\uBBFC\uAD6D\uC758 \uB300\uD45C \uBAA8\uBC14\uC77C \uD50C\uB7AB\uD3FC \uBC0F \uBA54\uC2E0\uC800 \uAE30\uBC18 \uC0DD\uD65C \uBC00\uCC29\uD615 \uC11C\uBE44\uC2A4 IT \uB300\uAE30\uC5C5 (\uC804\uB144\uB3C4 \uB9E4\uCD9C\uC561 \uC57D 8\uC870\uC6D0)",
    createdAt: new Date(Date.now() - 864e5 * 3).toISOString(),
    callHistory: []
  },
  {
    id: "c-4",
    name: "\uCD5C\uC720\uB9AC",
    company: "\uD1A0\uC2A4(\uBE44\uBC14\uB9AC\uD37C\uBE14\uB9AC\uCE74)",
    department: "\uBE0C\uB79C\uB4DC \uB514\uC790\uC778 \uADF8\uB8F9",
    title: "\uBE0C\uB79C\uB4DC \uB9E4\uB2C8\uC800",
    phoneMobile: "010-8765-4321",
    phoneOffice: "02-1599-1111",
    phoneFax: "02-1599-2222",
    email: "yuri.choi@toss.im",
    address: "\uC11C\uC6B8\uD2B9\uBCC4\uC2DC \uAC15\uB0A8\uAD6C \uD14C\uD5E4\uB780\uB85C 142 \uC544\uD06C\uD50C\uB808\uC774\uC2A4 12\uCE35",
    lat: 37.4994,
    lng: 127.0358,
    groupId: "g-friend",
    frontImage: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80",
    memo: "Toss B2B \uB9C8\uCF00\uD305 \uD611\uC5C5 \uAD00\uB828 \uC5F0\uB77D\uB9DD \uAD6C\uCD95.",
    companyInfo: "\uB300\uD55C\uBBFC\uAD6D\uC758 \uB300\uD45C \uC885\uD569 \uAE08\uC735 \uD540\uD14C\uD06C \uD50C\uB7AB\uD3FC \uBE44\uBC14\uB9AC\uD37C\uBE14\uB9AC\uCE74 \uC6B4\uC601 \uAE30\uC5C5 (\uC804\uB144\uB3C4 \uB9E4\uCD9C\uC561 \uC57D 1\uC870 3,000\uC5B5\uC6D0)",
    createdAt: new Date(Date.now() - 864e5 * 2).toISOString(),
    callHistory: []
  },
  {
    id: "c-5",
    name: "\uAC15\uD0DC\uC624",
    company: "LG CNS",
    department: "\uC2A4\uB9C8\uD2B8 \uD329\uD1A0\uB9AC \uC0AC\uC5C5\uBD80",
    title: "\uD30C\uD2B8\uC7A5",
    phoneMobile: "010-5555-5555",
    phoneOffice: "02-2099-0114",
    phoneFax: "02-2099-0115",
    email: "teoh.kang@lgcns.com",
    address: "\uC11C\uC6B8\uD2B9\uBCC4\uC2DC \uAC15\uC11C\uAD6C \uB9C8\uACE1\uC911\uC5598\uB85C 71 LG\uC0AC\uC774\uC5B8\uC2A4\uD30C\uD06C",
    lat: 37.5615,
    lng: 126.8335,
    groupId: "g-tech",
    frontImage: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80",
    memo: "\uC2A4\uB9C8\uD2B8 \uBB3C\uB958 \uC2DC\uBC94 \uAD6C\uCD95 \uC0AC\uC5C5 \uAD00\uB828 \uBA85\uD568 \uD655\uBCF4.",
    companyInfo: "LG\uADF8\uB8F9\uC758 IT \uC11C\uBE44\uC2A4 \uBC0F \uC2DC\uC2A4\uD15C \uD1B5\uD569(SI), \uB514\uC9C0\uD138 \uD2B8\uB79C\uC2A4\uD3EC\uBA54\uC774\uC158 \uC804\uBB38 \uB300\uAE30\uC5C5 (\uC804\uB144\uB3C4 \uB9E4\uCD9C\uC561 \uC57D 5\uC870 2,000\uC5B5\uC6D0)",
    createdAt: new Date(Date.now() - 864e5 * 1).toISOString(),
    callHistory: []
  }
];
var initialDailyLogs = [
  {
    id: "dl-1",
    date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    title: "\uC0BC\uC131\uC804\uC790 MX\uC0AC\uC5C5\uBD80 \uC194\uB8E8\uC158 \uC81C\uC548 \uBBF8\uD305 \uBC0F \uCD94\uAC00 \uC694\uAD6C \uAC80\uD1A0",
    author: "\uD55C\uC0C1\uC6B0",
    department: "\uBE44\uC988\uB2C8\uC2A4\uC804\uB7B5\uD300",
    tasksToday: "1. \uC0BC\uC131\uC804\uC790 \uC11C\uCD08\uC0AC\uC625 \uBC29\uBB38 \uBBF8\uD305 \uC9C4\uD589 \uBC0F \uC628\uB514\uBC14\uC774\uC2A4 \uB370\uBAA8 \uC2DC\uC5F0 \uC644\uB8CC\n2. \uACE0\uAC1D \uBCF4\uC548 \uAC00\uC774\uB4DC \uBC0F \uADDC\uC815 \uC900\uC218\uB97C \uC704\uD55C \uCD94\uAC00 \uC694\uAC74 \uBA54\uC77C \uC870\uC728 \uC644\uB8CC",
    tasksTomorrow: "1. \uB0B4\uBD80 \uAC1C\uBC1C \uBCF8\uBD80\uC640 \uC0BC\uC131\uC804\uC790 \uCE21 \uBCF4\uC548 \uAC00\uC774\uB4DC \uAE30\uC220 \uD0C0\uB2F9\uC131 \uAC80\uD1A0 \uD68C\uC758 \uC9C4\uD589\n2. 2\uCC28 \uBBF8\uD305\uC6A9 \uC218\uC815 \uC81C\uC548\uC11C \uCD08\uC548 \uC791\uC131 \uBC0F \uD53C\uCE58\uB371 \uC5C5\uB370\uC774\uD2B8",
    issues: "\uAE30\uC874 \uD074\uB77C\uC6B0\uB4DC \uC804\uC1A1 \uBC29\uC2DD \uC678\uC5D0 \uC644\uC804\uD55C \uC628\uB514\uBC14\uC774\uC2A4 \uD30C\uC2F1 \uC635\uC158\uC744 \uC694\uCCAD\uD568. \uCD94\uAC00\uC801\uC778 \uB77C\uC774\uBE0C\uB7EC\uB9AC \uAC00\uBCBC\uC6C0 \uBC0F \uB514\uBC14\uC774\uC2A4 \uC5F0\uC0B0 \uBD80\uD558 \uD14C\uC2A4\uD2B8\uAC00 \uAD00\uAC74\uC784.",
    contactIds: ["c-2"],
    projectIds: ["p-1"],
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "dl-2",
    date: new Date(Date.now() - 864e5).toISOString().split("T")[0],
    title: "\uB124\uC774\uBC84 \uD074\uB77C\uC6B0\uB4DC API \uC5F0\uB3D9 \uC694\uAE08\uC81C \uC870\uC728 \uBC0F \uC124\uACC4 \uD68C\uC758",
    author: "\uD55C\uC0C1\uC6B0",
    department: "\uBE44\uC988\uB2C8\uC2A4\uC804\uB7B5\uD300",
    tasksToday: "1. \uB124\uC774\uBC84 \uD074\uB77C\uC6B0\uB4DC \uAE40\uB3C4\uD604 \uC218\uC11D \uC5F0\uAD6C\uC6D0\uACFC \uC720\uC120 \uD1B5\uD654\uB85C \uC5F0\uB3D9 \uC2A4\uD399 \uC544\uC820\uB2E4 \uC870\uC728\n2. B2B \uC8FC\uC18C\uB85D \uC790\uB3D9 \uB3D9\uAE30\uD654 \uAE30\uB2A5\uC5D0 \uAD00\uD55C API \uD2B8\uB798\uD53D \uD55C\uB3C4 \uBC0F \uC694\uAE08 \uC815\uCC45 \uCD5C\uC885 \uD0C0\uD611\uC548 \uB3C4\uCD9C\n3. \uB0B4\uBD80 \uBCF4\uACE0\uC6A9 \uAE30\uC548\uC11C \uC791\uC131",
    tasksTomorrow: "1. \uD30C\uD2B8\uB108\uC2ED \uCD5C\uC885 \uACC4\uC57D\uC11C \uCD08\uC548 \uBC95\uBB34 \uAC80\uD1A0 \uC694\uCCAD\n2. \uC2E0\uADDC API \uC5F0\uB3D9\uC744 \uC704\uD55C \uC778\uD504\uB77C \uB9AC\uC18C\uC2A4 \uBC30\uCE58 \uACC4\uD68D \uC218\uB9BD",
    issues: "\uD2B8\uB798\uD53D \uAE09\uC99D \uC2DC\uC758 \uB808\uC774\uD134\uC2DC \uBCF4\uC7A5\uC744 \uC704\uD55C \uC804\uC6A9 \uD68C\uC120 \uC635\uC158 \uCD94\uAC00 \uB17C\uC758\uAC00 \uC77C\uBD80 \uB0A8\uC544\uC788\uC74C.",
    contactIds: ["c-1"],
    projectIds: ["p-2"],
    createdAt: new Date(Date.now() - 864e5).toISOString()
  }
];
var initialWeeklyLogs = [
  {
    id: "wl-1",
    startDate: new Date(Date.now() - 864e5 * 6).toISOString().split("T")[0],
    endDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    title: "6\uC6D4 4\uC8FC\uCC28 \uC8FC\uAC04 \uC5C5\uBB34 \uBCF4\uACE0 (\uC601\uC5C5 \uCD1D\uAD04 \uBC0F \uC194\uB8E8\uC158 \uD30C\uD2B8\uB108\uC2ED)",
    author: "\uD55C\uC0C1\uC6B0",
    department: "\uBE44\uC988\uB2C8\uC2A4\uC804\uB7B5\uD300",
    achievementsThisWeek: "1. \uC0BC\uC131\uC804\uC790 MX\uC0AC\uC5C5\uBD80 B2B \uC194\uB8E8\uC158 \uC628\uB514\uBC14\uC774\uC2A4 \uB370\uBAA8 \uBBF8\uD305 \uC218\uD589 (\uC131\uACF5\uC801 \uD53C\uB4DC\uBC31)\n2. \uB124\uC774\uBC84 \uD074\uB77C\uC6B0\uB4DC \uC5F0\uB3D9 \uC694\uAE08 \uC815\uCC45 \uD611\uC0C1 \uD0C0\uACB0 (B2B \uC8FC\uC18C\uB85D \uB3D9\uAE30\uD654 \uD575\uC2EC \uC544\uC820\uB2E4 \uD574\uACB0)\n3. \uC2E0\uADDC VIP \uBA85\uD568 5\uAC74 \uB4F1\uB85D \uBC0F \uACE0\uAC1D CRM \uB9E4\uD551 \uC644\uB8CC",
    achievementsByDay: {
      mon: "1. \uC8FC\uAC04 \uC601\uC5C5 \uC2E4\uC801 \uBCF4\uACE0 \uD68C\uC758 \uCC38\uC11D\n2. \uC8FC\uC694 VIP \uACE0\uAC1D \uBA54\uC77C \uD53C\uB4DC\uBC31 \uC815\uB9AC \uBC0F \uAE08\uC8FC \uD0C0\uAC9F \uBA85\uB2E8 \uC120\uC815",
      tue: "1. \uB124\uC774\uBC84 \uD074\uB77C\uC6B0\uB4DC \uAE40\uB3C4\uD604 \uC218\uC11D \uC5F0\uAD6C\uC6D0\uACFC \uC720\uC120 \uC694\uAE08 \uBC0F API \uC5F0\uB3D9 \uC544\uC820\uB2E4 \uC0AC\uC804 \uC870\uC728\n2. \uC2E0\uADDC \uD30C\uD2B8\uB108\uC6A9 \uAE30\uD68D \uC124\uBA85\uC11C \uBCF4\uC815 \uC791\uC5C5 \uC644\uB8CC",
      wed: "1. \uB124\uC774\uBC84 \uD074\uB77C\uC6B0\uB4DC B2B \uC8FC\uC18C\uB85D \uC790\uB3D9 \uB3D9\uAE30\uD654 \uAE30\uB2A5 \uD55C\uB3C4 \uBC0F API \uC694\uAE08 \uCD5C\uC885 \uD0C0\uACB0\uC548 \uB3C4\uCD9C\n2. \uB0B4\uBD80 \uBCF4\uACE0\uC6A9 \uC0C1\uC2E0 \uAE30\uC548\uC11C \uAE30\uC548 \uC644\uB8CC",
      thu: "1. \uC0BC\uC131\uC804\uC790 \uC11C\uCD08\uC0AC\uC625 \uC774\uC11C\uC5F0 \uCC45\uC784 PM \uBC29\uBB38 \uB300\uBA74 \uC81C\uC548 \uBBF8\uD305 \uBC0F \uC628\uB514\uBC14\uC774\uC2A4 \uB370\uBAA8 \uC2DC\uC5F0 \uC9C4\uD589\n2. \uACE0\uAC1D \uBCF4\uC548 \uAC00\uC774\uB4DC \uCD94\uAC00 \uC694\uAD6C\uC0AC\uD56D \uC218\uC2E0",
      fri: "1. \uC0BC\uC131\uC804\uC790 2\uCC28 \uBBF8\uD305 \uB300\uC548(\uBCF4\uC548 \uC5F0\uC0B0 \uBD80\uD558 \uAC00\uC774\uB4DC \uBC0F \uB77C\uC774\uBE0C\uB7EC\uB9AC \uACBD\uB7C9\uD654) \uAE30\uC220 \uBD84\uC11D \uC758\uB8B0\n2. \uC2E0\uADDC \uC778\uB9E5 5\uAC74 \uC2DC\uC2A4\uD15C \uB4F1\uB85D \uBC0F CRM \uC815\uBCF4 \uAE30\uC7AC \uC644\uB8CC",
      sat: "",
      sun: ""
    },
    plansNextWeek: "1. \uC0BC\uC131\uC804\uC790 \uBCF4\uC548 \uC694\uAD6C \uAE30\uC220 \uBBF8\uD305 \uC9C4\uD589 \uBC0F \uC644\uC804 \uC628\uB514\uBC14\uC774\uC2A4 \uC635\uC158 \uC544\uD0A4\uD14D\uCC98 \uC81C\uC548\uC11C \uC791\uC131\n2. \uB124\uC774\uBC84 \uD074\uB77C\uC6B0\uB4DC \uD30C\uD2B8\uB108\uC2ED \uCD5C\uC885 \uACC4\uC57D \uC11C\uBA85 \uC870\uC728\n3. \uB300\uB9AC\uC810 \uBC0F \uC720\uD1B5 \uD30C\uD2B8\uB108 \uCD94\uAC00 \uD655\uBCF4\uB97C \uC704\uD55C \uCEE8\uD0DD \uAC00\uB3D9",
    feedbacks: "\uD604\uC7AC \uAC1C\uBC1C\uD300 \uB9AC\uC18C\uC2A4\uAC00 \uD55C\uC815\uB418\uC5B4 \uC788\uC5B4, \uC0BC\uC131\uC804\uC790\uC758 \uC644\uC804 \uC628\uB514\uBC14\uC774\uC2A4 \uC694\uAD6C\uC0AC\uD56D \uC218\uC6A9\uC744 \uC704\uD574\uC11C\uB294 \uBC31\uC5D4\uB4DC \uCD5C\uC801\uD654 \uC5C5\uBB34\uC758 \uC6B0\uC120\uC21C\uC704 \uC7AC\uC870\uC815\uC774 \uD544\uC694\uD568.",
    contactIds: ["c-1", "c-2"],
    projectIds: ["p-1", "p-2"],
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  }
];
var initialUsers = [
  {
    id: "user-demo",
    email: "demo@bizcard.com",
    password: "demo",
    name: "\uBC15\uC601\uB85D",
    type: "individual"
  },
  {
    id: "user-naver1",
    email: "partner1@company.com",
    password: "demo",
    name: "\uC774\uC9C0\uBBFC",
    type: "company",
    companyName: "\uB124\uC774\uBC84",
    businessNumber: "123-45-67890"
  },
  {
    id: "user-naver2",
    email: "partner2@company.com",
    password: "demo",
    name: "\uD55C\uC0C1\uC6B0",
    type: "company",
    companyName: "\uB124\uC774\uBC84",
    businessNumber: "123-45-67890"
  }
];
var users = [];
var db = {};
var inFlightScopeLoads = {};
async function loadScopeFromSupabase(scopeId) {
  if (db[scopeId]) return db[scopeId];
  if (inFlightScopeLoads[scopeId]) return inFlightScopeLoads[scopeId];
  const loadPromise = loadScopeFromSupabaseInner(scopeId).finally(() => {
    delete inFlightScopeLoads[scopeId];
  });
  inFlightScopeLoads[scopeId] = loadPromise;
  return loadPromise;
}
async function loadScopeFromSupabaseInner(scopeId) {
  if (db[scopeId]) return db[scopeId];
  let hadTimeout = false;
  const withTimeout = (promise, label, ms = 4e4) => {
    let timer;
    const timeoutPromise = new Promise((resolve) => {
      timer = setTimeout(() => {
        hadTimeout = true;
        console.error(`getScopedCollection(${scopeId}, ${label}) \uD0C0\uC784\uC544\uC6C3 - \uC774\uBC88 \uC694\uCCAD\uC740 \uBE48 \uBAA9\uB85D\uC73C\uB85C \uCC98\uB9AC\uD569\uB2C8\uB2E4.`);
        resolve([]);
      }, ms);
    });
    return Promise.race([promise, timeoutPromise]).then((result) => {
      clearTimeout(timer);
      return result;
    });
  };
  await ensureScopeInitialized(scopeId, {
    contacts: [],
    projects: [],
    groups: JSON.parse(JSON.stringify(initialGroups)),
    myProfile: {
      name: "",
      company: "",
      department: "",
      title: "",
      phoneMobile: "",
      phoneOffice: "",
      phoneFax: "",
      email: "",
      address: "",
      snsUrl: "",
      website: "",
      memo: ""
    },
    vehicles: [],
    drivingLogs: [],
    expenses: [],
    maintenances: [],
    maintenanceIntervals: [],
    dailyLogs: [],
    weeklyLogs: []
  });
  const contacts = await withTimeout(getScopedCollection(scopeId, "contacts"), "contacts");
  const projects = await withTimeout(getScopedCollection(scopeId, "projects"), "projects");
  const groups = await withTimeout(getScopedCollection(scopeId, "groups"), "groups");
  const vehicles = await withTimeout(getScopedCollection(scopeId, "vehicles"), "vehicles");
  const drivingLogs = await withTimeout(getScopedCollection(scopeId, "drivingLogs"), "drivingLogs");
  const expenses = await withTimeout(getScopedCollection(scopeId, "expenses"), "expenses");
  const maintenances = await withTimeout(getScopedCollection(scopeId, "maintenances"), "maintenances");
  const maintenanceIntervals = await withTimeout(getScopedCollection(scopeId, "maintenanceIntervals"), "maintenanceIntervals");
  const dailyLogs = await withTimeout(getScopedCollection(scopeId, "dailyLogs"), "dailyLogs");
  const weeklyLogs = await withTimeout(getScopedCollection(scopeId, "weeklyLogs"), "weeklyLogs");
  const advancePayments = await withTimeout(getScopedCollection(scopeId, "advancePayments"), "advancePayments");
  const leaveRequests = await withTimeout(getScopedCollection(scopeId, "leaveRequests"), "leaveRequests");
  const officialDocuments = await withTimeout(getScopedCollection(scopeId, "officialDocuments"), "officialDocuments");
  const adminDocs = await withTimeout(getScopedCollection(scopeId, "adminDocs"), "adminDocs");
  const announcements = await withTimeout(getScopedCollection(scopeId, "announcements"), "announcements");
  const chatMessages = await withTimeout(getScopedCollection(scopeId, "chatMessages"), "chatMessages");
  const chatGroups = await withTimeout(getScopedCollection(scopeId, "chatGroups"), "chatGroups");
  const profileList = await withTimeout(getScopedCollection(scopeId, "myProfile"), "myProfile");
  const myProfile = profileList.find((p) => p.email === "parkyl5454@gmail.com") || profileList[0] || initialMyProfile;
  const loadedData = {
    contacts,
    projects,
    groups,
    myProfile,
    vehicles,
    drivingLogs,
    expenses,
    maintenances,
    maintenanceIntervals,
    dailyLogs,
    weeklyLogs,
    advancePayments,
    leaveRequests,
    officialDocuments,
    adminDocs,
    announcements,
    chatMessages,
    chatGroups
  };
  if (hadTimeout) {
    return loadedData;
  }
  db[scopeId] = loadedData;
  return db[scopeId];
}
async function bootstrapUsers() {
  users = await getUsers();
  if (users.length === 0) {
    await ensureUsersSeeded(initialUsers);
    users = await getUsers();
  }
}
function resolveScopeId(req) {
  const userId = req.headers["x-user-id"];
  let scopeId = "default";
  if (userId) {
    const user = users.find((u) => u.id === userId);
    if (user) {
      scopeId = scopeIdForUser(user);
    }
  }
  return scopeId;
}
function getScopedData(req) {
  const scopeId = req.scopeId || "default";
  return db[scopeId] || {
    contacts: [],
    projects: [],
    groups: [],
    myProfile: initialMyProfile,
    vehicles: [],
    drivingLogs: [],
    expenses: [],
    maintenances: [],
    maintenanceIntervals: [],
    dailyLogs: [],
    weeklyLogs: [],
    advancePayments: [],
    leaveRequests: [],
    officialDocuments: [],
    adminDocs: [],
    announcements: [],
    chatMessages: [],
    chatGroups: []
  };
}
var PENDING_APPROVAL_ALLOWED_PATHS = /* @__PURE__ */ new Set([
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
  "/api/auth/resend-verification",
  "/api/auth/withdraw",
  "/api/auth/lookup-company",
  // 회원가입 화면에서 로그인 전에도 써야 하는 유일한 공개 API
  // [수정] 아래 둘은 로그인한 "사용자"가 아니라 외부 크론 서비스가 주기적으로 호출하는
  // 엔드포인트다. 각자 CRON_SECRET 헤더로 자체적으로 보호하고 있으니(값 모르면 401),
  // 로그인 세션 요구 게이트에서는 예외로 통과시켜준다 — 안 그러면 크론이 애초에 호출을
  // 못 해서(사람이 로그인한 세션이 없으니) 아무 때도 자동으로 못 돈다.
  "/api/billing/run-scheduled",
  "/api/admin/run-company-summary-batch",
  // [추가] 애플 캘린더(아이폰/아이패드/맥) 구독 피드. 캘린더 앱은 로그인 세션 없이
  // URL 하나만 주기적으로 GET 요청하는 방식이라, x-user-id 로그인 세션 헤더를 절대
  // 보내지 않는다. 이 라우트는 URL에 담긴 무작위 토큰으로 자체적으로 사용자를 식별하고
  // 있으니(server.ts의 app.get('/api/worklogs/calendar.ics', ...) 참고), 로그인 세션
  // 요구 게이트에서는 예외로 통과시켜야 한다 — 안 그러면 항상 401(sessionExpired)로
  // 막혀서 캘린더 앱이 절대 내용을 받아올 수 없다.
  "/api/worklogs/calendar.ics"
]);
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  if (PENDING_APPROVAL_ALLOWED_PATHS.has(req.path)) return next();
  const userId = req.headers["x-user-id"];
  const requester = userId ? users.find((u) => u.id === userId) : void 0;
  if (!requester) {
    return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uB2E4\uC2DC \uB85C\uADF8\uC778\uD574\uC8FC\uC138\uC694.", sessionExpired: true });
  }
  if (requester.type === "company" && requester.approvalStatus === "pending") {
    return res.status(403).json({
      error: "\uC544\uC9C1 \uD68C\uC0AC \uAD00\uB9AC\uC790\uC758 \uC2B9\uC778\uC744 \uBC1B\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC2B9\uC778 \uD6C4 \uC774\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      pendingApproval: true
    });
  }
  if (!isEmailVerified(requester.emailVerified)) {
    return res.status(403).json({
      error: "\uC774\uBA54\uC77C \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uBC1B\uC73C\uC2E0 \uC778\uC99D \uBA54\uC77C\uC758 \uB9C1\uD06C\uB97C \uB20C\uB7EC\uC8FC\uC138\uC694.",
      emailVerificationRequired: true
    });
  }
  next();
});
app.use(async (req, res, next) => {
  try {
    const scopeId = resolveScopeId(req);
    req.scopeId = scopeId;
    await loadScopeFromSupabase(scopeId);
    next();
  } catch (error) {
    console.error("Scope resolution error:", error);
    next(error);
  }
});
var KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
async function geocodeAddress(address) {
  const result = await geocodeAddressWithDiagnostics(address);
  return result.coords;
}
async function geocodeAddressWithDiagnostics(address) {
  let cleaned = (address || "").trim();
  cleaned = cleaned.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ");
  cleaned = cleaned.replace(/대한민국|South\s*Korea|Republic\s*of\s*Korea|(?<![가-힣])한국(?![가-힣])/gi, " ").replace(/,?\s*\b\d{5}\b/g, " ").replace(/,?\s*\b\d{3}-\d{3}\b/g, " ").replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").replace(/,\s*$/, "").trim();
  const PROVINCE_NAMES = [
    "\uC11C\uC6B8\uD2B9\uBCC4\uC2DC",
    "\uC11C\uC6B8\uC2DC",
    "\uC11C\uC6B8",
    "\uBD80\uC0B0\uAD11\uC5ED\uC2DC",
    "\uBD80\uC0B0\uC2DC",
    "\uBD80\uC0B0",
    "\uB300\uAD6C\uAD11\uC5ED\uC2DC",
    "\uB300\uAD6C\uC2DC",
    "\uB300\uAD6C",
    "\uC778\uCC9C\uAD11\uC5ED\uC2DC",
    "\uC778\uCC9C\uC2DC",
    "\uC778\uCC9C",
    "\uAD11\uC8FC\uAD11\uC5ED\uC2DC",
    "\uAD11\uC8FC\uC2DC",
    "\uAD11\uC8FC",
    "\uB300\uC804\uAD11\uC5ED\uC2DC",
    "\uB300\uC804\uC2DC",
    "\uB300\uC804",
    "\uC6B8\uC0B0\uAD11\uC5ED\uC2DC",
    "\uC6B8\uC0B0\uC2DC",
    "\uC6B8\uC0B0",
    "\uC138\uC885\uD2B9\uBCC4\uC790\uCE58\uC2DC",
    "\uC138\uC885\uC2DC",
    "\uC138\uC885",
    "\uACBD\uAE30\uB3C4",
    "\uACBD\uAE30",
    "\uAC15\uC6D0\uD2B9\uBCC4\uC790\uCE58\uB3C4",
    "\uAC15\uC6D0\uB3C4",
    "\uAC15\uC6D0",
    "\uCDA9\uCCAD\uBD81\uB3C4",
    "\uCDA9\uBD81",
    "\uCDA9\uCCAD\uB0A8\uB3C4",
    "\uCDA9\uB0A8",
    "\uC804\uBD81\uD2B9\uBCC4\uC790\uCE58\uB3C4",
    "\uC804\uB77C\uBD81\uB3C4",
    "\uC804\uBD81",
    "\uC804\uB77C\uB0A8\uB3C4",
    "\uC804\uB0A8",
    "\uACBD\uC0C1\uBD81\uB3C4",
    "\uACBD\uBD81",
    "\uACBD\uC0C1\uB0A8\uB3C4",
    "\uACBD\uB0A8",
    "\uC81C\uC8FC\uD2B9\uBCC4\uC790\uCE58\uB3C4",
    "\uC81C\uC8FC\uB3C4",
    "\uC81C\uC8FC"
  ];
  for (const province of PROVINCE_NAMES) {
    const idx = cleaned.indexOf(province);
    if (idx > 2) {
      cleaned = `${province} ${cleaned.slice(0, idx)}${cleaned.slice(idx + province.length)}`.replace(/\s{2,}/g, " ").trim();
      break;
    }
  }
  const trimmed = cleaned.slice(0, 100);
  if (!trimmed) return { coords: null, error: "\uC8FC\uC18C\uAC00 \uBE44\uC5B4\uC788\uC74C" };
  if (!KAKAO_REST_API_KEY) {
    return { coords: null, error: "KAKAO_REST_API_KEY \uD658\uACBD\uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC74C" };
  }
  const headers = { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` };
  try {
    const addrRes = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(trimmed)}`, { headers });
    if (addrRes.ok) {
      const addrData = await addrRes.json();
      const doc = addrData?.documents?.[0];
      if (doc) return { coords: { lat: parseFloat(doc.y), lng: parseFloat(doc.x) } };
    } else {
      const bodyText = await addrRes.text().catch(() => "");
      console.error(`\uCE74\uCE74\uC624 \uC8FC\uC18C \uAC80\uC0C9 API \uC624\uB958 (\uC0C1\uD0DC ${addrRes.status}, \uC8FC\uC18C: "${trimmed}"):`, bodyText.slice(0, 300));
      if (addrRes.status === 401 || addrRes.status === 403) {
        return { coords: null, error: `\uCE74\uCE74\uC624 API \uC778\uC99D \uC2E4\uD328 (\uC0C1\uD0DC ${addrRes.status}) - REST API \uD0A4\uAC00 \uC798\uBABB\uB410\uAC70\uB098, \uB85C\uCEEC API \uC0AC\uC6A9 \uC124\uC815\uC774 \uC548 \uB3FC\uC788\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.` };
      }
      if (addrRes.status === 400) {
        return { coords: null, error: `\uCE74\uCE74\uC624 API 400 \uC624\uB958 (\uC8FC\uC18C: "${trimmed.slice(0, 40)}") - ${bodyText.slice(0, 200)}` };
      }
    }
    const keywordRes = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(trimmed)}`, { headers });
    if (keywordRes.ok) {
      const keywordData = await keywordRes.json();
      const doc = keywordData?.documents?.[0];
      if (doc) return { coords: { lat: parseFloat(doc.y), lng: parseFloat(doc.x) } };
      const candidateQueries = [];
      const coreAddress = trimmed.replace(/\([^)]*\)/g, " ").replace(/\d+\s*층.*$/, "").replace(/\s{2,}/g, " ").trim();
      if (coreAddress && coreAddress !== trimmed && coreAddress.length >= 4) {
        candidateQueries.push(coreAddress);
      }
      const base = coreAddress || trimmed;
      const tokens = base.split(" ").filter(Boolean);
      for (let cut = tokens.length - 1; cut >= 2; cut--) {
        const candidate = tokens.slice(0, cut).join(" ");
        if (candidate.length >= 4 && !candidateQueries.includes(candidate)) {
          candidateQueries.push(candidate);
        }
      }
      for (const candidate of candidateQueries) {
        try {
          const candRes = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(candidate)}`, { headers });
          if (candRes.ok) {
            const candData = await candRes.json();
            const candDoc = candData?.documents?.[0];
            if (candDoc) return { coords: { lat: parseFloat(candDoc.y), lng: parseFloat(candDoc.x) } };
          }
        } catch {
        }
      }
      return { coords: null, error: `\uC8FC\uC18C/\uD0A4\uC6CC\uB4DC \uAC80\uC0C9 \uACB0\uACFC \uC5C6\uC74C (\uC2E4\uC81C \uBCF4\uB0B8 \uAC80\uC0C9\uC5B4: "${trimmed}")` };
    } else {
      const bodyText = await keywordRes.text().catch(() => "");
      console.error(`\uCE74\uCE74\uC624 \uD0A4\uC6CC\uB4DC \uAC80\uC0C9 API \uC624\uB958 (\uC0C1\uD0DC ${keywordRes.status}, \uC8FC\uC18C: "${trimmed}"):`, bodyText.slice(0, 300));
      return { coords: null, error: `\uCE74\uCE74\uC624 API \uC624\uB958 (\uC0C1\uD0DC ${keywordRes.status}) - ${bodyText.slice(0, 200)}` };
    }
  } catch (err) {
    console.error("\uC8FC\uC18C \uC9C0\uC624\uCF54\uB529 \uC911 \uC624\uB958:", err);
    return { coords: null, error: `\uB124\uD2B8\uC6CC\uD06C \uC624\uB958: ${err.message || "\uC54C \uC218 \uC5C6\uC74C"}` };
  }
}
async function persistImageField(scopeId, value, keyHint, category = "cards") {
  if (!value || !value.startsWith("data:image/")) return value;
  try {
    const url = await uploadDataUrlImage(scopeId, value, keyHint, category);
    return url || value;
  } catch (err) {
    console.error(`persistImageField(${keyHint}) \uC2E4\uD328, base64\uB97C \uADF8\uB300\uB85C \uC800\uC7A5\uD569\uB2C8\uB2E4:`, err);
    return value;
  }
}
async function persistReceiptImagesInArray(scopeId, items, keyPrefix) {
  if (!items || !items.length) return items;
  return Promise.all(items.map(async (item) => ({
    ...item,
    receiptImage: await persistImageField(scopeId, item.receiptImage, `${keyPrefix}-${item.id}`, "receipts")
  })));
}
async function persistFileField(scopeId, value, keyHint, category = "attachments") {
  if (!value || !value.startsWith("data:")) return value;
  try {
    const url = await uploadDataUrlFile(scopeId, value, keyHint, category);
    return url || value;
  } catch (err) {
    console.error(`persistFileField(${keyHint}) \uC2E4\uD328, base64\uB97C \uADF8\uB300\uB85C \uC800\uC7A5\uD569\uB2C8\uB2E4:`, err);
    return value;
  }
}
async function persistAttachmentsInArray(scopeId, attachments, keyPrefix) {
  if (!attachments || !attachments.length) return attachments;
  return Promise.all(attachments.map(async (att) => {
    if (!att.dataUrl || !att.dataUrl.startsWith("data:")) return att;
    try {
      const url = await uploadDataUrlFile(scopeId, att.dataUrl, `${keyPrefix}-${att.id}`, "attachments", att.name);
      return url ? { ...att, dataUrl: url } : att;
    } catch (err) {
      console.error(`persistAttachmentsInArray(${keyPrefix}-${att.id}) \uC2E4\uD328, base64\uB97C \uADF8\uB300\uB85C \uC800\uC7A5\uD569\uB2C8\uB2E4:`, err);
      return att;
    }
  }));
}
function verifyPassword(inputPassword, storedPassword) {
  if (!storedPassword) return false;
  if (storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$") || storedPassword.startsWith("$2y$")) {
    return import_bcryptjs.default.compareSync(inputPassword, storedPassword);
  }
  return inputPassword === storedPassword;
}
var loginRateLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 10 * 60 * 1e3, lockoutMs: 10 * 60 * 1e3 });
var signupRateLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 60 * 60 * 1e3 });
var companyLookupRateLimiter = new RateLimiter({ maxAttempts: 30, windowMs: 60 * 60 * 1e3 });
var aiScanRateLimiter = new RateLimiter({ maxAttempts: 100, windowMs: 10 * 60 * 1e3 });
app.get("/api/auth/lookup-company", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const limit = companyLookupRateLimiter.check(ip);
  companyLookupRateLimiter.registerAttempt(ip);
  if (!limit.allowed) {
    return res.status(429).json({ error: "\uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  const businessNumber = String(req.query.businessNumber || "").trim();
  if (!businessNumber) return res.json({ found: false });
  const existing = users.find((u) => u.type === "company" && (u.businessNumber || "").trim() === businessNumber);
  if (!existing) return res.json({ found: false });
  res.json({ found: true, companyName: existing.companyName || "" });
});
function generateReferralCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
async function getOrCreateReferralCode(user) {
  if (user.referralCode) return user.referralCode;
  let code = generateReferralCode();
  while (users.some((u) => u.referralCode === code)) {
    code = generateReferralCode();
  }
  user.referralCode = code;
  await addUser(user);
  return code;
}
async function applyReferralCreditMonths(user, months) {
  if (months <= 0) return;
  if (user.subscriptionStatus === "active" && user.nextBillingAt) {
    let next = new Date(user.nextBillingAt);
    for (let i = 0; i < months; i++) next = addOneMonth(next);
    user.nextBillingAt = next.toISOString();
  } else {
    user.referralCreditMonths = (user.referralCreditMonths || 0) + months;
  }
  await addUser(user);
}
app.get("/api/referral/me", async (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const code = await getOrCreateReferralCode(requester);
  const referrals = await getReferralsForUser(requester.id);
  res.json({
    referralCode: code,
    shareUrl: `${APP_BASE_URL}/?ref=${code}`,
    totalReferred: referrals.length,
    totalRewarded: referrals.filter((r) => r.status === "rewarded").length,
    pendingCreditMonths: requester.referralCreditMonths || 0,
    referrals: referrals.map((r) => ({
      refereeName: r.referee_name,
      refereeEmail: r.referee_email,
      status: r.status,
      createdAt: r.created_at,
      rewardedAt: r.rewarded_at
    }))
  });
});
app.get("/api/announcements", (req, res) => {
  const userId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === userId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const dbData = getScopedData(req);
  const list = dbData.announcements || [];
  const sorted = [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  res.json(sorted);
});
app.post("/api/announcements", async (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const scopeId = req.scopeId;
  const dbData = getScopedData(req);
  const { title, content, pinned } = req.body;
  if (!title || !String(title).trim() || !content || !String(content).trim()) {
    return res.status(400).json({ error: "\uC81C\uBAA9\uACFC \uB0B4\uC6A9\uC744 \uBAA8\uB450 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const announcement = {
    id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scopeId,
    authorUserId: requester.id,
    authorName: requester.name,
    title: String(title).trim(),
    content: String(content).trim(),
    pinned: Boolean(pinned),
    createdAt: now,
    updatedAt: now
  };
  dbData.announcements = dbData.announcements || [];
  dbData.announcements.unshift(announcement);
  const saved = await setScopedDoc(scopeId, "announcements", announcement);
  if (!saved) {
    dbData.announcements = dbData.announcements.filter((a) => a.id !== announcement.id);
    return res.status(500).json({ error: "\uACF5\uC9C0\uC0AC\uD56D\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.status(201).json(announcement);
});
app.put("/api/announcements/:id", async (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const scopeId = req.scopeId;
  const dbData = getScopedData(req);
  dbData.announcements = dbData.announcements || [];
  const idx = dbData.announcements.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "\uACF5\uC9C0\uC0AC\uD56D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  const previous = dbData.announcements[idx];
  const { title, content, pinned } = req.body;
  const updated = {
    ...previous,
    title: typeof title === "string" && title.trim() ? title.trim() : previous.title,
    content: typeof content === "string" && content.trim() ? content.trim() : previous.content,
    pinned: typeof pinned === "boolean" ? pinned : previous.pinned,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  dbData.announcements[idx] = updated;
  const saved = await setScopedDoc(scopeId, "announcements", updated);
  if (!saved) {
    dbData.announcements[idx] = previous;
    return res.status(500).json({ error: "\uACF5\uC9C0\uC0AC\uD56D \uC218\uC815 \uB0B4\uC6A9\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.json(updated);
});
app.delete("/api/announcements/:id", async (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const scopeId = req.scopeId;
  const dbData = getScopedData(req);
  dbData.announcements = dbData.announcements || [];
  dbData.announcements = dbData.announcements.filter((a) => a.id !== req.params.id);
  await deleteScopedDoc(scopeId, "announcements", req.params.id);
  res.json({ success: true });
});
function canAccessGroupChannel(dbData, channel, requesterId) {
  const groupId = channel.slice("group:".length);
  const group = (dbData.chatGroups || []).find((g) => g.id === groupId);
  return Boolean(group && group.memberUserIds.includes(requesterId));
}
app.get("/api/chat/messages", (req, res) => {
  const userId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === userId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const channel = String(req.query.channel || "team");
  const dbData = getScopedData(req);
  if (channel.startsWith("dm:")) {
    const parts = channel.slice(3).split(":");
    if (!parts.includes(requester.id)) {
      return res.status(403).json({ error: "\uC774 \uB300\uD654\uB97C \uC870\uD68C\uD560 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
    }
  } else if (channel.startsWith("group:") && !canAccessGroupChannel(dbData, channel, requester.id)) {
    return res.status(403).json({ error: "\uC774 \uADF8\uB8F9 \uB300\uD654\uB97C \uC870\uD68C\uD560 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
  }
  const all = dbData.chatMessages || [];
  const since = req.query.sinceId ? String(req.query.sinceId) : void 0;
  let list = all.filter((m) => m.channel === channel);
  if (since) {
    const sinceIdx = list.findIndex((m) => m.id === since);
    if (sinceIdx !== -1) list = list.slice(sinceIdx + 1);
  } else {
    list = list.slice(-50);
  }
  res.json(list);
});
app.post("/api/chat/messages", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === userId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const channel = String(req.body.channel || "team");
  const content = String(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "\uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  if (content.length > 2e3) return res.status(400).json({ error: "\uBA54\uC2DC\uC9C0\uAC00 \uB108\uBB34 \uAE41\uB2C8\uB2E4 (\uCD5C\uB300 2000\uC790)." });
  const scopeId = req.scopeId;
  const dbData = getScopedData(req);
  if (channel.startsWith("dm:")) {
    const parts = channel.slice(3).split(":");
    if (!parts.includes(requester.id)) {
      return res.status(403).json({ error: "\uC774 \uB300\uD654\uC5D0 \uBCF4\uB0BC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
    }
  } else if (channel.startsWith("group:") && !canAccessGroupChannel(dbData, channel, requester.id)) {
    return res.status(403).json({ error: "\uC774 \uADF8\uB8F9 \uB300\uD654\uC5D0 \uBCF4\uB0BC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
  }
  const message = {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scopeId,
    channel,
    senderUserId: requester.id,
    senderName: requester.name,
    content,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  dbData.chatMessages = dbData.chatMessages || [];
  dbData.chatMessages.push(message);
  const saved = await setScopedDoc(scopeId, "chatMessages", message);
  if (!saved) {
    dbData.chatMessages = dbData.chatMessages.filter((m) => m.id !== message.id);
    return res.status(500).json({ error: "\uBA54\uC2DC\uC9C0\uB97C \uC804\uC1A1\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.status(201).json(message);
});
app.get("/api/chat/groups", (req, res) => {
  const userId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === userId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const dbData = getScopedData(req);
  const groups = dbData.chatGroups || [];
  const myGroups = groups.filter((g) => g.memberUserIds.includes(requester.id));
  res.json(myGroups);
});
app.post("/api/chat/groups", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === userId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const name = String(req.body.name || "").trim();
  const memberUserIds = Array.isArray(req.body.memberUserIds) ? req.body.memberUserIds : [];
  if (!name) return res.status(400).json({ error: "\uADF8\uB8F9 \uC774\uB984\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  const scopeId = req.scopeId;
  const uniqueMemberIds = Array.from(/* @__PURE__ */ new Set([requester.id, ...memberUserIds]));
  if (uniqueMemberIds.length < 2) {
    return res.status(400).json({ error: "\uBCF8\uC778 \uC678\uC5D0 1\uBA85 \uC774\uC0C1\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694." });
  }
  const invalidMember = uniqueMemberIds.find((id) => {
    const u = users.find((cand) => cand.id === id);
    return !u || scopeIdForUser(u) !== scopeId;
  });
  if (invalidMember) {
    return res.status(400).json({ error: "\uAC19\uC740 \uD68C\uC0AC \uC18C\uC18D \uB3D9\uB8CC\uB9CC \uADF8\uB8F9\uC5D0 \uCD08\uB300\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  }
  const dbData = getScopedData(req);
  const group = {
    id: `chatgroup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scopeId,
    name,
    memberUserIds: uniqueMemberIds,
    createdByUserId: requester.id,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  dbData.chatGroups = dbData.chatGroups || [];
  dbData.chatGroups.push(group);
  const saved = await setScopedDoc(scopeId, "chatGroups", group);
  if (!saved) {
    dbData.chatGroups = dbData.chatGroups.filter((g) => g.id !== group.id);
    return res.status(500).json({ error: "\uADF8\uB8F9\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.status(201).json(group);
});
app.post("/api/auth/signup", async (req, res) => {
  const signupIp = req.ip || req.socket.remoteAddress || "unknown";
  const signupLimit = signupRateLimiter.check(signupIp);
  signupRateLimiter.registerAttempt(signupIp);
  if (!signupLimit.allowed) {
    return res.status(429).json({ error: `\uAC00\uC785 \uC2DC\uB3C4\uAC00 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. ${signupLimit.retryAfterSec}\uCD08 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.` });
  }
  const { email, password, name, phone, type, companyName, businessNumber, position, referralCode } = req.body;
  if (!email || !password || !name || !type) {
    return res.status(400).json({ error: "\uD544\uC218 \uAC00\uC785 \uC815\uBCF4\uAC00 \uB204\uB77D\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normalizedEmail = email.toLowerCase().trim();
  if (!emailRegex.test(normalizedEmail)) {
    return res.status(400).json({ error: "\uC62C\uBC14\uB978 \uC774\uBA54\uC77C \uD615\uC2DD\uC774 \uC544\uB2D9\uB2C8\uB2E4." });
  }
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "\uC774\uB984\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  }
  if (phone && typeof phone !== "string") {
    return res.status(400).json({ error: "\uC804\uD654\uBC88\uD638 \uD615\uC2DD\uC774 \uC798\uBABB\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
  }
  if (companyName && typeof companyName !== "string") {
    return res.status(400).json({ error: "\uD68C\uC0AC\uBA85 \uD615\uC2DD\uC774 \uC798\uBABB\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
  }
  const passwordValidation = validatePasswordComplexity(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ error: passwordValidation.error });
  }
  let existing = users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!existing && isSupabaseConfigured) {
    const freshUsers = await getUsers();
    existing = freshUsers.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (existing) users = freshUsers;
  }
  if (existing) {
    return res.status(400).json({ error: "\uC774\uBBF8 \uAC00\uC785\uC5D0 \uC0AC\uC6A9\uB41C \uC774\uBA54\uC77C\uC785\uB2C8\uB2E4. \uAC1C\uC778/\uC0AC\uC5C5\uC790 \uACC4\uC815 \uBAA8\uB450 \uAC19\uC740 \uC774\uBA54\uC77C\uB85C\uB294 \uC911\uBCF5 \uAC00\uC785\uD560 \uC218 \uC5C6\uC73C\uB2C8, \uB2E4\uB978 \uC774\uBA54\uC77C\uB85C \uAC00\uC785\uD574\uC8FC\uC138\uC694." });
  }
  const cName = (companyName || "").trim();
  const bNum = (businessNumber || "").trim();
  const existingCompanyUser = users.find((u) => u.type === "company" && (u.businessNumber || "").trim() === bNum);
  const hasExistingCompanyUser = Boolean(existingCompanyUser);
  const finalCompanyName = existingCompanyUser?.companyName || cName;
  const { role, approvalStatus } = decideSignupRoleAndApproval(type, hasExistingCompanyUser);
  const emailVerificationToken = isMailerConfigured ? import_crypto2.default.randomBytes(32).toString("hex") : void 0;
  const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1e3;
  const newUser = {
    id: `user-${Date.now()}`,
    email: email.toLowerCase(),
    password: import_bcryptjs.default.hashSync(password, 10),
    // 안전하게 암호화하여 저장
    name,
    phone: phone || void 0,
    type,
    companyName: type === "company" ? finalCompanyName : companyName,
    businessNumber,
    position: position || void 0,
    role,
    approvalStatus,
    emailVerified: !isMailerConfigured,
    emailVerificationToken,
    emailVerificationTokenExpiresAt: emailVerificationToken ? Date.now() + EMAIL_VERIFICATION_TTL_MS : void 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  users.push(newUser);
  await addUser(newUser);
  if (typeof referralCode === "string" && referralCode.trim()) {
    const normalizedCode = referralCode.trim().toUpperCase();
    const referrer = users.find((u) => u.referralCode === normalizedCode && u.id !== newUser.id);
    if (referrer) {
      newUser.referredByUserId = referrer.id;
      await addUser(newUser);
      await createReferral({
        referrerUserId: referrer.id,
        refereeUserId: newUser.id,
        refereeEmail: newUser.email,
        refereeName: newUser.name
      });
    }
  }
  const dummyReq = { headers: { "x-user-id": newUser.id } };
  await loadScopeFromSupabase(resolveScopeId(dummyReq));
  if (emailVerificationToken) {
    try {
      const verifyUrl = `${APP_BASE_URL}/?verifyToken=${emailVerificationToken}`;
      await sendEmail({
        to: newUser.email,
        subject: "[BizCard] \uC774\uBA54\uC77C \uC8FC\uC18C\uB97C \uC778\uC99D\uD574\uC8FC\uC138\uC694",
        html: `
          <p>\uC548\uB155\uD558\uC138\uC694, ${escapeHtml(newUser.name)}\uB2D8.</p>
          <p>\uC544\uB798 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uC774\uBA54\uC77C \uC778\uC99D\uC744 \uC644\uB8CC\uD574\uC8FC\uC138\uC694 (24\uC2DC\uAC04 \uC774\uB0B4 \uC720\uD6A8).</p>
          <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;">\uC774\uBA54\uC77C \uC778\uC99D\uD558\uAE30</a></p>
          <p>\uBC84\uD2BC\uC774 \uC548 \uB20C\uB9AC\uBA74 \uC774 \uB9C1\uD06C\uB97C \uBE0C\uB77C\uC6B0\uC800\uC5D0 \uBD99\uC5EC\uB123\uC5B4\uC8FC\uC138\uC694: ${verifyUrl}</p>
        `
      });
    } catch (err) {
      console.error("\uD68C\uC6D0\uAC00\uC785 \uC778\uC99D \uBA54\uC77C \uBC1C\uC1A1 \uC2E4\uD328:", err);
    }
  }
  const signupSession = await createSession(newUser.id, true);
  setSessionCookie(req, res, signupSession.token, signupSession.ttlMs);
  res.status(201).json({
    success: true,
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      type: newUser.type,
      companyName: newUser.companyName,
      businessNumber: newUser.businessNumber,
      position: newUser.position,
      role: newUser.role,
      approvalStatus: newUser.approvalStatus,
      emailVerified: newUser.emailVerified
    }
  });
});
app.post("/api/auth/login", async (req, res) => {
  const { email, password, rememberMe } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "\uC774\uBA54\uC77C\uACFC \uBE44\uBC00\uBC88\uD638\uB97C \uBAA8\uB450 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  }
  const normalizedEmailForLimit = String(email).trim().toLowerCase();
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const limitKey = `${normalizedEmailForLimit}::${clientIp}`;
  const limitCheck = loginRateLimiter.check(limitKey);
  if (!limitCheck.allowed) {
    return res.status(429).json({
      error: `\uB85C\uADF8\uC778 \uC2DC\uB3C4\uAC00 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. ${limitCheck.retryAfterSec}\uCD08 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.`
    });
  }
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !verifyPassword(password, user.password)) {
    loginRateLimiter.registerAttempt(limitKey);
    return res.status(401).json({ error: "\uC774\uBA54\uC77C \uD639\uC740 \uBE44\uBC00\uBC88\uD638\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
  }
  loginRateLimiter.reset(limitKey);
  if (!user.password?.startsWith("$2")) {
    user.password = import_bcryptjs.default.hashSync(password, 10);
    await addUser(user);
  }
  const loginSession = await createSession(user.id, rememberMe !== false);
  setSessionCookie(req, res, loginSession.token, loginSession.ttlMs);
  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      type: user.type,
      companyName: user.companyName,
      businessNumber: user.businessNumber,
      position: user.position,
      role: user.role,
      approvalStatus: user.approvalStatus,
      emailVerified: isEmailVerified(user.emailVerified),
      signatureImage: user.signatureImage
    }
  });
});
app.post("/api/auth/verify-email", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "\uC778\uC99D \uD1A0\uD070\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
  const user = users.find((u) => u.emailVerificationToken === token);
  if (!user) return res.status(400).json({ error: "\uC778\uC99D \uB9C1\uD06C\uAC00 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC774\uBBF8 \uC0AC\uC6A9\uB410\uAC70\uB098 \uC798\uBABB\uB41C \uB9C1\uD06C\uC77C \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  if (!user.emailVerificationTokenExpiresAt || user.emailVerificationTokenExpiresAt < Date.now()) {
    return res.status(400).json({ error: "\uC778\uC99D \uB9C1\uD06C\uAC00 \uB9CC\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC778\uC99D \uBA54\uC77C\uC744 \uB2E4\uC2DC \uBC1B\uC544\uC8FC\uC138\uC694." });
  }
  user.emailVerified = true;
  user.emailVerificationToken = void 0;
  user.emailVerificationTokenExpiresAt = void 0;
  await addUser(user);
  res.json({ success: true, message: "\uC774\uBA54\uC77C \uC778\uC99D\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
});
var resendVerificationRateLimiter = new RateLimiter({ maxAttempts: 3, windowMs: 15 * 60 * 1e3 });
app.post("/api/auth/resend-verification", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "\uC774\uBA54\uC77C\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  const normalizedEmail = String(email).trim().toLowerCase();
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const resendKey = `${normalizedEmail}::${clientIp}`;
  const limitCheck = resendVerificationRateLimiter.check(resendKey);
  resendVerificationRateLimiter.registerAttempt(resendKey);
  if (!limitCheck.allowed) {
    return res.status(429).json({ error: `\uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. ${limitCheck.retryAfterSec}\uCD08 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.` });
  }
  const user = users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (user && !isEmailVerified(user.emailVerified) && isMailerConfigured) {
    user.emailVerificationToken = import_crypto2.default.randomBytes(32).toString("hex");
    user.emailVerificationTokenExpiresAt = Date.now() + 24 * 60 * 60 * 1e3;
    await addUser(user);
    try {
      const verifyUrl = `${APP_BASE_URL}/?verifyToken=${user.emailVerificationToken}`;
      await sendEmail({
        to: user.email,
        subject: "[BizCard] \uC774\uBA54\uC77C \uC8FC\uC18C\uB97C \uC778\uC99D\uD574\uC8FC\uC138\uC694",
        html: `
          <p>\uC548\uB155\uD558\uC138\uC694, ${escapeHtml(user.name)}\uB2D8.</p>
          <p>\uC544\uB798 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uC774\uBA54\uC77C \uC778\uC99D\uC744 \uC644\uB8CC\uD574\uC8FC\uC138\uC694 (24\uC2DC\uAC04 \uC774\uB0B4 \uC720\uD6A8).</p>
          <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;">\uC774\uBA54\uC77C \uC778\uC99D\uD558\uAE30</a></p>
          <p>\uBC84\uD2BC\uC774 \uC548 \uB20C\uB9AC\uBA74 \uC774 \uB9C1\uD06C\uB97C \uBE0C\uB77C\uC6B0\uC800\uC5D0 \uBD99\uC5EC\uB123\uC5B4\uC8FC\uC138\uC694: ${verifyUrl}</p>
        `
      });
    } catch (err) {
      console.error("\uC778\uC99D \uBA54\uC77C \uC7AC\uC804\uC1A1 \uC2E4\uD328:", err);
    }
  }
  res.json({ success: true, message: "\uC785\uB825\uD558\uC2E0 \uC774\uBA54\uC77C\uB85C \uAC00\uC785\uB41C \uBBF8\uC778\uC99D \uACC4\uC815\uC774 \uC788\uB2E4\uBA74, \uC778\uC99D \uBA54\uC77C\uC744 \uB2E4\uC2DC \uBCF4\uB0B4\uB4DC\uB838\uC2B5\uB2C8\uB2E4." });
});
app.post("/api/auth/logout", async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (token) {
    sessions.delete(token);
    await deleteSession(token);
  }
  clearSessionCookie(res);
  res.json({ success: true });
});
app.get("/api/auth/me", (req, res) => {
  const userId = req.headers["x-user-id"];
  const user = userId ? users.find((u) => u.id === userId) : void 0;
  if (!user) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      type: user.type,
      companyName: user.companyName,
      businessNumber: user.businessNumber,
      position: user.position,
      role: user.role,
      approvalStatus: user.approvalStatus,
      emailVerified: isEmailVerified(user.emailVerified),
      signatureImage: user.signatureImage
    }
  });
});
app.put("/api/auth/signature", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const user = users.find((u) => u.id === userId);
  if (!user) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const { signatureImage } = req.body;
  if (typeof signatureImage !== "string" || !signatureImage.startsWith("data:image/")) {
    return res.status(400).json({ error: "\uC11C\uBA85 \uC774\uBBF8\uC9C0 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
  }
  const previousSignatureImage = user.signatureImage;
  user.signatureImage = await persistImageField(scopeIdForUser(user), signatureImage, `sig-${user.id}`, "signatures");
  const savedUser = await addUser(user);
  if (!savedUser) {
    user.signatureImage = previousSignatureImage;
    return res.status(500).json({ error: "\uC11C\uBA85 \uC774\uBBF8\uC9C0\uB97C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      type: user.type,
      companyName: user.companyName,
      businessNumber: user.businessNumber,
      position: user.position,
      role: user.role,
      approvalStatus: user.approvalStatus,
      emailVerified: isEmailVerified(user.emailVerified),
      signatureImage: user.signatureImage
    }
  });
});
var passwordResetTokens = /* @__PURE__ */ new Map();
var RESET_TOKEN_TTL_MS = 30 * 60 * 1e3;
var forgotPasswordRateLimiter = new RateLimiter({ maxAttempts: 3, windowMs: 15 * 60 * 1e3 });
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "\uC774\uBA54\uC77C\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  const normalizedEmail = String(email).trim().toLowerCase();
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const forgotKey = `${normalizedEmail}::${clientIp}`;
  const limitCheck = forgotPasswordRateLimiter.check(forgotKey);
  forgotPasswordRateLimiter.registerAttempt(forgotKey);
  if (!limitCheck.allowed) {
    return res.status(429).json({ error: `\uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. ${limitCheck.retryAfterSec}\uCD08 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.` });
  }
  const user = users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (user && isMailerConfigured) {
    for (const [existingToken, entry] of passwordResetTokens.entries()) {
      if (entry.userId === user.id) passwordResetTokens.delete(existingToken);
    }
    await deleteAllPasswordResetTokensForUser(user.id);
    const token = import_crypto2.default.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
    passwordResetTokens.set(token, { userId: user.id, expiresAt });
    await savePasswordResetToken(token, user.id, expiresAt);
    const resetUrl = `${APP_BASE_URL}/?resetToken=${token}`;
    try {
      await sendEmail({
        to: user.email,
        toName: user.name,
        subject: "[BizCard] \uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815 \uC548\uB0B4",
        html: `
          <div style="font-family: 'Malgun Gothic', sans-serif; padding: 24px; color:#111;">
            <h2 style="margin-bottom:4px;">\uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815</h2>
            <p style="color:#555;">${user.name}\uB2D8, \uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815\uC744 \uC694\uCCAD\uD558\uC168\uC2B5\uB2C8\uB2E4. \uC544\uB798 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uC0C8 \uBE44\uBC00\uBC88\uD638\uB97C \uC124\uC815\uD574\uC8FC\uC138\uC694.</p>
            <p style="color:#999; font-size:12px;">\uC774 \uB9C1\uD06C\uB294 30\uBD84 \uB3D9\uC548\uB9CC \uC720\uD6A8\uD569\uB2C8\uB2E4. \uBCF8\uC778\uC774 \uC694\uCCAD\uD558\uC9C0 \uC54A\uC558\uB2E4\uBA74 \uC774 \uBA54\uC77C\uC744 \uBB34\uC2DC\uD558\uC154\uB3C4 \uB429\uB2C8\uB2E4.</p>
            <a href="${resetUrl}" style="display:inline-block; margin-top:12px; padding:10px 22px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold;">\uC0C8 \uBE44\uBC00\uBC88\uD638 \uC124\uC815\uD558\uAE30</a>
          </div>
        `
      });
      console.log(`[mailer] ${user.email}\uC5D0\uAC8C \uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815 \uBA54\uC77C \uBC1C\uC1A1 \uC644\uB8CC`);
    } catch (err) {
      console.error(`[mailer] ${user.email}\uC5D0\uAC8C \uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815 \uBA54\uC77C \uBC1C\uC1A1 \uC2E4\uD328:`, err);
    }
  } else if (user && !isMailerConfigured) {
    console.warn("[mailer] \uBA54\uC77C \uBBF8\uC124\uC815\uC73C\uB85C \uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815 \uBA54\uC77C\uC744 \uBCF4\uB0B4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  }
  res.json({ success: true, message: "\uC785\uB825\uD558\uC2E0 \uC774\uBA54\uC77C\uB85C \uAC00\uC785\uB41C \uACC4\uC815\uC774 \uC788\uB2E4\uBA74, \uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815 \uC548\uB0B4 \uBA54\uC77C\uC744 \uBCF4\uB0B4\uB4DC\uB838\uC2B5\uB2C8\uB2E4." });
});
app.post("/api/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: "\uC7AC\uC124\uC815 \uD1A0\uD070\uACFC \uC0C8 \uBE44\uBC00\uBC88\uD638\uB97C \uBAA8\uB450 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  const passwordValidation = validatePasswordComplexity(newPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({ error: passwordValidation.error });
  }
  let entry = passwordResetTokens.get(token);
  if (!entry && isSupabaseConfigured) {
    const stored = await loadPasswordResetToken(token);
    if (stored) {
      entry = { userId: stored.userId, expiresAt: stored.expiresAt };
      passwordResetTokens.set(token, entry);
    }
  }
  if (!entry || entry.expiresAt < Date.now()) {
    passwordResetTokens.delete(token);
    await deletePasswordResetToken(token);
    return res.status(400).json({ error: "\uC7AC\uC124\uC815 \uB9C1\uD06C\uAC00 \uB9CC\uB8CC\uB418\uC5C8\uAC70\uB098 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uBE44\uBC00\uBC88\uD638 \uCC3E\uAE30\uB97C \uB2E4\uC2DC \uC694\uCCAD\uD574\uC8FC\uC138\uC694." });
  }
  const user = users.find((u) => u.id === entry.userId);
  if (!user) {
    passwordResetTokens.delete(token);
    await deletePasswordResetToken(token);
    return res.status(404).json({ error: "\uACC4\uC815\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  }
  user.password = import_bcryptjs.default.hashSync(newPassword, 10);
  await addUser(user);
  passwordResetTokens.delete(token);
  await deletePasswordResetToken(token);
  await invalidateAllSessionsForUser(user.id);
  res.json({ success: true, message: "\uBE44\uBC00\uBC88\uD638\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC0C8 \uBE44\uBC00\uBC88\uD638\uB85C \uB85C\uADF8\uC778\uD574\uC8FC\uC138\uC694." });
});
app.get("/api/auth/users", (req, res) => {
  const userId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === userId);
  if (!requester) {
    return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  }
  const toPublicShape = (u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    type: u.type,
    companyName: u.companyName,
    businessNumber: u.businessNumber,
    position: u.position,
    role: u.role,
    approvalStatus: u.approvalStatus,
    // [추가] 관리자 화면(가입 회원 디렉토리)에서 "이 사람이 이메일 인증을 못 받았는지"
    // 알아야, 국내 메일(Daum/Naver)이 인증 메일을 스팸으로 자동 차단해서 못 받는
    // 경우에 관리자가 수동 인증 버튼을 보여줄 수 있다.
    emailVerified: isEmailVerified(u.emailVerified),
    // [추가] 조직도 화면에서 부서/보고 체계를 그리기 위한 필드.
    department: u.department,
    managerUserId: u.managerUserId,
    createdAt: u.createdAt
  });
  let visible;
  if (requester.email === ADMIN_EMAIL) {
    visible = users;
  } else if (requester.type === "company") {
    const bNum = (requester.businessNumber || "").trim().toLowerCase();
    visible = users.filter(
      (u) => u.type === "company" && (u.businessNumber || "").trim().toLowerCase() === bNum
    );
  } else {
    visible = [requester];
  }
  res.json(visible.map(toPublicShape));
});
app.get("/api/org/coworkers", (req, res) => {
  const userId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === userId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const toPublicShape = (u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    position: u.position,
    role: u.role,
    approvalStatus: u.approvalStatus,
    department: u.department,
    managerUserId: u.managerUserId
  });
  let visible;
  if (requester.type === "company") {
    const bNum = (requester.businessNumber || "").trim().toLowerCase();
    visible = users.filter((u) => u.type === "company" && (u.businessNumber || "").trim().toLowerCase() === bNum);
  } else {
    visible = [requester];
  }
  res.json(visible.map(toPublicShape));
});
app.get("/api/auth/duplicate-emails", async (req, res) => {
  const all = isSupabaseConfigured ? await getUsers() : users;
  const byEmail = /* @__PURE__ */ new Map();
  for (const u of all) {
    const key = u.email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push(u);
  }
  const duplicates = Array.from(byEmail.entries()).filter(([, list]) => list.length > 1).map(([email, list]) => ({
    email,
    accounts: list.map((u) => ({ id: u.id, type: u.type, companyName: u.companyName, businessNumber: u.businessNumber, position: u.position, role: u.role }))
  }));
  res.json({ duplicateCount: duplicates.length, duplicates });
});
app.put("/api/auth/users/:targetId", async (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  if (requester.role !== "admin") return res.status(403).json({ error: "\uAD00\uB9AC\uC790\uB9CC \uC9C1\uC6D0 \uC815\uBCF4\uB97C \uC218\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  const target = users.find((u) => u.id === req.params.targetId);
  if (!target) return res.status(404).json({ error: "\uB300\uC0C1 \uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  if (scopeIdForUser(requester) !== scopeIdForUser(target)) {
    return res.status(403).json({ error: "\uAC19\uC740 \uD68C\uC0AC \uC18C\uC18D \uC0AC\uC6A9\uC790\uB9CC \uC218\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  }
  const { position, role, department, managerUserId } = req.body;
  const prevRole = target.role;
  if (typeof position === "string") target.position = position;
  if (role === "admin" || role === "member") target.role = role;
  if (typeof department === "string") target.department = department.trim() || void 0;
  if (typeof managerUserId === "string") {
    target.managerUserId = managerUserId.trim() && managerUserId !== target.id ? managerUserId.trim() : void 0;
  }
  await addUser(target);
  if (role && role !== prevRole) {
    await logAudit({
      scopeId: scopeIdForUser(requester),
      actorUserId: requester.id,
      actorEmail: requester.email,
      action: "role_change",
      targetUserId: target.id,
      targetEmail: target.email,
      detail: { from: prevRole || null, to: target.role }
    });
  }
  res.json({ success: true, user: { id: target.id, email: target.email, name: target.name, position: target.position, role: target.role, department: target.department, managerUserId: target.managerUserId } });
});
app.delete("/api/auth/users/:targetId", async (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  if (requester.role !== "admin") return res.status(403).json({ error: "\uAD00\uB9AC\uC790\uB9CC \uB3D9\uB8CC\uB97C \uC81C\uAC70\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  const target = users.find((u) => u.id === req.params.targetId);
  if (!target) return res.status(404).json({ error: "\uB300\uC0C1 \uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  if (scopeIdForUser(requester) !== scopeIdForUser(target)) {
    return res.status(403).json({ error: "\uAC19\uC740 \uD68C\uC0AC \uC18C\uC18D \uC0AC\uC6A9\uC790\uB9CC \uC81C\uAC70\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  }
  if (target.id === requester.id) {
    return res.status(400).json({ error: '\uBCF8\uC778 \uACC4\uC815\uC740 \uC774 \uAE30\uB2A5\uC73C\uB85C \uC81C\uAC70\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD0C8\uD1F4\uB294 "\uD68C\uC6D0 \uD0C8\uD1F4" \uBA54\uB274\uB97C \uC774\uC6A9\uD574\uC8FC\uC138\uC694.' });
  }
  if (target.role === "admin") {
    const scopeId = scopeIdForUser(requester);
    const anotherAdminExists = users.some((u) => u.id !== target.id && scopeIdForUser(u) === scopeId && u.role === "admin");
    if (!anotherAdminExists) {
      return res.status(400).json({ error: "\uC774 \uD68C\uC0AC\uC758 \uB9C8\uC9C0\uB9C9 \uAD00\uB9AC\uC790\uB294 \uC81C\uAC70\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uB978 \uB3D9\uB8CC\uB97C \uBA3C\uC800 \uAD00\uB9AC\uC790\uB85C \uC9C0\uC815\uD574\uC8FC\uC138\uC694." });
    }
  }
  await logAudit({
    scopeId: scopeIdForUser(requester),
    actorUserId: requester.id,
    actorEmail: requester.email,
    action: "member_remove",
    targetUserId: target.id,
    targetEmail: target.email,
    detail: { role: target.role || null }
  });
  users = users.filter((u) => u.id !== target.id);
  await deleteUser(target.id);
  await invalidateAllSessionsForUser(target.id);
  res.json({ success: true });
});
app.get("/api/admin/company-name-mismatches", (req, res) => {
  const userId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === userId);
  if (!requester || requester.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "\uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
  }
  const byBusinessNumber = /* @__PURE__ */ new Map();
  for (const u of users) {
    if (u.type !== "company" || !u.businessNumber) continue;
    const bNum = u.businessNumber.trim();
    const cName = (u.companyName || "").trim();
    if (!bNum || !cName) continue;
    const arr = byBusinessNumber.get(bNum) || [];
    const found = arr.find((x) => x.companyName === cName);
    if (found) found.count++;
    else arr.push({ companyName: cName, count: 1 });
    byBusinessNumber.set(bNum, arr);
  }
  const mismatches = Array.from(byBusinessNumber.entries()).filter(([, names]) => names.length > 1).map(([businessNumber, names]) => ({ businessNumber, variants: names }));
  res.json(mismatches);
});
app.post("/api/admin/normalize-company-name", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === userId);
  if (!requester || requester.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "\uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
  }
  const { businessNumber, canonicalName } = req.body;
  if (!businessNumber || !canonicalName) {
    return res.status(400).json({ error: "businessNumber\uC640 canonicalName\uC774 \uBAA8\uB450 \uD544\uC694\uD569\uB2C8\uB2E4." });
  }
  const bNum = String(businessNumber).trim();
  const targets = users.filter((u) => u.type === "company" && (u.businessNumber || "").trim() === bNum);
  if (targets.length === 0) {
    return res.status(404).json({ error: "\uD574\uB2F9 \uC0AC\uC5C5\uC790\uBC88\uD638\uB85C \uAC00\uC785\uB41C \uC0AC\uC6A9\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." });
  }
  let updatedCount = 0;
  for (const u of targets) {
    if (u.companyName !== canonicalName) {
      u.companyName = canonicalName;
      await addUser(u);
      updatedCount++;
    }
  }
  await logAudit({
    scopeId: `company:${bNum}`,
    actorUserId: requester.id,
    actorEmail: requester.email,
    action: "company_name_normalized",
    detail: { businessNumber: bNum, canonicalName, updatedCount }
  });
  res.json({ success: true, updatedCount });
});
app.get("/api/auth/audit-logs", async (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  if (requester.role !== "admin") return res.status(403).json({ error: "\uAD00\uB9AC\uC790\uB9CC \uC870\uD68C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  const logs = await getAuditLogs(scopeIdForUser(requester));
  res.json(logs);
});
var backupExportRateLimiter = new RateLimiter({ maxAttempts: 3, windowMs: 5 * 60 * 1e3 });
function buildBackupDataPayload(dbData) {
  return {
    contacts: dbData.contacts,
    projects: dbData.projects,
    groups: dbData.groups,
    myProfile: dbData.myProfile,
    vehicles: dbData.vehicles,
    drivingLogs: dbData.drivingLogs,
    expenses: dbData.expenses,
    maintenances: dbData.maintenances,
    maintenanceIntervals: dbData.maintenanceIntervals,
    dailyLogs: dbData.dailyLogs,
    weeklyLogs: dbData.weeklyLogs,
    advancePayments: dbData.advancePayments,
    leaveRequests: dbData.leaveRequests,
    officialDocuments: dbData.officialDocuments,
    adminDocs: dbData.adminDocs
  };
}
app.get("/api/backup/export", async (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  if (requester.type === "company" && requester.role !== "admin") {
    return res.status(403).json({ error: "\uD68C\uC0AC \uACC4\uC815\uC740 \uAD00\uB9AC\uC790\uB9CC \uC804\uCCB4 \uBC31\uC5C5\uC744 \uB0B4\uB824\uBC1B\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  }
  const backupLimit = backupExportRateLimiter.check(requester.id);
  backupExportRateLimiter.registerAttempt(requester.id);
  if (!backupLimit.allowed) {
    return res.status(429).json({ error: `\uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. ${backupLimit.retryAfterSec}\uCD08 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.` });
  }
  const dbData = getScopedData(req);
  const backup = {
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    exportedBy: { id: requester.id, email: requester.email, name: requester.name },
    scope: requester.type === "company" ? { type: "company", companyName: requester.companyName, businessNumber: requester.businessNumber } : { type: "individual" },
    data: buildBackupDataPayload(dbData)
  };
  await logAudit({
    scopeId: scopeIdForUser(requester),
    actorUserId: requester.id,
    actorEmail: requester.email,
    action: "data_backup_export"
  });
  const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  res.setHeader("Content-Disposition", `attachment; filename="bizcard-backup-${dateStr}.json"`);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(backup, null, 2));
});
app.post("/api/auth/withdraw", async (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const { password } = req.body;
  if (!password || !verifyPassword(password, requester.password)) {
    return res.status(401).json({ error: "\uBE44\uBC00\uBC88\uD638\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
  }
  if (requester.type === "company" && requester.role === "admin") {
    const scopeId = scopeIdForUser(requester);
    const otherMembersExist = users.some((u) => u.id !== requester.id && scopeIdForUser(u) === scopeId);
    const anotherAdminExists = users.some((u) => u.id !== requester.id && scopeIdForUser(u) === scopeId && u.role === "admin");
    if (otherMembersExist && !anotherAdminExists) {
      return res.status(400).json({
        error: "\uC544\uC9C1 \uC18C\uC18D\uB41C \uB3D9\uB8CC\uAC00 \uC788\uB294\uB370 \uAD00\uB9AC\uC790\uAC00 \uBCF8\uC778 \uD55C \uBA85\uBFD0\uC785\uB2C8\uB2E4. \uB2E4\uB978 \uB3D9\uB8CC\uB97C \uAD00\uB9AC\uC790\uB85C \uBA3C\uC800 \uC9C0\uC815\uD55C \uB4A4 \uD0C8\uD1F4\uD574\uC8FC\uC138\uC694."
      });
    }
  }
  await logAudit({
    scopeId: scopeIdForUser(requester),
    actorUserId: requester.id,
    actorEmail: requester.email,
    action: "account_withdraw",
    detail: { type: requester.type }
  });
  if (requester.type === "individual") {
    const scopeId = scopeIdForUser(requester);
    delete db[scopeId];
    await deleteScopeCompletely(scopeId);
  }
  users = users.filter((u) => u.id !== requester.id);
  await deleteUser(requester.id);
  await invalidateAllSessionsForUser(requester.id);
  clearSessionCookie(res);
  res.json({ success: true, message: "\uD0C8\uD1F4 \uCC98\uB9AC\uAC00 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
});
var TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || "";
var SUBSCRIPTION_PRICE_PER_SEAT_KRW = Number(process.env.SUBSCRIPTION_PRICE_PER_SEAT_KRW) || 5e3;
function seatCountForScope(scopeId) {
  return Math.max(1, users.filter((u) => scopeIdForUser(u) === scopeId && u.approvalStatus !== "pending").length);
}
function billingOwnerForRequester(requester) {
  if (requester.type === "individual") return requester;
  if (requester.role === "admin") return requester;
  return null;
}
app.get("/api/billing/customer-key", (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const owner = billingOwnerForRequester(requester);
  if (!owner) return res.status(403).json({ error: "\uD68C\uC0AC \uACC4\uC815\uC740 \uAD00\uB9AC\uC790\uB9CC \uAD6C\uB3C5\uC744 \uAD00\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  if (!owner.tossCustomerKey) {
    owner.tossCustomerKey = generateCustomerKey();
    addUser(owner).catch((err) => console.error("customerKey \uC800\uC7A5 \uC2E4\uD328:", err));
  }
  res.json({ customerKey: owner.tossCustomerKey });
});
app.post("/api/billing/register-card", async (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const owner = billingOwnerForRequester(requester);
  if (!owner) return res.status(403).json({ error: "\uD68C\uC0AC \uACC4\uC815\uC740 \uAD00\uB9AC\uC790\uB9CC \uAD6C\uB3C5\uC744 \uAD00\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  if (!TOSS_SECRET_KEY) return res.status(500).json({ error: "\uACB0\uC81C \uAE30\uB2A5\uC774 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4 (TOSS_SECRET_KEY \uC5C6\uC74C)." });
  const { authKey } = req.body;
  if (!authKey || !owner.tossCustomerKey) {
    return res.status(400).json({ error: "\uCE74\uB4DC \uB4F1\uB85D \uC815\uBCF4\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uCC98\uC74C\uBD80\uD130 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  try {
    const result = await issueBillingKey(TOSS_SECRET_KEY, authKey, owner.tossCustomerKey);
    owner.tossBillingKey = result.billingKey;
    await addUser(owner);
    await logAudit({
      scopeId: scopeIdForUser(owner),
      actorUserId: owner.id,
      actorEmail: owner.email,
      action: "billing_card_registered"
    });
    res.json({ success: true, card: result.card });
  } catch (err) {
    console.error("\uCE74\uB4DC \uB4F1\uB85D \uC2E4\uD328:", err);
    res.status(400).json({ error: err.message || "\uCE74\uB4DC \uB4F1\uB85D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
app.post("/api/billing/subscribe", async (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const owner = billingOwnerForRequester(requester);
  if (!owner) return res.status(403).json({ error: "\uD68C\uC0AC \uACC4\uC815\uC740 \uAD00\uB9AC\uC790\uB9CC \uAD6C\uB3C5\uC744 \uAD00\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  if (!TOSS_SECRET_KEY) return res.status(500).json({ error: "\uACB0\uC81C \uAE30\uB2A5\uC774 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4 (TOSS_SECRET_KEY \uC5C6\uC74C)." });
  if (!owner.tossBillingKey || !owner.tossCustomerKey) {
    return res.status(400).json({ error: "\uBA3C\uC800 \uCE74\uB4DC\uB97C \uB4F1\uB85D\uD574\uC8FC\uC138\uC694." });
  }
  const scopeId = scopeIdForUser(owner);
  const seats = seatCountForScope(scopeId);
  const amount = seats * SUBSCRIPTION_PRICE_PER_SEAT_KRW;
  try {
    await chargeBilling(TOSS_SECRET_KEY, owner.tossBillingKey, {
      customerKey: owner.tossCustomerKey,
      amount,
      orderId: generateOrderId(),
      orderName: `BizCard \uAD6C\uB3C5 (\uC88C\uC11D ${seats}\uAC1C)`,
      customerEmail: owner.email,
      customerName: owner.name
    });
    owner.plan = "pro";
    owner.subscriptionStatus = "active";
    let firstBillingDate = addOneMonth(/* @__PURE__ */ new Date());
    const pendingCredit = owner.referralCreditMonths || 0;
    for (let i = 0; i < pendingCredit; i++) firstBillingDate = addOneMonth(firstBillingDate);
    owner.nextBillingAt = firstBillingDate.toISOString();
    owner.referralCreditMonths = 0;
    await addUser(owner);
    await logAudit({
      scopeId,
      actorUserId: owner.id,
      actorEmail: owner.email,
      action: "subscription_started",
      detail: { seats, amount }
    });
    if (owner.referredByUserId && !owner.referralRewardGranted) {
      owner.referralRewardGranted = true;
      owner.nextBillingAt = addOneMonth(new Date(owner.nextBillingAt)).toISOString();
      await addUser(owner);
      const referrer = users.find((u) => u.id === owner.referredByUserId);
      if (referrer) {
        await applyReferralCreditMonths(referrer, 1);
        await logAudit({
          scopeId: scopeIdForUser(referrer),
          actorUserId: owner.id,
          actorEmail: owner.email,
          action: "referral_rewarded",
          targetUserId: referrer.id,
          targetEmail: referrer.email,
          detail: { rewardMonths: 1 }
        });
      }
      await markReferralRewarded(owner.id);
    }
    res.json({ success: true, plan: owner.plan, nextBillingAt: owner.nextBillingAt, amount });
  } catch (err) {
    console.error("\uAD6C\uB3C5 \uACB0\uC81C \uC2E4\uD328:", err);
    res.status(400).json({ error: err.message || "\uACB0\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
app.post("/api/billing/cancel", async (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const owner = billingOwnerForRequester(requester);
  if (!owner) return res.status(403).json({ error: "\uD68C\uC0AC \uACC4\uC815\uC740 \uAD00\uB9AC\uC790\uB9CC \uAD6C\uB3C5\uC744 \uAD00\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  if (owner.subscriptionStatus !== "active") {
    return res.status(400).json({ error: "\uC9C4\uD589 \uC911\uC778 \uAD6C\uB3C5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
  }
  owner.subscriptionStatus = "canceled";
  await addUser(owner);
  await logAudit({
    scopeId: scopeIdForUser(owner),
    actorUserId: owner.id,
    actorEmail: owner.email,
    action: "subscription_canceled"
  });
  res.json({ success: true, message: `\uAD6C\uB3C5\uC774 \uD574\uC9C0\uB418\uC5C8\uC2B5\uB2C8\uB2E4. ${owner.nextBillingAt ? new Date(owner.nextBillingAt).toLocaleDateString("ko-KR") + "\uAE4C\uC9C0\uB294 \uACC4\uC18D \uC774\uC6A9\uD558\uC2E4 \uC218 \uC788\uC5B4\uC694." : ""}` });
});
app.get("/api/billing/status", (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const scopeId = scopeIdForUser(requester);
  const owner = requester.type === "individual" ? requester : users.find((u) => scopeIdForUser(u) === scopeId && u.role === "admin");
  const seats = seatCountForScope(scopeId);
  res.json({
    plan: owner?.plan || "free",
    subscriptionStatus: owner?.subscriptionStatus || "none",
    nextBillingAt: owner?.nextBillingAt || null,
    hasCardRegistered: Boolean(owner?.tossBillingKey),
    seats,
    pricePerSeat: SUBSCRIPTION_PRICE_PER_SEAT_KRW,
    estimatedMonthlyAmount: seats * SUBSCRIPTION_PRICE_PER_SEAT_KRW,
    // 결제 관리(카드 등록/구독/해지)를 이 사람이 할 수 있는지
    canManageBilling: Boolean(billingOwnerForRequester(requester))
  });
});
async function runScheduledBilling() {
  const now = /* @__PURE__ */ new Date();
  let charged = 0, failed = 0, downgraded = 0;
  for (const owner of [...users]) {
    if (owner.type === "company" && owner.role !== "admin") continue;
    if (!owner.nextBillingAt) continue;
    if (new Date(owner.nextBillingAt) > now) continue;
    const scopeId = scopeIdForUser(owner);
    if (owner.subscriptionStatus === "active") {
      if (!owner.tossBillingKey || !owner.tossCustomerKey || !TOSS_SECRET_KEY) continue;
      const seats = seatCountForScope(scopeId);
      const amount = seats * SUBSCRIPTION_PRICE_PER_SEAT_KRW;
      try {
        await chargeBilling(TOSS_SECRET_KEY, owner.tossBillingKey, {
          customerKey: owner.tossCustomerKey,
          amount,
          orderId: generateOrderId(),
          orderName: `BizCard \uAD6C\uB3C5 \uAC31\uC2E0 (\uC88C\uC11D ${seats}\uAC1C)`,
          customerEmail: owner.email,
          customerName: owner.name
        });
        owner.nextBillingAt = addOneMonth(now).toISOString();
        await addUser(owner);
        await logAudit({ scopeId, actorUserId: owner.id, actorEmail: owner.email, action: "subscription_renewed", detail: { seats, amount } });
        charged++;
      } catch (err) {
        console.error(`\uC815\uAE30\uACB0\uC81C \uC2E4\uD328 (${owner.email}):`, err);
        owner.subscriptionStatus = "past_due";
        await addUser(owner);
        await logAudit({ scopeId, actorUserId: owner.id, actorEmail: owner.email, action: "subscription_payment_failed" });
        failed++;
      }
    } else if (owner.subscriptionStatus === "canceled") {
      owner.plan = "free";
      owner.nextBillingAt = void 0;
      await addUser(owner);
      await logAudit({ scopeId, actorUserId: owner.id, actorEmail: owner.email, action: "subscription_downgraded_to_free" });
      downgraded++;
    }
  }
  return { charged, failed, downgraded };
}
setInterval(() => {
  runScheduledBilling().catch((err) => console.error("runScheduledBilling \uC2E4\uD328:", err));
}, 60 * 60 * 1e3);
app.post("/api/billing/run-scheduled", async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: "CRON_SECRET \uD658\uACBD\uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uC6B4\uC601\uC790\uC5D0\uAC8C \uBB38\uC758\uD558\uC138\uC694." });
  }
  if (req.headers["x-cron-secret"] !== cronSecret) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const result = await runScheduledBilling();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message || "\uC2A4\uCF00\uC904 \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
var DAILY_SUMMARY_QUOTA = Number(process.env.GEMINI_DAILY_SUMMARY_QUOTA) || 3;
async function runDailyCompanySummaryBatch() {
  if (!process.env.GEMINI_API_KEY) {
    console.log("[\uD68C\uC0AC\uC694\uC57D \uC790\uB3D9\uBC30\uCE58] GEMINI_API_KEY\uAC00 \uC5C6\uC5B4 \uAC74\uB108\uB701\uB2C8\uB2E4.");
    return { scopesChecked: 0, companiesUpdated: 0, failed: 0 };
  }
  const scopeStats = await getPlatformStats();
  const sortedScopes = scopeStats.filter((s) => s.scopeId.startsWith("company:") || s.scopeId.startsWith("individual:")).sort((a, b) => (b.lastActivity || "").localeCompare(a.lastActivity || ""));
  let quotaRemaining = DAILY_SUMMARY_QUOTA;
  let companiesUpdated = 0;
  let failed = 0;
  let scopesChecked = 0;
  let quotaExhaustedByGemini = false;
  for (const scope of sortedScopes) {
    if (quotaRemaining <= 0 || quotaExhaustedByGemini) break;
    scopesChecked++;
    const contacts = await getScopedCollection(scope.scopeId, "contacts");
    const byCompany = /* @__PURE__ */ new Map();
    for (const c of contacts) {
      const company = (c.company || "").trim();
      if (!company || c.companyInfo) continue;
      if (!byCompany.has(company)) byCompany.set(company, []);
      byCompany.get(company).push(c);
    }
    for (const [company, group] of byCompany) {
      if (quotaRemaining <= 0 || quotaExhaustedByGemini) break;
      try {
        const { summary: companyInfo, fromCache } = await getOrGenerateCompanySummary(company);
        if (!fromCache) quotaRemaining--;
        for (const c of group) {
          c.companyInfo = companyInfo;
          await setScopedDoc(scope.scopeId, "contacts", c);
        }
        companiesUpdated++;
      } catch (err) {
        const msg = String(err?.message || err || "");
        if (err?.status === 429 || /RESOURCE_EXHAUSTED/i.test(msg)) {
          console.error(`[\uD68C\uC0AC\uC694\uC57D \uC790\uB3D9\uBC30\uCE58] Gemini \uD560\uB2F9\uB7C9\uC774 \uC18C\uC9C4\uB418\uC5B4 \uC774\uBC88 \uBC30\uCE58\uB97C \uC911\uB2E8\uD569\uB2C8\uB2E4 ("${company}"\uC5D0\uC11C \uAC10\uC9C0).`);
          quotaExhaustedByGemini = true;
          break;
        }
        console.error(`[\uD68C\uC0AC\uC694\uC57D \uC790\uB3D9\uBC30\uCE58] "${company}" \uC694\uC57D \uC2E4\uD328:`, err);
        failed++;
        quotaRemaining--;
      }
    }
    delete db[scope.scopeId];
  }
  console.log(`[\uD68C\uC0AC\uC694\uC57D \uC790\uB3D9\uBC30\uCE58] \uC644\uB8CC: \uC2A4\uCF54\uD504 ${scopesChecked}\uAC1C \uD655\uC778, \uD68C\uC0AC ${companiesUpdated}\uACF3 \uAC31\uC2E0, \uC2E4\uD328 ${failed}\uAC74${quotaExhaustedByGemini ? " (Gemini \uD560\uB2F9\uB7C9 \uC18C\uC9C4\uC73C\uB85C \uC870\uAE30 \uC885\uB8CC)" : ""}`);
  return { scopesChecked, companiesUpdated, failed };
}
var lastCompanySummaryRunDate = null;
setInterval(() => {
  const todayKey = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  if (lastCompanySummaryRunDate === todayKey) return;
  lastCompanySummaryRunDate = todayKey;
  runDailyCompanySummaryBatch().catch((err) => console.error("runDailyCompanySummaryBatch \uC2E4\uD328:", err));
}, 60 * 60 * 1e3);
app.post("/api/admin/run-company-summary-batch", async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (req.headers["x-cron-secret"] !== cronSecret) return res.status(401).json({ error: "unauthorized" });
  } else {
    const requesterId = req.headers["x-user-id"];
    const requester = users.find((u) => u.id === requesterId);
    if (!requester || requester.email !== ADMIN_EMAIL) return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const result = await runDailyCompanySummaryBatch();
    lastCompanySummaryRunDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message || "\uBC30\uCE58 \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
function getTodayKstStr() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(/* @__PURE__ */ new Date());
}
function getCurrentKstHour() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" }).formatToParts(/* @__PURE__ */ new Date());
  const hourPart = parts.find((p) => p.type === "hour");
  return hourPart ? Number(hourPart.value) : (/* @__PURE__ */ new Date()).getUTCHours();
}
function getProjectDaysSinceLastActivity(proj, todayStr) {
  let lastDateStr = proj.createdAt ? proj.createdAt.split("T")[0] : todayStr;
  if (proj.followUps && proj.followUps.length > 0) {
    let maxDateStr = proj.followUps[0].date;
    for (const f of proj.followUps) {
      if (f.date > maxDateStr) maxDateStr = f.date;
    }
    lastDateStr = maxDateStr.split("T")[0];
  }
  const parseLocalDate = (str) => {
    const parts = str.split("-");
    if (parts.length === 3) return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
    return new Date(str).getTime();
  };
  const diffDays = Math.floor((parseLocalDate(todayStr) - parseLocalDate(lastDateStr)) / (1e3 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays : 0;
}
function findUpcomingMaintenance(dbData, todayStr, withinDays = 7) {
  const todayMs = new Date(todayStr).getTime();
  return (dbData.maintenances || []).filter((m) => {
    if (m.status !== "scheduled") return false;
    const diffDays = Math.round((new Date(m.date).getTime() - todayMs) / (1e3 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= withinDays;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
function findNeedyProjects(dbData, todayStr) {
  return (dbData.projects || []).filter((p) => {
    if (p.status !== "opportunity" && p.status !== "progress") return false;
    return getProjectDaysSinceLastActivity(p, todayStr) >= 5;
  }).sort((a, b) => getProjectDaysSinceLastActivity(b, todayStr) - getProjectDaysSinceLastActivity(a, todayStr));
}
function findPendingApprovals(dbData) {
  const results = [];
  const pickWaiting = (steps) => {
    const step = (steps || []).find((s) => !s.date);
    return step ? step.name || step.role || "\uB2F4\uB2F9\uC790" : "\uB2F4\uB2F9\uC790";
  };
  for (const lr of dbData.leaveRequests || []) {
    if (lr.status !== "pending") continue;
    results.push({ label: `\uD734\uAC00 \uC2E0\uCCAD\uC11C (${lr.author})`, waitingOn: pickWaiting(lr.approvalLine) });
  }
  for (const ap of dbData.advancePayments || []) {
    if (ap.status !== "pending") continue;
    results.push({ label: `\uAC00\uC9C0\uAE09\uAE08 \uC815\uC0B0\uC11C (${ap.author})`, waitingOn: pickWaiting(ap.approvalLine) });
  }
  for (const od of dbData.officialDocuments || []) {
    if (od.status !== "pending") continue;
    results.push({ label: `\uACF5\uBB38\uC11C: ${od.subject}`, waitingOn: pickWaiting(od.approvalLine) });
  }
  return results;
}
function getReportRecipients(scopeId) {
  const members = users.filter((u) => scopeIdForUser(u) === scopeId && u.approvalStatus !== "pending");
  if (members.length === 0) return [];
  const admins = members.filter((u) => u.role === "admin");
  return admins.length > 0 ? admins : members.slice(0, 1);
}
var MAX_BACKUP_ATTACHMENT_BYTES = 8 * 1024 * 1024;
function buildDailyReportEmailHtml(opts) {
  const maxRows = 10;
  const renderList = (items) => items.length > 0 ? `<ul style="margin:4px 0; padding-left:20px; font-size:13px; line-height:1.7; color:#333;">${items.slice(0, maxRows).map((i) => `<li>${i}</li>`).join("")}${items.length > maxRows ? `<li style="color:#888;">...\uC678 ${items.length - maxRows}\uAC74 \uB354</li>` : ""}</ul>` : `<p style="font-size:13px; color:#aaa; margin:4px 0 0;">\uD574\uB2F9 \uC5C6\uC74C</p>`;
  const maintItems = opts.upcomingMaint.map(
    (m) => `${escapeHtml(m.date)} - ${escapeHtml(m.title)}${m.mileage ? ` (\uC608\uC0C1 \uC2DC\uC810 ${m.mileage.toLocaleString()}km)` : ""}`
  );
  const projectItems = opts.needyProjects.map((p) => escapeHtml(p.name));
  const approvalItems = opts.pendingApprovals.map((a) => `${escapeHtml(a.label)} - <b>${escapeHtml(a.waitingOn)}</b>\uB2D8 \uACB0\uC7AC \uB300\uAE30\uC911`);
  return `
    <div style="font-family: 'Malgun Gothic', sans-serif; padding: 24px; color:#111; max-width:600px;">
      <h2 style="margin-bottom:4px;">\u{1F4CB} ${opts.dateStr} BizCard \uC77C\uC77C \uD604\uD669</h2>
      <p style="color:#555; font-size:13px;">${opts.backupAttached ? "\uC544\uB798 \uD56D\uBAA9\uB4E4\uC744 \uD655\uC778\uD574 \uBCF4\uC138\uC694. \uC774 \uBA54\uC77C\uC5D0\uB294 \uC624\uB298 \uAE30\uC900 \uC804\uCCB4 \uB370\uC774\uD130 \uBC31\uC5C5 \uD30C\uC77C(JSON)\uB3C4 \uCCA8\uBD80\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4." : '\uC544\uB798 \uD56D\uBAA9\uB4E4\uC744 \uD655\uC778\uD574 \uBCF4\uC138\uC694. (\uC624\uB298\uC740 \uB370\uC774\uD130 \uC591\uC774 \uB9CE\uC544 \uBC31\uC5C5 \uD30C\uC77C \uCCA8\uBD80\uB97C \uAC74\uB108\uB6F0\uC5C8\uC2B5\uB2C8\uB2E4 - \uD544\uC694\uD558\uC2DC\uBA74 \uAD00\uB9AC\uC790 \uD654\uBA74\uC758 "\uBC31\uC5C5 \uB0B4\uBCF4\uB0B4\uAE30"\uB85C \uC9C1\uC811 \uBC1B\uC544\uC8FC\uC138\uC694.)'}</p>

      <h3 style="margin-top:20px; margin-bottom:4px; font-size:15px;">\u{1F527} \uC784\uBC15\uD55C \uC608\uC815 \uC815\uBE44 (7\uC77C \uC774\uB0B4)</h3>
      ${renderList(maintItems)}

      <h3 style="margin-top:20px; margin-bottom:4px; font-size:15px;">\u26A0\uFE0F \uD314\uB85C\uC6B0\uC5C5 \uD544\uC694 \uD504\uB85C\uC81D\uD2B8 (5\uC77C \uC774\uC0C1 \uC5F0\uB77D \uC5C6\uC74C)</h3>
      ${renderList(projectItems)}

      <h3 style="margin-top:20px; margin-bottom:4px; font-size:15px;">\u{1F4DD} \uACB0\uC7AC \uB300\uAE30\uC911\uC778 \uBB38\uC11C</h3>
      ${renderList(approvalItems)}

      <a href="${APP_BASE_URL}" style="display:inline-block; margin-top:24px; padding:10px 22px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold;">\uC0AC\uC774\uD2B8\uC5D0\uC11C \uD655\uC778\uD558\uAE30</a>
    </div>
  `;
}
async function runDailyReportAndBackupBatch() {
  if (!isMailerConfigured) {
    console.log("[\uC77C\uC77C \uB9AC\uD3EC\uD2B8+\uBC31\uC5C5] \uBA54\uC77C \uC124\uC815\uC774 \uC548 \uB418\uC5B4 \uC788\uC5B4 \uAC74\uB108\uB701\uB2C8\uB2E4.");
    return { scopesChecked: 0, emailsSent: 0, failed: 0 };
  }
  const todayStr = getTodayKstStr();
  const scopeStats = await getPlatformStats();
  const relevantScopes = scopeStats.filter(
    (s) => (s.scopeId.startsWith("company:") || s.scopeId.startsWith("individual:")) && s.totalItems > 0
  );
  let emailsSent = 0;
  let failed = 0;
  for (const scope of relevantScopes) {
    try {
      const recipients = getReportRecipients(scope.scopeId);
      if (recipients.length === 0) continue;
      const dbData = await loadScopeFromSupabase(scope.scopeId);
      const upcomingMaint = findUpcomingMaintenance(dbData, todayStr);
      const needyProjects = findNeedyProjects(dbData, todayStr);
      const pendingApprovals = findPendingApprovals(dbData);
      const backupJson = JSON.stringify(
        { exportedAt: (/* @__PURE__ */ new Date()).toISOString(), scope: { scopeId: scope.scopeId }, data: buildBackupDataPayload(dbData) },
        null,
        2
      );
      const backupBuffer = Buffer.from(backupJson, "utf-8");
      const backupAttached = backupBuffer.byteLength <= MAX_BACKUP_ATTACHMENT_BYTES;
      const html = buildDailyReportEmailHtml({ dateStr: todayStr, upcomingMaint, needyProjects, pendingApprovals, backupAttached });
      for (const recipient of recipients) {
        try {
          await sendEmail({
            to: recipient.email,
            toName: recipient.name,
            subject: `[BizCard] ${todayStr} \uC77C\uC77C \uD604\uD669 + \uC790\uB3D9 \uBC31\uC5C5`,
            html,
            attachments: backupAttached ? [{ filename: `bizcard-backup-${todayStr}.json`, content: backupBuffer }] : void 0
          });
          emailsSent++;
        } catch (err) {
          failed++;
          console.error(`[\uC77C\uC77C \uB9AC\uD3EC\uD2B8+\uBC31\uC5C5] ${recipient.email}\uC5D0\uAC8C \uBC1C\uC1A1 \uC2E4\uD328:`, err);
        }
      }
    } catch (err) {
      failed++;
      console.error(`[\uC77C\uC77C \uB9AC\uD3EC\uD2B8+\uBC31\uC5C5] \uC2A4\uCF54\uD504 ${scope.scopeId} \uCC98\uB9AC \uC2E4\uD328:`, err);
    }
  }
  console.log(`[\uC77C\uC77C \uB9AC\uD3EC\uD2B8+\uBC31\uC5C5] \uC644\uB8CC: \uC2A4\uCF54\uD504 ${relevantScopes.length}\uAC1C \uD655\uC778, \uC774\uBA54\uC77C ${emailsSent}\uAC74 \uBC1C\uC1A1, \uC2E4\uD328 ${failed}\uAC74`);
  return { scopesChecked: relevantScopes.length, emailsSent, failed };
}
var DAILY_REPORT_TARGET_KST_HOUR = 7;
var lastDailyReportRunDate = null;
setInterval(() => {
  const todayKey = getTodayKstStr();
  if (lastDailyReportRunDate === todayKey) return;
  if (getCurrentKstHour() < DAILY_REPORT_TARGET_KST_HOUR) return;
  lastDailyReportRunDate = todayKey;
  runDailyReportAndBackupBatch().catch((err) => console.error("runDailyReportAndBackupBatch \uC2E4\uD328:", err));
}, 60 * 60 * 1e3);
app.post("/api/admin/run-daily-report-batch", async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (req.headers["x-cron-secret"] !== cronSecret) return res.status(401).json({ error: "unauthorized" });
  } else {
    const requesterId = req.headers["x-user-id"];
    const requester = users.find((u) => u.id === requesterId);
    if (!requester || requester.email !== ADMIN_EMAIL) return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const result = await runDailyReportAndBackupBatch();
    lastDailyReportRunDate = getTodayKstStr();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message || "\uC77C\uC77C \uB9AC\uD3EC\uD2B8 \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
app.get("/api/auth/pending-members", (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  if (requester.role !== "admin") return res.status(403).json({ error: "\uAD00\uB9AC\uC790\uB9CC \uC870\uD68C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  const pending = users.filter(
    (u) => u.type === "company" && u.approvalStatus === "pending" && scopeIdForUser(u) === scopeIdForUser(requester)
  );
  res.json(pending.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    position: u.position,
    createdAt: u.createdAt
  })));
});
app.post("/api/auth/pending-members/:targetId/approve", async (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  if (requester.role !== "admin") return res.status(403).json({ error: "\uAD00\uB9AC\uC790\uB9CC \uC2B9\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  const target = users.find((u) => u.id === req.params.targetId);
  if (!target) return res.status(404).json({ error: "\uB300\uC0C1 \uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  if (scopeIdForUser(requester) !== scopeIdForUser(target)) {
    return res.status(403).json({ error: "\uAC19\uC740 \uD68C\uC0AC \uC18C\uC18D \uC2E0\uCCAD\uC790\uB9CC \uC2B9\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  }
  target.approvalStatus = "approved";
  await addUser(target);
  await logAudit({
    scopeId: scopeIdForUser(requester),
    actorUserId: requester.id,
    actorEmail: requester.email,
    action: "member_approve",
    targetUserId: target.id,
    targetEmail: target.email
  });
  res.json({ success: true });
});
app.post("/api/auth/pending-members/:targetId/reject", async (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  if (requester.role !== "admin") return res.status(403).json({ error: "\uAD00\uB9AC\uC790\uB9CC \uAC70\uC808\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  const target = users.find((u) => u.id === req.params.targetId);
  if (!target) return res.status(404).json({ error: "\uB300\uC0C1 \uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  if (scopeIdForUser(requester) !== scopeIdForUser(target)) {
    return res.status(403).json({ error: "\uAC19\uC740 \uD68C\uC0AC \uC18C\uC18D \uC2E0\uCCAD\uC790\uB9CC \uAC70\uC808\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  }
  if (target.approvalStatus !== "pending") {
    return res.status(400).json({ error: "\uC774\uBBF8 \uCC98\uB9AC\uB41C \uC2E0\uCCAD\uC785\uB2C8\uB2E4." });
  }
  await logAudit({
    scopeId: scopeIdForUser(requester),
    actorUserId: requester.id,
    actorEmail: requester.email,
    action: "member_reject",
    targetUserId: target.id,
    targetEmail: target.email
  });
  users = users.filter((u) => u.id !== target.id);
  await deleteUser(target.id);
  await invalidateAllSessionsForUser(target.id);
  res.json({ success: true });
});
app.post("/api/auth/users/:targetId/verify-email", async (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const isOperator = requester.email === ADMIN_EMAIL;
  if (requester.role !== "admin" && !isOperator) return res.status(403).json({ error: "\uAD00\uB9AC\uC790\uB9CC \uCC98\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  const target = users.find((u) => u.id === req.params.targetId);
  if (!target) return res.status(404).json({ error: "\uB300\uC0C1 \uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  if (!isOperator && scopeIdForUser(requester) !== scopeIdForUser(target)) {
    return res.status(403).json({ error: "\uAC19\uC740 \uD68C\uC0AC \uC18C\uC18D \uD68C\uC6D0\uB9CC \uCC98\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  }
  if (isEmailVerified(target.emailVerified)) {
    return res.status(400).json({ error: "\uC774\uBBF8 \uC778\uC99D\uB41C \uACC4\uC815\uC785\uB2C8\uB2E4." });
  }
  target.emailVerified = true;
  await addUser(target);
  await logAudit({
    scopeId: scopeIdForUser(requester),
    actorUserId: requester.id,
    actorEmail: requester.email,
    action: "member_manual_email_verify",
    targetUserId: target.id,
    targetEmail: target.email
  });
  res.json({ success: true });
});
app.post("/api/auth/users/:targetId/set-password", async (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const isOperator = requester.email === ADMIN_EMAIL;
  if (requester.role !== "admin" && !isOperator) return res.status(403).json({ error: "\uAD00\uB9AC\uC790\uB9CC \uCC98\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  const target = users.find((u) => u.id === req.params.targetId);
  if (!target) return res.status(404).json({ error: "\uB300\uC0C1 \uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  if (!isOperator && scopeIdForUser(requester) !== scopeIdForUser(target)) {
    return res.status(403).json({ error: "\uAC19\uC740 \uD68C\uC0AC \uC18C\uC18D \uD68C\uC6D0\uB9CC \uCC98\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  }
  if (target.id === requester.id) {
    return res.status(400).json({ error: "\uBCF8\uC778 \uBE44\uBC00\uBC88\uD638\uB294 \uC774 \uAE30\uB2A5\uC73C\uB85C \uBC14\uAFC0 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  }
  const { newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: "\uBE44\uBC00\uBC88\uD638\uB294 8\uC790 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4." });
  }
  target.password = import_bcryptjs.default.hashSync(String(newPassword), 10);
  await addUser(target);
  await invalidateAllSessionsForUser(target.id);
  await logAudit({
    scopeId: scopeIdForUser(requester),
    actorUserId: requester.id,
    actorEmail: requester.email,
    action: "admin_set_password",
    targetUserId: target.id,
    targetEmail: target.email
  });
  res.json({ success: true });
});
app.get("/api/company-members", (req, res) => {
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const scopeId = scopeIdForUser(requester);
  const members = users.filter(
    (u) => u.id !== requester.id && scopeIdForUser(u) === scopeId && u.approvalStatus !== "pending"
  );
  res.json(members.map((u) => ({ id: u.id, name: u.name, position: u.position || "", email: u.email })));
});
app.get("/api/places/search", async (req, res) => {
  const query = String(req.query.query || "").trim().slice(0, 100);
  if (!query) return res.json({ places: [] });
  if (!KAKAO_REST_API_KEY) {
    return res.status(500).json({ error: "KAKAO_REST_API_KEY \uD658\uACBD\uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", places: [] });
  }
  try {
    const kakaoRes = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=5`, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` }
    });
    if (!kakaoRes.ok) {
      const bodyText = await kakaoRes.text().catch(() => "");
      return res.status(kakaoRes.status).json({ error: `\uCE74\uCE74\uC624 \uC7A5\uC18C \uAC80\uC0C9 \uC624\uB958: ${bodyText.slice(0, 200)}`, places: [] });
    }
    const data = await kakaoRes.json();
    const places = (data.documents || []).map((d) => ({
      name: d.place_name,
      address: d.road_address_name || d.address_name,
      lat: parseFloat(d.y),
      lng: parseFloat(d.x)
    }));
    res.json({ places });
  } catch (err) {
    console.error("\uC7A5\uC18C \uAC80\uC0C9 \uC911 \uC624\uB958:", err);
    res.status(500).json({ error: err.message || "\uC7A5\uC18C \uAC80\uC0C9 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.", places: [] });
  }
});
var ROAD_DISTANCE_CORRECTION_FACTOR = 1.3;
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
app.post("/api/vehicles/estimate-distance", async (req, res) => {
  const { startAddress, endAddress, startLat, startLng, endLat, endLng } = req.body;
  try {
    let sLat = startLat, sLng = startLng, eLat = endLat, eLng = endLng;
    if (!sLat || !sLng) {
      const { coords, error } = await geocodeAddressWithDiagnostics(startAddress || "");
      if (!coords) return res.status(422).json({ error: `\uCD9C\uBC1C\uC9C0 \uC8FC\uC18C\uC758 \uC88C\uD45C\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. (${error || "\uC54C \uC218 \uC5C6\uB294 \uC774\uC720"})` });
      sLat = coords.lat;
      sLng = coords.lng;
    }
    if (!eLat || !eLng) {
      const { coords, error } = await geocodeAddressWithDiagnostics(endAddress || "");
      if (!coords) return res.status(422).json({ error: `\uBAA9\uC801\uC9C0 \uC8FC\uC18C\uC758 \uC88C\uD45C\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. (${error || "\uC54C \uC218 \uC5C6\uB294 \uC774\uC720"})` });
      eLat = coords.lat;
      eLng = coords.lng;
    }
    const straightLineKm = haversineKm(sLat, sLng, eLat, eLng);
    const estimatedRoadKm = Math.round(straightLineKm * ROAD_DISTANCE_CORRECTION_FACTOR * 10) / 10;
    res.json({ success: true, estimatedKm: estimatedRoadKm, straightLineKm: Math.round(straightLineKm * 10) / 10 });
  } catch (err) {
    console.error("\uC608\uC0C1 \uAC70\uB9AC \uACC4\uC0B0 \uC911 \uC624\uB958:", err);
    res.status(500).json({ error: err.message || "\uAC70\uB9AC \uACC4\uC0B0 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
app.get("/api/contacts/geocode-failures", (req, res) => {
  const dbData = getScopedData(req);
  const failures = dbData.contacts.filter((c) => (c.address || "").trim() && c.isRealGeocoded && (!c.lat || !c.lng)).map((c) => ({ id: c.id, name: c.name, company: c.company, address: c.address }));
  res.json({ failures, count: failures.length });
});
app.post("/api/contacts/regeocode", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const retryFailed = req.body?.retryFailed === true;
  const offset = Number(req.body?.offset) || 0;
  const hasAddress = (c) => Boolean((c.address || "").trim());
  const candidates = retryFailed ? dbData.contacts.filter(hasAddress) : dbData.contacts.filter((c) => hasAddress(c) && !c.isRealGeocoded);
  const LIMIT_PER_CALL = 150;
  const targets = candidates.slice(offset, offset + LIMIT_PER_CALL);
  let updated = 0;
  let failed = 0;
  let firstError;
  let authError = false;
  const CONCURRENCY = 6;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    if (authError) break;
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (c) => {
      const { coords, error } = await geocodeAddressWithDiagnostics(c.address || "");
      if (coords) {
        c.lat = coords.lat;
        c.lng = coords.lng;
        c.isRealGeocoded = true;
        await setScopedDoc(scopeId, "contacts", c);
        updated++;
      } else {
        c.lat = void 0;
        c.lng = void 0;
        c.isRealGeocoded = true;
        await setScopedDoc(scopeId, "contacts", c);
        failed++;
        if (!firstError && error) firstError = error;
        if (error && error.includes("\uC778\uC99D \uC2E4\uD328")) authError = true;
      }
    }));
  }
  const nextOffset = offset + targets.length;
  const done = authError || nextOffset >= candidates.length;
  res.json({
    success: true,
    processedThisCall: targets.length,
    updated,
    failed,
    done,
    nextOffset,
    totalCandidates: candidates.length,
    firstError,
    authError
  });
});
app.get("/api/img/contacts/:contactId/:side", (req, res) => {
  const dbData = getScopedData(req);
  const contact = dbData.contacts.find((c) => c.id === req.params.contactId);
  if (!contact) return res.status(404).send("Not found");
  const url = req.params.side === "back" ? contact.backImage : contact.frontImage;
  if (!url) return res.status(404).send("Not found");
  res.redirect(url);
});
app.get("/api/img/my-profile/:side", (req, res) => {
  const dbData = getScopedData(req);
  const url = req.params.side === "back" ? dbData.myProfile?.backImage : dbData.myProfile?.frontImage;
  if (!url) return res.status(404).send("Not found");
  res.redirect(url);
});
app.get("/api/contacts", (req, res) => {
  const dbData = getScopedData(req);
  const requesterId = req.headers["x-user-id"];
  const privateGroupIds = new Set(
    dbData.groups.filter((g) => g.isPrivate && g.createdByUserId && g.createdByUserId !== requesterId).map((g) => g.id)
  );
  const visible = dbData.contacts.filter((c) => {
    if (c.isPrivate && c.addedByUserId && c.addedByUserId !== requesterId) return false;
    if (privateGroupIds.size > 0 && getContactGroupIds(c).some((gid) => privateGroupIds.has(gid))) return false;
    return true;
  });
  res.json(visible);
});
app.post("/api/contacts", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const newCard = req.body;
  if (!newCard.id) newCard.id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!newCard.createdAt) newCard.createdAt = (/* @__PURE__ */ new Date()).toISOString();
  if (!newCard.callHistory) newCard.callHistory = [];
  if (typeof newCard.address === "string") newCard.address = stripBackslashFromAddress(newCard.address);
  if (typeof newCard.address2 === "string") newCard.address2 = stripBackslashFromAddress(newCard.address2);
  if (typeof newCard.homeAddress === "string") newCard.homeAddress = stripBackslashFromAddress(newCard.homeAddress);
  const requesterId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === requesterId);
  newCard.addedByUserId = requesterId || newCard.addedByUserId;
  newCard.addedByUserName = requester?.name || newCard.addedByUserName;
  if (!newCard.lat || !newCard.lng) {
    const coords = await geocodeAddress(newCard.address || "");
    if (coords) {
      newCard.lat = coords.lat;
      newCard.lng = coords.lng;
      newCard.isRealGeocoded = true;
    }
  }
  newCard.frontImage = await persistImageField(scopeId, newCard.frontImage, `contact-${newCard.id}-front`);
  newCard.backImage = await persistImageField(scopeId, newCard.backImage, `contact-${newCard.id}-back`);
  dbData.contacts.unshift(newCard);
  const saved = await setScopedDoc(scopeId, "contacts", newCard);
  if (!saved) {
    dbData.contacts = dbData.contacts.filter((c) => c.id !== newCard.id);
    return res.status(500).json({ error: "\uBA85\uD568\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.status(201).json(newCard);
});
app.put("/api/contacts/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const idx = dbData.contacts.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Contact not found" });
  const beforeAddress = dbData.contacts[idx].address;
  const previousContact = dbData.contacts[idx];
  const updated = { ...dbData.contacts[idx], ...req.body };
  if (typeof updated.address === "string") updated.address = stripBackslashFromAddress(updated.address);
  if (typeof updated.address2 === "string") updated.address2 = stripBackslashFromAddress(updated.address2);
  if (typeof updated.homeAddress === "string") updated.homeAddress = stripBackslashFromAddress(updated.homeAddress);
  if (updated.address && updated.address !== beforeAddress) {
    const coords = await geocodeAddress(updated.address);
    if (coords) {
      updated.lat = coords.lat;
      updated.lng = coords.lng;
      updated.isRealGeocoded = true;
    }
  }
  updated.frontImage = await persistImageField(scopeId, updated.frontImage, `contact-${updated.id}-front`);
  updated.backImage = await persistImageField(scopeId, updated.backImage, `contact-${updated.id}-back`);
  dbData.contacts[idx] = updated;
  const saved = await setScopedDoc(scopeId, "contacts", updated);
  if (!saved) {
    dbData.contacts[idx] = previousContact;
    return res.status(500).json({ error: "\uBA85\uD568 \uC218\uC815 \uB0B4\uC6A9\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.json(updated);
});
app.delete("/api/contacts/:id", async (req, res) => {
  const dbData = getScopedData(req);
  dbData.contacts = dbData.contacts.filter((c) => c.id !== req.params.id);
  await deleteScopedDoc(req.scopeId, "contacts", req.params.id);
  res.json({ success: true });
});
function stripBackslashFromAddress(value) {
  return value.replace(/\\/g, "").replace(/\s{2,}/g, " ").trim();
}
function findBackslashAddressFixes(dbData) {
  const fields = ["address", "address2", "homeAddress"];
  const results = [];
  for (const c of dbData.contacts || []) {
    const changes = {};
    for (const field of fields) {
      const before = c[field];
      if (typeof before === "string" && before.includes("\\")) {
        changes[field] = { before, after: stripBackslashFromAddress(before) };
      }
    }
    if (Object.keys(changes).length > 0) {
      results.push({ id: c.id, name: c.name, company: c.company, changes });
    }
  }
  return results;
}
app.get("/api/admin/contacts-backslash-scan", (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const dbData = getScopedData(req);
  res.json(findBackslashAddressFixes(dbData));
});
app.post("/api/admin/contacts-backslash-clean", async (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const fixes = findBackslashAddressFixes(dbData);
  if (!fixes.length) return res.json({ fixedCount: 0 });
  const fixIds = new Set(fixes.map((f) => f.id));
  const updatedContacts = [];
  dbData.contacts = dbData.contacts.map((c) => {
    if (!fixIds.has(c.id)) return c;
    const fix = fixes.find((f) => f.id === c.id);
    const updated = { ...c };
    for (const field of Object.keys(fix.changes)) {
      updated[field] = fix.changes[field].after;
    }
    updatedContacts.push(updated);
    return updated;
  });
  await setScopedDocs(scopeId, "contacts", updatedContacts);
  res.json({ fixedCount: updatedContacts.length });
});
app.get("/api/groups", (req, res) => {
  const dbData = getScopedData(req);
  const requesterId = req.headers["x-user-id"];
  const visible = dbData.groups.filter((g) => !g.isPrivate || !g.createdByUserId || g.createdByUserId === requesterId);
  res.json(visible);
});
app.post("/api/groups", async (req, res) => {
  const dbData = getScopedData(req);
  const g = req.body;
  if (!g.id) g.id = `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!g.color) g.color = "bg-slate-700 text-white border-slate-600";
  const requesterId = req.headers["x-user-id"];
  const requester = requesterId ? users.find((u) => u.id === requesterId) : void 0;
  if (requester) {
    g.createdByUserId = requester.id;
    g.createdByUserName = requester.name;
  }
  dbData.groups.push(g);
  await setScopedDoc(req.scopeId, "groups", g);
  res.status(201).json(g);
});
app.put("/api/groups/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const idx = dbData.groups.findIndex((g) => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Group not found" });
  dbData.groups[idx] = { ...dbData.groups[idx], ...req.body };
  await setScopedDoc(req.scopeId, "groups", dbData.groups[idx]);
  res.json(dbData.groups[idx]);
});
app.delete("/api/groups/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const gid = req.params.id;
  dbData.groups = dbData.groups.filter((g) => g.id !== gid);
  const defaultGid = dbData.groups[0]?.id || "";
  const movedContacts = [];
  dbData.contacts = dbData.contacts.map((c) => {
    if (c.groupId !== gid) return c;
    const moved = { ...c, groupId: defaultGid };
    movedContacts.push(moved);
    return moved;
  });
  await deleteScopedDoc(scopeId, "groups", gid);
  if (movedContacts.length) await setScopedDocs(scopeId, "contacts", movedContacts);
  res.json({ success: true });
});
app.post("/api/contacts/:id/history", async (req, res) => {
  const dbData = getScopedData(req);
  const idx = dbData.contacts.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Contact not found" });
  const record = {
    id: `call-${Date.now()}`,
    contactId: req.params.id,
    type: req.body.type || "incoming",
    timestamp: req.body.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
    duration: req.body.duration || void 0,
    note: req.body.note || void 0
  };
  dbData.contacts[idx].callHistory.unshift(record);
  await setScopedDoc(req.scopeId, "contacts", dbData.contacts[idx]);
  res.json(dbData.contacts[idx]);
});
app.post("/api/detect-card-corners", async (req, res) => {
  try {
    const scanUserId = req.headers["x-user-id"] || req.ip || "unknown";
    const scanLimit = aiScanRateLimiter.check(scanUserId);
    if (!scanLimit.allowed) {
      return res.status(429).json({ error: "\uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
    }
    aiScanRateLimiter.registerAttempt(scanUserId);
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: "\uC774\uBBF8\uC9C0\uAC00 \uC804\uC1A1\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." });
    if (typeof image !== "string" || !image.startsWith("data:image")) {
      return res.json({ corners: null });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.json({ corners: null });
    const ai = new import_genai.GoogleGenAI({ apiKey });
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const contents = [
      '\uC774 \uC0AC\uC9C4\uC5D0 \uCC0D\uD78C \uBA85\uD568(\uC885\uC774 \uCE74\uB4DC) \uC2E4\uBB3C\uC758 \uB124 \uBAA8\uC11C\uB9AC \uC88C\uD45C\uB97C \uCC3E\uC544\uC918. \uC88C\uD45C\uB294 \uC774\uBBF8\uC9C0\uC758 \uAC00\uB85C/\uC138\uB85C \uD06C\uAE30\uC5D0 \uB300\uD55C 0~1 \uC0AC\uC774\uC758 \uBE44\uC728\uB85C \uD45C\uD604\uD574\uC918 (\uC608: \uC774\uBBF8\uC9C0 \uB9E8 \uC67C\uCABD \uC704\uB294 x:0, y:0). \uCE74\uBA54\uB77C \uAC01\uB3C4 \uB54C\uBB38\uC5D0 \uBA85\uD568\uC774 \uAE30\uC6B8\uC5B4\uC838 \uCC0D\uD614\uC5B4\uB3C4 \uC2E4\uC81C \uCE74\uB4DC\uC758 \uB124 \uAF2D\uC9D3\uC810 \uC704\uCE58\uB97C \uCD5C\uB300\uD55C \uC815\uD655\uD558\uAC8C \uCC3E\uC544\uC918 (\uCE74\uB4DC \uC8FC\uBCC0 \uBC30\uACBD, \uBC14\uB2E5, \uC637, \uC190\uAC00\uB77D, \uADF8\uB9BC\uC790\uB294 \uC808\uB300 \uD3EC\uD568\uD558\uC9C0 \uB9D0\uACE0 \uCE74\uB4DC \uC2E4\uBB3C \uAC00\uC7A5\uC790\uB9AC\uC5D0 \uB531 \uB9DE\uCDB0\uC918). \uC0AC\uC9C4\uC5D0 \uBA85\uD568\uC774 \uC548 \uBCF4\uC774\uBA74 corners\uB97C null\uB85C \uB9AC\uD134\uD574\uC918.\n\uC751\uB2F5\uC740 \uBC18\uB4DC\uC2DC \uC544\uB798 JSON \uADDC\uACA9\uC5D0 \uB9DE\uAC8C \uC21C\uC218 JSON \uB370\uC774\uD130\uB9CC \uB9AC\uD134\uD574\uC918. \uB9C8\uD06C\uB2E4\uC6B4 \uBC31\uD2F1 \uC5C6\uC774.\n{\n  "corners": {"topLeft": {"x":0,"y":0}, "topRight": {"x":0,"y":0}, "bottomRight": {"x":0,"y":0}, "bottomLeft": {"x":0,"y":0}}\n}',
      { inlineData: { mimeType: "image/jpeg", data: base64Data } }
    ];
    const response = await generateContentWithRetry(ai, {
      model: PRIMARY_GEMINI_MODEL,
      contents
    });
    const text = response.text || "";
    let parsedJson = { corners: null };
    try {
      const jsonStr = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      parsedJson = JSON.parse(jsonStr);
    } catch (e) {
      console.error("\uD14C\uB450\uB9AC \uAC10\uC9C0 JSON \uD30C\uC2F1 \uC2E4\uD328:", text);
    }
    res.json(parsedJson);
  } catch (error) {
    console.error("AI \uD14C\uB450\uB9AC \uAC10\uC9C0 \uC624\uB958:", error);
    res.json({ corners: null });
  }
});
app.post("/api/scan-card", async (req, res) => {
  try {
    const scanUserId = req.headers["x-user-id"] || req.ip || "unknown";
    const scanLimit = aiScanRateLimiter.check(scanUserId);
    if (!scanLimit.allowed) {
      return res.status(429).json({ error: "\uBA85\uD568 \uC2A4\uCE94 \uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
    }
    aiScanRateLimiter.registerAttempt(scanUserId);
    const { frontImage, backImage } = req.body;
    if (!frontImage && !backImage) {
      return res.status(400).json({ error: "\uBA85\uD568 \uC774\uBBF8\uC9C0\uAC00 \uC804\uC1A1\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." });
    }
    const isDataUrl = (v) => typeof v === "string" && v.startsWith("data:image");
    if (frontImage && !isDataUrl(frontImage) || backImage && !isDataUrl(backImage)) {
      return res.status(400).json({ error: "\uC774\uBBF8\uC9C0 \uB370\uC774\uD130 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4 (base64 \uC0AC\uC9C4 \uB370\uC774\uD130\uAC00 \uC544\uB2CC URL \uB4F1\uC774 \uC804\uB2EC\uB428)." });
    }
    if (frontImage) {
      const frontValidation = validateImageSize(frontImage, 5);
      if (!frontValidation.valid) {
        return res.status(400).json({ error: `\uC55E\uBA74 ${frontValidation.error}` });
      }
    }
    if (backImage) {
      const backValidation = validateImageSize(backImage, 5);
      if (!backValidation.valid) {
        return res.status(400).json({ error: `\uB4B7\uBA74 ${backValidation.error}` });
      }
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json({
        name: "\uD64D\uAE38\uB3D9",
        company: "(\uC8FC)\uC2A4\uB9C8\uD2B8\uD14C\uD06C",
        department: "\uB514\uC9C0\uD138 \uC804\uD658\uD300",
        title: "\uBD80\uC7A5",
        phoneMobile: "010-1234-5678",
        phoneOffice: "02-123-4567 (\uB300\uD45C)",
        phoneOffice2: "070-7654-3210 (\uC9C1\uD1B5)",
        phoneFax: "02-123-4568",
        email: "gildong.hong@smarttech.co.kr",
        address: "\uC11C\uC6B8\uD2B9\uBCC4\uC2DC \uAC15\uB0A8\uAD6C \uD14C\uD5E4\uB780\uB85C 123 \uC2A4\uB9C8\uD2B8\uBE4C\uB529 8\uCE35 (\uBCF8\uC0AC)",
        address2: "\uACBD\uAE30\uB3C4 \uC131\uB0A8\uC2DC \uBD84\uB2F9\uAD6C \uD310\uAD50\uC5ED\uB85C 231 \uD310\uAD50\uD14C\uD06C\uB178\uBC38\uB9AC R&D\uC13C\uD130 3\uCE35 (\uD310\uAD50\uC5F0\uAD6C\uC18C)",
        memo: "\uC790\uB3D9 \uC2A4\uCE94 \uC0D8\uD50C \uB370\uC774\uD130 (GEMINI_API_KEY \uC124\uC815 \uC2DC \uC2E4\uC2DC\uAC04 \uC774\uBBF8\uC9C0 OCR \uAC00\uB3D9)",
        companyInfo: "\uC778\uACF5\uC9C0\uB2A5 \uAE30\uBC18 \uB514\uC9C0\uD138 \uC804\uD658(DX) \uBC0F \uC2A4\uB9C8\uD2B8 \uAE30\uC5C5 \uC194\uB8E8\uC158 \uC804\uBB38 \uC81C\uACF5\uC0AC (\uC804\uB144\uB3C4 \uB9E4\uCD9C\uC561 \uC57D 120\uC5B5\uC6D0)"
      });
    }
    const ai = new import_genai.GoogleGenAI({ apiKey });
    const contents = [
      '\uC774 \uBA85\uD568 \uC774\uBBF8\uC9C0(\uC55E\uBA74 \uBC0F \uB4B7\uBA74)\uB97C \uBD84\uC11D\uD558\uC5EC \uB2E4\uC74C \uC815\uBCF4\uB4E4\uC744 \uCD94\uCD9C\uD574\uC918. \uD55C\uAD6D\uC5B4 \uB610\uB294 \uC601\uC5B4 \uBA85\uD568\uC744 \uC778\uC2DD\uD558\uC5EC \uC815\uD655\uD55C \uBB38\uC790\uC5F4\uB85C \uC815\uB9AC\uD574\uC918.\n\uBA85\uD568\uC5D0 \uBCF8\uC0AC/\uC9C0\uC0AC, \uC11C\uC6B8\uC0AC\uBB34\uC18C/\uACF5\uC7A5, \uD5E4\uB4DC\uC624\uD53C\uC2A4/\uC5F0\uAD6C\uC18C \uB4F1 \'\uC8FC\uC18C\uAC00 2\uAC1C \uD45C\uAE30\uB418\uC5B4 \uC788\uB294 \uACBD\uC6B0\' \uAC01\uAC01\uC744 \uCCA0\uC800\uD558\uAC8C \uBD84\uB9AC\uD558\uC5EC address\uC640 address2\uC5D0 \uB098\uB220 \uB2F4\uC544\uC8FC\uACE0, \uC8FC\uC18C\uAC00 1\uAC1C\uB9CC \uC788\uB2E4\uBA74 address2\uB294 \uBE48 \uBB38\uC790\uC5F4\uB85C \uCC98\uB9AC\uD574\uC918.\n\uB610\uD55C \uC720\uC120\uC804\uD654/\uC0AC\uBB34\uC2E4 \uC804\uD654\uBC88\uD638\uAC00 2\uAC1C \uC774\uC0C1 \uC874\uC7AC\uD558\uB294 \uACBD\uC6B0(\uC608: \uB300\uD45C\uC804\uD654 \uBC0F \uC9C1\uD1B5\uBC88\uD638, \uD639\uC740 \uC11C\uC6B8\uC0AC\uBB34\uC18C \uBC88\uD638 \uBC0F \uACF5\uC7A5 \uBC88\uD638), \uCCAB \uBC88\uC9F8 \uBC88\uD638\uB294 phoneOffice\uC5D0, \uB450 \uBC88\uC9F8 \uBC88\uD638\uB294 phoneOffice2\uC5D0 \uBD84\uB9AC\uD558\uC5EC \uB2F4\uC544\uC8FC\uACE0, 1\uAC1C\uB9CC \uC788\uB2E4\uBA74 phoneOffice2\uB294 \uBE48 \uBB38\uC790\uC5F4\uB85C \uCC98\uB9AC\uD574\uC918.\n\uCD94\uAC00\uB85C, \uC0AC\uC9C4\uC5D0 \uCC0D\uD78C \uBA85\uD568 \uC2E4\uBB3C(\uC885\uC774 \uCE74\uB4DC \uC790\uCCB4)\uC758 \uB124 \uBAA8\uC11C\uB9AC \uC88C\uD45C\uB97C \uAC01 \uC774\uBBF8\uC9C0 \uAE30\uC900\uC73C\uB85C \uC54C\uB824\uC918. \uC88C\uD45C\uB294 \uC774\uBBF8\uC9C0\uC758 \uAC00\uB85C/\uC138\uB85C \uD06C\uAE30\uC5D0 \uB300\uD55C 0~1 \uC0AC\uC774\uC758 \uBE44\uC728\uB85C \uD45C\uD604\uD574\uC918 (\uC608: \uC774\uBBF8\uC9C0 \uB9E8 \uC67C\uCABD \uC704 \uBAA8\uC11C\uB9AC\uB294 x:0, y:0). \uCE74\uBA54\uB77C \uAC01\uB3C4 \uB54C\uBB38\uC5D0 \uBA85\uD568\uC774 \uAE30\uC6B8\uC5B4\uC838 \uCC0D\uD614\uC5B4\uB3C4, \uC2E4\uC81C \uCE74\uB4DC\uC758 \uB124 \uAF2D\uC9D3\uC810 \uC704\uCE58\uB97C \uCD5C\uB300\uD55C \uC815\uD655\uD558\uAC8C \uCC3E\uC544\uC918 (\uCE74\uB4DC \uC8FC\uBCC0 \uBC30\uACBD, \uC190\uAC00\uB77D, \uADF8\uB9BC\uC790\uB294 \uC808\uB300 \uD3EC\uD568\uD558\uC9C0 \uB9D0\uACE0 \uCE74\uB4DC \uC2E4\uBB3C \uAC00\uC7A5\uC790\uB9AC\uC5D0 \uB531 \uB9DE\uCDB0\uC918).\n\uADF8\uB9AC\uACE0 \uAC01 \uC774\uBBF8\uC9C0\uBCC4\uB85C, \uADF8 \uC774\uBBF8\uC9C0\uB97C \uC2DC\uACC4 \uBC29\uD5A5\uC73C\uB85C \uBA87 \uB3C4 \uB3CC\uB824\uC57C \uBA85\uD568\uC5D0 \uC801\uD78C \uAE00\uC790\uAC00 \uB611\uBC14\uB85C(\uAC70\uAFB8\uB85C \uB4A4\uC9D1\uD788\uC9C0 \uC54A\uACE0, \uC606\uC73C\uB85C \uB215\uC9C0 \uC54A\uACE0) \uC815\uC0C1\uC801\uC73C\uB85C \uC77D\uD788\uB294\uC9C0\uB3C4 \uC54C\uB824\uC918. \uAC12\uC740 \uBC18\uB4DC\uC2DC 0, 90, 180, 270 \uC911 \uD558\uB098\uC5EC\uC57C \uD574 (\uC774\uBBF8 \uB611\uBC14\uB85C \uBCF4\uC774\uBA74 0).\n\uC751\uB2F5\uC740 \uBC18\uB4DC\uC2DC \uC544\uB798 JSON \uADDC\uACA9\uC5D0 \uB9DE\uAC8C \uC21C\uC218 JSON \uB370\uC774\uD130\uB9CC \uB9AC\uD134\uD574\uC918. \uB9C8\uD06C\uB2E4\uC6B4 \uBC31\uD2F1(```json) \uC5C6\uC774 \uB9AC\uD134\uD558\uAC70\uB098 \uC788\uC5B4\uB3C4 JSON \uD30C\uC2F1 \uAC00\uB2A5\uD574\uC57C \uD568.\n{\n  "name": "\uC131\uBA85",\n  "company": "\uD68C\uC0AC\uBA85",\n  "department": "\uBD80\uC11C\uBA85",\n  "title": "\uC9C1\uCC45/\uC9C1\uAE09",\n  "phoneMobile": "\uD578\uB4DC\uD3F0 \uBC88\uD638 (\uC608: 010-XXXX-XXXX)",\n  "phoneOffice": "\uC0AC\uBB34\uC2E4 \uC720\uC120\uC804\uD654 1 (\uC608: 02-XXXX-XXXX)",\n  "phoneOffice2": "\uC0AC\uBB34\uC2E4 \uC720\uC120\uC804\uD654 2 \uB610\uB294 \uC9C1\uD1B5\uBC88\uD638/\uBCF4\uC870\uBC88\uD638 (\uC720\uC120\uBC88\uD638\uAC00 2\uAC1C \uC874\uC7AC\uD558\uB294 \uACBD\uC6B0\uC5D0\uB9CC \uAE30\uC7AC, 1\uAC1C\uC77C \uACBD\uC6B0 \uBE48 \uBB38\uC790\uC5F4 "")",\n  "phoneFax": "\uD329\uC2A4 \uBC88\uD638",\n  "email": "\uC774\uBA54\uC77C \uC8FC\uC18C",\n  "address": "\uD68C\uC0AC \uCCAB \uBC88\uC9F8/\uAE30\uBCF8/\uBCF8\uC0AC \uC8FC\uC18C",\n  "address2": "\uD68C\uC0AC \uB450 \uBC88\uC9F8/\uC9C0\uC0AC/\uACF5\uC7A5/\uBCF4\uC870 \uC8FC\uC18C (\uBA85\uD568 \uB0B4 \uC8FC\uC18C\uAC00 2\uAC1C \uC874\uC7AC\uD558\uB294 \uACBD\uC6B0\uC5D0\uB9CC \uC791\uC131, 1\uAC1C\uC77C \uACBD\uC6B0 \uBE48 \uBB38\uC790\uC5F4 "")",\n  "website": "\uD648\uD398\uC774\uC9C0 \uC8FC\uC18C (\uBA85\uD568\uC5D0 \uC801\uD600\uC788\uB294 \uACBD\uC6B0\uC5D0\uB9CC \uAE30\uC7AC, \uC5C6\uC73C\uBA74 \uBE48 \uBB38\uC790\uC5F4 "")",\n  "memo": "\uBA85\uD568\uC5D0 \uC801\uD78C \uC2AC\uB85C\uAC74\uC774\uB098 \uC8FC\uC694 \uBE44\uC988\uB2C8\uC2A4 \uC694\uC57D",\n  "frontCorners": {"topLeft": {"x":0,"y":0}, "topRight": {"x":0,"y":0}, "bottomRight": {"x":0,"y":0}, "bottomLeft": {"x":0,"y":0}},\n  "backCorners": {"topLeft": {"x":0,"y":0}, "topRight": {"x":0,"y":0}, "bottomRight": {"x":0,"y":0}, "bottomLeft": {"x":0,"y":0}},\n  "frontRotation": 0,\n  "backRotation": 0\n}\n(frontCorners/frontRotation\uC740 \uCCAB \uBC88\uC9F8\uB85C \uCCA8\uBD80\uB41C \uC774\uBBF8\uC9C0, backCorners/backRotation\uC740 \uB450 \uBC88\uC9F8\uB85C \uCCA8\uBD80\uB41C \uC774\uBBF8\uC9C0 \uAE30\uC900\uC774\uC57C. \uD574\uB2F9 \uC774\uBBF8\uC9C0\uAC00 \uC5C6\uC73C\uBA74 \uADF8 \uD544\uB4DC\uB4E4\uC740 \uC0DD\uB7B5\uD574\uB3C4 \uB3FC.)'
    ];
    if (frontImage) {
      const base64Data = frontImage.replace(/^data:image\/\w+;base64,/, "");
      contents.push("\uB2E4\uC74C\uC740 \uBA85\uD568 \uC55E\uBA74 \uC774\uBBF8\uC9C0\uC57C (frontCorners\uB294 \uC774 \uC774\uBBF8\uC9C0 \uAE30\uC900):");
      contents.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data
        }
      });
    }
    if (backImage) {
      const base64DataBack = backImage.replace(/^data:image\/\w+;base64,/, "");
      contents.push("\uB2E4\uC74C\uC740 \uBA85\uD568 \uB4B7\uBA74 \uC774\uBBF8\uC9C0\uC57C (backCorners\uB294 \uC774 \uC774\uBBF8\uC9C0 \uAE30\uC900):");
      contents.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64DataBack
        }
      });
    }
    const response = await generateContentWithRetry(ai, {
      model: PRIMARY_GEMINI_MODEL,
      contents
    });
    const text = response.text || "";
    let parsedJson = {};
    try {
      const jsonStr = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      parsedJson = JSON.parse(jsonStr);
    } catch (e) {
      console.error("JSON \uD30C\uC2F1 \uC2E4\uD328, \uD14D\uC2A4\uD2B8 \uADF8\uB300\uB85C \uBD84\uC11D \uC2DC\uB3C4:", text);
      parsedJson = {
        name: "\uC778\uC2DD \uC644\uB8CC",
        company: "\uD655\uC778 \uD544\uC694",
        department: "",
        title: "",
        phoneMobile: "",
        phoneOffice: "",
        phoneOffice2: "",
        phoneFax: "",
        email: "",
        address: "",
        address2: "",
        memo: text.slice(0, 100),
        companyInfo: "\uB9E4\uCD9C \uC815\uBCF4 \uD655\uC778 \uC5B4\uB824\uC6C0"
      };
    }
    const normalizeRotation = (v) => [0, 90, 180, 270].includes(v) ? v : 0;
    if ("frontRotation" in parsedJson) parsedJson.frontRotation = normalizeRotation(parsedJson.frontRotation);
    if ("backRotation" in parsedJson) parsedJson.backRotation = normalizeRotation(parsedJson.backRotation);
    res.json(parsedJson);
  } catch (error) {
    console.error("Gemini OCR Error:", error);
    res.status(500).json({ error: toFriendlyAiErrorMessage(error) });
  }
});
app.post("/api/summarize-meeting", async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText || !String(rawText).trim()) {
      return res.status(400).json({ error: "\uC815\uB9AC\uD560 \uD68C\uC758 \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." });
    const ai = new import_genai.GoogleGenAI({ apiKey });
    const prompt = `\uB2E4\uC74C\uC740 \uBBF8\uD305/\uAC70\uB798\uCC98 \uBC29\uBB38 \uC911\uC5D0 \uC74C\uC131 \uC778\uC2DD\uC73C\uB85C \uBC1B\uC544\uC801\uC5B4\uC11C, \uBB38\uC7A5\uC774 \uB450\uC11C\uC5C6\uACE0 \uC815\uB9AC\uAC00 \uC548 \uB418\uC5B4 \uC788\uB294 \uD68C\uC758 \uBA54\uBAA8\uC57C. \uC774\uAC78 \uC2E4\uC81C \uC5C5\uBB34 \uD314\uB85C\uC6B0\uC5C5 \uAE30\uB85D\uC73C\uB85C \uC4F8 \uC218 \uC788\uAC8C \uC815\uB9AC\uD574\uC918.

[\uC6D0\uBCF8 \uBA54\uBAA8]
${rawText}

\uB2E4\uC74C JSON \uADDC\uACA9\uC5D0 \uB9DE\uAC8C \uC21C\uC218 JSON\uB9CC \uB9AC\uD134\uD574\uC918. \uB9C8\uD06C\uB2E4\uC6B4 \uBC31\uD2F1 \uC5C6\uC774. \uC6D0\uBCF8\uC5D0 \uC5C6\uB294 \uB0B4\uC6A9\uC744 \uC9C0\uC5B4\uB0B4\uC9C0 \uB9D0\uACE0, \uC2E4\uC81C \uC5B8\uAE09\uB41C \uB0B4\uC6A9\uB9CC \uC815\uB9AC\uD574\uC918.
{
  "summary": "\uD575\uC2EC \uB0B4\uC6A9\uC744 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uBB38\uC7A5 2~4\uAC1C\uB85C \uC815\uB9AC\uD55C \uD68C\uC758\uB85D (\uB450\uC11C\uC5C6\uB358 \uB9D0\uD22C\uB97C \uC5C5\uBB34 \uAE30\uB85D\uCCB4\uB85C \uB2E4\uB4EC\uC5B4\uC918)",
  "actionItems": ["\uB2E4\uC74C\uC5D0 \uD558\uAE30\uB85C \uD55C \uC77C 1", "\uB2E4\uC74C\uC5D0 \uD558\uAE30\uB85C \uD55C \uC77C 2"], // \uC5B8\uAE09\uC774 \uC5C6\uC73C\uBA74 \uBE48 \uBC30\uC5F4
  "mentionedAmounts": [{"amount": 500000, "context": "\uC2DD\uB300\uB85C \uC5B8\uAE09\uB41C \uAE08\uC561"}], // \uC6D0 \uB2E8\uC704 \uC22B\uC790\uB85C \uBCC0\uD658, \uC5B8\uAE09 \uC5C6\uC73C\uBA74 \uBE48 \uBC30\uC5F4
}`;
    const response = await generateContentWithRetry(ai, {
      model: PRIMARY_GEMINI_MODEL,
      contents: prompt
    });
    const text = response.text || "";
    let parsed = {};
    try {
      const cleaned = text.replace(/```json\s*|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { summary: text.trim(), actionItems: [], mentionedAmounts: [] };
    }
    res.json({
      summary: parsed.summary || "",
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      mentionedAmounts: Array.isArray(parsed.mentionedAmounts) ? parsed.mentionedAmounts : []
    });
  } catch (error) {
    console.error("\uD68C\uC758\uB85D AI \uC694\uC57D \uC624\uB958:", error);
    res.status(500).json({ error: toFriendlyAiErrorMessage(error) });
  }
});
app.post("/api/parse-voice-contact", async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText || !String(rawText).trim()) {
      return res.status(400).json({ error: "\uC778\uC2DD\uB41C \uC74C\uC131 \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." });
    const ai = new import_genai.GoogleGenAI({ apiKey });
    const prompt = `\uB2E4\uC74C\uC740 \uC804\uC2DC\uD68C\uB098 \uBBF8\uD305 \uC790\uB9AC\uC5D0\uC11C \uBC29\uAE08 \uB9CC\uB09C \uC0AC\uB78C\uC5D0 \uB300\uD574 \uC190\uC774 \uBC14\uBE60\uC11C \uC74C\uC131\uC73C\uB85C \uAE09\uD558\uAC8C \uB9D0\uD55C \uB0B4\uC6A9\uC774\uC57C. \uC774\uB984\uACFC (\uC5B8\uAE09\uB410\uB2E4\uBA74) \uD68C\uC0AC\uBA85/\uC9C1\uCC45/\uBD80\uC11C/\uBA54\uBAA8\uB97C \uBF51\uC544\uC918.

[\uC74C\uC131 \uC778\uC2DD \uD14D\uC2A4\uD2B8]
${rawText}

\uB2E4\uC74C JSON \uADDC\uACA9\uC5D0 \uB9DE\uAC8C \uC21C\uC218 JSON\uB9CC \uB9AC\uD134\uD574\uC918. \uB9C8\uD06C\uB2E4\uC6B4 \uBC31\uD2F1 \uC5C6\uC774. \uC5B8\uAE09 \uC548 \uB41C \uD56D\uBAA9\uC740 \uBE48 \uBB38\uC790\uC5F4\uB85C \uB46C. \uC774\uB984\uC740 \uCD5C\uB300\uD55C \uCD94\uC815\uD574\uC11C\uB77C\uB3C4 \uCC44\uC6CC\uC918(\uC0AC\uB78C \uC774\uB984\uC73C\uB85C \uB4E4\uB9AC\uB294 \uB2E8\uC5B4).
{
  "name": "\uC131\uBA85",
  "company": "\uD68C\uC0AC\uBA85",
  "department": "\uBD80\uC11C\uBA85",
  "title": "\uC9C1\uCC45/\uC9C1\uAE09",
  "memo": "\uADF8 \uC678 \uC5B8\uAE09\uB41C \uB0B4\uC6A9(\uC608: \uC5B4\uB514\uC11C \uB9CC\uB0AC\uB294\uC9C0, \uAD00\uC2EC\uC0AC \uB4F1)"
}`;
    const response = await generateContentWithRetry(ai, {
      model: PRIMARY_GEMINI_MODEL,
      contents: prompt
    });
    const text = response.text || "";
    let parsed = {};
    try {
      const cleaned = text.replace(/```json\s*|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { name: rawText.trim().split(/[\s,]+/)[0] || "", company: "", department: "", title: "", memo: rawText };
    }
    res.json({
      name: parsed.name || "",
      company: parsed.company || "",
      department: parsed.department || "",
      title: parsed.title || "",
      memo: parsed.memo || ""
    });
  } catch (error) {
    console.error("\uC74C\uC131 \uBA85\uD568 \uD30C\uC2F1 \uC624\uB958:", error);
    res.status(500).json({ error: toFriendlyAiErrorMessage(error) });
  }
});
app.post("/api/scan-receipt", async (req, res) => {
  try {
    const scanUserId = req.headers["x-user-id"] || req.ip || "unknown";
    const scanLimit = aiScanRateLimiter.check(scanUserId);
    if (!scanLimit.allowed) {
      return res.status(429).json({ error: "\uC601\uC218\uC99D \uC2A4\uCE94 \uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
    }
    aiScanRateLimiter.registerAttempt(scanUserId);
    const { image, context } = req.body;
    if (!image) {
      return res.status(400).json({ error: "\uC601\uC218\uC99D \uC774\uBBF8\uC9C0\uAC00 \uC804\uC1A1\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." });
    }
    const imageValidation = validateImageSize(image, 5);
    if (!imageValidation.valid) {
      return res.status(400).json({ error: imageValidation.error });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json(
        context === "overseas_trip" ? {
          amount: 35e3,
          date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
          merchantName: "\uC131\uBD81\uAD6C \uB099\uC0B0 \uAC08\uBE44\uB9C8\uC744",
          memo: "\uCD9C\uC7A5 \uC911 \uC2DD\uC0AC (\uC601\uC218\uC99D \uC790\uB3D9 \uC2A4\uCE94 \uC644\uB8CC - \uC0D8\uD50C \uB370\uC774\uD130)",
          category: "\uC2DD\uBE44",
          payMethod: "\uC2E0\uC6A9\uCE74\uB4DC"
        } : {
          amount: 35e3,
          date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
          merchantName: "\uC131\uBD81\uAD6C \uB099\uC0B0 \uAC08\uBE44\uB9C8\uC744",
          memo: "\uC2DD\uB300 \uACB0\uC81C \uAC74 (\uC601\uC218\uC99D \uC790\uB3D9 \uC2A4\uCE94 \uC644\uB8CC - \uC0D8\uD50C \uB370\uC774\uD130)",
          category: "meal",
          payMethod: "company_card"
        }
      );
    }
    const ai = new import_genai.GoogleGenAI({ apiKey });
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const contents = [
      "\uC774 \uC601\uC218\uC99D \uC774\uBBF8\uC9C0(\uB610\uB294 \uBE44\uC6A9 \uC601\uC218\uC99D \uC0AC\uC9C4)\uB97C \uBD84\uC11D\uD558\uC5EC \uC9C0\uCD9C \uC815\uBCF4\uB97C \uCD94\uCD9C\uD558\uACE0 \uC801\uD569\uD55C \uCE74\uD14C\uACE0\uB9AC\uB97C \uBD84\uB958\uD574\uC918.\n" + // [추가] 해외 출장 경비(회계관리 > AdminDocsView, context === 'overseas_trip') 화면에서
      // 올라온 영수증은 국내 일반 비용(주유비/식대 등)과 분류 체계가 전혀 달라서(항공료/숙박비/
      // 환전 비용 등), 기존 카테고리 목록을 그대로 쓰면 항공권·호텔 영수증이 전부 'other'로만
      // 잡힌다. 이 화면 전용으로, 그 화면이 실제로 쓰는 한글 사용구분 값을 그대로 분류하게 해서
      // 클라이언트에서 별도 코드↔한글 매핑 없이 바로 써도 서로 어긋나지 않게 한다.
      (context === "overseas_trip" ? "\uBD84\uB958\uD560 \uCE74\uD14C\uACE0\uB9AC(\uC0AC\uC6A9\uAD6C\uBD84)\uB294 \uB2E4\uC74C \uC911\uC5D0\uC11C \uAC00\uC7A5 \uC54C\uB9DE\uC740 \uD558\uB098\uB97C \uD55C\uAE00 \uADF8\uB300\uB85C \uC120\uD0DD\uD574\uC918:\n- '\uD56D\uACF5\uB8CC' (\uD56D\uACF5\uAD8C, \uC218\uD558\uBB3C \uC694\uAE08 \uB4F1 \uD56D\uACF5 \uAD00\uB828 \uBE44\uC6A9)\n- '\uC219\uBC15\uBE44' (\uD638\uD154, \uC219\uC18C \uBE44\uC6A9)\n- '\uC2DD\uBE44' (\uC2DD\uC0AC, \uCE74\uD398, \uC74C\uB8CC \uB4F1)\n- '\uAD50\uD1B5\uBE44' (\uD0DD\uC2DC, \uB300\uC911\uAD50\uD1B5, \uB80C\uD130\uCE74, \uC8FC\uCC28, \uD1B5\uD589\uB8CC, \uACF5\uD56D \uC774\uB3D9 \uB4F1)\n- '\uD658\uC804 \uBE44\uC6A9' (\uD658\uC804 \uC218\uC218\uB8CC, \uD658\uC804\uC18C \uACB0\uC81C \uB4F1)\n- '\uC9C1\uC6D0 \uC120\uBB3C' (\uCD9C\uC7A5 \uC911 \uAD6C\uC785\uD55C \uC120\uBB3C/\uAE30\uB150\uD488)\n- '\uAE30\uD0C0' (\uC704 \uBD84\uB958\uC5D0 \uC548 \uB9DE\uB294 \uAE30\uD0C0 \uCD9C\uC7A5 \uC9C0\uCD9C)\n\n" : "\uBD84\uB958\uD560 \uCE74\uD14C\uACE0\uB9AC\uB294 \uB2E4\uC74C \uC911\uC5D0\uC11C \uAC00\uC7A5 \uC54C\uB9DE\uC740 \uD558\uB098\uB97C \uC120\uD0DD\uD574\uC918:\n- 'fuel' (\uC8FC\uC720\uBE44, \uCDA9\uC804\uBE44)\n- 'parking' (\uC8FC\uCC28\uBE44)\n- 'toll' (\uD1B5\uD589\uB8CC, \uACE0\uC18D\uB3C4\uB85C \uD1B5\uD589\uB8CC)\n- 'meal' (\uC2DD\uB300, \uC2DD\uC0AC\uBE44, \uD55C\uC2DD, \uC591\uC2DD, \uC911\uC2DD, \uC77C\uC2DD \uB4F1)\n- 'beverage' (\uC74C\uB8CC, \uCEE4\uD53C, \uB514\uC800\uD2B8, \uCE74\uD398 \uAC74)\n- 'supplies' (\uBE44\uD488 \uAD6C\uC785, \uC0AC\uBB34\uC6A9\uD488, \uBB38\uAD6C, \uBB3C\uD488 \uAD6C\uB9E4)\n- 'maintenance' (\uCC28\uB7C9 \uC815\uBE44, \uC218\uB9AC, \uC5D4\uC9C4\uC624\uC77C \uAD50\uD658 \uB4F1)\n- 'agency_drive' (\uB300\uB9AC\uC6B4\uC804)\n- 'other' (\uAE30\uD0C0 \uC9C0\uCD9C)\n\n") + (context === "overseas_trip" ? "\uACB0\uC81C\uC218\uB2E8\uC740 \uB2E4\uC74C \uC911 \uAC00\uC7A5 \uC54C\uB9DE\uC740 \uD558\uB098\uB97C \uD55C\uAE00 \uADF8\uB300\uB85C \uC120\uD0DD\uD574\uC918:\n- '\uC2E0\uC6A9\uCE74\uB4DC' (\uC2E0\uC6A9\uCE74\uB4DC/\uCCB4\uD06C\uCE74\uB4DC \uACB0\uC81C, \uBC95\uC778\uCE74\uB4DC \uD3EC\uD568)\n- '\uD604\uAE08' (\uD604\uAE08 \uACB0\uC81C, \uD604\uC9C0 \uD1B5\uD654 \uACB0\uC81C, \uD604\uAE08 \uC601\uC218\uC99D \uD3EC\uD568)\n\n" : "\uACB0\uC81C\uC218\uB2E8\uC740 \uB2E4\uC74C \uC911 \uAC00\uC7A5 \uC54C\uB9DE\uC740 \uD558\uB098\uB97C \uC120\uD0DD\uD574\uC918:\n- 'company_card' (\uBC95\uC778\uCE74\uB4DC, \uC2E0\uC6A9\uCE74\uB4DC \uC601\uC218\uC99D\uC5D0 \uBC95\uC778\uCE74\uB4DC \uD45C\uC2DC\uAC00 \uC788\uAC70\uB098 \uD68C\uC0AC \uBE44\uC6A9\uC778 \uACBD\uC6B0)\n- 'personal_card' (\uAC1C\uC778\uCE74\uB4DC)\n- 'cash' (\uD604\uAE08 \uC601\uC218\uC99D, \uAC04\uC774 \uC601\uC218\uC99D, \uD604\uAE08 \uACB0\uC81C)\n\n") + // [추가] "법인카드 등록 정보와 대조해서 맞으면 법인카드로 우선 판단" 요청에 맞춰,
      // 영수증에 인쇄된 카드번호(마스킹되어 일부만 보여도 그 보이는 부분)를 같이 추출해달라고
      // 요청한다. 아래에서 이 값을 경영지원 > 법인카드 관리에 등록된 카드번호들과 대조해서,
      // 일치하면 AI가 뭐라고 판단했든 payMethod를 company_card로 강제로 바꿔준다 - 영수증에
      // "법인카드"라는 문구가 안 찍혀 있어서 AI가 애매하게 개인카드/현금으로 잘못 고르는
      // 경우를 실제 등록된 카드 정보로 보정하기 위함이다.
      // [수정] 처음엔 "보이는 숫자를 순서대로 이어붙여서" 한 필드로만 받았는데, 실제
      // 영수증은 "앞자리 일부 + 중간 마스킹 + 뒷자리 일부"가 같이 찍히는 경우가 흔하다
      // (예: "5229715 1**686*"). 이걸 그냥 이어붙이면("52297151686") 등록 카드번호의
      // 앞부분도 뒷부분도 아닌 애매한 문자열이 돼서 대조에 실패한다. 그래서 앞쪽에 연속으로
      // 보이는 숫자와 뒤쪽에 연속으로 보이는 숫자를 별도 필드로 나눠 받아, 아래에서 각각
      // 등록 카드번호의 앞부분/끝부분과 정확히 대조한다.
      "\uCD94\uAC00\uB85C, \uC601\uC218\uC99D\uC5D0 \uCE74\uB4DC\uBC88\uD638\uAC00 \uC778\uC1C4\uB418\uC5B4 \uC788\uC73C\uBA74(\uB9C8\uC2A4\uD0B9\uB418\uC5B4 \uC77C\uBD80\uB9CC \uBCF4\uC5EC\uB3C4 \uC0C1\uAD00\uC5C6\uC74C) \uB2E4\uC74C \uB450 \uBD80\uBD84\uC744 \uAC01\uAC01 \uC54C\uB824\uC918 (\uBCC4\uD45C(*)\uB098 \uB9C8\uC2A4\uD0B9 \uAE30\uD638, \uD558\uC774\uD508, \uACF5\uBC31\uC740 \uBE7C\uACE0 \uC22B\uC790\uB9CC):\n1) \uCE74\uB4DC\uBC88\uD638 \uB9E8 \uC55E\uCABD\uC5D0\uC11C\uBD80\uD130 \uB9C8\uC2A4\uD0B9\uB418\uAE30 \uC804\uAE4C\uC9C0 \uC5F0\uC18D\uC73C\uB85C \uBCF4\uC774\uB294 \uC22B\uC790\n2) \uCE74\uB4DC\uBC88\uD638 \uB9E8 \uB4A4\uCABD\uC5D0\uC11C \uB9C8\uC2A4\uD0B9\uC774 \uB05D\uB09C \uB2E4\uC74C\uBD80\uD130 \uB05D\uAE4C\uC9C0 \uC5F0\uC18D\uC73C\uB85C \uBCF4\uC774\uB294 \uC22B\uC790\n(\uC55E\uCABD \uB610\uB294 \uB4A4\uCABD\uC774 \uC544\uC608 \uC548 \uBCF4\uC774\uBA74 \uADF8 \uD56D\uBAA9\uC740 \uBE48 \uBB38\uC790\uC5F4\uB85C \uC8FC\uACE0, \uCE74\uB4DC\uBC88\uD638 \uC790\uCCB4\uAC00 \uC804\uD600 \uC548 \uBCF4\uC774\uBA74 \uB458 \uB2E4 \uBE48 \uBB38\uC790\uC5F4\uB85C \uC918.)\n\n" + // [추가] 정비내역 등록 화면(context === 'maint')에서 올라온 영수증만 아래 안내를
      // 추가로 붙여준다. 정비소가 발급하는 문서는 일반 카드 매출전표(카페, 주유소 등)와
      // 달리 세금계산서·정비 명세서·견적서 형태인 경우가 많아, 상호명이 눈에 잘 띄지 않는
      // 위치에 있거나 부품비/공임비/부가세가 여러 줄로 나뉘어 있어 AI가 최종 합계가 아닌
      // 중간 금액 한 줄만 집어내는 경우가 있었다. 다른 화면(운행기록/일반비용)의 프롬프트는
      // 그대로 두고 이 화면일 때만 안내를 덧붙여서 영향 범위를 최소화한다.
      (context === "maint" ? "\uC774 \uC0AC\uC9C4\uC740 \uC790\uB3D9\uCC28 \uC815\uBE44\uC18C/\uCE74\uC13C\uD130\uC5D0\uC11C \uBC1C\uAE09\uD55C \uC601\uC218\uC99D, \uC138\uAE08\uACC4\uC0B0\uC11C, \uC815\uBE44 \uBA85\uC138\uC11C, \uACAC\uC801\uC11C \uC911 \uD558\uB098\uC77C \uC218 \uC788\uB2E4. \uC77C\uBC18 \uCE74\uB4DC \uB9E4\uCD9C\uC804\uD45C\uBFD0 \uC544\uB2C8\uB77C \uC774\uB7F0 \uBB38\uC11C \uD615\uD0DC\uC5D0\uB3C4 \uC775\uC219\uD558\uB2E4\uACE0 \uAC00\uC815\uD558\uACE0 \uC544\uB798\uB97C \uC9C0\uCF1C\uC918.\n- \uC0C1\uD638\uBA85(merchantName)\uC740 \uBB38\uC11C \uC0C1\uB2E8\uC774\uB098 \uD558\uB2E8 \uC5B4\uB514\uC5D0 \uC788\uB4E0 \uC815\uBE44\uC5C5\uCCB4\uC758 \uC0AC\uC5C5\uC790\uBA85/\uC0C1\uD638\uB97C \uCC3E\uC544\uC11C \uBC18\uD658\uD574\uB77C.\n- \uBD80\uD488\uBE44, \uACF5\uC784\uBE44, \uC18C\uACC4, \uBD80\uAC00\uAC00\uCE58\uC138(VAT) \uB4F1 \uAE08\uC561\uC774 \uC5EC\uB7EC \uC904\uB85C \uB098\uB258\uC5B4 \uC788\uC73C\uBA74 \uC808\uB300 \uADF8 \uC911 \uD55C \uC904\uB9CC \uC9D1\uC9C0 \uB9D0\uACE0, \uBC18\uB4DC\uC2DC \uCD5C\uC885 '\uD569\uACC4\uAE08\uC561' \uB610\uB294 '\uCCAD\uAD6C\uAE08\uC561'(\uBD80\uAC00\uC138 \uD3EC\uD568 \uCD1D\uC561)\uC744 amount\uB85C \uBC18\uD658\uD574\uB77C.\n\n" : "") + // [수정] 지출 정보뿐 아니라, 사진 속에서 "영수증 실물의 네 꼭짓점이 어디인지"도 같이 알려달라고
      // 요청한다. 화면의 명암 차이만으로 테두리를 찾는 기존 방식은 영수증처럼 휘거나 구겨진 얇은
      // 종이, 또는 배경과 색이 비슷한 경우 실패하기 쉬운데, AI는 "영수증처럼 생긴 패턴" 자체로
      // 인식하기 때문에 훨씬 안정적이다.
      '\uCD94\uAC00\uB85C, \uC0AC\uC9C4\uC5D0 \uCC0D\uD78C \uC601\uC218\uC99D \uC2E4\uBB3C(\uC885\uC774 \uC790\uCCB4)\uC758 \uB124 \uBAA8\uC11C\uB9AC \uC88C\uD45C\uB97C \uC54C\uB824\uC918. \uC88C\uD45C\uB294 \uC774\uBBF8\uC9C0\uC758 \uAC00\uB85C/\uC138\uB85C \uD06C\uAE30\uC5D0 \uB300\uD55C 0~1 \uC0AC\uC774\uC758 \uBE44\uC728\uB85C \uD45C\uD604\uD574\uC918 (\uC608: \uC774\uBBF8\uC9C0 \uB9E8 \uC67C\uCABD \uC704 \uBAA8\uC11C\uB9AC\uB294 x:0, y:0). \uC601\uC218\uC99D\uC774 \uC0B4\uC9DD \uD718\uAC70\uB098 \uAD6C\uACA8\uC838 \uC788\uC5B4\uB3C4, \uC2E4\uC81C \uC885\uC774\uC758 \uB124 \uAF2D\uC9D3\uC810 \uC704\uCE58\uB97C \uCD5C\uB300\uD55C \uC815\uD655\uD558\uAC8C \uCC3E\uC544\uC918 (\uC8FC\uBCC0 \uBC30\uACBD, \uC190\uAC00\uB77D, \uADF8\uB9BC\uC790\uB294 \uC808\uB300 \uD3EC\uD568\uD558\uC9C0 \uB9D0\uACE0 \uC601\uC218\uC99D \uC2E4\uBB3C \uAC00\uC7A5\uC790\uB9AC\uC5D0 \uB531 \uB9DE\uCDB0\uC918).\n\uC751\uB2F5\uC740 \uBC18\uB4DC\uC2DC \uC544\uB798 JSON \uADDC\uACA9\uC5D0 \uB9DE\uAC8C \uC21C\uC218 JSON \uB370\uC774\uD130\uB9CC \uB9AC\uD134\uD574\uC918. \uB9C8\uD06C\uB2E4\uC6B4 \uBC31\uD2F1(```json) \uC5C6\uC774 \uB9AC\uD134\uD558\uAC70\uB098 \uC788\uC5B4\uB3C4 JSON \uD30C\uC2F1 \uAC00\uB2A5\uD574\uC57C \uD568.\n{\n  "amount": 12000, // \uC22B\uC790\uD615 \uC9C0\uCD9C \uAE08\uC561 (\uC6D0\uD654 \uB2E8\uC704\uB97C \uD30C\uC2F1\uD558\uC5EC \uC22B\uC790\uB9CC \uAE30\uC7AC, \uCF64\uB9C8 \uC81C\uC678)\n  "date": "2026-03-12", // \uC9C0\uCD9C \uC77C\uC790 (YYYY-MM-DD \uD3EC\uB9F7, \uC5F0\uB3C4\uAC00 \uC5C6\uC73C\uBA74 \uAC00\uC7A5 \uCD5C\uADFC \uC5F0\uB3C4\uB098 \uC62C\uD574 \uC5F0\uB3C4\uB85C \uAC00\uC815)\n  "merchantName": "\uC0C1\uD638\uBA85 \uB610\uB294 \uAC00\uB9F9\uC810\uBA85 (\uC608: \uC2A4\uD0C0\uBC85\uC2A4 \uAC15\uB0A8\uC810)",\n  "memo": "\uAD6C\uB9E4 \uD488\uBAA9 \uC694\uC57D \uB610\uB294 \uBA54\uBAA8 (\uC608: \uC544\uBA54\uB9AC\uCE74\uB178 \uC678 2\uAC74)",\n  "category": "\uC120\uD0DD\uD55C \uCE74\uD14C\uACE0\uB9AC \uCF54\uB4DC (\uC608: beverage)",\n  "payMethod": "\uC120\uD0DD\uD55C \uACB0\uC81C\uC218\uB2E8 \uCF54\uB4DC (\uC608: company_card)",\n  "cardNumberFrontVisible": "\uCE74\uB4DC\uBC88\uD638 \uC55E\uCABD\uC5D0\uC11C \uB9C8\uC2A4\uD0B9 \uC804\uAE4C\uC9C0 \uBCF4\uC774\uB294 \uC22B\uC790 (\uD558\uC774\uD508/\uACF5\uBC31 \uC81C\uC678, \uC5C6\uC73C\uBA74 \uBE48 \uBB38\uC790\uC5F4)",\n  "cardNumberLastVisible": "\uCE74\uB4DC\uBC88\uD638 \uB4A4\uCABD\uC5D0\uC11C \uB9C8\uC2A4\uD0B9 \uC774\uD6C4 \uBCF4\uC774\uB294 \uC22B\uC790 (\uD558\uC774\uD508/\uACF5\uBC31 \uC81C\uC678, \uC5C6\uC73C\uBA74 \uBE48 \uBB38\uC790\uC5F4)",\n  "corners": {"topLeft": {"x":0,"y":0}, "topRight": {"x":0,"y":0}, "bottomRight": {"x":0,"y":0}, "bottomLeft": {"x":0,"y":0}}\n}'
    ];
    contents.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Data
      }
    });
    const response = await generateContentWithRetry(ai, {
      model: PRIMARY_GEMINI_MODEL,
      contents
    });
    const text = response.text || "";
    let parsedJson = {};
    try {
      const jsonStr = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      parsedJson = JSON.parse(jsonStr);
    } catch (e) {
      console.error("JSON \uD30C\uC2F1 \uC2E4\uD328, \uD14D\uC2A4\uD2B8 \uADF8\uB300\uB85C \uBD84\uC11D \uC2DC\uB3C4:", text);
      parsedJson = {
        amount: 0,
        date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        merchantName: "\uC601\uC218\uC99D \uC778\uC2DD \uC644\uB8CC",
        memo: text.slice(0, 100),
        category: context === "overseas_trip" ? "\uAE30\uD0C0" : "other",
        payMethod: context === "overseas_trip" ? "\uC2E0\uC6A9\uCE74\uB4DC" : "company_card"
      };
    }
    try {
      const frontDigits = String(parsedJson.cardNumberFrontVisible || "").replace(/\D/g, "");
      const lastDigits = String(parsedJson.cardNumberLastVisible || "").replace(/\D/g, "");
      if (frontDigits.length >= 3 || lastDigits.length >= 3) {
        const dbData = getScopedData(req);
        const registeredCardDigits = [];
        for (const doc of dbData.adminDocs || []) {
          if (doc.category !== "corp_card" || !doc.corpCard) continue;
          for (const c of doc.corpCard.cards || []) {
            const digits = String(c.cardNumber || "").replace(/\D/g, "");
            if (digits) registeredCardDigits.push(digits);
          }
        }
        const matchesRegisteredCard = registeredCardDigits.some((full) => {
          const frontOk = frontDigits.length >= 3 && full.length >= frontDigits.length && full.startsWith(frontDigits);
          const lastOk = lastDigits.length >= 3 && full.length >= lastDigits.length && full.endsWith(lastDigits);
          if (frontDigits.length >= 3 && lastDigits.length >= 3) return frontOk && lastOk;
          return frontOk || lastOk;
        });
        if (matchesRegisteredCard) {
          parsedJson.payMethod = context === "overseas_trip" ? "\uC2E0\uC6A9\uCE74\uB4DC" : "company_card";
        }
      }
    } catch (matchErr) {
      console.error("\uBC95\uC778\uCE74\uB4DC \uB4F1\uB85D \uC815\uBCF4 \uB300\uC870 \uC2E4\uD328(\uC6D0\uB798 AI \uD310\uB2E8 \uADF8\uB300\uB85C \uC0AC\uC6A9):", matchErr);
    }
    res.json(parsedJson);
  } catch (error) {
    console.error("Receipt OCR Error:", error);
    res.status(500).json({ error: toFriendlyAiErrorMessage(error) });
  }
});
var COMPANY_SUMMARY_SCHEMA_VERSION = 1;
async function generateCompanySummary(company) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      fields: {
        businessNumber: null,
        industry: "\uC815\uBCF4 \uD655\uC778 \uC5B4\uB824\uC6C0",
        mainBusiness: "\uD601\uC2E0 \uBE44\uC988\uB2C8\uC2A4\uB97C \uC601\uC704\uD558\uACE0 \uC788\uB294 \uAE30\uC5C5\uC785\uB2C8\uB2E4.",
        website: null,
        employees: "\uC57D 210\uBA85 \uC218\uC900 (\uBAA8\uC758 \uB370\uC774\uD130)",
        sales: "\uC57D 1,250\uC5B5\uC6D0 (\uBAA8\uC758 \uB370\uC774\uD130)",
        businessSummary: `${company}\uC740(\uB294) \uD601\uC2E0 \uBE44\uC988\uB2C8\uC2A4\uB97C \uC601\uC704\uD558\uACE0 \uC788\uB294 \uAE30\uC5C5\uC785\uB2C8\uB2E4. (\uC804\uB144\uB3C4 \uB9E4\uCD9C\uC561 \uADDC\uBAA8: \uC57D 1,250\uC5B5\uC6D0, \uC9C1\uC6D0\uC218: \uC57D 210\uBA85 \uC218\uC900 / \uC2E4\uC2DC\uAC04 AI \uAC80\uC0C9 \uACB0\uACFC\uB97C \uBCF4\uC2DC\uB824\uBA74 GEMINI_API_KEY\uB97C \uB4F1\uB85D\uD558\uC138\uC694)`
      },
      sourceUrls: []
    };
  }
  const ai = new import_genai.GoogleGenAI({ apiKey });
  const prompt = `\uD68C\uC0AC\uBA85 "${company}"\uC5D0 \uB300\uD574 \uC2E4\uC2DC\uAC04 \uAD6C\uAE00 \uAC80\uC0C9(googleSearch)\uC73C\uB85C \uB2E4\uC74C \uC815\uBCF4\uB97C \uC870\uC0AC\uD574\uC918:
- \uC0AC\uC5C5\uC790\uB4F1\uB85D\uBC88\uD638 (\uD30C\uC545 \uAC00\uB2A5\uD55C \uACBD\uC6B0\uB9CC, \uD655\uC778 \uC5B4\uB824\uC6B0\uBA74 null)
- \uC5C5\uC885
- \uC8FC\uC694 \uC0AC\uC5C5 \uB0B4\uC6A9 (1\uC904 \uC124\uBA85)
- \uACF5\uC2DD \uD648\uD398\uC774\uC9C0 \uC8FC\uC18C (\uD30C\uC545 \uAC00\uB2A5\uD55C \uACBD\uC6B0\uB9CC, \uC5C6\uC73C\uBA74 null)
- \uC9C1\uC6D0\uC218 (\uAC00\uC7A5 \uCD5C\uADFC \uD30C\uC545 \uAC00\uB2A5\uD55C \uADDC\uBAA8, \uC608: "\uC57D 150\uBA85", \uD655\uC778 \uC5B4\uB824\uC6B0\uBA74 "\uC9C1\uC6D0\uC218 \uD655\uC778 \uC5B4\uB824\uC6C0")
- \uC804\uB144\uB3C4 \uB9E4\uCD9C\uC561 \uADDC\uBAA8 (\uAC00\uC7A5 \uCD5C\uADFC \uC5F0 \uB9E4\uCD9C \uADDC\uBAA8, \uC608: "\uC57D 5,000\uC5B5\uC6D0", \uD655\uC778 \uC5B4\uB824\uC6B0\uBA74 "\uB9E4\uCD9C \uC815\uBCF4 \uD655\uC778 \uC5B4\uB824\uC6C0")
- \uC704 \uB0B4\uC6A9\uC744 \uC885\uD569\uD55C 1~2\uC904 \uBE44\uC988\uB2C8\uC2A4 \uC694\uC57D \uBB38\uC7A5 (\uC608: "\uC778\uACF5\uC9C0\uB2A5 \uAE30\uBC18 B2B DX \uBC0F \uC2A4\uB9C8\uD2B8 \uBE44\uC988\uB2C8\uC2A4 \uC194\uB8E8\uC158 \uAE30\uC5C5 (\uC804\uB144\uB3C4 \uB9E4\uCD9C\uC561 \uC57D 320\uC5B5\uC6D0, \uC9C1\uC6D0\uC218 \uC57D 85\uBA85)")

\uC751\uB2F5\uC740 \uBC18\uB4DC\uC2DC \uC544\uB798 JSON \uD615\uC2DD\uC73C\uB85C\uB9CC, \uB9C8\uD06C\uB2E4\uC6B4 \uBC31\uD2F1\uC774\uB098 \uB2E4\uB978 \uC124\uBA85 \uC5C6\uC774 \uC21C\uC218 JSON\uB9CC \uBC18\uD658\uD574\uC918:
{"businessNumber": string|null, "industry": string|null, "mainBusiness": string|null, "website": string|null, "employees": string|null, "sales": string|null, "businessSummary": string}`;
  const response = await generateContentWithRetry(ai, {
    model: PRIMARY_GEMINI_MODEL,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });
  let fields = {
    businessNumber: null,
    industry: null,
    mainBusiness: null,
    website: null,
    employees: null,
    sales: null,
    businessSummary: (response.text || "").trim()
  };
  try {
    const jsonStr = (response.text || "").replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(jsonStr);
    fields = {
      businessNumber: parsed.businessNumber || null,
      industry: parsed.industry || null,
      mainBusiness: parsed.mainBusiness || null,
      website: parsed.website || null,
      employees: parsed.employees || null,
      sales: parsed.sales || null,
      businessSummary: parsed.businessSummary || fields.businessSummary
    };
  } catch (e) {
    console.error("\uD68C\uC0AC \uC694\uC57D JSON \uD30C\uC2F1 \uC2E4\uD328, \uC6D0\uBB38 \uD14D\uC2A4\uD2B8\uB97C \uC694\uC57D\uC73C\uB85C\uB9CC \uC0AC\uC6A9:", response.text);
  }
  const sourceUrls = [];
  try {
    const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      if (uri && !sourceUrls.includes(uri)) sourceUrls.push(uri);
    }
  } catch (e) {
  }
  return { fields, sourceUrls };
}
var COMPANY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
function normalizeCompanyKey(company) {
  return company.trim().replace(/\(주\)|주식회사|㈜/g, "").replace(/\s+/g, "").toLowerCase();
}
async function getOrGenerateCompanySummary(company) {
  const key = normalizeCompanyKey(company);
  if (key && isSupabaseConfigured) {
    const { data: cached, error } = await supabase.from("company").select("*").eq("company_name_normalized", key).maybeSingle();
    if (error) console.error("company \uD14C\uC774\uBE14 \uC870\uD68C \uC2E4\uD328:", error);
    if (cached && cached.business_summary) {
      const age = Date.now() - new Date(cached.last_searched_at).getTime();
      if (age < COMPANY_CACHE_TTL_MS && cached.summary_version === COMPANY_SUMMARY_SCHEMA_VERSION) {
        return { summary: cached.business_summary, fromCache: true };
      }
    }
  }
  const { fields, sourceUrls } = await generateCompanySummary(company);
  if (key && isSupabaseConfigured && fields.businessSummary) {
    const { error } = await supabase.from("company").upsert(
      {
        company_name: company,
        company_name_normalized: key,
        business_number: fields.businessNumber,
        industry: fields.industry,
        main_business: fields.mainBusiness,
        website: fields.website,
        employees: fields.employees,
        sales: fields.sales,
        business_summary: fields.businessSummary,
        source_urls: sourceUrls,
        last_searched_at: (/* @__PURE__ */ new Date()).toISOString(),
        summary_version: COMPANY_SUMMARY_SCHEMA_VERSION
      },
      { onConflict: "company_name_normalized" }
    );
    if (error) console.error("company \uD14C\uC774\uBE14 \uC800\uC7A5 \uC2E4\uD328:", error);
  }
  return { summary: fields.businessSummary || "", fromCache: false };
}
app.post("/api/company/intelligence-refresh", async (req, res) => {
  try {
    const { company } = req.body;
    if (!company) {
      return res.status(400).json({ error: "\uD68C\uC0AC\uBA85\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    }
    const { summary: companyInfo, fromCache } = await getOrGenerateCompanySummary(company);
    res.json({ companyInfo, fromCache });
  } catch (error) {
    console.error("Company intelligence refresh error:", error);
    res.status(500).json({ error: toFriendlyAiErrorMessage(error) });
  }
});
app.post("/api/company/search-summary", async (req, res) => {
  try {
    const { company } = req.body;
    if (!company) {
      return res.status(400).json({ error: "\uD68C\uC0AC\uBA85\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    }
    const { summary: companyInfo, fromCache } = await getOrGenerateCompanySummary(company);
    res.json({ companyInfo, fromCache });
  } catch (error) {
    console.error("Company search summary error:", error);
    res.status(500).json({ error: toFriendlyAiErrorMessage(error) });
  }
});
app.post("/api/company/intelligence", async (req, res) => {
  try {
    const { companies } = req.body;
    if (!Array.isArray(companies) || companies.length === 0) {
      return res.json({ items: [] });
    }
    if (!isSupabaseConfigured) return res.json({ items: [] });
    const keys = Array.from(new Set(companies.map((c) => normalizeCompanyKey(c)).filter(Boolean)));
    if (keys.length === 0) return res.json({ items: [] });
    const { data, error } = await supabase.from("company").select("*").in("company_name_normalized", keys);
    if (error) {
      console.error("company \uD14C\uC774\uBE14 \uC77C\uAD04 \uC870\uD68C \uC2E4\uD328:", error);
      return res.json({ items: [] });
    }
    res.json({ items: data || [] });
  } catch (error) {
    console.error("Company intelligence error:", error);
    res.status(500).json({ error: "\uAE30\uC5C5 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
app.post("/api/company/intelligence-batch", async (req, res) => {
  try {
    const { companies } = req.body;
    if (!Array.isArray(companies) || companies.length === 0) {
      return res.json({ items: [] });
    }
    if (!isSupabaseConfigured) return res.json({ items: [] });
    const keys = Array.from(new Set(companies.map((c) => normalizeCompanyKey(c)).filter(Boolean)));
    if (keys.length === 0) return res.json({ items: [] });
    const { data, error } = await supabase.from("company").select("*").in("company_name_normalized", keys);
    if (error) return res.json({ items: [] });
    res.json({ items: data || [] });
  } catch (error) {
    res.status(500).json({ error: "\uAE30\uC5C5 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
async function searchProjectRelations(input) {
  const emptyFields = {
    contractor: null,
    architect: null,
    interiorDesigner: null,
    electricalDesigner: null,
    mechanicalDesigner: null,
    supervisor: null,
    operator: null
  };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { fields: emptyFields, sourceUrls: [] };
  }
  const ai = new import_genai.GoogleGenAI({ apiKey });
  const contextLines = [`\uD504\uB85C\uC81D\uD2B8\uBA85(\uACF5\uC0AC\uBA85/\uAC74\uBB3C\uBA85 \uB4F1): "${input.projectName}"`];
  if (input.endCustomer?.trim()) contextLines.push(`\uCD5C\uC885\uACE0\uAC1D(\uBC1C\uC8FC\uCC98): "${input.endCustomer.trim()}"`);
  if (input.siteLocation?.trim()) contextLines.push(`\uD604\uC7A5/\uC9C0\uC5ED: "${input.siteLocation.trim()}"`);
  const prompt = `\uC544\uB798 \uAC74\uC124/\uBD80\uB3D9\uC0B0/\uC2DC\uC124 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uB300\uD574 \uC2E4\uC2DC\uAC04 \uAD6C\uAE00 \uAC80\uC0C9(googleSearch)\uC73C\uB85C \uCC38\uC5EC\uC0AC\uB97C \uC870\uC0AC\uD574\uC918.

${contextLines.join("\n")}

\uCC3E\uC544\uC57C \uD560 \uD56D\uBAA9:
- contractor: \uC2DC\uACF5\uC0AC
- architect: \uAC74\uCD95\uC124\uACC4\uC0AC
- interiorDesigner: \uC778\uD14C\uB9AC\uC5B4\uC124\uACC4\uC0AC
- electricalDesigner: \uC804\uAE30\uC124\uACC4\uC0AC
- mechanicalDesigner: \uAE30\uACC4\uC124\uACC4\uC0AC
- supervisor: \uAC10\uB9AC\uC0AC
- operator: \uC6B4\uC601\uC0AC

\uC911\uC694: \uB274\uC2A4, \uACF5\uC2DD \uBC1C\uD45C, \uC785\uCC30/\uC218\uC8FC \uACF5\uACE0 \uB4F1 \uC2E0\uB8B0\uD560 \uC218 \uC788\uB294 \uCD9C\uCC98\uB85C \uC2E4\uC81C \uD655\uC778\uB418\uB294 \uACBD\uC6B0\uB9CC \uD68C\uC0AC\uBA85\uC744 \uCC44\uC6B0\uACE0, \uAC80\uC0C9\uC73C\uB85C \uD655\uC778\uC774 \uC5B4\uB835\uAC70\uB098 \uCD94\uCE21\uC774 \uD544\uC694\uD55C \uD56D\uBAA9\uC740 \uC808\uB300 \uC9C0\uC5B4\uB0B4\uC9C0 \uB9D0\uACE0 \uBC18\uB4DC\uC2DC null\uB85C \uB0A8\uACA8\uC918.

\uC751\uB2F5\uC740 \uBC18\uB4DC\uC2DC \uC544\uB798 JSON \uD615\uC2DD\uC73C\uB85C\uB9CC, \uB9C8\uD06C\uB2E4\uC6B4 \uBC31\uD2F1\uC774\uB098 \uB2E4\uB978 \uC124\uBA85 \uC5C6\uC774 \uC21C\uC218 JSON\uB9CC \uBC18\uD658\uD574\uC918:
{"contractor": string|null, "architect": string|null, "interiorDesigner": string|null, "electricalDesigner": string|null, "mechanicalDesigner": string|null, "supervisor": string|null, "operator": string|null}`;
  const response = await generateContentWithRetry(ai, {
    model: PRIMARY_GEMINI_MODEL,
    contents: prompt,
    config: { tools: [{ googleSearch: {} }] }
  });
  let fields = { ...emptyFields };
  try {
    const jsonStr = (response.text || "").replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(jsonStr);
    fields = {
      contractor: parsed.contractor || null,
      architect: parsed.architect || null,
      interiorDesigner: parsed.interiorDesigner || null,
      electricalDesigner: parsed.electricalDesigner || null,
      mechanicalDesigner: parsed.mechanicalDesigner || null,
      supervisor: parsed.supervisor || null,
      operator: parsed.operator || null
    };
  } catch (e) {
    console.error("\uD504\uB85C\uC81D\uD2B8 \uCC38\uC5EC\uC0AC \uAC80\uC0C9 JSON \uD30C\uC2F1 \uC2E4\uD328:", response.text);
  }
  const sourceUrls = [];
  try {
    const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      if (uri && !sourceUrls.includes(uri)) sourceUrls.push(uri);
    }
  } catch (e) {
  }
  return { fields, sourceUrls };
}
app.post("/api/projects/relations-search", async (req, res) => {
  try {
    const { projectName, endCustomer, siteLocation } = req.body;
    if (!projectName || !projectName.trim()) {
      return res.status(400).json({ error: "\uD504\uB85C\uC81D\uD2B8\uBA85\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    }
    const { fields, sourceUrls } = await searchProjectRelations({ projectName, endCustomer, siteLocation });
    res.json({ fields, sourceUrls });
  } catch (error) {
    console.error("Project relations search error:", error);
    res.status(500).json({ error: toFriendlyAiErrorMessage(error) });
  }
});
async function runGeminiTextAnalysis(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return "AI \uBD84\uC11D\uC744 \uC0AC\uC6A9\uD558\uB824\uBA74 GEMINI_API_KEY\uB97C \uB4F1\uB85D\uD574\uC8FC\uC138\uC694. (\uC9C0\uAE08\uC740 \uC704\uC5D0 \uBCF4\uC774\uB294 \uB370\uC774\uD130\uB9CC\uC73C\uB85C \uD310\uB2E8\uD574\uC8FC\uC138\uC694)";
  }
  const ai = new import_genai.GoogleGenAI({ apiKey });
  const response = await generateContentWithRetry(ai, {
    model: PRIMARY_GEMINI_MODEL,
    contents: prompt
  });
  return (response.text || "").trim();
}
app.post("/api/ai-intelligence/briefing-analysis", async (req, res) => {
  try {
    const { briefing } = req.body;
    const prompt = `\uB2F9\uC2E0\uC740 \uC5C5\uBB34 \uBE44\uC11C\uC785\uB2C8\uB2E4. \uC544\uB798\uB294 \uC624\uB298 \uD558\uB8E8\uC758 \uC5C5\uBB34 \uD604\uD669 \uB370\uC774\uD130\uC785\uB2C8\uB2E4(\uC774\uBBF8 \uACC4\uC0B0\uB41C \uB370\uC774\uD130\uC774\uB2C8 \uB2E4\uC2DC \uACC4\uC0B0\uD560 \uD544\uC694 \uC5C6\uC74C):

${JSON.stringify(briefing, null, 2)}

\uC774 \uB370\uC774\uD130\uB97C \uBC14\uD0D5\uC73C\uB85C, \uC624\uB298 \uAC00\uC7A5 \uBA3C\uC800 \uCC59\uACA8\uC57C \uD560 \uAC83 2~3\uAC00\uC9C0\uB97C \uC6B0\uC120\uC21C\uC704 \uC21C\uC11C\uB85C \uC9DA\uC5B4\uC8FC\uACE0, \uC65C \uC911\uC694\uD55C\uC9C0 \uC9E7\uAC8C \uC774\uC720\uB97C \uBD99\uC5EC\uC11C \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uD55C\uAD6D\uC5B4 \uBB38\uC7A5\uC73C\uB85C \uBE0C\uB9AC\uD551\uD574\uC918. \uC778\uC0AC\uB9D0\uC774\uB098 formatting \uC5C6\uC774, \uBC14\uB85C \uBCF8\uB860\uBD80\uD130 5~7\uBB38\uC7A5 \uC774\uB0B4\uB85C \uAC04\uACB0\uD558\uAC8C \uC791\uC131\uD574\uC918.`;
    const analysis = await runGeminiTextAnalysis(prompt);
    res.json({ analysis });
  } catch (error) {
    console.error("Briefing AI analysis error:", error);
    res.status(500).json({ error: toFriendlyAiErrorMessage(error) });
  }
});
app.post("/api/ai-intelligence/company-analysis", async (req, res) => {
  try {
    const { companies } = req.body;
    const prompt = `\uB2F9\uC2E0\uC740 B2B \uC601\uC5C5 \uC804\uB7B5 \uCEE8\uC124\uD134\uD2B8\uC785\uB2C8\uB2E4. \uC544\uB798\uB294 \uC6B0\uB9AC \uD68C\uC0AC \uBA85\uD568\uCCA9\uC5D0 \uB4F1\uB85D\uB41C \uAC70\uB798\uCC98 \uD68C\uC0AC\uB4E4\uC758 \uC815\uBCF4\uC785\uB2C8\uB2E4(\uC774\uBBF8 \uC870\uC0AC\uB41C \uB370\uC774\uD130\uC774\uB2C8 \uB2E4\uC2DC \uAC80\uC0C9\uD560 \uD544\uC694 \uC5C6\uC74C):

${JSON.stringify(companies, null, 2)}

\uC774 \uB370\uC774\uD130\uB97C \uBC14\uD0D5\uC73C\uB85C, \uC5B4\uB290 \uD68C\uC0AC\uC5D0 \uC6B0\uC120\uC801\uC73C\uB85C \uC9D1\uC911\uD558\uBA74 \uC88B\uC744\uC9C0, \uC5C5\uC885/\uB9E4\uCD9C \uADDC\uBAA8 \uAD00\uC810\uC5D0\uC11C \uB208\uC5D0 \uB744\uB294 \uD2B9\uC9D5\uC774\uB098 \uAE30\uD68C\uAC00 \uC788\uB294\uC9C0 \uBD84\uC11D\uD574\uC11C \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uD55C\uAD6D\uC5B4 \uBB38\uC7A5\uC73C\uB85C \uC815\uB9AC\uD574\uC918. \uC778\uC0AC\uB9D0\uC774\uB098 formatting \uC5C6\uC774, \uBC14\uB85C \uBCF8\uB860\uBD80\uD130 5~7\uBB38\uC7A5 \uC774\uB0B4\uB85C \uAC04\uACB0\uD558\uAC8C \uC791\uC131\uD574\uC918.`;
    const analysis = await runGeminiTextAnalysis(prompt);
    res.json({ analysis });
  } catch (error) {
    console.error("Company AI analysis error:", error);
    res.status(500).json({ error: toFriendlyAiErrorMessage(error) });
  }
});
app.post("/api/ai-intelligence/relationship-analysis", async (req, res) => {
  try {
    const { pipeline, insights, topCompanies } = req.body;
    const prompt = `\uB2F9\uC2E0\uC740 \uC601\uC5C5 \uAD00\uB9AC \uCEE8\uC124\uD134\uD2B8\uC785\uB2C8\uB2E4. \uC544\uB798\uB294 \uC6B0\uB9AC \uD68C\uC0AC\uC758 \uC601\uC5C5 \uD30C\uC774\uD504\uB77C\uC778\uACFC \uAC70\uB798\uCC98 \uAD00\uACC4 \uB370\uC774\uD130\uC785\uB2C8\uB2E4(\uC774\uBBF8 \uACC4\uC0B0\uB41C \uB370\uC774\uD130\uC774\uB2C8 \uB2E4\uC2DC \uACC4\uC0B0\uD560 \uD544\uC694 \uC5C6\uC74C):

\uD30C\uC774\uD504\uB77C\uC778 \uC694\uC57D: ${JSON.stringify(pipeline)}

\uC9C0\uAE08 \uCC59\uAE30\uBA74 \uC88B\uC740 \uAC70\uB798\uCC98 \uBAA9\uB85D: ${JSON.stringify(insights)}

\uAD00\uACC4\uAC00 \uAE4A\uC740 \uD68C\uC0AC TOP: ${JSON.stringify(topCompanies)}

\uC774 \uB370\uC774\uD130\uB97C \uBC14\uD0D5\uC73C\uB85C, \uC9C0\uAE08 \uAC00\uC7A5 \uC911\uC694\uD55C \uC601\uC5C5 \uC561\uC158\uC774 \uBB34\uC5C7\uC778\uC9C0, \uD30C\uC774\uD504\uB77C\uC778\uC5D0\uC11C \uC704\uD5D8 \uC2E0\uD638\uB294 \uC5C6\uB294\uC9C0 \uC9DA\uC5B4\uC11C \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uD55C\uAD6D\uC5B4 \uBB38\uC7A5\uC73C\uB85C \uC601\uC5C5 \uC804\uB7B5\uC744 \uC870\uC5B8\uD574\uC918. \uC778\uC0AC\uB9D0\uC774\uB098 formatting \uC5C6\uC774, \uBC14\uB85C \uBCF8\uB860\uBD80\uD130 5~7\uBB38\uC7A5 \uC774\uB0B4\uB85C \uAC04\uACB0\uD558\uAC8C \uC791\uC131\uD574\uC918.`;
    const analysis = await runGeminiTextAnalysis(prompt);
    res.json({ analysis });
  } catch (error) {
    console.error("Relationship AI analysis error:", error);
    res.status(500).json({ error: toFriendlyAiErrorMessage(error) });
  }
});
app.post("/api/contacts/import", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const { importedContacts } = req.body;
  if (!Array.isArray(importedContacts)) return res.status(400).json({ error: "Invalid data" });
  const normalizePhone = (p) => (p || "").replace(/\D/g, "");
  const existingPhoneKeys = /* @__PURE__ */ new Set();
  const existingEmailKeys = /* @__PURE__ */ new Set();
  const keyToExistingContact = /* @__PURE__ */ new Map();
  for (const c of dbData.contacts) {
    if (c.phoneMobile) {
      const k = `phone:${normalizePhone(c.phoneMobile)}`;
      existingPhoneKeys.add(k);
      if (!keyToExistingContact.has(k)) keyToExistingContact.set(k, { id: c.id, name: c.name || "(\uC774\uB984 \uC5C6\uC74C)" });
    }
    if (c.email) {
      const k = `email:${c.email.trim().toLowerCase()}`;
      existingEmailKeys.add(k);
      if (!keyToExistingContact.has(k)) keyToExistingContact.set(k, { id: c.id, name: c.name || "(\uC774\uB984 \uC5C6\uC74C)" });
    }
  }
  const toInsert = [];
  let skippedDuplicates = 0;
  const skippedDetails = [];
  for (const c of importedContacts) {
    const phoneKey = c.phoneMobile && normalizePhone(c.phoneMobile) ? `phone:${normalizePhone(c.phoneMobile)}` : null;
    const emailKey = c.email && c.email.trim() ? `email:${c.email.trim().toLowerCase()}` : null;
    const matchedKey = phoneKey ? existingPhoneKeys.has(phoneKey) ? phoneKey : null : emailKey && existingEmailKeys.has(emailKey) ? emailKey : null;
    if (matchedKey) {
      skippedDuplicates += 1;
      const existing = keyToExistingContact.get(matchedKey);
      if (existing) {
        skippedDetails.push({
          importedName: c.name || "(\uC774\uB984 \uC5C6\uC74C)",
          matchedField: matchedKey.startsWith("phone:") ? "phone" : "email",
          existingContactId: existing.id,
          existingContactName: existing.name
        });
      }
      continue;
    }
    if (!c.id) c.id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    if (!c.createdAt) c.createdAt = (/* @__PURE__ */ new Date()).toISOString();
    if (!c.callHistory) c.callHistory = [];
    if (c.groupId && !dbData.groups.some((g) => g.id === c.groupId)) {
      c.groupId = void 0;
    }
    c.frontImage = await persistImageField(scopeId, c.frontImage, `contact-${c.id}-front`);
    c.backImage = await persistImageField(scopeId, c.backImage, `contact-${c.id}-back`);
    dbData.contacts.unshift(c);
    toInsert.push(c);
    if (phoneKey) existingPhoneKeys.add(phoneKey);
    if (emailKey) existingEmailKeys.add(emailKey);
  }
  const bulkSaved = await setScopedDocs(scopeId, "contacts", toInsert);
  if (!bulkSaved) {
    const insertedIds = new Set(toInsert.map((c) => c.id));
    dbData.contacts = dbData.contacts.filter((c) => !insertedIds.has(c.id));
    return res.status(500).json({ error: "\uAC00\uC838\uC628 \uBA85\uD568\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.json({ count: toInsert.length, skippedDuplicates, skippedDetails, contacts: dbData.contacts });
});
app.get("/api/my-profile", async (req, res) => {
  const dbData = getScopedData(req);
  if (!dbData.myProfile.shareSlug) {
    dbData.myProfile.shareSlug = import_crypto2.default.randomBytes(6).toString("hex");
    await setScopedProfile(req.scopeId, dbData.myProfile);
  }
  res.json(dbData.myProfile);
});
app.put("/api/my-profile", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const previousProfile = dbData.myProfile;
  dbData.myProfile = { ...dbData.myProfile, ...req.body };
  dbData.myProfile.frontImage = await persistImageField(scopeId, dbData.myProfile.frontImage, `myprofile-${scopeId}-front`);
  dbData.myProfile.backImage = await persistImageField(scopeId, dbData.myProfile.backImage, `myprofile-${scopeId}-back`);
  const savedProfile = await setScopedProfile(scopeId, dbData.myProfile);
  if (!savedProfile) {
    dbData.myProfile = previousProfile;
    return res.status(500).json({ error: "\uB0B4 \uBA85\uD568 \uC815\uBCF4\uB97C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.json(dbData.myProfile);
});
app.get("/api/approval-line-templates", async (req, res) => {
  const scopeId = req.scopeId;
  const existing = await getScopedDoc(scopeId, "approvalLineTemplates", "default");
  res.json(existing || { id: "default", advance: null, leave: null, official: null });
});
app.put("/api/approval-line-templates", async (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const scopeId = req.scopeId;
  const template = { id: "default", advance: req.body.advance || null, leave: req.body.leave || null, official: req.body.official || null };
  await setScopedDoc(scopeId, "approvalLineTemplates", template);
  res.json(template);
});
app.get("/api/company-branding", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === userId);
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const scopeId = req.scopeId;
  const existing = await getScopedDoc(scopeId, "branding", "branding");
  res.json(existing || { id: "branding", scopeId, logoUrl: void 0, sealUrl: void 0, updatedAt: "" });
});
app.put("/api/company-branding", async (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const scopeId = req.scopeId;
  const existing = await getScopedDoc(scopeId, "branding", "branding");
  let logoUrl = existing?.logoUrl;
  let sealUrl = existing?.sealUrl;
  const { logoImage, sealImage, removeLogo, removeSeal } = req.body;
  if (removeLogo) logoUrl = void 0;
  if (removeSeal) sealUrl = void 0;
  if (typeof logoImage === "string" && logoImage.startsWith("data:image/")) {
    logoUrl = await persistImageField(scopeId, logoImage, `branding-logo-${scopeId}`, "branding");
  }
  if (typeof sealImage === "string" && sealImage.startsWith("data:image/")) {
    sealUrl = await persistImageField(scopeId, sealImage, `branding-seal-${scopeId}`, "branding");
  }
  const branding = { id: "branding", scopeId, logoUrl, sealUrl, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  const saved = await setScopedDoc(scopeId, "branding", branding);
  if (!saved) {
    return res.status(500).json({ error: "\uB85C\uACE0/\uC9C1\uC778 \uC774\uBBF8\uC9C0\uB97C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.json(branding);
});
function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
}
var VALID_SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;
app.get("/s/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!VALID_SLUG_PATTERN.test(slug)) {
      return res.status(400).send('<h1 style="font-family:sans-serif;text-align:center;margin-top:80px;">\uC798\uBABB\uB41C \uC694\uCCAD\uC785\uB2C8\uB2E4.</h1>');
    }
    const result = await findProfileByShareSlug(slug);
    if (!result) {
      return res.status(404).send('<h1 style="font-family:sans-serif;text-align:center;margin-top:80px;">\uBA85\uD568\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.</h1>');
    }
    const { profile } = result;
    const title = `${profile.name} \xB7 ${profile.company}`;
    const description = `${profile.title}${profile.department ? " | " + profile.department : ""} \xB7 \u{1F4DE} ${profile.phoneMobile}`;
    const hasPhoto = !!profile.frontImage;
    const imageUrl = hasPhoto ? `${APP_BASE_URL}/s/${req.params.slug}/photo` : `${APP_BASE_URL}/kakao-share-thumb.png`;
    const pageUrl = `${APP_BASE_URL}/s/${req.params.slug}`;
    res.send(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta property="og:type" content="profile" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${imageUrl}" />
<meta property="og:url" content="${pageUrl}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${imageUrl}" />
<style>
  body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; background:#0f172a; color:#e2e8f0; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:24px; box-sizing:border-box; }
  .card { background:#1e293b; border-radius:24px; padding:32px; max-width:420px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,0.4); box-sizing:border-box; }
  .card img { width:100%; border-radius:16px; margin-bottom:20px; display:block; }
  h1 { font-size:22px; margin:0 0 4px; }
  .title { color:#60a5fa; font-size:13px; margin-bottom:16px; }
  .row { font-size:14px; margin:8px 0; color:#cbd5e1; }
  a { color:#93c5fd; text-decoration:none; }
  .badge { display:inline-block; margin-top:20px; font-size:11px; color:#64748b; }
</style>
</head>
<body>
  <div class="card">
    ${hasPhoto ? `<img src="${imageUrl}" alt="\uBA85\uD568" />` : ""}
    <h1>${escapeHtml(profile.name)}</h1>
    <div class="title">${escapeHtml(profile.title)}${profile.company ? " \xB7 " + escapeHtml(profile.company) : ""}</div>
    ${profile.phoneMobile ? `<div class="row">\u{1F4F1} <a href="tel:${escapeHtml(profile.phoneMobile)}">${escapeHtml(profile.phoneMobile)}</a></div>` : ""}
    ${profile.email ? `<div class="row">\u2709\uFE0F <a href="mailto:${escapeHtml(profile.email)}">${escapeHtml(profile.email)}</a></div>` : ""}
    ${profile.address ? `<div class="row">\u{1F3E2} ${escapeHtml(profile.address)}</div>` : ""}
    ${profile.website ? `<div class="row">\u{1F310} <a href="${escapeHtml(profile.website)}" target="_blank" rel="noreferrer">${escapeHtml(profile.website)}</a></div>` : ""}
    <div class="badge">BizCard \uB514\uC9C0\uD138 \uBA85\uD568</div>
  </div>
</body>
</html>`);
  } catch (error) {
    console.error("\uACF5\uC720 \uD398\uC774\uC9C0 \uC624\uB958:", error);
    res.status(500).send("\uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.");
  }
});
app.get("/s/:slug/photo", async (req, res) => {
  try {
    const result = await findProfileByShareSlug(req.params.slug);
    if (!result || !result.profile.frontImage) return res.status(404).end();
    if (/^https?:\/\//.test(result.profile.frontImage)) {
      return res.redirect(302, result.profile.frontImage);
    }
    const match = result.profile.frontImage.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return res.status(404).end();
    const [, mime, base64Data] = match;
    const buffer = Buffer.from(base64Data, "base64");
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch (error) {
    console.error("\uACF5\uC720 \uC0AC\uC9C4 \uC624\uB958:", error);
    res.status(500).end();
  }
});
app.get("/api/projects", (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.projects);
});
app.post("/api/projects", async (req, res) => {
  const dbData = getScopedData(req);
  const p = req.body;
  if (!p.id) p.id = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!p.createdAt) p.createdAt = (/* @__PURE__ */ new Date()).toISOString();
  if (!p.followUps) p.followUps = [];
  if (!p.contactIds) p.contactIds = [];
  dbData.projects.unshift(p);
  await setScopedDoc(req.scopeId, "projects", p);
  res.status(201).json(p);
});
app.post("/api/projects/import", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const importedProjects = req.body.importedProjects;
  if (!Array.isArray(importedProjects)) {
    return res.status(400).json({ error: "importedProjects \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  }
  const toInsert = [];
  for (const raw of importedProjects) {
    const p = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: raw.name || "(\uC774\uB984 \uC5C6\uC74C)",
      description: raw.description || "",
      salesRep: raw.salesRep || "",
      developer: raw.developer || "",
      status: raw.status || "opportunity",
      priority: raw.priority || "medium",
      dueDate: raw.dueDate || "",
      contactIds: [],
      budget: raw.budget || "",
      followUps: [],
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      // [추가] "프로젝트 파이프라인" 양식 전용 필드들(리스트 출력 화면/인쇄/엑셀에서 사용).
      // 클라이언트(ProjectsView.tsx의 handleImportProjectsExcel)가 엑셀에서 읽어 그대로
      // 넣어 보내므로 여기서도 빠짐없이 저장한다.
      endCustomer: raw.endCustomer || "",
      siteLocation: raw.siteLocation || "",
      productGroup: raw.productGroup || "",
      mainItemsSpec: raw.mainItemsSpec || "",
      expectedTiming: raw.expectedTiming || "",
      winProbability: typeof raw.winProbability === "number" ? raw.winProbability : void 0,
      pipelineStage: raw.pipelineStage || void 0,
      competitor: raw.competitor || "",
      supportNeeded: raw.supportNeeded || "",
      remarks: raw.remarks || ""
    };
    dbData.projects.unshift(p);
    toInsert.push(p);
  }
  await setScopedDocs(scopeId, "projects", toInsert);
  res.status(201).json({ count: toInsert.length, projects: dbData.projects });
});
app.put("/api/projects/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const idx = dbData.projects.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Project not found" });
  dbData.projects[idx] = { ...dbData.projects[idx], ...req.body };
  await setScopedDoc(req.scopeId, "projects", dbData.projects[idx]);
  res.json(dbData.projects[idx]);
});
app.delete("/api/projects/:id", async (req, res) => {
  const dbData = getScopedData(req);
  dbData.projects = dbData.projects.filter((p) => p.id !== req.params.id);
  await deleteScopedDoc(req.scopeId, "projects", req.params.id);
  res.json({ success: true });
});
app.post("/api/projects/bulk-delete", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (ids.length === 0) return res.json({ success: true, deletedCount: 0 });
  const idSet = new Set(ids);
  dbData.projects = dbData.projects.filter((p) => !idSet.has(p.id));
  for (const id of ids) {
    await deleteScopedDoc(scopeId, "projects", id);
  }
  res.json({ success: true, deletedCount: ids.length });
});
app.post("/api/projects/:id/followups", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const idx = dbData.projects.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Project not found" });
  const f = {
    id: `f-${Date.now()}`,
    projectId: req.params.id,
    content: req.body.content || "",
    date: req.body.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    status: req.body.status || "planned",
    meetingDegree: req.body.meetingDegree,
    meetingType: req.body.meetingType,
    attendee: req.body.attendee,
    internalStaffName: req.body.internalStaffName,
    hasVoice: req.body.hasVoice,
    voiceUrl: req.body.voiceUrl,
    voiceDuration: req.body.voiceDuration,
    attachments: req.body.attachments || [],
    expenses: req.body.expenses || []
  };
  f.expenses = await persistReceiptImagesInArray(scopeId, f.expenses, `followup-${f.id}`);
  f.attachments = await persistAttachmentsInArray(scopeId, f.attachments, `followup-${f.id}`);
  const previousProject = dbData.projects[idx];
  dbData.projects[idx] = { ...previousProject, followUps: [f, ...previousProject.followUps] };
  const savedFollowup = await setScopedDoc(scopeId, "projects", dbData.projects[idx]);
  if (!savedFollowup) {
    dbData.projects[idx] = previousProject;
    return res.status(500).json({ error: "\uBBF8\uD305 \uAE30\uB85D\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.status(201).json(dbData.projects[idx]);
});
app.put("/api/projects/:id/followups/:fid", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const idx = dbData.projects.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Project not found" });
  const fIdx = dbData.projects[idx].followUps.findIndex((f) => f.id === req.params.fid);
  if (fIdx !== -1) {
    const updatedFollowUp = { ...dbData.projects[idx].followUps[fIdx], ...req.body };
    if (req.body.expenses) {
      updatedFollowUp.expenses = await persistReceiptImagesInArray(scopeId, updatedFollowUp.expenses, `followup-${req.params.fid}`);
    }
    if (req.body.attachments) {
      updatedFollowUp.attachments = await persistAttachmentsInArray(scopeId, updatedFollowUp.attachments, `followup-${req.params.fid}`);
    }
    const previousProject = dbData.projects[idx];
    const nextFollowUps = [...previousProject.followUps];
    nextFollowUps[fIdx] = updatedFollowUp;
    dbData.projects[idx] = { ...previousProject, followUps: nextFollowUps };
    const savedFollowup = await setScopedDoc(scopeId, "projects", dbData.projects[idx]);
    if (!savedFollowup) {
      dbData.projects[idx] = previousProject;
      return res.status(500).json({ error: "\uBBF8\uD305 \uAE30\uB85D \uC218\uC815 \uB0B4\uC6A9\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
    }
  }
  res.json(dbData.projects[idx]);
});
app.delete("/api/projects/:id/followups/:fid", async (req, res) => {
  const dbData = getScopedData(req);
  const idx = dbData.projects.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Project not found" });
  dbData.projects[idx].followUps = dbData.projects[idx].followUps.filter((f) => f.id !== req.params.fid);
  await setScopedDoc(req.scopeId, "projects", dbData.projects[idx]);
  res.json(dbData.projects[idx]);
});
app.get("/api/vehicles", (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.vehicles || []);
});
app.post("/api/vehicles", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const v = req.body;
  if (!v.id) v.id = `vh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!v.createdAt) v.createdAt = (/* @__PURE__ */ new Date()).toISOString();
  if (v.currentMileage === void 0) v.currentMileage = v.initialMileage || 0;
  v.registrationDocumentUrl = await persistFileField(scopeId, v.registrationDocumentUrl, `vehicle-${v.id}-reg`, "attachments");
  dbData.vehicles.unshift(v);
  const savedVehicle = await setScopedDoc(scopeId, "vehicles", v);
  if (!savedVehicle) {
    dbData.vehicles = dbData.vehicles.filter((x) => x.id !== v.id);
    return res.status(500).json({ error: "\uCC28\uB7C9 \uC815\uBCF4\uB97C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.status(201).json(v);
});
app.put("/api/vehicles/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const idx = dbData.vehicles.findIndex((v) => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Vehicle not found" });
  const previousVehicle = dbData.vehicles[idx];
  const updated = { ...dbData.vehicles[idx], ...req.body };
  updated.registrationDocumentUrl = await persistFileField(scopeId, updated.registrationDocumentUrl, `vehicle-${updated.id}-reg`, "attachments");
  dbData.vehicles[idx] = updated;
  const savedVehicle = await setScopedDoc(scopeId, "vehicles", dbData.vehicles[idx]);
  if (!savedVehicle) {
    dbData.vehicles[idx] = previousVehicle;
    return res.status(500).json({ error: "\uCC28\uB7C9 \uC218\uC815 \uB0B4\uC6A9\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.json(dbData.vehicles[idx]);
});
app.delete("/api/vehicles/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  dbData.vehicles = dbData.vehicles.filter((v) => v.id !== req.params.id);
  dbData.drivingLogs = dbData.drivingLogs.filter((log) => log.vehicleId !== req.params.id);
  dbData.expenses = dbData.expenses.filter((e) => e.vehicleId !== req.params.id);
  dbData.maintenances = dbData.maintenances.filter((m) => m.vehicleId !== req.params.id);
  await Promise.all([
    deleteScopedDoc(scopeId, "vehicles", req.params.id),
    replaceScopedCollection(scopeId, "drivingLogs", dbData.drivingLogs),
    replaceScopedCollection(scopeId, "expenses", dbData.expenses),
    replaceScopedCollection(scopeId, "maintenances", dbData.maintenances)
  ]);
  res.json({ success: true });
});
app.get("/api/vehicles/driving", (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.drivingLogs || []);
});
app.post("/api/vehicles/driving", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const log = req.body;
  if (!log.id) log.id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!log.createdAt) log.createdAt = (/* @__PURE__ */ new Date()).toISOString();
  dbData.drivingLogs.unshift(log);
  const vIdx = dbData.vehicles.findIndex((v) => v.id === log.vehicleId);
  let updatedVehicle = null;
  if (vIdx !== -1) {
    const v = dbData.vehicles[vIdx];
    if (log.endMileage > v.currentMileage) {
      dbData.vehicles[vIdx].currentMileage = log.endMileage;
      updatedVehicle = dbData.vehicles[vIdx];
    }
  }
  await setScopedDoc(scopeId, "drivingLogs", log);
  if (updatedVehicle) await setScopedDoc(scopeId, "vehicles", updatedVehicle);
  res.status(201).json(log);
});
app.delete("/api/vehicles/driving/:id", async (req, res) => {
  const dbData = getScopedData(req);
  dbData.drivingLogs = dbData.drivingLogs.filter((log) => log.id !== req.params.id);
  await deleteScopedDoc(req.scopeId, "drivingLogs", req.params.id);
  res.json({ success: true });
});
app.get("/api/vehicles/expenses", (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.expenses || []);
});
app.post("/api/vehicles/expenses", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const exp = req.body;
  if (!exp.id) exp.id = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!exp.createdAt) exp.createdAt = (/* @__PURE__ */ new Date()).toISOString();
  exp.receiptImage = await persistImageField(scopeId, exp.receiptImage, `vehicle-expense-${exp.id}`, "receipts");
  dbData.expenses.unshift(exp);
  const savedExpense = await setScopedDoc(scopeId, "expenses", exp);
  if (!savedExpense) {
    dbData.expenses = dbData.expenses.filter((e) => e.id !== exp.id);
    return res.status(500).json({ error: "\uC9C0\uCD9C \uB0B4\uC5ED\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.status(201).json(exp);
});
app.delete("/api/vehicles/expenses/:id", async (req, res) => {
  const dbData = getScopedData(req);
  dbData.expenses = dbData.expenses.filter((e) => e.id !== req.params.id);
  await deleteScopedDoc(req.scopeId, "expenses", req.params.id);
  res.json({ success: true });
});
app.get("/api/vehicles/maintenances", (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.maintenances || []);
});
app.post("/api/vehicles/maintenances", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const maint = req.body;
  if (!maint.id) maint.id = `maint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!maint.createdAt) maint.createdAt = (/* @__PURE__ */ new Date()).toISOString();
  maint.receiptImage = await persistImageField(scopeId, maint.receiptImage, `vehicle-maint-${maint.id}`, "receipts");
  dbData.maintenances.unshift(maint);
  const savedMaint = await setScopedDoc(scopeId, "maintenances", maint);
  if (!savedMaint) {
    dbData.maintenances = dbData.maintenances.filter((m) => m.id !== maint.id);
    return res.status(500).json({ error: "\uC815\uBE44 \uAE30\uB85D\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.status(201).json(maint);
});
app.put("/api/vehicles/maintenances/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const idx = dbData.maintenances.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Maintenance not found" });
  const previousMaint = dbData.maintenances[idx];
  const updated = { ...dbData.maintenances[idx], ...req.body };
  updated.receiptImage = await persistImageField(scopeId, updated.receiptImage, `vehicle-maint-${updated.id}`, "receipts");
  dbData.maintenances[idx] = updated;
  const savedMaintUpdate = await setScopedDoc(scopeId, "maintenances", dbData.maintenances[idx]);
  if (!savedMaintUpdate) {
    dbData.maintenances[idx] = previousMaint;
    return res.status(500).json({ error: "\uC815\uBE44 \uAE30\uB85D \uC218\uC815 \uB0B4\uC6A9\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.json(dbData.maintenances[idx]);
});
app.delete("/api/vehicles/maintenances/:id", async (req, res) => {
  const dbData = getScopedData(req);
  dbData.maintenances = dbData.maintenances.filter((m) => m.id !== req.params.id);
  await deleteScopedDoc(req.scopeId, "maintenances", req.params.id);
  res.json({ success: true });
});
app.put("/api/vehicles/driving/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const idx = dbData.drivingLogs.findIndex((log2) => log2.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Driving log not found" });
  const oldEndMileage = dbData.drivingLogs[idx].endMileage;
  dbData.drivingLogs[idx] = { ...dbData.drivingLogs[idx], ...req.body };
  const log = dbData.drivingLogs[idx];
  const vIdx = dbData.vehicles.findIndex((v) => v.id === log.vehicleId);
  let updatedVehicle = null;
  if (vIdx !== -1) {
    const v = dbData.vehicles[vIdx];
    if (log.endMileage > v.currentMileage) {
      dbData.vehicles[vIdx].currentMileage = log.endMileage;
      updatedVehicle = dbData.vehicles[vIdx];
    }
  }
  await setScopedDoc(scopeId, "drivingLogs", log);
  if (updatedVehicle) await setScopedDoc(scopeId, "vehicles", updatedVehicle);
  let cascadedLog = null;
  if (log.endMileage !== oldEndMileage) {
    const nextIdx = dbData.drivingLogs.findIndex(
      (l) => l.id !== log.id && l.vehicleId === log.vehicleId && l.startMileage === oldEndMileage
    );
    if (nextIdx !== -1) {
      const nextLog = dbData.drivingLogs[nextIdx];
      const newDistance = nextLog.endMileage - log.endMileage;
      if (newDistance >= 0) {
        dbData.drivingLogs[nextIdx] = { ...nextLog, startMileage: log.endMileage, distance: newDistance };
        cascadedLog = dbData.drivingLogs[nextIdx];
        await setScopedDoc(scopeId, "drivingLogs", cascadedLog);
      }
    }
  }
  res.json({ ...dbData.drivingLogs[idx], cascadedLog });
});
app.put("/api/vehicles/expenses/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const idx = dbData.expenses.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Expense not found" });
  const previousExpense = dbData.expenses[idx];
  const updated = { ...dbData.expenses[idx], ...req.body };
  updated.receiptImage = await persistImageField(scopeId, updated.receiptImage, `vehicle-expense-${updated.id}`, "receipts");
  dbData.expenses[idx] = updated;
  const savedExpenseUpdate = await setScopedDoc(scopeId, "expenses", dbData.expenses[idx]);
  if (!savedExpenseUpdate) {
    dbData.expenses[idx] = previousExpense;
    return res.status(500).json({ error: "\uC9C0\uCD9C \uB0B4\uC5ED \uC218\uC815 \uC0AC\uD56D\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.json(dbData.expenses[idx]);
});
app.get("/api/vehicles/intervals", (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.maintenanceIntervals || []);
});
app.post("/api/vehicles/intervals", async (req, res) => {
  const dbData = getScopedData(req);
  const interval = req.body;
  if (!interval.id) interval.id = `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!interval.createdAt) interval.createdAt = (/* @__PURE__ */ new Date()).toISOString();
  dbData.maintenanceIntervals = dbData.maintenanceIntervals || [];
  dbData.maintenanceIntervals.unshift(interval);
  await setScopedDoc(req.scopeId, "maintenanceIntervals", interval);
  res.status(201).json(interval);
});
app.put("/api/vehicles/intervals/:id", async (req, res) => {
  const dbData = getScopedData(req);
  dbData.maintenanceIntervals = dbData.maintenanceIntervals || [];
  const idx = dbData.maintenanceIntervals.findIndex((item) => item.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Interval not found" });
  dbData.maintenanceIntervals[idx] = { ...dbData.maintenanceIntervals[idx], ...req.body };
  await setScopedDoc(req.scopeId, "maintenanceIntervals", dbData.maintenanceIntervals[idx]);
  res.json(dbData.maintenanceIntervals[idx]);
});
app.delete("/api/vehicles/intervals/:id", async (req, res) => {
  const dbData = getScopedData(req);
  dbData.maintenanceIntervals = dbData.maintenanceIntervals || [];
  dbData.maintenanceIntervals = dbData.maintenanceIntervals.filter((item) => item.id !== req.params.id);
  await deleteScopedDoc(req.scopeId, "maintenanceIntervals", req.params.id);
  res.json({ success: true });
});
function syncWorkLogExpenses(dbData, logId, logDate, logTitle, expenses) {
  dbData.expenses = dbData.expenses || [];
  dbData.expenses = dbData.expenses.filter((e) => !e.id.startsWith(`ve-wl-${logId}-`));
  if (!expenses || !Array.isArray(expenses)) return;
  expenses.forEach((expense) => {
    if (!expense.vehicleId) return;
    let category = "other";
    let memoPrefix = "";
    switch (expense.category) {
      case "breakfast":
        category = "meal";
        memoPrefix = "[\uC544\uCE68\uC2DD\uC0AC] ";
        break;
      case "lunch":
        category = "meal";
        memoPrefix = "[\uC810\uC2EC\uC2DD\uC0AC] ";
        break;
      case "dinner":
        category = "meal";
        memoPrefix = "[\uC800\uB141\uC2DD\uC0AC] ";
        break;
      case "drinks":
        category = "beverage";
        memoPrefix = "[\uC74C\uB8CC&\uCEE4\uD53C] ";
        break;
      case "fuel":
        category = "fuel";
        break;
      case "parking":
        category = "parking";
        break;
      case "proxy":
        category = "agency_drive";
        break;
      case "purchase":
        category = "supplies";
        memoPrefix = "[\uBB3C\uD488\uAD6C\uC785] ";
        break;
      case "custom":
        category = "custom";
        break;
    }
    let payMethod = "cash";
    if (expense.payMethod === "company_card") {
      payMethod = "company_card";
    } else if (expense.payMethod === "personal_card") {
      payMethod = "personal_card";
    } else if (expense.payMethod === "cash_personal") {
      payMethod = "cash";
      memoPrefix += "[\uAC1C\uC778\uD604\uAE08] ";
    } else if (expense.payMethod === "cash_company") {
      payMethod = "cash";
      memoPrefix += "[\uBC95\uC778\uD604\uAE08] ";
    }
    const memoContent = `${memoPrefix}${expense.memo || ""} (\uC5C5\uBB34\uC77C\uC9C0 \uC5F0\uB3D9: ${logTitle})`;
    dbData.expenses.unshift({
      id: `ve-wl-${logId}-${expense.id}`,
      vehicleId: expense.vehicleId,
      date: logDate,
      category,
      categoryCustom: expense.categoryCustom,
      amount: Number(expense.amount) || 0,
      memo: memoContent.trim(),
      payMethod,
      // [수정] 업무일지 지출 쪽에서 이미 Storage에 업로드된 영수증 URL을 그대로 같이 넘겨서,
      // 연동된 차량 비용 화면에서도 같은 영수증 사진을 볼 수 있게 한다.
      receiptImage: expense.receiptImage,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
}
app.post("/api/worklogs/calendar-token", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const user = userId ? users.find((u) => u.id === userId) : void 0;
  if (!user) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  if (!user.calendarFeedToken) {
    user.calendarFeedToken = import_crypto2.default.randomBytes(24).toString("hex");
    await addUser(user);
  }
  const host = req.get("host");
  const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  res.json({
    token: user.calendarFeedToken,
    feedUrl: `${protocol}://${host}/api/worklogs/calendar.ics?token=${user.calendarFeedToken}`,
    // webcal:// 스킴은 아이폰/아이패드/맥에서 링크를 누르면 캘린더 앱이 바로 "구독 추가"
    // 화면을 띄워준다 (https 링크는 그냥 브라우저에서 텍스트로 열려버림).
    webcalUrl: `webcal://${host}/api/worklogs/calendar.ics?token=${user.calendarFeedToken}`
  });
});
function icsEscape(text) {
  return (text || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
function icsDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}${pad(m)}${pad(d)}T${pad(hh || 0)}${pad(mm || 0)}00`;
}
app.get("/api/worklogs/calendar.ics", (req, res) => {
  const token = req.query.token;
  const user = token ? users.find((u) => u.calendarFeedToken === token) : void 0;
  if (!user) return res.status(404).send("\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uCE98\uB9B0\uB354 \uAD6C\uB3C5 \uB9C1\uD06C\uC785\uB2C8\uB2E4.");
  const scopeId = scopeIdForUser(user);
  const dbData = db[scopeId] || { dailyLogs: [], weeklyLogs: [] };
  const events = [];
  const now = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  for (const l of dbData.dailyLogs || []) {
    const entries = l.taskEntriesToday && l.taskEntriesToday.length > 0 ? l.taskEntriesToday : l.tasksToday && l.tasksToday.trim() ? [{ id: "legacy", content: l.tasksToday }] : [];
    for (const t of entries) {
      if (!t.content || !t.content.trim()) continue;
      const start = icsDateTime(l.date, t.startTime);
      const end = icsDateTime(l.date, t.endTime || t.startTime);
      events.push([
        "BEGIN:VEVENT",
        `UID:daily-${l.id}-${t.id}@bizcard-pro`,
        `DTSTAMP:${now}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${icsEscape(`[\uC5C5\uBB34\uC77C\uC9C0] ${l.author || ""} ${t.content}`.trim())}`,
        `DESCRIPTION:${icsEscape(t.content)}`,
        "END:VEVENT"
      ].join("\r\n"));
    }
  }
  const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  for (const wl of dbData.weeklyLogs || []) {
    if (!wl.startDate) continue;
    const start = new Date(wl.startDate);
    dayKeys.forEach((key, offset) => {
      const d = new Date(start);
      d.setDate(d.getDate() + offset);
      const dateStr = d.toISOString().split("T")[0];
      const structured = wl.achievementEntriesByDay?.[key];
      const entries = structured && structured.length > 0 ? structured : wl.achievementsByDay?.[key]?.trim() ? [{ id: "legacy", content: wl.achievementsByDay[key] }] : [];
      for (const t of entries) {
        if (!t.content || !t.content.trim()) return;
        const s = icsDateTime(dateStr, t.startTime);
        const e = icsDateTime(dateStr, t.endTime || t.startTime);
        events.push([
          "BEGIN:VEVENT",
          `UID:weekly-${wl.id}-${key}-${t.id}@bizcard-pro`,
          `DTSTAMP:${now}`,
          `DTSTART:${s}`,
          `DTEND:${e}`,
          `SUMMARY:${icsEscape(`[\uC5C5\uBB34\uC77C\uC9C0] ${wl.author || ""} ${t.content}`.trim())}`,
          `DESCRIPTION:${icsEscape(t.content)}`,
          "END:VEVENT"
        ].join("\r\n"));
      }
    });
  }
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BizCard Pro AI//WorkLogs Calendar//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:BizCard \uC5C5\uBB34\uC77C\uC9C0",
    "X-WR-TIMEZONE:Asia/Seoul",
    ...events,
    "END:VCALENDAR"
  ].join("\r\n");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="bizcard-pro-worklogs.ics"');
  res.send(ics);
});
function parseBasicAuth(req) {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
    const idx = decoded.indexOf(":");
    if (idx === -1) return null;
    return { email: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}
function requireCalDavAuth(req, res) {
  const creds = parseBasicAuth(req);
  const user = creds ? users.find((u) => u.email.toLowerCase() === creds.email.toLowerCase()) : void 0;
  if (!user || !creds || !verifyPassword(creds.password, user.password)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="BizCard Calendar"');
    res.status(401).send("Unauthorized");
    return null;
  }
  return user;
}
var caldavRouter = import_express.default.Router();
caldavRouter.use(import_express.default.text({ type: () => true, limit: "5mb" }));
caldavRouter.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, REPORT, MKCALENDAR, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Depth, If-Match, If-None-Match");
  res.setHeader("Access-Control-Expose-Headers", "ETag, DAV");
  next();
});
caldavRouter.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.setHeader("DAV", "1, 2, 3, calendar-access, calendar-schedule");
    res.setHeader("Allow", "OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, REPORT, MKCALENDAR");
    return res.status(200).end();
  }
  next();
});
function icsUidEscape(s) {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function collectCaldavEvents(scopeId) {
  const dbData = db[scopeId];
  if (!dbData) return [];
  const out = [];
  for (const l of dbData.dailyLogs || []) {
    const entries = l.taskEntriesToday && l.taskEntriesToday.length > 0 ? l.taskEntriesToday : [];
    for (const t of entries) {
      if (!t.content || !t.content.trim()) continue;
      const uid = `daily__${l.id}__${t.id}`;
      out.push({
        uid,
        summary: `[\uC5C5\uBB34\uC77C\uC9C0] ${l.author || ""} ${t.content}`.trim(),
        description: t.content,
        dtstart: icsDateTime(l.date, t.startTime),
        dtend: icsDateTime(l.date, t.endTime || t.startTime),
        etag: `"${icsUidEscape(uid)}-${(t.content || "").length}-${t.startTime || ""}-${t.endTime || ""}"`
      });
    }
  }
  const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  for (const wl of dbData.weeklyLogs || []) {
    if (!wl.startDate) continue;
    const start = new Date(wl.startDate);
    dayKeys.forEach((key, offset) => {
      const d = new Date(start);
      d.setDate(d.getDate() + offset);
      const dateStr = d.toISOString().split("T")[0];
      const entries = wl.achievementEntriesByDay?.[key] || [];
      for (const t of entries) {
        if (!t.content || !t.content.trim()) continue;
        const uid = `weekly__${wl.id}__${key}__${t.id}`;
        out.push({
          uid,
          summary: `[\uC5C5\uBB34\uC77C\uC9C0] ${wl.author || ""} ${t.content}`.trim(),
          description: t.content,
          dtstart: icsDateTime(dateStr, t.startTime),
          dtend: icsDateTime(dateStr, t.endTime || t.startTime),
          etag: `"${icsUidEscape(uid)}-${(t.content || "").length}-${t.startTime || ""}-${t.endTime || ""}"`
        });
      }
    });
  }
  return out;
}
function buildVEventIcs(ev) {
  const now = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BizCard Pro AI//CalDAV//KO",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${ev.uid}@bizcard-pro`,
    `DTSTAMP:${now}`,
    `DTSTART:${ev.dtstart}`,
    `DTEND:${ev.dtend}`,
    `SUMMARY:${icsEscape(ev.summary)}`,
    `DESCRIPTION:${icsEscape(ev.description)}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}
function parseVEvent(ics) {
  const unescape = (v) => v.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
  const lines = ics.split(/\r\n|\n|\r/);
  const result = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const rawKey = line.slice(0, idx);
    const key = rawKey.split(";")[0].toUpperCase();
    const value = line.slice(idx + 1);
    if (key === "UID") result.uid = value.trim();
    else if (key === "SUMMARY") result.summary = unescape(value);
    else if (key === "DESCRIPTION") result.description = unescape(value);
    else if (key === "DTSTART") result.dtstart = value.trim();
    else if (key === "DTEND") result.dtend = value.trim();
  }
  return result;
}
function parseIcsDateTime(v) {
  if (!v) return null;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  return { date: `${y}-${mo}-${d}`, time: hh ? `${hh}:${mm}` : void 0 };
}
caldavRouter.use(async (req, res, next) => {
  const user = requireCalDavAuth(req, res);
  if (!user) return;
  req.caldavUser = user;
  await loadScopeFromSupabase(scopeIdForUser(user));
  next();
});
app.all("/.well-known/caldav", (req, res) => {
  res.redirect(301, "/caldav/");
});
app.all("/", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  if (req.method === "OPTIONS") {
    res.setHeader("DAV", "1, 2, 3, calendar-access, calendar-schedule");
    res.setHeader("Allow", "OPTIONS, GET, HEAD, PROPFIND");
    return res.status(200).end();
  }
  if (req.method === "PROPFIND") {
    return res.redirect(301, "/caldav/");
  }
  next();
});
caldavRouter.all("/", (req, res) => {
  if (req.method !== "PROPFIND") return res.status(405).end();
  const user = req.caldavUser;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/caldav/</D:href>
    <D:propstat>
      <D:prop>
        <D:current-user-principal><D:href>/caldav/principals/${user.id}/</D:href></D:current-user-principal>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;
  res.status(207).setHeader("Content-Type", "application/xml; charset=utf-8").send(xml);
});
caldavRouter.all("/principals/:userId/", (req, res) => {
  if (req.method !== "PROPFIND") return res.status(405).end();
  const user = req.caldavUser;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/caldav/principals/${user.id}/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${user.name}</D:displayname>
        <C:calendar-home-set><D:href>/caldav/calendars/${user.id}/</D:href></C:calendar-home-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;
  res.status(207).setHeader("Content-Type", "application/xml; charset=utf-8").send(xml);
});
caldavRouter.all("/calendars/:userId/", (req, res) => {
  if (req.method !== "PROPFIND") return res.status(405).end();
  const user = req.caldavUser;
  const depth = req.headers["depth"] || "0";
  let responses = `
  <D:response>
    <D:href>/caldav/calendars/${user.id}/</D:href>
    <D:propstat>
      <D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
  if (depth !== "0") {
    responses += `
  <D:response>
    <D:href>/caldav/calendars/${user.id}/worklogs/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
        <D:displayname>BizCard \uC5C5\uBB34\uC77C\uC9C0</D:displayname>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
  }
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${responses}
</D:multistatus>`;
  res.status(207).setHeader("Content-Type", "application/xml; charset=utf-8").send(xml);
});
caldavRouter.all("/calendars/:userId/worklogs/", (req, res) => {
  const user = req.caldavUser;
  const scopeId = scopeIdForUser(user);
  if (req.method === "MKCALENDAR") {
    return res.status(201).end();
  }
  if (req.method !== "PROPFIND" && req.method !== "REPORT") return res.status(405).end();
  const events = collectCaldavEvents(scopeId);
  const ctag = `"${events.length}-${events.map((e) => e.etag).join("").length}"`;
  if (req.method === "PROPFIND") {
    const depth = req.headers["depth"] || "0";
    let responses2 = `
  <D:response>
    <D:href>/caldav/calendars/${user.id}/worklogs/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
        <D:displayname>BizCard \uC5C5\uBB34\uC77C\uC9C0</D:displayname>
        <CS:getctag xmlns:CS="http://calendarserver.org/ns/">${ctag}</CS:getctag>
        <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
    if (depth !== "0") {
      for (const ev of events) {
        responses2 += `
  <D:response>
    <D:href>/caldav/calendars/${user.id}/worklogs/${ev.uid}.ics</D:href>
    <D:propstat>
      <D:prop><D:getetag>${ev.etag}</D:getetag></D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
      }
    }
    const xml2 = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${responses2}
</D:multistatus>`;
    return res.status(207).setHeader("Content-Type", "application/xml; charset=utf-8").send(xml2);
  }
  const body = req.body || "";
  const isMultiget = body.includes("calendar-multiget");
  let targetUids = null;
  if (isMultiget) {
    const hrefMatches = [...body.matchAll(/<[^:>]*:?href>([^<]+)<\/[^:>]*:?href>/g)].map((m) => m[1]);
    targetUids = hrefMatches.map((h) => h.split("/").pop()?.replace(/\.ics$/, "") || "");
  }
  const targetEvents = targetUids ? events.filter((e) => targetUids.includes(e.uid)) : events;
  let responses = "";
  for (const ev of targetEvents) {
    const calData = buildVEventIcs(ev);
    responses += `
  <D:response>
    <D:href>/caldav/calendars/${user.id}/worklogs/${ev.uid}.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>${ev.etag}</D:getetag>
        <C:calendar-data><![CDATA[${calData}]]></C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
  }
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${responses}
  <D:sync-token>http://bizcard-pro/sync/${ctag}</D:sync-token>
</D:multistatus>`;
  res.status(207).setHeader("Content-Type", "application/xml; charset=utf-8").send(xml);
});
caldavRouter.all("/calendars/:userId/worklogs/:uidIcs", async (req, res) => {
  const user = req.caldavUser;
  const scopeId = scopeIdForUser(user);
  await loadScopeFromSupabase(scopeId);
  const dbData = db[scopeId];
  const uid = req.params.uidIcs.replace(/\.ics$/, "");
  if (req.method === "GET" || req.method === "HEAD") {
    const events = collectCaldavEvents(scopeId);
    const ev = events.find((e) => e.uid === uid);
    if (!ev) return res.status(404).end();
    res.setHeader("ETag", ev.etag);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    return res.send(req.method === "HEAD" ? "" : buildVEventIcs(ev));
  }
  if (req.method === "DELETE") {
    const dailyMatch = uid.match(/^daily__(.+)__([^_]+)$/);
    const weeklyMatch = uid.match(/^weekly__(.+)__(mon|tue|wed|thu|fri|sat|sun)__([^_]+)$/);
    let removed = false;
    if (dailyMatch) {
      const [, logId, taskId] = dailyMatch;
      const log = (dbData.dailyLogs || []).find((l) => l.id === logId);
      if (log?.taskEntriesToday) {
        const before = log.taskEntriesToday.length;
        log.taskEntriesToday = log.taskEntriesToday.filter((t) => t.id !== taskId);
        removed = log.taskEntriesToday.length < before;
        log.tasksToday = log.taskEntriesToday.map((t) => t.content).join("\n");
        if (log.taskEntriesToday.length === 0 && !log.tasksTomorrow && !log.issues) {
          dbData.dailyLogs = (dbData.dailyLogs || []).filter((l) => l.id !== logId);
          await deleteScopedDoc(scopeId, "dailyLogs", logId);
        } else {
          await setScopedDoc(scopeId, "dailyLogs", log);
        }
      }
    } else if (weeklyMatch) {
      const [, wlId, dayKey, taskId] = weeklyMatch;
      const wl = (dbData.weeklyLogs || []).find((w) => w.id === wlId);
      const dayEntries = wl?.achievementEntriesByDay?.[dayKey];
      if (wl && dayEntries) {
        const before = dayEntries.length;
        wl.achievementEntriesByDay[dayKey] = dayEntries.filter((t) => t.id !== taskId);
        removed = wl.achievementEntriesByDay[dayKey].length < before;
        if (wl.achievementsByDay) {
          wl.achievementsByDay[dayKey] = wl.achievementEntriesByDay[dayKey].map((t) => t.content).join("\n");
        }
        await setScopedDoc(scopeId, "weeklyLogs", wl);
      }
    }
    if (!removed) return res.status(404).end();
    return res.status(204).end();
  }
  if (req.method === "PUT") {
    const parsed = parseVEvent(req.body || "");
    const start = parseIcsDateTime(parsed.dtstart);
    const end = parseIcsDateTime(parsed.dtend);
    const content = parsed.summary || parsed.description || "(\uC81C\uBAA9 \uC5C6\uC74C)";
    const dailyMatch = uid.match(/^daily__(.+)__([^_]+)$/);
    const weeklyMatch = uid.match(/^weekly__(.+)__(mon|tue|wed|thu|fri|sat|sun)__([^_]+)$/);
    if (dailyMatch) {
      const [, logId, taskId] = dailyMatch;
      const log = (dbData.dailyLogs || []).find((l) => l.id === logId);
      if (log?.taskEntriesToday) {
        const task = log.taskEntriesToday.find((t) => t.id === taskId);
        if (task) {
          task.content = content;
          if (start?.time) task.startTime = start.time;
          if (end?.time) task.endTime = end.time;
          log.tasksToday = log.taskEntriesToday.map((t) => t.content).join("\n");
          await setScopedDoc(scopeId, "dailyLogs", log);
          return res.status(204).end();
        }
      }
    } else if (weeklyMatch) {
      const [, wlId, dayKey, taskId] = weeklyMatch;
      const wl = (dbData.weeklyLogs || []).find((w) => w.id === wlId);
      const dayEntries = wl?.achievementEntriesByDay?.[dayKey];
      const task = dayEntries?.find((t) => t.id === taskId);
      if (wl && task) {
        task.content = content;
        if (start?.time) task.startTime = start.time;
        if (end?.time) task.endTime = end.time;
        if (wl.achievementsByDay) {
          wl.achievementsByDay[dayKey] = (dayEntries || []).map((t) => t.content).join("\n");
        }
        await setScopedDoc(scopeId, "weeklyLogs", wl);
        return res.status(204).end();
      }
    }
    if (!start) return res.status(400).send("DTSTART\uC774 \uC5C6\uC5B4 \uB0A0\uC9DC\uB97C \uC54C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const newLogId = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newTaskId = uid;
    const newTask = { id: newTaskId, content, startTime: start.time, endTime: end?.time || start.time };
    const newLog = {
      id: newLogId,
      date: start.date,
      title: "Apple \uCE98\uB9B0\uB354\uC5D0\uC11C \uCD94\uAC00\uD55C \uC77C\uC815",
      author: user.name,
      tasksToday: content,
      taskEntriesToday: [newTask],
      tasksTomorrow: "",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    dbData.dailyLogs = [newLog, ...dbData.dailyLogs || []];
    await setScopedDoc(scopeId, "dailyLogs", newLog);
    return res.status(201).end();
  }
  return res.status(405).end();
});
app.use("/caldav", caldavRouter);
app.get("/api/worklogs/daily", (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.dailyLogs || []);
});
app.post("/api/worklogs/daily", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const log = req.body;
  if (!log.id) log.id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!log.createdAt) log.createdAt = (/* @__PURE__ */ new Date()).toISOString();
  if (!log.projectIds) log.projectIds = [];
  if (!log.contactIds) log.contactIds = [];
  log.expenses = await persistReceiptImagesInArray(scopeId, log.expenses, `worklog-daily-${log.id}`);
  syncWorkLogExpenses(dbData, log.id, log.date, log.title, log.expenses);
  dbData.dailyLogs = dbData.dailyLogs || [];
  dbData.dailyLogs.unshift(log);
  const [savedDailyLog] = await Promise.all([
    setScopedDoc(scopeId, "dailyLogs", log),
    replaceScopedCollection(scopeId, "expenses", dbData.expenses)
  ]);
  if (!savedDailyLog) {
    dbData.dailyLogs = dbData.dailyLogs.filter((l) => l.id !== log.id);
    return res.status(500).json({ error: "\uC5C5\uBB34\uC77C\uC9C0\uB97C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  const inviterUser = users.find((u) => u.id === req.headers["x-user-id"]);
  notifyNewWorkLogInvites({
    inviterId: inviterUser?.id || "",
    inviterName: inviterUser?.name || log.author || "\uB3D9\uB8CC",
    title: log.title,
    date: log.date,
    beforeIds: [],
    afterIds: log.invitedUserIds
  });
  res.status(201).json(log);
});
app.put("/api/worklogs/daily/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  dbData.dailyLogs = dbData.dailyLogs || [];
  const idx = dbData.dailyLogs.findIndex((l) => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Daily log not found" });
  const original = dbData.dailyLogs[idx];
  const updated = { ...original, ...req.body };
  updated.expenses = await persistReceiptImagesInArray(scopeId, updated.expenses, `worklog-daily-${req.params.id}`);
  dbData.dailyLogs[idx] = updated;
  syncWorkLogExpenses(dbData, req.params.id, updated.date, updated.title, updated.expenses);
  const [savedDailyLogUpdate] = await Promise.all([
    setScopedDoc(scopeId, "dailyLogs", updated),
    replaceScopedCollection(scopeId, "expenses", dbData.expenses)
  ]);
  if (!savedDailyLogUpdate) {
    dbData.dailyLogs[idx] = original;
    return res.status(500).json({ error: "\uC5C5\uBB34\uC77C\uC9C0 \uC218\uC815 \uB0B4\uC6A9\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  const inviterUser = users.find((u) => u.id === req.headers["x-user-id"]);
  notifyNewWorkLogInvites({
    inviterId: inviterUser?.id || "",
    inviterName: inviterUser?.name || updated.author || "\uB3D9\uB8CC",
    title: updated.title,
    date: updated.date,
    beforeIds: original.invitedUserIds,
    afterIds: updated.invitedUserIds
  });
  res.json(dbData.dailyLogs[idx]);
});
app.delete("/api/worklogs/daily/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  dbData.dailyLogs = dbData.dailyLogs || [];
  dbData.dailyLogs = dbData.dailyLogs.filter((l) => l.id !== req.params.id);
  dbData.expenses = dbData.expenses || [];
  dbData.expenses = dbData.expenses.filter((e) => !e.id.startsWith(`ve-wl-${req.params.id}-`));
  await Promise.all([
    deleteScopedDoc(scopeId, "dailyLogs", req.params.id),
    replaceScopedCollection(scopeId, "expenses", dbData.expenses)
  ]);
  res.json({ success: true });
});
app.get("/api/worklogs/weekly", (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.weeklyLogs || []);
});
app.post("/api/worklogs/weekly", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const log = req.body;
  if (!log.id) log.id = `wl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!log.createdAt) log.createdAt = (/* @__PURE__ */ new Date()).toISOString();
  if (!log.projectIds) log.projectIds = [];
  if (!log.contactIds) log.contactIds = [];
  log.expenses = await persistReceiptImagesInArray(scopeId, log.expenses, `worklog-weekly-${log.id}`);
  syncWorkLogExpenses(dbData, log.id, log.startDate, log.title, log.expenses);
  dbData.weeklyLogs = dbData.weeklyLogs || [];
  dbData.weeklyLogs.unshift(log);
  const [savedWeeklyLog] = await Promise.all([
    setScopedDoc(scopeId, "weeklyLogs", log),
    replaceScopedCollection(scopeId, "expenses", dbData.expenses)
  ]);
  if (!savedWeeklyLog) {
    dbData.weeklyLogs = dbData.weeklyLogs.filter((l) => l.id !== log.id);
    return res.status(500).json({ error: "\uC8FC\uAC04 \uC5C5\uBB34\uC77C\uC9C0\uB97C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  const inviterUser = users.find((u) => u.id === req.headers["x-user-id"]);
  notifyNewWorkLogInvites({
    inviterId: inviterUser?.id || "",
    inviterName: inviterUser?.name || log.author || "\uB3D9\uB8CC",
    title: log.title,
    date: log.startDate,
    beforeIds: [],
    afterIds: log.invitedUserIds
  });
  res.status(201).json(log);
});
app.put("/api/worklogs/weekly/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  dbData.weeklyLogs = dbData.weeklyLogs || [];
  const idx = dbData.weeklyLogs.findIndex((l) => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Weekly log not found" });
  const original = dbData.weeklyLogs[idx];
  const updated = { ...original, ...req.body };
  updated.expenses = await persistReceiptImagesInArray(scopeId, updated.expenses, `worklog-weekly-${req.params.id}`);
  dbData.weeklyLogs[idx] = updated;
  syncWorkLogExpenses(dbData, req.params.id, updated.startDate, updated.title, updated.expenses);
  const [savedWeeklyLogUpdate] = await Promise.all([
    setScopedDoc(scopeId, "weeklyLogs", updated),
    replaceScopedCollection(scopeId, "expenses", dbData.expenses)
  ]);
  if (!savedWeeklyLogUpdate) {
    dbData.weeklyLogs[idx] = original;
    return res.status(500).json({ error: "\uC8FC\uAC04 \uC5C5\uBB34\uC77C\uC9C0 \uC218\uC815 \uB0B4\uC6A9\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  const inviterUser = users.find((u) => u.id === req.headers["x-user-id"]);
  notifyNewWorkLogInvites({
    inviterId: inviterUser?.id || "",
    inviterName: inviterUser?.name || updated.author || "\uB3D9\uB8CC",
    title: updated.title,
    date: updated.startDate,
    beforeIds: original.invitedUserIds,
    afterIds: updated.invitedUserIds
  });
  res.json(dbData.weeklyLogs[idx]);
});
app.delete("/api/worklogs/weekly/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  dbData.weeklyLogs = dbData.weeklyLogs || [];
  dbData.weeklyLogs = dbData.weeklyLogs.filter((l) => l.id !== req.params.id);
  dbData.expenses = dbData.expenses || [];
  dbData.expenses = dbData.expenses.filter((e) => !e.id.startsWith(`ve-wl-${req.params.id}-`));
  await Promise.all([
    deleteScopedDoc(scopeId, "weeklyLogs", req.params.id),
    replaceScopedCollection(scopeId, "expenses", dbData.expenses)
  ]);
  res.json({ success: true });
});
var BREVO_API_KEY = process.env.BREVO_API_KEY;
var SMTP_FROM_EMAIL = process.env.SMTP_FROM_EMAIL || "";
var SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || "BizCard \uC804\uC790\uACB0\uC7AC";
var APP_BASE_URL = process.env.APP_BASE_URL || "https://bizcard-pro.onrender.com";
var isMailerConfigured = Boolean(BREVO_API_KEY && SMTP_FROM_EMAIL);
if (!isMailerConfigured) {
  console.warn("[mailer] BREVO_API_KEY \uB610\uB294 SMTP_FROM_EMAIL \uD658\uACBD\uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC544 \uC774\uBA54\uC77C \uBC1C\uC1A1\uC774 \uBE44\uD65C\uC131\uD654\uB429\uB2C8\uB2E4.");
}
async function sendEmail(opts) {
  if (!isMailerConfigured) {
    console.warn(`[mailer] \uBBF8\uC124\uC815 \uC0C1\uD0DC\uB77C ${opts.to}\uC5D0\uAC8C \uBA54\uC77C\uC744 \uBCF4\uB0B4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`);
    return;
  }
  const payload = {
    sender: { name: SMTP_FROM_NAME, email: SMTP_FROM_EMAIL },
    to: [{ email: opts.to, name: opts.toName || opts.to }],
    subject: opts.subject,
    htmlContent: opts.html
  };
  if (opts.attachments && opts.attachments.length > 0) {
    payload.attachment = opts.attachments.map((a) => ({
      name: a.filename,
      content: a.content.toString("base64")
    }));
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Brevo \uBA54\uC77C \uBC1C\uC1A1 \uC2E4\uD328 (${res.status}): ${errText}`);
  }
}
async function sendApprovalRequestEmail(opts) {
  if (!isMailerConfigured) {
    console.warn(`[mailer] \uBBF8\uC124\uC815 \uC0C1\uD0DC\uB77C ${opts.toEmail}\uC5D0\uAC8C \uACB0\uC7AC \uC694\uCCAD \uC774\uBA54\uC77C\uC744 \uBCF4\uB0B4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`);
    return;
  }
  try {
    await sendEmail({
      to: opts.toEmail,
      toName: opts.toName,
      subject: `[\uACB0\uC7AC \uC694\uCCAD] ${opts.docTypeLabel} - ${opts.authorName}\uB2D8\uC774 \uC0C1\uC2E0\uD55C \uBB38\uC11C (\uAE30\uC548\uBC88\uD638: ${opts.draftNumber})`,
      html: `
        <div style="font-family: 'Malgun Gothic', sans-serif; padding: 24px; color:#111;">
          <h2 style="margin-bottom:4px;">${opts.docTypeLabel} \uACB0\uC7AC \uC694\uCCAD</h2>
          <p style="color:#555;">${opts.toName}\uB2D8(${opts.approverRole}), \uACB0\uC7AC\uD574 \uC8FC\uC2E4 \uBB38\uC11C\uAC00 \uB3C4\uCC29\uD588\uC2B5\uB2C8\uB2E4.</p>
          <table style="border-collapse:collapse; margin:16px 0; font-size:14px;">
            <tr><td style="padding:4px 16px 4px 0; color:#888;">\uAE30\uC548\uBC88\uD638</td><td>${opts.draftNumber}</td></tr>
            <tr><td style="padding:4px 16px 4px 0; color:#888;">\uAE30\uC548\uC790</td><td>${opts.authorName}</td></tr>
          </table>
          <a href="${APP_BASE_URL}" style="display:inline-block; padding:10px 22px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold;">\uC0AC\uC774\uD2B8\uC5D0\uC11C \uD655\uC778\uD558\uAE30</a>
        </div>
      `
    });
    console.log(`[mailer] ${opts.toEmail}\uC5D0\uAC8C \uACB0\uC7AC \uC694\uCCAD \uC774\uBA54\uC77C \uBC1C\uC1A1 \uC644\uB8CC`);
  } catch (err) {
    console.error(`[mailer] ${opts.toEmail}\uC5D0\uAC8C \uC774\uBA54\uC77C \uBC1C\uC1A1 \uC2E4\uD328:`, err);
  }
}
async function sendWorkLogInviteEmail(opts) {
  if (!isMailerConfigured) {
    console.warn(`[mailer] \uBBF8\uC124\uC815 \uC0C1\uD0DC\uB77C ${opts.toEmail}\uC5D0\uAC8C \uC5C5\uBB34\uC77C\uC9C0 \uCD08\uB300 \uC774\uBA54\uC77C\uC744 \uBCF4\uB0B4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.`);
    return;
  }
  try {
    await sendEmail({
      to: opts.toEmail,
      toName: opts.toName,
      subject: `[\uC77C\uC815 \uCD08\uB300] ${opts.inviterName}\uB2D8\uC774 ${opts.date} \uC77C\uC815\uC5D0 \uCD08\uB300\uD588\uC2B5\uB2C8\uB2E4`,
      html: `
        <div style="font-family: 'Malgun Gothic', sans-serif; padding: 24px; color:#111;">
          <h2 style="margin-bottom:4px;">\uC5C5\uBB34\uC77C\uC9C0 \uC77C\uC815 \uCD08\uB300</h2>
          <p style="color:#555;">${opts.toName}\uB2D8, ${opts.inviterName}\uB2D8\uC774 \uC544\uB798 \uC77C\uC815\uC5D0 \uCD08\uB300\uD588\uC2B5\uB2C8\uB2E4.</p>
          <table style="border-collapse:collapse; margin:16px 0; font-size:14px;">
            <tr><td style="padding:4px 16px 4px 0; color:#888;">\uC77C\uC815 \uC81C\uBAA9</td><td>${opts.title || "(\uC81C\uBAA9 \uC5C6\uC74C)"}</td></tr>
            <tr><td style="padding:4px 16px 4px 0; color:#888;">\uB0A0\uC9DC</td><td>${opts.date}</td></tr>
            <tr><td style="padding:4px 16px 4px 0; color:#888;">\uCD08\uB300\uD55C \uC0AC\uB78C</td><td>${opts.inviterName}</td></tr>
          </table>
          <a href="${APP_BASE_URL}" style="display:inline-block; padding:10px 22px; background:#059669; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold;">\uC0AC\uC774\uD2B8\uC5D0\uC11C \uD655\uC778\uD558\uAE30</a>
        </div>
      `
    });
    console.log(`[mailer] ${opts.toEmail}\uC5D0\uAC8C \uC5C5\uBB34\uC77C\uC9C0 \uCD08\uB300 \uC774\uBA54\uC77C \uBC1C\uC1A1 \uC644\uB8CC`);
  } catch (err) {
    console.error(`[mailer] ${opts.toEmail}\uC5D0\uAC8C \uC774\uBA54\uC77C \uBC1C\uC1A1 \uC2E4\uD328:`, err);
  }
}
function notifyNewWorkLogInvites(opts) {
  const newIds = (opts.afterIds || []).filter((id) => id && id !== opts.inviterId && !(opts.beforeIds || []).includes(id));
  for (const uid of newIds) {
    const target = users.find((u) => u.id === uid);
    if (!target) continue;
    sendWorkLogInviteEmail({
      toEmail: target.email,
      toName: target.name,
      inviterName: opts.inviterName,
      title: opts.title,
      date: opts.date
    }).catch((err) => console.error("[mailer] \uC5C5\uBB34\uC77C\uC9C0 \uCD08\uB300 \uC774\uBA54\uC77C \uBC1C\uC1A1 \uC911 \uC624\uB958:", err));
  }
}
var GLOBAL_FEEDBACK_SCOPE = "__global_feedback__";
app.post("/api/feedback", async (req, res) => {
  try {
    const { category, content, pageContext } = req.body;
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: "\uBB38\uC758 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
    }
    const userId = req.headers["x-user-id"];
    const user = users.find((u) => u.id === userId);
    const item = {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category: ["bug", "feature", "other"].includes(category) ? category : "other",
      content: String(content).trim(),
      authorName: user?.name,
      authorEmail: user?.email,
      authorPhone: user?.phone,
      companyName: user?.companyName,
      pageContext: pageContext || void 0,
      status: "new",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await setScopedDoc(GLOBAL_FEEDBACK_SCOPE, "feedback", item);
    res.status(201).json({ success: true });
    if (isMailerConfigured) {
      const categoryLabel = item.category === "bug" ? "\u{1F41E} \uBC84\uADF8 \uC2E0\uACE0" : item.category === "feature" ? "\u{1F4A1} \uAE30\uB2A5 \uC81C\uC548" : "\u2709\uFE0F \uAE30\uD0C0 \uBB38\uC758";
      sendEmail({
        to: ADMIN_EMAIL,
        subject: `[BizCard Pro \uBB38\uC758] ${categoryLabel} - ${item.authorName || "\uC775\uBA85"}`,
        html: `
          <div style="font-family: 'Malgun Gothic', sans-serif; padding: 24px; color:#111;">
            <h2 style="margin-bottom:4px;">${categoryLabel}</h2>
            <p style="color:#555;">\uC791\uC131\uC790: ${item.authorName || "\uC54C \uC218 \uC5C6\uC74C"} (${item.authorEmail || "-"})</p>
            <p style="color:#555;">\uC5F0\uB77D\uCC98: ${item.authorPhone || "\uB4F1\uB85D\uB41C \uBC88\uD638 \uC5C6\uC74C"}</p>
            <p style="color:#555;">\uC18C\uC18D: ${item.companyName || "\uAC1C\uC778 \uACC4\uC815"}</p>
            <p style="color:#555;">\uC811\uC218 \uD654\uBA74: ${item.pageContext || "-"}</p>
            <div style="margin-top:16px; padding:16px; background:#f8fafc; border-radius:8px; white-space:pre-wrap; font-size:14px;">${String(item.content).replace(/</g, "&lt;")}</div>
          </div>
        `
      }).then(() => {
        console.log("[mailer] \uBB38\uC758 \uC811\uC218 \uC54C\uB9BC \uBA54\uC77C \uBC1C\uC1A1 \uC644\uB8CC");
      }).catch((err) => {
        console.error("[mailer] \uBB38\uC758 \uC811\uC218 \uC54C\uB9BC \uBA54\uC77C \uBC1C\uC1A1 \uC2E4\uD328:", err);
      });
    }
  } catch (err) {
    console.error("Feedback submit error:", err);
    if (!res.headersSent) res.status(500).json({ error: "\uBB38\uC758 \uC811\uC218 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
var ADMIN_EMAIL = process.env.ADMIN_EMAIL || "parkhy5454@gmail.com";
app.get("/api/admin/platform-stats", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === userId);
  if (!requester || requester.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "\uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
  }
  try {
    const scopeStats = await getPlatformStats();
    const usersByScope = /* @__PURE__ */ new Map();
    for (const u of users) {
      const scopeId = scopeIdForUser(u);
      if (!usersByScope.has(scopeId)) {
        usersByScope.set(scopeId, { count: 0, companyName: u.companyName, businessNumber: u.businessNumber, members: [] });
      }
      const entry = usersByScope.get(scopeId);
      entry.count += 1;
      entry.members.push({ name: u.name, email: u.email, phone: u.phone, position: u.position, createdAt: u.createdAt });
    }
    const companies = scopeStats.filter((s) => s.scopeId.startsWith("company:")).map((s) => {
      const userInfo = usersByScope.get(s.scopeId);
      return {
        scopeId: s.scopeId,
        companyName: userInfo?.companyName || s.scopeId.replace("company:", ""),
        businessNumber: userInfo?.businessNumber || "",
        userCount: userInfo?.count || 0,
        members: userInfo?.members || [],
        itemCounts: s.itemCounts,
        totalItems: s.totalItems,
        lastActivity: s.lastActivity
      };
    }).sort((a, b) => (b.lastActivity || "").localeCompare(a.lastActivity || ""));
    const seenScopeIds = new Set(companies.map((c) => c.scopeId));
    for (const [scopeId, info] of usersByScope) {
      if (scopeId.startsWith("company:") && !seenScopeIds.has(scopeId)) {
        companies.push({
          scopeId,
          companyName: info.companyName || scopeId.replace("company:", ""),
          businessNumber: info.businessNumber || "",
          userCount: info.count,
          members: info.members,
          itemCounts: {},
          totalItems: 0,
          lastActivity: null
        });
      }
    }
    const individuals = users.filter((u) => u.type === "individual").map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, createdAt: u.createdAt })).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const individualScopeCount = scopeStats.filter((s) => s.scopeId.startsWith("individual:")).length;
    const latestMemberJoin = (c) => Math.max(0, ...c.members.map((m) => m.createdAt ? new Date(m.createdAt).getTime() : 0));
    companies.sort((a, b) => latestMemberJoin(b) - latestMemberJoin(a));
    const featureTotals = {};
    for (const s of scopeStats) {
      for (const [collection, count] of Object.entries(s.itemCounts)) {
        featureTotals[collection] = (featureTotals[collection] || 0) + count;
      }
    }
    res.json({
      totalUsers: users.length,
      totalCompanies: companies.length,
      individualAccountCount: individualScopeCount,
      companies,
      individuals,
      featureTotals
    });
  } catch (err) {
    console.error("platform-stats \uC870\uD68C \uC624\uB958:", err);
    res.status(500).json({ error: "\uD1B5\uACC4 \uC870\uD68C \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
var MIGRATABLE_COLLECTIONS = [
  "contacts",
  "projects",
  "groups",
  "vehicles",
  "drivingLogs",
  "expenses",
  "maintenances",
  "maintenanceIntervals",
  "dailyLogs",
  "weeklyLogs",
  "advancePayments",
  "leaveRequests",
  "adminDocs"
];
app.post("/api/admin/migrate-scope", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const requester = users.find((u) => u.id === userId);
  if (!requester || requester.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "\uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
  }
  const { fromScopeId, toScopeId } = req.body;
  if (!fromScopeId || !toScopeId || fromScopeId === toScopeId) {
    return res.status(400).json({ error: "fromScopeId\uC640 toScopeId\uB97C \uC11C\uB85C \uB2E4\uB974\uAC8C \uC815\uD655\uD788 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  }
  try {
    const summary = {};
    for (const name of MIGRATABLE_COLLECTIONS) {
      const oldItems = await getScopedCollection(fromScopeId, name);
      if (!oldItems || oldItems.length === 0) continue;
      const newItems = await getScopedCollection(toScopeId, name);
      const merged = [...newItems || [], ...oldItems];
      await replaceScopedCollection(toScopeId, name, merged);
      await replaceScopedCollection(fromScopeId, name, []);
      summary[name] = oldItems.length;
    }
    const oldProfileList = await getScopedCollection(fromScopeId, "myProfile");
    const oldProfile = oldProfileList[0];
    if (oldProfile) {
      const newProfileList = await getScopedCollection(toScopeId, "myProfile");
      const newProfile = newProfileList[0];
      const toIsEmpty = !newProfile || !newProfile.name && !newProfile.company && !newProfile.phoneMobile;
      if (toIsEmpty) {
        await setScopedProfile(toScopeId, oldProfile);
        summary["myProfile"] = 1;
      }
    }
    delete db[fromScopeId];
    delete db[toScopeId];
    res.json({ success: true, fromScopeId, toScopeId, migratedCounts: summary });
  } catch (err) {
    console.error("scope migrate \uC624\uB958:", err);
    res.status(500).json({ error: "\uB370\uC774\uD130 \uBCD1\uD569 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
app.get("/api/feedback", async (req, res) => {
  const list = await getScopedCollection(GLOBAL_FEEDBACK_SCOPE, "feedback");
  res.json(list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
});
app.put("/api/feedback/:id", async (req, res) => {
  try {
    const existing = await getScopedDoc(GLOBAL_FEEDBACK_SCOPE, "feedback", req.params.id);
    if (!existing) return res.status(404).json({ error: "\uD574\uB2F9 \uBB38\uC758\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const status = ["new", "in_progress", "resolved"].includes(req.body.status) ? req.body.status : existing.status;
    const updated = { ...existing, status };
    await setScopedDoc(GLOBAL_FEEDBACK_SCOPE, "feedback", updated);
    res.json(updated);
  } catch (err) {
    console.error("Feedback status update error:", err);
    res.status(500).json({ error: "\uC0C1\uD0DC \uBCC0\uACBD \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
app.post("/api/invites", async (req, res) => {
  try {
    const scopeId = req.scopeId;
    const userId = req.headers["x-user-id"];
    const user = users.find((u) => u.id === userId);
    const record = {
      id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      contactId: req.body.contactId,
      contactName: req.body.contactName,
      channel: ["sms", "email", "kakao", "share", "other"].includes(req.body.channel) ? req.body.channel : "other",
      sentByUserId: userId,
      sentByUserName: user?.name,
      sentAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await setScopedDoc(scopeId, "invites", record);
    res.status(201).json(record);
  } catch (err) {
    console.error("Invite log error:", err);
    res.status(500).json({ error: "\uCD08\uB300 \uAE30\uB85D \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
app.get("/api/invites", async (req, res) => {
  const scopeId = req.scopeId;
  const list = await getScopedCollection(scopeId, "invites");
  res.json(list.sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || "")));
});
function getNextPendingApprover(approvalLine = []) {
  return approvalLine.find((s) => !s.date);
}
function normalizeApprovalRole(s) {
  return s.trim().replace(/\s+/g, "").toLowerCase();
}
async function notifyNextApproverIfChanged(scopeId, docTypeLabel, draftNumber, authorName, afterLine, afterStatus, beforeLine) {
  if (!isMailerConfigured) return;
  if (afterStatus !== "pending") return;
  if (!scopeId.startsWith("company:")) return;
  const nextBefore = beforeLine ? getNextPendingApprover(beforeLine) : void 0;
  const nextAfter = getNextPendingApprover(afterLine || []);
  if (!nextAfter) return;
  if (beforeLine && nextBefore?.role === nextAfter.role && nextBefore?.date === nextAfter.date) return;
  const target = users.find((u) => scopeIdForUser(u) === scopeId && normalizeApprovalRole(u.position || "") === normalizeApprovalRole(nextAfter.role));
  if (!target) {
    console.warn(`[mailer] "${nextAfter.role}" \uC9C1\uCC45\uC744 \uAC00\uC9C4 \uAC00\uC785\uC790\uB97C \uCC3E\uC9C0 \uBABB\uD574 \uACB0\uC7AC \uC694\uCCAD \uC774\uBA54\uC77C\uC744 \uBCF4\uB0B4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. (\uC9C1\uC6D0 \uAD00\uB9AC\uC5D0\uC11C \uC9C1\uCC45\uC744 \uC9C0\uC815\uD574\uC8FC\uC138\uC694)`);
    return;
  }
  await sendApprovalRequestEmail({
    toEmail: target.email,
    toName: target.name,
    approverRole: nextAfter.role,
    docTypeLabel,
    draftNumber,
    authorName
  });
}
function hasApprovalUpdateConflict(before, reqBody) {
  const expected = reqBody?.expectedUpdatedAt;
  if (!expected) return false;
  return !!before.updatedAt && before.updatedAt !== expected;
}
app.get("/api/approvals/advance", (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.advancePayments || []);
});
app.post("/api/approvals/advance", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const doc = req.body;
  if (!doc.id) doc.id = `ap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!doc.createdAt) doc.createdAt = (/* @__PURE__ */ new Date()).toISOString();
  doc.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (!doc.items) doc.items = [];
  if (!doc.status) doc.status = "pending";
  doc.items = await persistReceiptImagesInArray(scopeId, doc.items, `advance-${doc.id}`) || [];
  dbData.advancePayments = dbData.advancePayments || [];
  dbData.advancePayments.unshift(doc);
  const savedAdvance = await setScopedDoc(scopeId, "advancePayments", doc);
  if (!savedAdvance) {
    dbData.advancePayments = dbData.advancePayments.filter((d) => d.id !== doc.id);
    return res.status(500).json({ error: "\uAC00\uC9C0\uAE09\uAE08 \uC815\uC0B0\uC11C\uB97C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.status(201).json(doc);
  notifyNextApproverIfChanged(scopeId, "\uAC00\uC9C0\uAE09\uAE08 \uC815\uC0B0\uC11C", `${doc.periodStart} ~ ${doc.periodEnd}`, doc.author, doc.approvalLine, doc.status).catch((err) => console.error("[mailer] \uAC00\uC9C0\uAE09\uAE08 \uC815\uC0B0\uC11C \uACB0\uC7AC \uC54C\uB9BC \uCC98\uB9AC \uC2E4\uD328:", err));
});
app.put("/api/approvals/advance/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  dbData.advancePayments = dbData.advancePayments || [];
  const idx = dbData.advancePayments.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Advance payment settlement not found" });
  const before = dbData.advancePayments[idx];
  if (hasApprovalUpdateConflict(before, req.body)) {
    return res.status(409).json({ error: "\uB2E4\uB978 \uC0AC\uB78C\uC774 \uBC29\uAE08 \uC774 \uBB38\uC11C\uB97C \uBA3C\uC800 \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uD655\uC778\uD574\uC8FC\uC138\uC694.", current: before });
  }
  const updated = { ...before, ...req.body, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  updated.items = await persistReceiptImagesInArray(scopeId, updated.items, `advance-${updated.id}`) || [];
  dbData.advancePayments[idx] = updated;
  const savedAdvanceUpdate = await setScopedDoc(scopeId, "advancePayments", updated);
  if (!savedAdvanceUpdate) {
    dbData.advancePayments[idx] = before;
    return res.status(500).json({ error: "\uAC00\uC9C0\uAE09\uAE08 \uC815\uC0B0\uC11C \uC218\uC815 \uB0B4\uC6A9\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.json(updated);
  notifyNextApproverIfChanged(scopeId, "\uAC00\uC9C0\uAE09\uAE08 \uC815\uC0B0\uC11C", `${updated.periodStart} ~ ${updated.periodEnd}`, updated.author, updated.approvalLine, updated.status, before.approvalLine).catch((err) => console.error("[mailer] \uAC00\uC9C0\uAE09\uAE08 \uC815\uC0B0\uC11C \uACB0\uC7AC \uC54C\uB9BC \uCC98\uB9AC \uC2E4\uD328:", err));
});
app.delete("/api/approvals/advance/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  dbData.advancePayments = dbData.advancePayments || [];
  dbData.advancePayments = dbData.advancePayments.filter((d) => d.id !== req.params.id);
  await deleteScopedDoc(scopeId, "advancePayments", req.params.id);
  res.json({ success: true });
});
function findOrCreateAnnualLeaveStatusDoc(dbData, year) {
  dbData.adminDocs = dbData.adminDocs || [];
  let doc = dbData.adminDocs.find((d) => d.category === "annual_leave_status" && d.annualLeaveStatus?.year === year);
  if (!doc) {
    doc = {
      id: `adoc-al-${year}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      section: "management",
      category: "annual_leave_status",
      title: `${year}\uB144 \uC5F0\uCC28 \uD604\uD669`,
      date: `${year}-01-01`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      annualLeaveStatus: { year, people: [] }
    };
    dbData.adminDocs.unshift(doc);
  }
  if (!doc.annualLeaveStatus) doc.annualLeaveStatus = { year, people: [] };
  return doc;
}
function syncApprovedAnnualLeaveToStatus(dbData, leaveReq) {
  if (leaveReq.status !== "approved" || leaveReq.leaveCategory !== "annual") return null;
  const author = (leaveReq.author || "").trim();
  if (!author || !leaveReq.startDate) return null;
  const year = leaveReq.startDate.slice(0, 4);
  const doc = findOrCreateAnnualLeaveStatusDoc(dbData, year);
  const sourceKey = `leave_request:${leaveReq.id}`;
  let person = doc.annualLeaveStatus.people.find((p) => (p.name || "").trim() === author);
  if (!person) {
    person = {
      id: `alp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: author,
      hireDate: "",
      totalAnnualDays: leaveReq.totalAnnualDays || 0,
      leaveEntries: [],
      overtimeEntries: [],
      substituteEntries: []
    };
    doc.annualLeaveStatus.people.push(person);
  } else if (!person.totalAnnualDays && leaveReq.totalAnnualDays) {
    person.totalAnnualDays = leaveReq.totalAnnualDays;
  }
  const entryPatch = {
    startDate: leaveReq.startDate,
    endDate: leaveReq.endDate,
    days: leaveReq.days,
    note: leaveReq.reason || "",
    sourceKey,
    sourceLabel: "\uC804\uC790\uACB0\uC7AC \uD734\uAC00 \uC2E0\uCCAD\uC11C"
  };
  const existingIdx = person.leaveEntries.findIndex((e) => e.sourceKey === sourceKey);
  if (existingIdx === -1) {
    person.leaveEntries.push({ id: `ale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...entryPatch });
  } else {
    person.leaveEntries[existingIdx] = { ...person.leaveEntries[existingIdx], ...entryPatch };
  }
  return doc;
}
function removeSyncedAnnualLeaveEntry(dbData, leaveReqId) {
  dbData.adminDocs = dbData.adminDocs || [];
  const sourceKey = `leave_request:${leaveReqId}`;
  const affected = [];
  for (const doc of dbData.adminDocs) {
    if (doc.category !== "annual_leave_status" || !doc.annualLeaveStatus) continue;
    let changed = false;
    for (const person of doc.annualLeaveStatus.people) {
      const before = person.leaveEntries.length;
      person.leaveEntries = person.leaveEntries.filter((e) => e.sourceKey !== sourceKey);
      if (person.leaveEntries.length !== before) changed = true;
    }
    if (changed) affected.push(doc);
  }
  return affected;
}
app.get("/api/approvals/leave", (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.leaveRequests || []);
});
app.post("/api/approvals/leave", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const doc = req.body;
  if (!doc.id) doc.id = `lv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!doc.createdAt) doc.createdAt = (/* @__PURE__ */ new Date()).toISOString();
  doc.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (!doc.status) doc.status = "pending";
  dbData.leaveRequests = dbData.leaveRequests || [];
  dbData.leaveRequests.unshift(doc);
  const syncedAnnualLeaveDocOnCreate = syncApprovedAnnualLeaveToStatus(dbData, doc);
  await Promise.all([
    setScopedDoc(scopeId, "leaveRequests", doc),
    ...syncedAnnualLeaveDocOnCreate ? [setScopedDoc(scopeId, "adminDocs", syncedAnnualLeaveDocOnCreate)] : []
  ]);
  res.status(201).json(doc);
  notifyNextApproverIfChanged(scopeId, "\uD734\uAC00 \uC2E0\uCCAD\uC11C", doc.draftNumber, doc.author, doc.approvalLine, doc.status).catch((err) => console.error("[mailer] \uD734\uAC00 \uC2E0\uCCAD\uC11C \uACB0\uC7AC \uC54C\uB9BC \uCC98\uB9AC \uC2E4\uD328:", err));
});
app.put("/api/approvals/leave/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  dbData.leaveRequests = dbData.leaveRequests || [];
  const idx = dbData.leaveRequests.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Leave request not found" });
  const before = dbData.leaveRequests[idx];
  if (hasApprovalUpdateConflict(before, req.body)) {
    return res.status(409).json({ error: "\uB2E4\uB978 \uC0AC\uB78C\uC774 \uBC29\uAE08 \uC774 \uBB38\uC11C\uB97C \uBA3C\uC800 \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uD655\uC778\uD574\uC8FC\uC138\uC694.", current: before });
  }
  const updated = { ...before, ...req.body, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  dbData.leaveRequests[idx] = updated;
  const removedAnnualLeaveDocs = removeSyncedAnnualLeaveEntry(dbData, updated.id);
  const syncedAnnualLeaveDoc = syncApprovedAnnualLeaveToStatus(dbData, updated);
  const affectedAnnualLeaveDocs = /* @__PURE__ */ new Map();
  for (const d of removedAnnualLeaveDocs) affectedAnnualLeaveDocs.set(d.id, d);
  if (syncedAnnualLeaveDoc) affectedAnnualLeaveDocs.set(syncedAnnualLeaveDoc.id, syncedAnnualLeaveDoc);
  await Promise.all([
    setScopedDoc(scopeId, "leaveRequests", updated),
    ...Array.from(affectedAnnualLeaveDocs.values()).map((d) => setScopedDoc(scopeId, "adminDocs", d))
  ]);
  res.json(updated);
  notifyNextApproverIfChanged(scopeId, "\uD734\uAC00 \uC2E0\uCCAD\uC11C", updated.draftNumber, updated.author, updated.approvalLine, updated.status, before.approvalLine).catch((err) => console.error("[mailer] \uD734\uAC00 \uC2E0\uCCAD\uC11C \uACB0\uC7AC \uC54C\uB9BC \uCC98\uB9AC \uC2E4\uD328:", err));
});
app.delete("/api/approvals/leave/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  dbData.leaveRequests = dbData.leaveRequests || [];
  dbData.leaveRequests = dbData.leaveRequests.filter((d) => d.id !== req.params.id);
  await deleteScopedDoc(scopeId, "leaveRequests", req.params.id);
  res.json({ success: true });
});
app.get("/api/approvals/official", (req, res) => {
  const dbData = getScopedData(req);
  res.json(dbData.officialDocuments || []);
});
app.post("/api/approvals/official", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const doc = req.body;
  if (!doc.id) doc.id = `of-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!doc.createdAt) doc.createdAt = (/* @__PURE__ */ new Date()).toISOString();
  doc.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (!doc.bodyParagraphs) doc.bodyParagraphs = [];
  if (!doc.status) doc.status = "pending";
  dbData.officialDocuments = dbData.officialDocuments || [];
  dbData.officialDocuments.unshift(doc);
  await setScopedDoc(scopeId, "officialDocuments", doc);
  res.status(201).json(doc);
  notifyNextApproverIfChanged(scopeId, "\uACF5\uBB38\uC11C", doc.executionNumber, doc.author, doc.approvalLine, doc.status).catch((err) => console.error("[mailer] \uACF5\uBB38\uC11C \uACB0\uC7AC \uC54C\uB9BC \uCC98\uB9AC \uC2E4\uD328:", err));
});
app.put("/api/approvals/official/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  dbData.officialDocuments = dbData.officialDocuments || [];
  const idx = dbData.officialDocuments.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Official document not found" });
  const before = dbData.officialDocuments[idx];
  if (hasApprovalUpdateConflict(before, req.body)) {
    return res.status(409).json({ error: "\uB2E4\uB978 \uC0AC\uB78C\uC774 \uBC29\uAE08 \uC774 \uBB38\uC11C\uB97C \uBA3C\uC800 \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uD655\uC778\uD574\uC8FC\uC138\uC694.", current: before });
  }
  const updated = { ...before, ...req.body, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  dbData.officialDocuments[idx] = updated;
  await setScopedDoc(scopeId, "officialDocuments", updated);
  res.json(updated);
  notifyNextApproverIfChanged(scopeId, "\uACF5\uBB38\uC11C", updated.executionNumber, updated.author, updated.approvalLine, updated.status, before.approvalLine).catch((err) => console.error("[mailer] \uACF5\uBB38\uC11C \uACB0\uC7AC \uC54C\uB9BC \uCC98\uB9AC \uC2E4\uD328:", err));
});
app.delete("/api/approvals/official/:id", async (req, res) => {
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  dbData.officialDocuments = dbData.officialDocuments || [];
  dbData.officialDocuments = dbData.officialDocuments.filter((d) => d.id !== req.params.id);
  await deleteScopedDoc(scopeId, "officialDocuments", req.params.id);
  res.json({ success: true });
});
app.get("/api/approvals/pending-count", (req, res) => {
  const userId = req.headers["x-user-id"];
  const requester = userId ? users.find((u) => u.id === userId) : void 0;
  if (!requester) return res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const myRole = normalizeApprovalRole(requester.position || "");
  if (!myRole) return res.json({ count: 0, byType: { advance: 0, leave: 0, official: 0 } });
  const dbData = getScopedData(req);
  const countMine = (docs) => (docs || []).filter((d) => {
    if (d.status !== "pending") return false;
    const next = getNextPendingApprover(d.approvalLine || []);
    return !!next && normalizeApprovalRole(next.role) === myRole;
  }).length;
  const advance = countMine(dbData.advancePayments);
  const leave = countMine(dbData.leaveRequests);
  const official = countMine(dbData.officialDocuments);
  res.json({ count: advance + leave + official, byType: { advance, leave, official } });
});
function requireAdmin(req, res) {
  const userId = req.headers["x-user-id"];
  const requester = userId ? users.find((u) => u.id === userId) : void 0;
  if (!requester || requester.role !== "admin") {
    res.status(403).json({ error: "\uAD00\uB9AC\uC790\uB9CC \uC811\uADFC\uD560 \uC218 \uC788\uB294 \uD654\uBA74\uC785\uB2C8\uB2E4." });
    return null;
  }
  return requester;
}
app.get("/api/admin-docs", (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const dbData = getScopedData(req);
  res.json(dbData.adminDocs || []);
});
app.post("/api/admin-docs", async (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  const doc = req.body;
  if (!doc.id) doc.id = `adoc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!doc.createdAt) doc.createdAt = (/* @__PURE__ */ new Date()).toISOString();
  doc.createdByUserId = requester.id;
  doc.createdByUserName = requester.name;
  doc.attachments = await persistAttachmentsInArray(scopeId, doc.attachments, `admindoc-${doc.id}`);
  dbData.adminDocs = dbData.adminDocs || [];
  dbData.adminDocs.unshift(doc);
  const savedAdminDoc = await setScopedDoc(scopeId, "adminDocs", doc);
  if (!savedAdminDoc) {
    dbData.adminDocs = dbData.adminDocs.filter((d) => d.id !== doc.id);
    return res.status(500).json({ error: "\uBB38\uC11C\uB97C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.status(201).json(doc);
});
app.put("/api/admin-docs/:id", async (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  dbData.adminDocs = dbData.adminDocs || [];
  const idx = dbData.adminDocs.findIndex((d) => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Document not found" });
  const previousAdminDoc = dbData.adminDocs[idx];
  const updated = { ...dbData.adminDocs[idx], ...req.body, id: req.params.id };
  if (updated.attachments) {
    updated.attachments = await persistAttachmentsInArray(scopeId, updated.attachments, `admindoc-${updated.id}`);
  }
  dbData.adminDocs[idx] = updated;
  const savedAdminDocUpdate = await setScopedDoc(scopeId, "adminDocs", updated);
  if (!savedAdminDocUpdate) {
    dbData.adminDocs[idx] = previousAdminDoc;
    return res.status(500).json({ error: "\uBB38\uC11C \uC218\uC815 \uB0B4\uC6A9\uC744 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." });
  }
  res.json(updated);
});
app.delete("/api/admin-docs/:id", async (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const dbData = getScopedData(req);
  const scopeId = req.scopeId;
  dbData.adminDocs = dbData.adminDocs || [];
  dbData.adminDocs = dbData.adminDocs.filter((d) => d.id !== req.params.id);
  await deleteScopedDoc(scopeId, "adminDocs", req.params.id);
  res.json({ success: true });
});
app.get("/api/company-settings", async (req, res) => {
  const scopeId = req.scopeId;
  const list = await getScopedCollection(scopeId, "companySettings");
  res.json(list[0] || { id: "default", address: "", businessType: "", phone: "", fax: "", email: "", docPrefix: "KS" });
});
app.put("/api/company-settings", async (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const scopeId = req.scopeId;
  const existingList = await getScopedCollection(scopeId, "companySettings");
  const existing = existingList[0] || {};
  const record = {
    id: "default",
    address: req.body.address !== void 0 ? req.body.address : existing.address || "",
    businessType: req.body.businessType !== void 0 ? req.body.businessType : existing.businessType || "",
    phone: req.body.phone !== void 0 ? req.body.phone : existing.phone || "",
    fax: req.body.fax !== void 0 ? req.body.fax : existing.fax || "",
    email: req.body.email !== void 0 ? req.body.email : existing.email || "",
    docPrefix: req.body.docPrefix !== void 0 ? req.body.docPrefix : existing.docPrefix || "KS"
  };
  await setScopedDoc(scopeId, "companySettings", record);
  res.json(record);
});
app.get("/api/admin-docs/card-usage-candidates", (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const dbData = getScopedData(req);
  const candidates = [];
  for (const e of dbData.expenses || []) {
    if (e.payMethod !== "company_card") continue;
    candidates.push({
      sourceKey: `vehicle_expense:${e.id}`,
      sourceLabel: "\uCC28\uB7C9 \uBE44\uC6A9\uAD00\uB9AC",
      date: e.date,
      amount: e.amount,
      project: e.projectName,
      memo: e.merchantName || e.categoryCustom || e.category
    });
  }
  for (const m of dbData.maintenances || []) {
    if (m.payMethod !== "company_card") continue;
    candidates.push({
      sourceKey: `vehicle_maintenance:${m.id}`,
      sourceLabel: "\uCC28\uB7C9 \uC815\uBE44\uC77C\uC9C0",
      date: m.date,
      amount: m.cost,
      memo: `${m.title}${m.shopName ? ` (${m.shopName})` : ""}`
    });
  }
  for (const p of dbData.projects || []) {
    for (const f of p.followUps || []) {
      for (const ex of f.expenses || []) {
        if (ex.payMethod !== "company_card") continue;
        candidates.push({
          sourceKey: `project_expense:${ex.id}`,
          sourceLabel: "\uD504\uB85C\uC81D\uD2B8",
          date: f.date,
          amount: ex.amount,
          project: p.name,
          memo: ex.memo || ex.categoryCustom || ex.category
        });
      }
    }
  }
  for (const l of dbData.dailyLogs || []) {
    for (const ex of l.expenses || []) {
      if (ex.payMethod !== "company_card") continue;
      candidates.push({
        sourceKey: `worklog_daily_expense:${ex.id}`,
        sourceLabel: "\uC5C5\uBB34\uC77C\uC9C0(\uC77C\uC77C)",
        date: l.date,
        amount: ex.amount,
        memo: ex.memo || ex.categoryCustom || ex.category,
        personName: l.author
      });
    }
  }
  for (const l of dbData.weeklyLogs || []) {
    for (const ex of l.expenses || []) {
      if (ex.payMethod !== "company_card") continue;
      candidates.push({
        sourceKey: `worklog_weekly_expense:${ex.id}`,
        sourceLabel: "\uC5C5\uBB34\uC77C\uC9C0(\uC8FC\uAC04)",
        date: l.startDate,
        amount: ex.amount,
        memo: ex.memo || ex.categoryCustom || ex.category,
        personName: l.author
      });
    }
  }
  candidates.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  res.json(candidates);
});
app.get("/api/admin-docs/overseas-trip-card-candidates", (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const dbData = getScopedData(req);
  const candidates = [];
  const reconciledToCardUsage = /* @__PURE__ */ new Set();
  for (const doc of dbData.adminDocs || []) {
    if (doc.category !== "card_usage" || !doc.cardUsage) continue;
    for (const card of doc.cardUsage.cards || []) {
      for (const entry of card.entries || []) {
        candidates.push({
          sourceKey: `card_usage_entry:${doc.id}:${card.id}:${entry.id}`,
          sourceLabel: "\uCE74\uB4DC\uC0AC\uC6A9\uB0B4\uC5ED",
          date: entry.date,
          amount: Number(entry.amount) || 0,
          project: entry.project,
          memo: entry.note,
          personName: entry.user || card.holder
        });
        if (entry.sourceKey) reconciledToCardUsage.add(entry.sourceKey);
      }
    }
  }
  for (const l of dbData.dailyLogs || []) {
    for (const ex of l.expenses || []) {
      if (ex.payMethod !== "company_card") continue;
      const sourceKey = `worklog_daily_expense:${ex.id}`;
      if (reconciledToCardUsage.has(sourceKey)) continue;
      candidates.push({
        sourceKey,
        sourceLabel: "\uC5C5\uBB34\uC77C\uC9C0(\uC77C\uC77C)",
        date: l.date,
        amount: ex.amount,
        memo: ex.memo || ex.categoryCustom || ex.category,
        personName: l.author
      });
    }
  }
  for (const l of dbData.weeklyLogs || []) {
    for (const ex of l.expenses || []) {
      if (ex.payMethod !== "company_card") continue;
      const sourceKey = `worklog_weekly_expense:${ex.id}`;
      if (reconciledToCardUsage.has(sourceKey)) continue;
      candidates.push({
        sourceKey,
        sourceLabel: "\uC5C5\uBB34\uC77C\uC9C0(\uC8FC\uAC04)",
        date: l.startDate,
        amount: ex.amount,
        memo: ex.memo || ex.categoryCustom || ex.category,
        personName: l.author
      });
    }
  }
  candidates.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  res.json(candidates);
});
app.get("/api/admin-docs/advance-payment-candidates", (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const dbData = getScopedData(req);
  const candidates = [];
  for (const settlement of dbData.advancePayments || []) {
    if (settlement.status !== "approved") continue;
    for (const item of settlement.items || []) {
      candidates.push({
        sourceKey: `advance_settlement_item:${settlement.id}:${item.id}`,
        sourceLabel: "\uC804\uC790\uACB0\uC7AC \uAC00\uC9C0\uAE09\uAE08 \uC815\uC0B0\uC11C",
        date: item.date,
        amount: item.amount,
        personName: settlement.author,
        project: item.project,
        memo: item.description
      });
    }
  }
  candidates.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  res.json(candidates);
});
app.get("/api/admin-docs/annual-leave-candidates", (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const year = req.query.year;
  const dbData = getScopedData(req);
  const candidates = [];
  for (const doc of dbData.leaveRequests || []) {
    if (doc.status !== "approved") continue;
    if (doc.leaveCategory !== "annual") continue;
    if (year && (doc.startDate || "").slice(0, 4) !== year) continue;
    candidates.push({
      sourceKey: `leave_request:${doc.id}`,
      sourceLabel: "\uC804\uC790\uACB0\uC7AC \uD734\uAC00 \uC2E0\uCCAD\uC11C",
      author: doc.author,
      startDate: doc.startDate,
      endDate: doc.endDate,
      days: doc.days,
      note: doc.reason,
      totalAnnualDays: doc.totalAnnualDays
    });
  }
  candidates.sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  res.json(candidates);
});
app.get("/api/admin-docs/bank-withdrawal-candidates", (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const dbData = getScopedData(req);
  const candidates = [];
  for (const doc of dbData.adminDocs || []) {
    if (doc.category !== "bank_withdrawal" || !doc.bankLedger) continue;
    for (const acc of doc.bankLedger.accounts || []) {
      for (const entry of acc.entries || []) {
        candidates.push({
          sourceKey: `bank_withdrawal_entry:${doc.id}:${entry.id}`,
          sourceLabel: "\uD1B5\uC7A5 \uCD9C\uAE08 \uB0B4\uC5ED",
          date: entry.date,
          amount: entry.amount,
          memo: [entry.description, entry.note].filter(Boolean).join(" \xB7 ")
        });
      }
    }
  }
  candidates.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  res.json(candidates);
});
app.get("/api/admin-docs/bank-deposit-candidates", (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const dbData = getScopedData(req);
  const candidates = [];
  for (const doc of dbData.adminDocs || []) {
    if (doc.category !== "bank_deposit" || !doc.bankLedger) continue;
    for (const acc of doc.bankLedger.accounts || []) {
      for (const entry of acc.entries || []) {
        candidates.push({
          sourceKey: `bank_deposit_entry:${doc.id}:${entry.id}`,
          sourceLabel: "\uD1B5\uC7A5 \uC785\uAE08 \uB0B4\uC5ED",
          date: entry.date,
          amount: entry.amount,
          memo: [entry.description, entry.note].filter(Boolean).join(" \xB7 ")
        });
      }
    }
  }
  candidates.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  res.json(candidates);
});
app.get("/api/admin-docs/project-cost-candidates", (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const projectId = req.query.projectId;
  if (!projectId) return res.status(400).json({ error: "projectId\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
  const dbData = getScopedData(req);
  const candidates = [];
  for (const doc of dbData.adminDocs || []) {
    if (doc.category === "bank_withdrawal" && doc.bankLedger) {
      for (const acc of doc.bankLedger.accounts || []) {
        for (const entry of acc.entries || []) {
          if (entry.projectId !== projectId || !entry.costCategory) continue;
          candidates.push({
            sourceKey: `bank_withdrawal_entry:${doc.id}:${entry.id}`,
            sourceLabel: "\uD1B5\uC7A5 \uCD9C\uAE08 \uB0B4\uC5ED",
            date: entry.date,
            amount: Number(entry.amount) || 0,
            category: entry.costCategory,
            memo: [entry.description, entry.note].filter(Boolean).join(" \xB7 ")
          });
        }
      }
    }
    if (doc.category === "card_usage" && doc.cardUsage) {
      for (const card of doc.cardUsage.cards || []) {
        for (const entry of card.entries || []) {
          if (entry.projectId !== projectId || !entry.costCategory) continue;
          candidates.push({
            sourceKey: `card_usage_entry:${doc.id}:${card.id}:${entry.id}`,
            sourceLabel: "\uCE74\uB4DC\uC0AC\uC6A9\uB0B4\uC5ED",
            date: entry.date,
            amount: Number(entry.amount) || 0,
            category: entry.costCategory,
            memo: entry.note
          });
        }
      }
    }
  }
  candidates.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  res.json(candidates);
});
app.get("/api/projects/pnl", (req, res) => {
  const requester = requireAdmin(req, res);
  if (!requester) return;
  const dbData = getScopedData(req);
  const incomeByProject = {};
  const cardExpenseByProject = {};
  const incomeEntriesByProject = {};
  const cardExpenseEntriesByProject = {};
  let unmatchedIncome = 0;
  let unmatchedCardExpense = 0;
  for (const doc of dbData.adminDocs || []) {
    if (doc.category === "bank_deposit" && doc.bankLedger) {
      for (const acc of doc.bankLedger.accounts || []) {
        for (const entry of acc.entries || []) {
          const amt = Number(entry.amount) || 0;
          if (entry.projectId) {
            incomeByProject[entry.projectId] = (incomeByProject[entry.projectId] || 0) + amt;
            (incomeEntriesByProject[entry.projectId] = incomeEntriesByProject[entry.projectId] || []).push({
              date: entry.date,
              amount: amt,
              memo: [entry.description, entry.note].filter(Boolean).join(" \xB7 ")
            });
          } else {
            unmatchedIncome += amt;
          }
        }
      }
    }
    if (doc.category === "card_usage" && doc.cardUsage) {
      for (const card of doc.cardUsage.cards || []) {
        for (const entry of card.entries || []) {
          const amt = Number(entry.amount) || 0;
          if (entry.projectId) {
            cardExpenseByProject[entry.projectId] = (cardExpenseByProject[entry.projectId] || 0) + amt;
            (cardExpenseEntriesByProject[entry.projectId] = cardExpenseEntriesByProject[entry.projectId] || []).push({
              date: entry.date,
              amount: amt,
              memo: entry.note,
              cardName: card.cardName,
              holder: card.holder
            });
          } else {
            unmatchedCardExpense += amt;
          }
        }
      }
    }
  }
  const rows = (dbData.projects || []).map((p) => {
    const income = incomeByProject[p.id] || 0;
    const cardExpense = cardExpenseByProject[p.id] || 0;
    const followupExpense = (p.followUps || []).reduce((sum, fu) => sum + (fu.expenses || []).reduce((s, ex) => s + (Number(ex.amount) || 0), 0), 0);
    const totalExpense = cardExpense + followupExpense;
    const profit = income - totalExpense;
    const profitMargin = income > 0 ? profit / income * 100 : null;
    const incomeEntries = (incomeEntriesByProject[p.id] || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const cardExpenseEntries = (cardExpenseEntriesByProject[p.id] || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return {
      projectId: p.id,
      projectName: p.name,
      status: p.status,
      income,
      cardExpense,
      followupExpense,
      totalExpense,
      profit,
      profitMargin,
      incomeEntries,
      cardExpenseEntries
    };
  });
  res.json({ rows, unmatchedIncome, unmatchedCardExpense });
});
app.post("/api/worklogs/ai-polish", async (req, res) => {
  try {
    const { text, type, field } = req.body;
    if (!text) {
      return res.status(400).json({ error: "\uC815\uC81C\uD560 \uD14D\uC2A4\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const polishedText2 = lines.map((line, i) => {
        let cleaned = line.replace(/^[-*•\d.\s]+/, "").trim();
        if (!cleaned.endsWith(".") && !cleaned.endsWith("\uD568") && !cleaned.endsWith("\uC74C") && !cleaned.endsWith("\uC644\uB8CC") && !cleaned.endsWith("\uC218\uB9BD")) {
          cleaned += " \uC644\uB8CC";
        }
        return `${i + 1}. ${cleaned}`;
      }).join("\n");
      return res.json({ polishedText: polishedText2 });
    }
    const ai = new import_genai.GoogleGenAI({ apiKey });
    const prompt = `
\uB2F9\uC2E0\uC740 \uCD5C\uACE0\uC758 \uBE44\uC988\uB2C8\uC2A4 \uC218\uC11D \uBE44\uC11C \uBC0F \uC815\uBC00\uD55C \uC5C5\uBB34 \uBCF4\uACE0\uC11C \uC815\uB9AC \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4.
\uC0AC\uC6A9\uC790\uAC00 \uC791\uC131\uD55C \uAC00\uACF5\uB418\uC9C0 \uC54A\uC740 \uB7EC\uD504\uD55C(\uB610\uB294 \uC5B4\uD22C\uAC00 \uCE90\uC8FC\uC5BC\uD55C) \uC5C5\uBB34 \uC694\uC57D \uB0B4\uC6A9\uC744 \uC77D\uACE0, \uAC00\uACF5\uD558\uC5EC \uACA9\uC2DD \uC788\uACE0 \uAE54\uB054\uD558\uAC8C \uC815\uB3C8\uB41C \uAE30\uC5C5\uD615 \uC5C5\uBB34 \uBCF4\uACE0(\uAC1C\uC870\uC2DD) \uD1A4\uC564\uB9E4\uB108\uB85C \uAD50\uC815\uD574\uC8FC\uC138\uC694.

\uC791\uC131 \uB300\uC0C1 \uC77C\uC9C0 \uD0C0\uC785: ${type === "daily" ? "\uC77C\uC77C \uC5C5\uBB34\uC77C\uC9C0" : "\uC8FC\uAC04 \uC5C5\uBB34\uC77C\uC9C0"}
\uC791\uC131 \uB300\uC0C1 \uD56D\uBAA9: ${field === "tasksToday" || field === "achievementsThisWeek" ? "\uC2E4\uC2DC \uC131\uACFC \uBC0F \uB2EC\uC131 \uC0AC\uD56D" : "\uD5A5\uD6C4 \uACC4\uD68D \uBC0F \uC608\uC815 \uC0AC\uD56D"}

[\uC785\uB825 \uB370\uC774\uD130]:
"""
${text}
"""

[\uAD50\uC815 \uC6D0\uCE59]:
1. \uC5B4\uD718\uB97C \uACA9\uC2DD \uC788\uACE0 \uC804\uBB38\uC801\uC778 \uBE44\uC988\uB2C8\uC2A4 \uBA85\uC0AC\uD615/\uC885\uACB0\uD615 \uD1A4\uC73C\uB85C \uBCC0\uACBD\uD574\uC8FC\uC138\uC694 (\uC608: '~\uD568', '~\uD588\uC74C', '~\uC870\uC728 \uC644\uB8CC', '~\uACC4\uD68D \uC218\uB9BD', '~\uB300\uC751\uC548 \uB9C8\uB828').
2. \uB0B4\uC6A9\uC744 \uAD6C\uC870\uD654\uD558\uC5EC \uAC00\uB3C5\uC131 \uB192\uC740 \uAC1C\uC870\uC2DD \uBC88\uD638(1., 2., 3...)\uC640 \uBD88\uB81B \uAE30\uD638(-) \uC870\uD569\uC73C\uB85C \uC77C\uBAA9\uC694\uC5F0\uD558\uAC8C \uC791\uC131\uD574\uC8FC\uC138\uC694.
3. \uC6D0\uBCF8 \uB0B4\uC6A9\uC774 \uAC00\uC9C0\uACE0 \uC788\uB294 \uD575\uC2EC \uC758\uBBF8, \uAD6C\uCCB4\uC801\uC778 \uC218\uCE58, \uAE30\uAD00\uBA85, \uB2F4\uB2F9\uC790\uBA85 \uB4F1\uC744 \uC65C\uACE1\uD558\uAC70\uB098 \uC784\uC758\uB85C \uBE60\uB728\uB9AC\uC9C0 \uB9C8\uC138\uC694.
4. \uBD88\uD544\uC694\uD55C \uC0AC\uC871\uC774\uB098 \uBBF8\uC0AC\uC5EC\uAD6C, \uC778\uC0AC\uB9D0, \uB9C8\uD06C\uB2E4\uC6B4 \uBC31\uD2F1(\`\`\`json \uB610\uB294 \`\`\` \uB4F1)\uC740 \uBAA8\uB450 \uC81C\uAC70\uD558\uACE0, \uC624\uC9C1 "\uAD50\uC815 \uC815\uC81C\uB41C \uC644\uC131 \uBB38\uC7A5\uB4E4"\uB9CC \uBC18\uD658\uD574\uC57C \uD569\uB2C8\uB2E4.
`;
    const response = await generateContentWithRetry(ai, {
      model: PRIMARY_GEMINI_MODEL,
      contents: prompt
    });
    const polishedText = (response.text || "").trim();
    res.json({ polishedText });
  } catch (error) {
    console.error("AI Polish Error:", error);
    res.status(500).json({ error: toFriendlyAiErrorMessage(error) });
  }
});
app.post("/api/send-tax-package", async (req, res) => {
  try {
    const { year, month, accountantEmail } = req.body;
    if (!year || !month || !accountantEmail) {
      return res.status(400).json({ error: "\uC5F0\uB3C4, \uC6D4, \uC138\uBB34\uC0AC \uC774\uBA54\uC77C\uC744 \uBAA8\uB450 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
    }
    if (!isMailerConfigured) {
      return res.status(500).json({ error: "\uBA54\uC77C \uBC1C\uC1A1 \uC124\uC815(BREVO_API_KEY)\uC774 \uB418\uC5B4\uC788\uC9C0 \uC54A\uC544 \uBC1C\uC1A1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    }
    const dbData = getScopedData(req);
    const monthStr = String(month).padStart(2, "0");
    const prefix = `${year}-${monthStr}`;
    const rows = [];
    const payMethodKo = (p) => {
      if (p === "personal_card") return "\uAC1C\uC778\uCE74\uB4DC";
      if (p === "cash" || p === "cash_personal") return "\uD604\uAE08";
      if (p === "cash_company") return "\uD604\uAE08(\uD68C\uC0AC)";
      return "\uBC95\uC778\uCE74\uB4DC";
    };
    (dbData.expenses || []).forEach((e) => {
      if ((e.date || "").startsWith(prefix)) {
        rows.push({
          date: e.date,
          category: "\uCC28\uB7C9\uBE44\uC6A9",
          merchant: e.merchantName || e.categoryCustom || e.category || "",
          amount: e.amount || 0,
          payMethod: payMethodKo(e.payMethod),
          memo: e.memo || "",
          receiptImage: e.receiptImage
        });
      }
    });
    (dbData.maintenances || []).forEach((m) => {
      if ((m.date || "").startsWith(prefix)) {
        rows.push({
          date: m.date,
          category: "\uCC28\uB7C9\uC815\uBE44",
          merchant: m.shopName || m.title || "",
          amount: m.cost || 0,
          payMethod: payMethodKo(m.payMethod),
          memo: m.memo || "",
          receiptImage: m.receiptImage
        });
      }
    });
    (dbData.projects || []).forEach((p) => {
      (p.followUps || []).forEach((fu) => {
        if ((fu.date || "").startsWith(prefix)) {
          (fu.expenses || []).forEach((exp) => {
            rows.push({
              date: fu.date,
              category: "\uBBF8\uD305\uC9C0\uCD9C",
              merchant: exp.categoryCustom || exp.category || "",
              amount: exp.amount || 0,
              payMethod: payMethodKo(exp.payMethod),
              memo: [p.name, exp.memo].filter(Boolean).join(" \xB7 "),
              receiptImage: exp.receiptImage
            });
          });
        }
      });
    });
    (dbData.dailyLogs || []).forEach((log) => {
      if ((log.date || "").startsWith(prefix)) {
        (log.expenses || []).forEach((exp) => {
          rows.push({
            date: log.date,
            category: "\uC5C5\uBB34\uC77C\uC9C0 \uC9C0\uCD9C",
            merchant: exp.categoryCustom || exp.category || "",
            amount: exp.amount || 0,
            payMethod: payMethodKo(exp.payMethod),
            memo: exp.memo || "",
            receiptImage: exp.receiptImage
          });
        });
      }
    });
    (dbData.weeklyLogs || []).forEach((log) => {
      if ((log.startDate || "").startsWith(prefix)) {
        (log.expenses || []).forEach((exp) => {
          rows.push({
            date: log.startDate,
            category: "\uC5C5\uBB34\uC77C\uC9C0 \uC9C0\uCD9C(\uC8FC\uAC04)",
            merchant: exp.categoryCustom || exp.category || "",
            amount: exp.amount || 0,
            payMethod: payMethodKo(exp.payMethod),
            memo: exp.memo || "",
            receiptImage: exp.receiptImage
          });
        });
      }
    });
    rows.sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length === 0) {
      return res.status(400).json({ error: `${year}\uB144 ${monthStr}\uC6D4\uC5D0 \uD574\uB2F9\uD558\uB294 \uC9C0\uCD9C \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.` });
    }
    const wsData = [
      ["\uB0A0\uC9DC", "\uAD6C\uBD84", "\uC0C1\uD638/\uD56D\uBAA9", "\uAE08\uC561", "\uACB0\uC81C\uC218\uB2E8", "\uBA54\uBAA8"],
      ...rows.map((r) => [r.date, r.category, r.merchant, r.amount, r.payMethod, r.memo])
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${year}\uB144${monthStr}\uC6D4`);
    const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const archive = (0, import_archiver.default)("zip", { zlib: { level: 9 } });
    const chunks = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    const archiveFinished = new Promise((resolve, reject) => {
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", reject);
    });
    archive.append(excelBuffer, { name: `${year}\uB144_${monthStr}\uC6D4_\uC9C0\uCD9C\uB0B4\uC5ED.xlsx` });
    let receiptIndex = 1;
    for (const r of rows) {
      if (!r.receiptImage) continue;
      try {
        let imgBuffer = null;
        let ext = "jpg";
        if (r.receiptImage.startsWith("data:image/")) {
          const match = r.receiptImage.match(/^data:image\/(\w+);base64,(.+)$/);
          if (match) {
            ext = match[1] === "jpeg" ? "jpg" : match[1];
            imgBuffer = Buffer.from(match[2], "base64");
          }
        } else if (r.receiptImage.startsWith("http")) {
          const resp = await fetch(r.receiptImage);
          if (resp.ok) {
            imgBuffer = Buffer.from(await resp.arrayBuffer());
            const urlExt = r.receiptImage.split("?")[0].split(".").pop();
            if (urlExt && urlExt.length <= 4) ext = urlExt;
          }
        }
        if (imgBuffer) {
          const safeMerchant = (r.merchant || "").replace(/[^\w가-힣]/g, "").slice(0, 15);
          archive.append(imgBuffer, { name: `\uC601\uC218\uC99D/${receiptIndex}_${r.date}_${safeMerchant}.${ext}` });
          receiptIndex++;
        }
      } catch (err) {
        console.error("\uC601\uC218\uC99D \uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328(\uAC74\uB108\uB700):", err);
      }
    }
    archive.finalize();
    const zipBuffer = await archiveFinished;
    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    const companyName = dbData.myProfile?.company || "";
    await sendEmail({
      to: accountantEmail,
      subject: `[${year}\uB144 ${monthStr}\uC6D4] \uC9C0\uCD9C \uBC0F \uC601\uC218\uC99D \uC790\uB8CC${companyName ? " - " + companyName : ""}`,
      html: `
        <div style="font-family: 'Malgun Gothic', sans-serif; padding: 24px; color:#111;">
          <h2 style="margin-bottom:8px;">${year}\uB144 ${monthStr}\uC6D4 \uC9C0\uCD9C \uC790\uB8CC</h2>
          <p style="color:#555;">${companyName ? companyName + " \xB7 " : ""}\uCD1D ${rows.length}\uAC74, \uD569\uACC4 ${totalAmount.toLocaleString()}\uC6D0</p>
          <p style="color:#555; margin-top:12px;">\uCCA8\uBD80\uB41C \uC555\uCD95\uD30C\uC77C \uC548\uC5D0 <b>\uC5D1\uC140 \uC815\uB9AC\uD45C</b>\uC640 <b>\uC601\uC218\uC99D \uC0AC\uC9C4</b>\uC774 \uBAA8\uB450 \uB4E4\uC5B4\uC788\uC2B5\uB2C8\uB2E4.</p>
        </div>
      `,
      attachments: [
        { filename: `${year}\uB144_${monthStr}\uC6D4_\uC138\uBB34\uC790\uB8CC.zip`, content: zipBuffer }
      ]
    });
    res.json({ success: true, count: rows.length, totalAmount });
  } catch (err) {
    console.error("\uC138\uBB34 \uC790\uB8CC \uBC1C\uC1A1 \uC624\uB958:", err);
    res.status(500).json({ error: err.message || "\uC138\uBB34 \uC790\uB8CC \uBC1C\uC1A1 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." });
  }
});
async function startServer() {
  await bootstrapUsers();
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(import_express.default.static("dist"));
  }
  if (SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\u{1F680} \uBA85\uD568 \uAD00\uB9AC \uC11C\uBC84\uAC00 \uD3EC\uD2B8 ${PORT}\uBC88\uC5D0\uC11C \uC131\uACF5\uC801\uC73C\uB85C \uAC00\uB3D9\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
