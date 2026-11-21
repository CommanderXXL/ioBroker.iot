"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppNotifications = void 0;
const adapter_core_1 = require("@iobroker/adapter-core");
/**
 * Manages a set of states that the user has marked for app-notifications
 * via the standard ioBroker custom config (`obj.common.custom[<namespace>]`).
 *
 * Lifecycle:
 *  1. {@link init} – called once on adapter start. Loads every existing
 *     foreign object that has a non-empty `custom[namespace]`, builds a
 *     {@link ManagedRule} cache, primes the `lastValue` from the current
 *     state and subscribes to the foreign state.
 *  2. {@link handleObjectChange} – called from the adapter's object-change
 *     callback. Handles add / update / remove transitions in the cache and
 *     keeps the subscriptions in sync.
 *  3. {@link handleStateChange} – called from the adapter's state-change
 *     callback. Filters according to the user settings and dispatches a
 *     notification through {@link IotAdapter.sendMessageToApp}.
 *  4. {@link destroy} – called from `unload`. Unsubscribes everything.
 *
 * Wiring in `main.ts`:
 * ```ts
 * this.appNotifications = new AppNotifications(this);
 * await this.appNotifications.init();
 *
 * // in objectChange: void this.appNotifications.handleObjectChange(id, obj);
 * // in stateChange:  void this.appNotifications.handleStateChange(id, state);
 * // in unload:       await this.appNotifications.destroy();
 * ```
 */
class AppNotifications {
    adapter;
    rules = new Map();
    constructor(adapter, lang) {
        this.adapter = adapter;
        adapter_core_1.I18n.init(`${__dirname}/../`, lang).catch(e => this.adapter.log.error(e));
    }
    /** Returns the custom block for this instance, or `undefined` if not enabled. */
    extractSettings(obj) {
        if (!obj) {
            return undefined;
        }
        const custom = obj[this.adapter.namespace];
        if (!custom) {
            return undefined;
        }
        const settings = custom;
        return settings.enabled ? settings : undefined;
    }
    /** Derive the display title for an object from `common.name`. */
    resolveTitle(_settings, obj) {
        const name = obj.common?.name;
        if (typeof name === 'object' && name) {
            return name.en || name[Object.keys(name)[0]] || obj._id;
        }
        return name || obj._id;
    }
    /**
     * Initial scan executed once at adapter start. Locates every foreign
     * object that has at least one `custom` entry, filters those that belong
     * to this instance with `enabled === true`, primes the cache and
     * subscribes to the corresponding states.
     */
    async init() {
        let view;
        try {
            const result = await this.adapter.getObjectViewAsync('system', 'custom', {});
            view = result?.rows;
        }
        catch (e) {
            this.adapter.log.warn(`[appNotifications] Cannot enumerate custom objects: ${e}`);
            return;
        }
        if (!view?.length) {
            return;
        }
        for (const row of view) {
            const id = row.id;
            const custom = row.value;
            const settings = this.extractSettings(custom);
            if (!settings || !custom) {
                continue;
            }
            const obj = await this.adapter.getForeignObjectAsync(id);
            if (obj) {
                await this.registerRule(id, obj, settings);
            }
        }
        this.adapter.log.info(`[appNotifications] Tracking ${this.rules.size} state(s) for app notifications`);
    }
    /**
     * Reconcile the rule cache when an object changes:
     *  - object deleted (or custom block removed) → drop rule, unsubscribe
     *  - custom block added for this instance      → register rule, subscribe
     *  - existing rule was modified                → update settings in place
     */
    async handleObjectChange(id, obj) {
        const settings = this.extractSettings(obj?.common?.custom);
        const existing = this.rules.get(id);
        if (existing && (!obj || !settings)) {
            await this.unregisterRule(id);
            return;
        }
        if (!existing && obj && settings) {
            await this.registerRule(id, obj, settings);
            return;
        }
        if (existing && obj && settings) {
            // In-place update. lastValue stays valid; subscription is unchanged.
            existing.settings = settings;
            existing.title = this.resolveTitle(settings, obj);
            existing.type = obj.common?.type;
        }
    }
    async registerRule(id, obj, settings) {
        try {
            await this.adapter.subscribeForeignStatesAsync(id);
        }
        catch (e) {
            this.adapter.log.warn(`[appNotifications] Cannot subscribe to ${id}: ${e}`);
            return;
        }
        let lastValue;
        try {
            const state = await this.adapter.getForeignStateAsync(id);
            lastValue = state?.val ?? undefined;
        }
        catch {
            lastValue = undefined;
        }
        this.rules.set(id, {
            settings,
            title: this.resolveTitle(settings, obj),
            lastValue,
            lastNotifiedValue: undefined,
            type: obj.common?.type,
        });
        this.adapter.log.debug(`[appNotifications] Registered "${id}"`);
    }
    async unregisterRule(id) {
        if (!this.rules.has(id)) {
            return;
        }
        try {
            await this.adapter.unsubscribeForeignStatesAsync(id);
        }
        catch {
            // ignore — adapter may already be unloading
        }
        this.rules.delete(id);
        this.adapter.log.debug(`[appNotifications] Unregistered "${id}"`);
    }
    /**
     * Dispatch a single state change. Safe to call for every state the
     * adapter receives — unrelated ids are ignored cheaply.
     */
    async handleStateChange(id, state) {
        if (!state) {
            return;
        }
        const rule = this.rules.get(id);
        if (!rule) {
            return;
        }
        const oldValue = rule.lastValue;
        rule.lastValue = state.val;
        if (!this.shouldFire(rule, state, oldValue)) {
            return;
        }
        const payload = this.buildAppNotification(id, rule, state, oldValue);
        if (!payload) {
            return;
        }
        rule.lastNotifiedValue = state.val;
        try {
            await this.adapter.sendMessageToApp(JSON.stringify(payload));
            this.adapter.log.debug(`[appNotifications] Sent "${payload.message}" for ${id}=${String(state.val)}`);
        }
        catch (e) {
            this.adapter.log.error(`[appNotifications] Cannot send notification for "${id}": ${e}`);
        }
    }
    shouldFire(rule, state, oldValue) {
        const settings = rule.settings;
        if (settings.reportChanges && state.val === oldValue) {
            return false;
        }
        if (rule.type === 'boolean') {
            if (settings.onlyTrue && !state.val) {
                return false;
            }
            return !(settings.onlyFalse && state.val);
        }
        // Numeric debounce: suppress small jitter around the last notified level.
        const delta = settings.debounceDifference;
        if (delta !== undefined && delta > 0 && typeof state.val === 'number') {
            const last = rule.lastNotifiedValue;
            if (typeof last === 'number' && Math.abs(state.val - last) < delta) {
                return false;
            }
        }
        return true;
    }
    buildAppNotification(id, rule, state, oldValue) {
        const message = this.formatMessage(rule, state.val);
        if (!message) {
            return null;
        }
        const titleTemplate = rule.settings.title?.trim();
        const title = titleTemplate ? this.applyTemplate(titleTemplate, rule.title, state.val) : rule.title;
        const result = {
            title,
            message,
            payload: {
                id,
                value: state.val === null || state.val === undefined ? '' : String(state.val),
                oldValue: oldValue === null || oldValue === undefined ? '' : String(oldValue),
                ack: state.ack ? 'true' : 'false',
            },
        };
        if (rule.settings.priority === 'high' || rule.settings.priority === 'normal') {
            result.priority = rule.settings.priority;
        }
        if (rule.settings.expire !== undefined && rule.settings.expire > 0) {
            // Cloud accepts both `expire` (seconds) and `ttlSeconds`. Use `expire` to match the
            // app message documentation; sendMessageToApp() normalises both to `ttlSeconds`.
            result.expire = Math.min(rule.settings.expire, 3_600 * 48);
        }
        const rawDevices = rule.settings.devices?.trim();
        if (rawDevices) {
            const devs = rawDevices
                .split(',')
                .map(d => d.trim())
                .filter(d => d);
            if (devs.length) {
                // Visu App ≥ 1.4.0 expects payload.devices as a JSON-stringified array.
                result.payload.devices = JSON.stringify(devs);
            }
        }
        return result;
    }
    /**
     * Pick the message text:
     *  - boolean: use `onStatus` / `offStatus` (with `${name}` / `${value}` placeholders),
     *    otherwise fall back to `<name>: ON|OFF`.
     *  - other types: use `message` template (placeholders supported), otherwise fall back
     *    to `<name>: <value>`.
     */
    formatMessage(rule, value) {
        if (rule.type === 'boolean') {
            const truthy = !!value;
            const explicit = truthy ? rule.settings.onStatus : rule.settings.offStatus;
            if (explicit) {
                return this.applyTemplate(explicit, rule.title, value);
            }
            return `${rule.title}: ${truthy ? adapter_core_1.I18n.t('ON') : adapter_core_1.I18n.t('OFF')}`;
        }
        const template = rule.settings.message;
        if (template) {
            return this.applyTemplate(template, rule.title, value);
        }
        if (value === null || value === undefined) {
            return `${rule.title}: -`;
        }
        return `${rule.title}: ${String(value)}`;
    }
    /** Substitute `${name}` and `${value}` placeholders in a message template. */
    applyTemplate(template, name, value) {
        const v = value === null || value === undefined ? '' : String(value);
        return template.replace(/\$\{name\}/g, name).replace(/\$\{value\}/g, v);
    }
    /** Unsubscribe everything. Call from the adapter's `unload`. */
    async destroy() {
        const ids = [...this.rules.keys()];
        this.rules.clear();
        for (const id of ids) {
            try {
                await this.adapter.unsubscribeForeignStatesAsync(id);
            }
            catch {
                // ignore
            }
        }
    }
}
exports.AppNotifications = AppNotifications;
//# sourceMappingURL=appNotifications.js.map