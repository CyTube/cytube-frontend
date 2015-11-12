export default class IOConfiguration {
    constructor(config) {
        this.config = Object.freeze(config);
    }

    getListenerConfig() {
        return this.config.listeners;
    }

    getProcessCount() {
        return this.config.processCount;
    }
}
