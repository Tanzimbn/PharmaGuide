// Runtime settings (M4) — the single source of user-configurable config:
// the BYO LLM API key, LLM endpoint/model, and the extraction-service URL.
//
// The key is a secret, so everything is stored in DEVICE SECURE STORAGE (iOS
// Keychain / Android Keystore via expo-secure-store), never in the JS bundle or
// git (mobile.md §8). Non-secret fields ride along in the same store for one
// consistent API. Values seed from config.ts DEFAULT_* on first run.
//
// Load order: App calls loadSettings() once at startup (before first render);
// llm.ts / extractClient.ts then read getSettings() synchronously from the
// in-memory cache at call time, so saving in the Settings tab takes effect
// immediately without a reload.
import * as SecureStore from "expo-secure-store";

import {
  DEFAULT_EXTRACT_BASE_URL,
  DEFAULT_LLM_API_KEY,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MODEL,
} from "./config";

export interface Settings {
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  extractBaseUrl: string;
}

// SecureStore keys must match [A-Za-z0-9._-]; map each field explicitly.
const STORE_KEYS: Record<keyof Settings, string> = {
  llmApiKey: "pg_llm_api_key",
  llmBaseUrl: "pg_llm_base_url",
  llmModel: "pg_llm_model",
  extractBaseUrl: "pg_extract_base_url",
};

const DEFAULTS: Settings = {
  llmApiKey: DEFAULT_LLM_API_KEY,
  llmBaseUrl: DEFAULT_LLM_BASE_URL,
  llmModel: DEFAULT_LLM_MODEL,
  extractBaseUrl: DEFAULT_EXTRACT_BASE_URL,
};

let _cache: Settings | null = null;

/** Read all settings from secure storage into the in-memory cache. Unset keys
 *  fall back to the DEFAULT_* seeds. Call once at app startup. */
export async function loadSettings(): Promise<Settings> {
  const entries = await Promise.all(
    (Object.keys(STORE_KEYS) as (keyof Settings)[]).map(async (field) => {
      const stored = await SecureStore.getItemAsync(STORE_KEYS[field]);
      return [field, stored ?? DEFAULTS[field]] as const;
    }),
  );
  _cache = Object.fromEntries(entries) as unknown as Settings;
  return _cache;
}

/** Synchronous read of the cached settings. Safe after loadSettings() resolves
 *  (the startup gate guarantees this for all UI/query call sites). */
export function getSettings(): Settings {
  if (!_cache) throw new Error("settings not loaded — call loadSettings() at startup");
  return _cache;
}

/** Persist changed fields to secure storage and update the cache. */
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = getSettings();
  for (const field of Object.keys(patch) as (keyof Settings)[]) {
    const value = patch[field];
    if (value === undefined) continue;
    await SecureStore.setItemAsync(STORE_KEYS[field], value);
  }
  _cache = { ...current, ...patch };
}

/** Delete the stored API key (and clear it from cache). */
export async function clearKey(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEYS.llmApiKey);
  if (_cache) _cache = { ..._cache, llmApiKey: "" };
}
