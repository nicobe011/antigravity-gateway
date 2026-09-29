/**
 * Account Manager
 * Manages multiple Antigravity accounts with sticky selection,
 * automatic failover, and smart cooldown for rate-limited accounts.
 */

import { ACCOUNT_CONFIG_PATH } from '../constants.js';
import { loadAccounts, loadDefaultAccount, saveAccounts } from './storage.js';
import {
    isAllRateLimited as checkAllRateLimited,
    getAvailableAccounts as getAvailable,
    getInvalidAccounts as getInvalid,
    clearExpiredLimits as clearLimits,
    resetAllRateLimits as resetLimits,
    markRateLimited as markLimited,
    markInvalid as markAccountInvalid,
    getMinWaitTimeMs as getMinWait
} from './rate-limits.js';
import {
    getTokenForAccount as fetchToken,
    getProjectForAccount as fetchProject,
    clearProjectCache as clearProject,
    clearTokenCache as clearToken
} from './credentials.js';
import {
    pickNext as selectNext,
    getCurrentStickyAccount as getSticky,
    shouldWaitForCurrentAccount as shouldWait,
    pickStickyAccount as selectSticky
} from './selection.js';
import { fetchAvailableModels, retrieveUserQuotaSummary } from '../cloudcode/model-api.js';
import { parseAccountQuotaSummary } from '../utils/quota-formatter.js';
import { logger } from '../utils/logger.js';

export class AccountManager {
    #accounts = [];
    #currentIndex = 0;
    #configPath;
    #settings = {};
    #initialized = false;
    #pinnedEmail = null; // When set, gateway uses strictly this account

    // Per-account caches
    #tokenCache = new Map(); // email -> { token, extractedAt }
    #projectCache = new Map(); // email -> projectId

    constructor(configPath = ACCOUNT_CONFIG_PATH) {
        this.#configPath = configPath;
    }

    /**
     * Initialize the account manager by loading config
     */
    async initialize() {
        if (this.#initialized) return;

        const { accounts, settings, activeIndex } = await loadAccounts(this.#configPath);

        this.#accounts = accounts;
        this.#settings = settings;
        this.#currentIndex = activeIndex;

        // If config exists but has no accounts, fall back to Antigravity database
        if (this.#accounts.length === 0) {
            logger.warn('[AccountManager] No accounts in config. Falling back to Antigravity database');
            const { accounts: defaultAccounts, tokenCache } = loadDefaultAccount();
            this.#accounts = defaultAccounts;
            this.#tokenCache = tokenCache;
        }

        // Clear any expired rate limits
        this.clearExpiredLimits();

        this.#initialized = true;
    }

    /**
     * Get the number of accounts
     * @returns {number} Number of configured accounts
     */
    getAccountCount() {
        return this.#accounts.length;
    }

    /**
     * Check if all accounts are rate-limited
     * @param {string} [modelId] - Optional model ID
     * @returns {boolean} True if all accounts are rate-limited
     */
    isAllRateLimited(modelId = null) {
        return checkAllRateLimited(this.#accounts, modelId);
    }

    /**
     * Get list of available (non-rate-limited, non-invalid) accounts
     * @param {string} [modelId] - Optional model ID
     * @returns {Array<Object>} Array of available account objects
     */
    getAvailableAccounts(modelId = null) {
        return getAvailable(this.#accounts, modelId);
    }

    /**
     * Get list of invalid accounts
     * @returns {Array<Object>} Array of invalid account objects
     */
    getInvalidAccounts() {
        return getInvalid(this.#accounts);
    }

    /**
     * Clear expired rate limits
     * @returns {number} Number of rate limits cleared
     */
    clearExpiredLimits() {
        const cleared = clearLimits(this.#accounts);
        if (cleared > 0) {
            this.saveToDisk();
        }
        return cleared;
    }

    /**
     * Clear all rate limits to force a fresh check
     * (Optimistic retry strategy)
     * @returns {void}
     */
    resetAllRateLimits() {
        resetLimits(this.#accounts);
    }

    /**
     * Set a specific account to use strictly (pin account)
     * Pass null, '', or 'auto' to revert to intelligent multi-account mode
     *
     * @param {string|number|null} emailOrIndex - Account email, index, or null for auto
     * @returns {Object|null} The pinned account or null if auto mode
     */
    setPinnedAccount(emailOrIndex) {
        if (emailOrIndex === null || emailOrIndex === undefined || emailOrIndex === '' || emailOrIndex === 'auto') {
            this.#pinnedEmail = null;
            logger.info('[AccountManager] Modo Multi-Contas Inteligente ATIVADO (rotação e failover automáticos).');
            return null;
        }

        let target = null;
        if (typeof emailOrIndex === 'number') {
            target = this.#accounts[emailOrIndex] || null;
        } else if (typeof emailOrIndex === 'string') {
            const trimmed = emailOrIndex.trim().toLowerCase();
            target = this.#accounts.find(a => a.email.toLowerCase() === trimmed || a.email.toLowerCase().startsWith(trimmed)) || null;
        }

        if (target) {
            this.#pinnedEmail = target.email;
            logger.info(`[AccountManager] Conta fixada com sucesso: ${target.email}`);
            return target;
        } else {
            logger.warn(`[AccountManager] Conta não encontrada para fixação: ${emailOrIndex}. Mantendo modo atual.`);
            return this.getPinnedAccount();
        }
    }

    /**
     * Get the currently pinned account, if any
     * @returns {Object|null} Pinned account object or null if in multi-account mode
     */
    getPinnedAccount() {
        if (!this.#pinnedEmail) return null;
        return this.#accounts.find(a => a.email === this.#pinnedEmail) || null;
    }

    /**
     * Get the email of the currently pinned account
     * @returns {string|null} Pinned email or null
     */
    getPinnedAccountEmail() {
        return this.#pinnedEmail;
    }

    /**
     * Check if a specific account is currently pinned
     * @returns {boolean} True if pinned to a single account
     */
    isPinned() {
        return !!this.#pinnedEmail;
    }

    /**
     * Fetch real-time quota summary (5-Hour Limit and Weekly Limit) for an account
     *
     * @param {Object|string|null} [accountOrEmail] - Account object or email (defaults to active account)
     * @returns {Promise<Object>} Formatted quota summary
     */
    async getAccountQuotaSummary(accountOrEmail = null) {
        let account = null;
        if (!accountOrEmail) {
            account = this.getPinnedAccount() || this.getCurrentStickyAccount() || this.#accounts[0];
        } else if (typeof accountOrEmail === 'string') {
            account = this.#accounts.find(a => a.email === accountOrEmail) || null;
        } else {
            account = accountOrEmail;
        }

        if (!account) {
            return parseAccountQuotaSummary({});
        }

        try {
            const token = await this.getTokenForAccount(account);

            let quotaData = null;
            try {
                quotaData = await retrieveUserQuotaSummary(token);
            } catch (quotaErr) {
                logger.warn(`[AccountManager] retrieveUserQuotaSummary falhou para ${account.email}: ${quotaErr.message}`);
            }

            let modelsData = null;
            try {
                modelsData = await fetchAvailableModels(token);
            } catch (modelsErr) {
                logger.warn(`[AccountManager] fetchAvailableModels falhou para ${account.email}: ${modelsErr.message}`);
            }

            const summary = parseAccountQuotaSummary(quotaData, modelsData);
            summary.email = account.email;
            return summary;
        } catch (error) {
            logger.warn(`[AccountManager] Não foi possível obter cotas para ${account.email}: ${error.message}`);
            const fallbackSummary = parseAccountQuotaSummary({});
            fallbackSummary.email = account.email;
            fallbackSummary.error = error.message;
            return fallbackSummary;
        }
    }

    /**
     * Pick the next available account (fallback when current is unavailable).
     * Sets activeIndex to the selected account's index.
     * @param {string} [modelId] - Optional model ID
     * @returns {Object|null} The next available account or null if none available
     */
    pickNext(modelId = null) {
        if (this.#pinnedEmail) {
            const pinned = this.getPinnedAccount();
            if (pinned && !pinned.isInvalid) {
                pinned.lastUsed = Date.now();
                return pinned;
            }
        }

        const { account, newIndex } = selectNext(this.#accounts, this.#currentIndex, () => this.saveToDisk(), modelId);
        this.#currentIndex = newIndex;
        return account;
    }

    /**
     * Get the current account without advancing the index (sticky selection).
     * Used for cache continuity - sticks to the same account until rate-limited.
     * @param {string} [modelId] - Optional model ID
     * @returns {Object|null} The current account or null if unavailable/rate-limited
     */
    getCurrentStickyAccount(modelId = null) {
        if (this.#pinnedEmail) {
            const pinned = this.getPinnedAccount();
            if (pinned && !pinned.isInvalid) {
                pinned.lastUsed = Date.now();
                return pinned;
            }
        }

        const { account, newIndex } = getSticky(this.#accounts, this.#currentIndex, () => this.saveToDisk(), modelId);
        this.#currentIndex = newIndex;
        return account;
    }

    /**
     * Check if we should wait for the current account's rate limit to reset.
     * Used for sticky account selection - wait if rate limit is short (≤ threshold).
     * @param {string} [modelId] - Optional model ID
     * @returns {{shouldWait: boolean, waitMs: number, account: Object|null}}
     */
    shouldWaitForCurrentAccount(modelId = null) {
        if (this.#pinnedEmail) {
            const pinned = this.getPinnedAccount();
            if (!pinned || pinned.isInvalid) {
                return { shouldWait: false, waitMs: 0, account: null };
            }
            if (modelId && pinned.modelRateLimits && pinned.modelRateLimits[modelId]) {
                const limit = pinned.modelRateLimits[modelId];
                if (limit.isRateLimited && limit.resetTime) {
                    const waitMs = limit.resetTime - Date.now();
                    if (waitMs > 0) {
                        return { shouldWait: true, waitMs, account: pinned };
                    }
                }
            }
            return { shouldWait: false, waitMs: 0, account: pinned };
        }

        return shouldWait(this.#accounts, this.#currentIndex, modelId);
    }

    /**
     * Pick an account with sticky selection preference.
     * Prefers the current account for cache continuity, only switches when:
     * - Current account is rate-limited for > 2 minutes
     * - Current account is invalid
     * @param {string} [modelId] - Optional model ID
     * @returns {{account: Object|null, waitMs: number}} Account to use and optional wait time
     */
    pickStickyAccount(modelId = null) {
        if (this.#pinnedEmail) {
            const pinned = this.getPinnedAccount();
            if (pinned && !pinned.isInvalid) {
                // If model has active rate limit
                if (modelId && pinned.modelRateLimits && pinned.modelRateLimits[modelId]) {
                    const limit = pinned.modelRateLimits[modelId];
                    if (limit.isRateLimited && limit.resetTime) {
                        const waitMs = limit.resetTime - Date.now();
                        if (waitMs > 0) {
                            return { account: null, waitMs };
                        }
                    }
                }
                pinned.lastUsed = Date.now();
                return { account: pinned, waitMs: 0 };
            }
        }

        const { account, waitMs, newIndex } = selectSticky(this.#accounts, this.#currentIndex, () => this.saveToDisk(), modelId);
        this.#currentIndex = newIndex;
        return { account, waitMs };
    }

    /**
     * Mark an account as rate-limited
     * @param {string} email - Email of the account to mark
     * @param {number|null} resetMs - Time in ms until rate limit resets (optional)
     * @param {string} [modelId] - Optional model ID to mark specific limit
     */
    markRateLimited(email, resetMs = null, modelId = null) {
        markLimited(this.#accounts, email, resetMs, this.#settings, modelId);
        this.saveToDisk();
    }

    /**
     * Mark an account as invalid (credentials need re-authentication)
     * @param {string} email - Email of the account to mark
     * @param {string} reason - Reason for marking as invalid
     */
    markInvalid(email, reason = 'Unknown error') {
        markAccountInvalid(this.#accounts, email, reason);
        this.saveToDisk();
    }

    /**
     * Get the minimum wait time until any account becomes available
     * @param {string} [modelId] - Optional model ID
     * @returns {number} Wait time in milliseconds
     */
    getMinWaitTimeMs(modelId = null) {
        return getMinWait(this.#accounts, modelId);
    }

    /**
     * Get OAuth token for an account
     * @param {Object} account - Account object with email and credentials
     * @returns {Promise<string>} OAuth access token
     * @throws {Error} If token refresh fails
     */
    async getTokenForAccount(account) {
        return fetchToken(
            account,
            this.#tokenCache,
            (email, reason) => this.markInvalid(email, reason),
            () => this.saveToDisk()
        );
    }

    /**
     * Get project ID for an account
     * @param {Object} account - Account object
     * @param {string} token - OAuth access token
     * @returns {Promise<string>} Project ID
     */
    async getProjectForAccount(account, token) {
        return fetchProject(account, token, this.#projectCache);
    }

    /**
     * Clear project cache for an account (useful on auth errors)
     * @param {string|null} email - Email to clear cache for, or null to clear all
     */
    clearProjectCache(email = null) {
        clearProject(this.#projectCache, email);
    }

    /**
     * Clear token cache for an account (useful on auth errors)
     * @param {string|null} email - Email to clear cache for, or null to clear all
     */
    clearTokenCache(email = null) {
        clearToken(this.#tokenCache, email);
    }

    /**
     * Save current state to disk (async)
     * @returns {Promise<void>}
     */
    async saveToDisk() {
        await saveAccounts(this.#configPath, this.#accounts, this.#settings, this.#currentIndex);
    }

    /**
     * Get status object for logging/API
     * @returns {{accounts: Array, settings: Object}} Status object with accounts and settings
     */
    getStatus() {
        const available = this.getAvailableAccounts();
        const invalid = this.getInvalidAccounts();

        // Count accounts that have any active model-specific rate limits
        const rateLimited = this.#accounts.filter(a => {
            if (!a.modelRateLimits) return false;
            return Object.values(a.modelRateLimits).some(
                limit => limit.isRateLimited && limit.resetTime > Date.now()
            );
        });

        return {
            total: this.#accounts.length,
            available: available.length,
            rateLimited: rateLimited.length,
            invalid: invalid.length,
            summary: `${this.#accounts.length} total, ${available.length} available, ${rateLimited.length} rate-limited, ${invalid.length} invalid`,
            accounts: this.#accounts.map(a => ({
                email: a.email,
                source: a.source,
                modelRateLimits: a.modelRateLimits || {},
                isInvalid: a.isInvalid || false,
                invalidReason: a.invalidReason || null,
                lastUsed: a.lastUsed
            }))
        };
    }

    /**
     * Get settings
     * @returns {Object} Current settings object
     */
    getSettings() {
        return { ...this.#settings };
    }

    /**
     * Get all accounts (internal use for quota fetching)
     * Returns the full account objects including credentials
     * @returns {Array<Object>} Array of account objects
     */
    getAllAccounts() {
        return this.#accounts;
    }
}

export default AccountManager;
