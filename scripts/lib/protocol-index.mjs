export function* iterateProtocolIndex(index) {
    const isMapping = value => typeof value === 'object' && value !== null && !Array.isArray(value);

    if (Array.isArray(index)) {
        for (let id = 0; id < index.length; id++) {
            const mapping = index[id];
            if (mapping == null) continue;
            if (!isMapping(mapping)) throw new TypeError(`mapping for protocol ${id} must be an object`);
            yield [String(id), mapping];
        }
        return;
    }

    if (typeof index !== 'object' || index === null) {
        throw new TypeError('protocol index must be an array or object');
    }

    for (const id in index) {
        if (!Object.hasOwn(index, id)) continue;
        if (!/^\d+$/.test(id)) throw new TypeError(`protocol index key ${id} must be a numeric protocol ID`);
        const mapping = index[id];
        if (!isMapping(mapping)) throw new TypeError(`mapping for protocol ${id} must be an object`);
        yield [id, mapping];
    }
}
