/**
 * Account Manager
 * Manages Antigravity accounts.
 * Multi-account selection is manual on startup: the selected account stays fixed.
 * No automatic account switching during runtime.
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
import { fetchAvailableModels, retrieveUserQuotaSummary } from '../cloudcode/model-api.js';
import { parseAccountQuotaSummary } from '../utils/quota-formatter.js';
import { logger } from '../utils/logger.js';

export class AccountManager {
    #accounts = [];
    #currentIndex = 0;
    #configPath;
    #settings = {};
    #initialized = false;
    #selectedAccount = null;

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

        // Set default active account to activeIndex
        if (this.#accounts.length > 0) {
            const idx = Math.min(this.#currentIndex, this.#accounts.length - 1);
            this.#selectedAccount = this.#accounts[idx];
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
        if (this.#selectedAccount) {
            if (modelId && this.#selectedAccount.modelRateLimits && this.#selectedAccount.modelRateLimits[modelId]) {
                const limit = this.#selectedAccount.modelRateLimits[modelId];
                return limit.isRateLimited && limit.resetTime > Date.now();
            }
            return false;
        }
        return checkAllRateLimited(this.#accounts, modelId);
    }

    /**
     * Get list of available (non-rate-limited, non-invalid) accounts
     * @param {string} [modelId] - Optional model ID
     * @returns {Array<Object>} Array of available account objects
     */
    getAvailableAccounts(modelId = null) {
        if (this.#selectedAccount) {
            return [this.#selectedAccount];
        }
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
     * @returns {void}
     */
    resetAllRateLimits() {
        resetLimits(this.#accounts);
    }

    /**
     * Manually select an account to use for the session.
     * Stored in memory and activeIndex saved to disk.
     * NO automatic switching during runtime.
     *
     * @param {string|number|null} emailOrIndex - Account email or index
     * @returns {Object|null} The selected account
     */
    selectAccount(emailOrIndex) {
        let target = null;
        let newIndex = 0;

        if (typeof emailOrIndex === 'number') {
            newIndex = Math.max(0, Math.min(emailOrIndex, this.#accounts.length - 1));
            target = this.#accounts[newIndex] || null;
        } else if (typeof emailOrIndex === 'string') {
            const trimmed = emailOrIndex.trim().toLowerCase();
            const idx = this.#accounts.findIndex(a =>
                a.email.toLowerCase() === trimmed || a.email.toLowerCase().startsWith(trimmed)
            );
            if (idx !== -1) {
                newIndex = idx;
                target = this.#accounts[idx];
            }
        }

        if (target) {
            this.#selectedAccount = target;
            this.#currentIndex = newIndex;
            this.saveToDisk();
            logger.info(`[AccountManager] Conta ativa selecionada: ${target.email}`);
            return target;
        }

        if (this.#accounts.length > 0) {
            this.#selectedAccount = this.#accounts[0];
            this.#currentIndex = 0;
            return this.#selectedAccount;
        }

        return null;
    }

    /**
     * Set pinned account (alias for selectAccount for compatibility)
     */
    setPinnedAccount(emailOrIndex) {
        return this.selectAccount(emailOrIndex);
    }

    /**
     * Get the currently active selected account
     * @returns {Object|null}
     */
    getSelectedAccount() {
        if (!this.#selectedAccount && this.#accounts.length > 0) {
            const idx = Math.min(this.#currentIndex, this.#accounts.length - 1);
            this.#selectedAccount = this.#accounts[idx];
        }
        return this.#selectedAccount;
    }

    getPinnedAccount() {
        return this.getSelectedAccount();
    }

    getPinnedAccountEmail() {
        return this.getSelectedAccount()?.email || null;
    }

    isPinned() {
        return true; // Always manual/fixed to the chosen account
    }

    /**
     * Fetch real-time quota summary (5-Hour Limit and Weekly Limit) for an account
     */
    async getAccountQuotaSummary(accountOrEmail = null) {
        let account = null;
        if (!accountOrEmail) {
            account = this.getSelectedAccount() || this.#accounts[0];
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
     * Get the active account for request execution.
     * Pure zero-overhead: returns the chosen account directly without rotation.
     *
     * @param {string} [modelId] - Optional model ID
     * @returns {Object|null}
     */
    pickNext(modelId = null) {
        const acc = this.getSelectedAccount();
        if (acc) {
            acc.lastUsed = Date.now();
            return acc;
        }
        return null;
    }

    /**
     * Get the active account without advancing index
     * @param {string} [modelId] - Optional model ID
     * @returns {Object|null}
     */
    getCurrentStickyAccount(modelId = null) {
        const acc = this.getSelectedAccount();
        if (acc) {
            acc.lastUsed = Date.now();
            return acc;
        }
        return null;
    }

    /**
     * Check if we should wait for rate limit to reset on the active account
     * @param {string} [modelId] - Optional model ID
     * @returns {{shouldWait: boolean, waitMs: number, account: Object|null}}
     */
    shouldWaitForCurrentAccount(modelId = null) {
        const acc = this.getSelectedAccount();
        if (!acc || acc.isInvalid) {
            return { shouldWait: false, waitMs: 0, account: null };
        }

        if (modelId && acc.modelRateLimits && acc.modelRateLimits[modelId]) {
            const limit = acc.modelRateLimits[modelId];
            if (limit.isRateLimited && limit.resetTime) {
                const waitMs = limit.resetTime - Date.now();
                if (waitMs > 0) {
                    return { shouldWait: true, waitMs, account: acc };
                }
            }
        }

        return { shouldWait: false, waitMs: 0, account: acc };
    }

    /**
     * Pick account for sticky request.
     * Zero-overhead: always uses the user-selected account directly.
     *
     * @param {string} [modelId] - Optional model ID
     * @returns {{account: Object|null, waitMs: number}}
     */
    pickStickyAccount(modelId = null) {
        const acc = this.getSelectedAccount();
        if (acc && !acc.isInvalid) {
            if (modelId && acc.modelRateLimits && acc.modelRateLimits[modelId]) {
                const limit = acc.modelRateLimits[modelId];
                if (limit.isRateLimited && limit.resetTime) {
                    const waitMs = limit.resetTime - Date.now();
                    if (waitMs > 0) {
                        return { account: null, waitMs };
                    }
                }
            }
            acc.lastUsed = Date.now();
            return { account: acc, waitMs: 0 };
        }

        return { account: acc, waitMs: 0 };
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
     * Get the minimum wait time until account becomes available
     * @param {string} [modelId] - Optional model ID
     * @returns {number} Wait time in milliseconds
     */
    getMinWaitTimeMs(modelId = null) {
        const acc = this.getSelectedAccount();
        if (acc && modelId && acc.modelRateLimits && acc.modelRateLimits[modelId]) {
            const limit = acc.modelRateLimits[modelId];
            if (limit.isRateLimited && limit.resetTime) {
                return Math.max(0, limit.resetTime - Date.now());
            }
        }
        return getMinWait(this.#accounts, modelId);
    }

    /**
     * Get OAuth token for an account
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
     */
    async getProjectForAccount(account, token) {
        return fetchProject(account, token, this.#projectCache);
    }

    /**
     * Clear project cache for an account
     */
    clearProjectCache(email = null) {
        clearProject(this.#projectCache, email);
    }

    /**
     * Clear token cache for an account
     */
    clearTokenCache(email = null) {
        clearToken(this.#tokenCache, email);
    }

    /**
     * Save current state to disk
     */
    async saveToDisk() {
        await saveAccounts(this.#configPath, this.#accounts, this.#settings, this.#currentIndex);
    }

    /**
     * Get status object for logging/API
     */
    getStatus() {
        const active = this.getSelectedAccount();
        const available = active ? [active] : [];
        const invalid = this.getInvalidAccounts();

        return {
            total: this.#accounts.length,
            available: available.length,
            rateLimited: 0,
            invalid: invalid.length,
            activeEmail: active?.email || null,
            summary: `Conta ativa: ${active?.email || 'Nenhuma'} (${this.#accounts.length} total)`,
            accounts: this.#accounts.map(a => ({
                email: a.email,
                source: a.source,
                isActive: a.email === active?.email,
                modelRateLimits: a.modelRateLimits || {},
                isInvalid: a.isInvalid || false,
                invalidReason: a.invalidReason || null,
                lastUsed: a.lastUsed
            }))
        };
    }

    /**
     * Get settings
     */
    getSettings() {
        return { ...this.#settings };
    }

    /**
     * Get all accounts
     */
    getAllAccounts() {
        return this.#accounts;
    }
}

export default AccountManager;
