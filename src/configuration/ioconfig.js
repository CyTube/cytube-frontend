export default class IOConfiguration {
    constructor(config) {
        this.config = config;
    }

    getListenerConfig() {
        return this.config.listeners;
    }

    getProcessCount() {
        return this.config.processCount;
    }
}
