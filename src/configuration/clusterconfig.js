export default class ClusterConfiguration {
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
