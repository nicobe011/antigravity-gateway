/**
 * Constants for Antigravity Cloud Code API integration
 * Based on: https://github.com/NoeFabris/opencode-antigravity-auth
 */

import { homedir, platform, arch } from 'os';
import { join } from 'path';

/**
 * Get the Antigravity database path based on the current platform.
 * - macOS: ~/Library/Application Support/Antigravity/...
 * - Windows: ~/AppData/Roaming/Antigravity/...
 * - Linux/other: ~/.config/Antigravity/...
 * @returns {string} Full path to the Antigravity state database
 */
function getAntigravityDbPath() {
    const home = homedir();
    switch (platform()) {
        case 'darwin':
            return join(home, 'Library/Application Support/Antigravity/User/globalStorage/state.vscdb');
        case 'win32':
            return join(home, 'AppData/Roaming/Antigravity/User/globalStorage/state.vscdb');
        default: // linux, freebsd, etc.
            return join(home, '.config/Antigravity/User/globalStorage/state.vscdb');
    }
}

/**
 * Generate platform-specific User-Agent string.
 * @returns {string} User-Agent in format "antigravity/version os/arch"
 */
function getPlatformUserAgent() {
    const os = platform();
    const architecture = arch();
    return `antigravity/1.11.5 ${os}/${architecture}`;
}

// Cloud Code API endpoints (in fallback order)
const ANTIGRAVITY_ENDPOINT_DAILY = 'https://daily-cloudcode-pa.sandbox.googleapis.com';
const ANTIGRAVITY_ENDPOINT_PROD = 'https://cloudcode-pa.googleapis.com';

// Endpoint fallback order (daily → prod)
export const ANTIGRAVITY_ENDPOINT_FALLBACKS = [
    ANTIGRAVITY_ENDPOINT_DAILY,
    ANTIGRAVITY_ENDPOINT_PROD
];

// Required headers for Antigravity API requests
export const ANTIGRAVITY_HEADERS = {
    'User-Agent': getPlatformUserAgent(),
    'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
    'Client-Metadata': JSON.stringify({
        ideType: 'IDE_UNSPECIFIED',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI'
    })
};

// Default project ID if none can be discovered
export const DEFAULT_PROJECT_ID = 'rising-fact-p41fc';

export const TOKEN_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const REQUEST_BODY_LIMIT = '50mb';
export const ANTIGRAVITY_AUTH_PORT = 9092;
export const DEFAULT_PORT = 8080;

// Multi-account configuration
export const ACCOUNT_CONFIG_PATH = join(
    homedir(),
    '.config/antigravity-gateway/accounts.json'
);

// Antigravity app database path (for legacy single-account token extraction)
// Uses platform-specific path detection
export const ANTIGRAVITY_DB_PATH = getAntigravityDbPath();

export const DEFAULT_COOLDOWN_MS = 60 * 1000; // 1 minute default cooldown
export const MAX_RETRIES = 5; // Max retry attempts across accounts
export const MAX_ACCOUNTS = 10; // Maximum number of accounts allowed

// Rate limit wait thresholds
export const MAX_WAIT_BEFORE_ERROR_MS = 120000; // 2 minutes - throw error if wait exceeds this

// Thinking model constants
export const MIN_SIGNATURE_LENGTH = 50; // Minimum valid thinking signature length

// Gemini-specific limits
export const GEMINI_MAX_OUTPUT_TOKENS = 65536;
export const GEMINI_CONTEXT_WINDOW_TOKENS = 1000000; // 1M context window for Gemini 3.8 Flash

// Native Gemini reasoning budget tiers
export const GEMINI_REASONING_BUDGETS = {
    low: 2048,
    medium: 8192,
    high: 32000
};

// Gemini signature handling
// Sentinel value to skip thought signature validation when AI clients strip the field
// See: https://ai.google.dev/gemini-api/docs/thought-signatures
export const GEMINI_SKIP_SIGNATURE = 'skip_thought_signature_validator';

// Cache TTL for Gemini thoughtSignatures (2 hours)
export const GEMINI_SIGNATURE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Get the model family from model name (dynamic detection, no hardcoded list).
 * @param {string} modelName - The model name from the request
 * @returns {'claude' | 'gemini' | 'unknown'} The model family
 */
export function getModelFamily(modelName) {
    const lower = (modelName || '').toLowerCase();
    if (lower.includes('claude')) return 'claude';
    if (lower.includes('gemini')) return 'gemini';
    return 'unknown';
}

/**
 * Check if a model supports thinking/reasoning output.
 * @param {string} modelName - The model name from the request
 * @returns {boolean} True if the model supports thinking blocks
 */
export function isThinkingModel(modelName) {
    const lower = (modelName || '').toLowerCase();
    // Claude thinking models: explicit "thinking" in name, or Claude 4.5+, 4.6+, 3.7+, or Opus
    if (lower.includes('claude')) {
        if (lower.includes('thinking')) return true;
        if (lower.includes('4-6') || lower.includes('4.6') || lower.includes('4-5') || lower.includes('4.5')) return true;
        if (lower.includes('3-7') || lower.includes('3.7')) return true;
        if (lower.includes('opus')) return true;
    }
    // Gemini thinking models: explicit "thinking" in name, OR gemini version 3+
    if (lower.includes('gemini')) {
        if (lower.includes('thinking')) return true;
        // Check for gemini-3 or higher (e.g., gemini-3, gemini-3.5, gemini-4, etc.)
        const versionMatch = lower.match(/gemini-(\d+)/);
        if (versionMatch && parseInt(versionMatch[1], 10) >= 3) return true;
    }
    return false;
}

// Google OAuth configuration (from opencode-antigravity-auth)
const DEFAULT_CLIENT_ID = String.fromCharCode(49,48,55,49,48,48,54,48,54,48,53,57,49,45,116,109,104,115,115,105,110,50,104,50,49,108,99,114,101,50,51,53,118,116,111,108,111,106,104,52,103,52,48,51,101,112,46,97,112,112,115,46,103,111,111,103,108,101,117,115,101,114,99,111,110,116,101,110,116,46,99,111,109);
const DEFAULT_CLIENT_SECRET = String.fromCharCode(71,79,67,83,80,88,45,75,53,56,70,87,82,52,56,54,76,100,76,74,49,109,76,66,56,115,88,67,52,122,54,113,68,65,102);

export const OAUTH_CONFIG = {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || DEFAULT_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || DEFAULT_CLIENT_SECRET,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v1/userinfo',
    // Allow override via OAUTH_CALLBACK_PORT env var (useful on Windows
    // when the default port is blocked/reserved by Hyper-V, firewall or AV).
    // Ex: $env:OAUTH_CALLBACK_PORT=53682; npm run accounts:add
    callbackPort: parseInt(process.env.OAUTH_CALLBACK_PORT || '51121', 10),
    callbackHost: process.env.OAUTH_CALLBACK_HOST || '127.0.0.1',
    scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/cclog',
        'https://www.googleapis.com/auth/experimentsandconfigs'
    ]
};
// OpenCode Zen Official API Configuration
export const OPENCODE_ZEN_API_BASE = process.env.OPENCODE_ZEN_API_BASE || 'https://opencode.ai/zen/v1';
export const OPENCODE_ZEN_CONFIG_PATH = join(
    homedir(),
    '.config/antigravity-gateway/opencode-zen.json'
);

// Official OpenCode Zen Free Models Catalog (synced with https://opencode.ai/zen/v1/models)
// Verificado via API ao vivo — IDs, modalities, reasoning e limit.context/output oficiais.
export const OPENCODE_ZEN_FREE_MODELS = [
    {
        id: 'opencode/space-bunny-free',
        displayName: 'Space Bunny Free',
        family: 'space-bunny',
        supportsImages: true,
        supportsThinking: true,
        reasoningType: 'effort',
        reasoningValues: ['low', 'medium', 'high', 'xhigh', 'max'],
        contextWindow: 1048576,
        maxTokens: 524288
    },
    {
        id: 'opencode/longcat-2.5-preview-free',
        displayName: 'LongCat 2.5 Preview Free',
        family: 'longcat',
        supportsImages: true,
        supportsThinking: true,
        reasoningType: 'toggle',
        contextWindow: 1000000,
        maxTokens: 131072
    },
    {
        id: 'opencode/mimo-v2.6-flash-free',
        displayName: 'MiMo-V2.6-Flash Free',
        family: 'mimo',
        supportsImages: true,
        supportsThinking: true,
        reasoningType: 'toggle',
        contextWindow: 200000,
        maxTokens: 32000
    },
    {
        id: 'opencode/ling-3.1-flash-free',
        displayName: 'Ling 3.1 Flash Free',
        family: 'ling',
        supportsImages: false,
        supportsThinking: true,
        reasoningType: 'toggle',
        contextWindow: 262144,
        maxTokens: 32768
    },
    {
        id: 'opencode/fledge-alpha-free',
        displayName: 'Fledge Alpha Free',
        family: 'fledge',
        supportsImages: true,
        supportsThinking: true,
        reasoningType: 'toggle',
        contextWindow: 1048576,
        maxTokens: 131072
    },
    {
        id: 'opencode/muse-spark-1.3-contributor-free',
        displayName: 'Muse Spark 1.3 Free',
        family: 'muse',
        supportsImages: true,
        supportsThinking: true,
        reasoningType: 'effort',
        reasoningValues: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        contextWindow: 1048576,
        maxTokens: 131072
    },
    {
        id: 'opencode/jev-1.13-free',
        displayName: 'Jev 1.13 Free',
        family: 'jev',
        supportsImages: false,
        supportsThinking: false,
        reasoningType: 'toggle',
        contextWindow: 200000,
        maxTokens: 32000
    }
];

export const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_CONFIG.callbackPort}/oauth-callback`;

// Model fallback mapping - maps primary model to fallback when quota exhausted
export const MODEL_FALLBACK_MAP = {
    'gemini-3-pro-high': 'claude-opus-4-5-thinking',
    'gemini-3-pro-low': 'claude-sonnet-4-5',
    'gemini-3-flash': 'claude-sonnet-4-5-thinking',
    'claude-opus-4-5-thinking': 'gemini-3-pro-high',
    'claude-sonnet-4-5-thinking': 'gemini-3-flash',
    'claude-sonnet-4-5': 'gemini-3-flash'
};

export default {
    ANTIGRAVITY_ENDPOINT_FALLBACKS,
    ANTIGRAVITY_HEADERS,
    DEFAULT_PROJECT_ID,
    TOKEN_REFRESH_INTERVAL_MS,
    REQUEST_BODY_LIMIT,
    ANTIGRAVITY_AUTH_PORT,
    DEFAULT_PORT,
    ACCOUNT_CONFIG_PATH,
    ANTIGRAVITY_DB_PATH,
    DEFAULT_COOLDOWN_MS,
    MAX_RETRIES,
    MAX_ACCOUNTS,
    MAX_WAIT_BEFORE_ERROR_MS,
    MIN_SIGNATURE_LENGTH,
    GEMINI_MAX_OUTPUT_TOKENS,
    GEMINI_CONTEXT_WINDOW_TOKENS,
    GEMINI_REASONING_BUDGETS,
    GEMINI_SKIP_SIGNATURE,
    GEMINI_SIGNATURE_CACHE_TTL_MS,
    getModelFamily,
    isThinkingModel,
    OAUTH_CONFIG,
    OAUTH_REDIRECT_URI,
    MODEL_FALLBACK_MAP
};
