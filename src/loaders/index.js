import AuthService from "#services/authService.js";
import dependencyInjectorLoader from "#loaders/dependencyInjector.js";
import GameNetMgr from "#game/net/GameNetMgr.js";
import account from "#config/runtimeAccount.js";

export default async (username, password, serverId) => {
    await dependencyInjectorLoader();

    // Login first, and then fetch the wsAddress and token
    const authServiceInstance = new AuthService(account.deviceIdentity);
    const response = await authServiceInstance.Login(username, password, serverId);

    // Initialize WebSocket
    const { wsAddress, playerId, token } = response;
    GameNetMgr.inst.connectGameServer(wsAddress, playerId, token);
};

