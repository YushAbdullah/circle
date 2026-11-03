import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { Request, Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";

/**
 * Where recordings and meeting records are kept.
 *  - Local folder (DATA_DIR) by default.
 *  - Supabase Storage when SUPABASE_URL and SUPABASE_SERVICE_KEY are set, so the
 *    server can run on free hosts whose disk is wiped on restart.
 */
export interface BlobStore {
  kind: "local" | "supabase";
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  /** Keys directly under a folder, e.g. list("meetings") -> ["meetings/a.json", ...] */
  list(folder: string): Promise<string[]>;
  remove(key: string): Promise<void>;
  /** Stream a stored file to an HTTP response, honouring Range requests (needed for seeking). */
  stream(key: string, contentType: string, req: Request, res: Response): Promise<void>;
}

class LocalStore implements BlobStore {
  kind = "local" as const;
  constructor(private root: string) {
    fs.mkdirSync(root, { recursive: true });
  }
  private file(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error("Invalid key");
    return p;
  }
  async put(key: string, data: Buffer) {
    await fs.promises.mkdir(path.dirname(this.file(key)), { recursive: true });
    await fs.promises.writeFile(this.file(key), data);
  }
  async get(key: string) {
    return fs.promises.readFile(this.file(key)).catch(() => null);
  }
  async list(folder: string) {
    const dir = this.file(folder);
    const names = await fs.promises.readdir(dir).catch(() => [] as string[]);
    return names.map((n) => `${folder}/${n}`);
  }
  async remove(key: string) {
    await fs.promises.unlink(this.file(key)).catch(() => {});
  }
  async stream(key: string, contentType: string, _req: Request, res: Response) {
    const p = this.file(key);
    if (!fs.existsSync(p)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.type(contentType).sendFile(p);
  }
}

class SupabaseStore implements BlobStore {
  kind = "supabase" as const;
  private client: SupabaseClient;
  private ready: Promise<void>;
  constructor(url: string, key: string, private bucket: string) {
    this.client = createClient(url, key, { auth: { persistSession: false } });
    this.ready = this.ensureBucket();
  }
  private async ensureBucket() {
    const { data } = await this.client.storage.getBucket(this.bucket);
    if (data) return;
    const { error } = await this.client.storage.createBucket(this.bucket, { public: false });
    if (error && !/already exists/i.test(error.message)) throw new Error(`Supabase bucket: ${error.message}`);
  }
  async put(key: string, data: Buffer, contentType: string) {
    await this.ready;
    const { error } = await this.client.storage.from(this.bucket).upload(key, data, { contentType, upsert: true });
    if (error) throw new Error(`Saving ${key} failed: ${error.message}`);
  }
  async get(key: string) {
    await this.ready;
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  async list(folder: string) {
    await this.ready;
    const keys: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await this.client.storage.from(this.bucket).list(folder, { limit: 1000, offset });
      if (error) throw new Error(`Listing ${folder} failed: ${error.message}`);
      keys.push(...data.filter((f) => f.id).map((f) => `${folder}/${f.name}`));
      if (data.length < 1000) return keys;
    }
  }
  async remove(key: string) {
    await this.ready;
    await this.client.storage.from(this.bucket).remove([key]);
  }
  async stream(key: string, contentType: string, req: Request, res: Response) {
    await this.ready;
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(key, 600);
    if (error || !data) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const upstream = await fetch(data.signedUrl, { headers: req.headers.range ? { Range: req.headers.range } : {} });
    res.status(upstream.status);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");
    for (const h of ["content-length", "content-range"]) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!upstream.body) return void res.end();
    Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream).pipe(res);
  }
}

export const store: BlobStore =
  config.supabaseUrl && config.supabaseServiceKey
    ? new SupabaseStore(config.supabaseUrl, config.supabaseServiceKey, config.supabaseBucket)
    : new LocalStore(config.dataDir);

export const uploadTmpDir = path.join(config.dataDir, "tmp");
fs.mkdirSync(uploadTmpDir, { recursive: true });
