import { createClient, SupabaseClient } from "@supabase/supabase-js";
import path from "node:path";
import { mkdir, writeFile, readFile, unlink, access } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || "trustvault-documents";
const LOCAL_STORAGE_DIR = path.resolve(process.env.UPLOAD_DIR || "./uploads");

let supabase: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    console.log(`Supabase Storage initialized (Bucket: ${BUCKET_NAME})`);
  } catch (error) {
    console.error("Failed to initialize Supabase Storage client:", error);
    supabase = null;
  }
} else {
  console.log(`Using Local Storage directory: ${LOCAL_STORAGE_DIR}`);
}

export function isCloudStorage(): boolean {
  return supabase !== null;
}

export function getStorageMode(): "supabase" | "local" {
  return supabase !== null ? "supabase" : "local";
}

/**
 * Uploads a document buffer into private storage (Supabase or Local Disk).
 */
export async function uploadDocumentFile(
  storageKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  if (supabase) {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storageKey, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }
  } else {
    await mkdir(LOCAL_STORAGE_DIR, { recursive: true });
    const targetPath = path.join(LOCAL_STORAGE_DIR, storageKey);
    await writeFile(targetPath, buffer);
  }
}

/**
 * Retrieves a document from private storage as a readable stream or buffer.
 */
export async function getDocumentStream(
  storageKey: string
): Promise<{ stream: NodeJS.ReadableStream; size?: number }> {
  if (supabase) {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(storageKey);

    if (error || !data) {
      throw new Error(`Supabase Storage download failed: ${error?.message || "File not found"}`);
    }

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const readable = Readable.from(buffer);

    return {
      stream: readable,
      size: buffer.length,
    };
  } else {
    const targetPath = path.join(LOCAL_STORAGE_DIR, storageKey);
    await access(targetPath);
    const stream = createReadStream(targetPath);
    return { stream };
  }
}

/**
 * Deletes a document from private storage.
 */
export async function deleteDocumentFile(storageKey: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([storageKey]);

    if (error) {
      console.error(`Failed to delete Supabase storage object ${storageKey}:`, error.message);
    }
  } else {
    try {
      const targetPath = path.join(LOCAL_STORAGE_DIR, storageKey);
      await unlink(targetPath);
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        console.error(`Failed to delete local storage file ${storageKey}:`, err.message);
      }
    }
  }
}
