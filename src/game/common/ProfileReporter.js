export function reportProfile(profile, send = process.connected && typeof process.send === 'function' ? process.send.bind(process) : null) {
    if (!send || !profile || typeof profile !== 'object') return false;
    send({ type: 'profile-update', profile });
    return true;
}
