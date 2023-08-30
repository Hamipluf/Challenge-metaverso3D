"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = __importDefault(require("socket.io"));
const ioredis_1 = __importDefault(require("ioredis"));
const fs_1 = __importDefault(require("fs"));
// CLASS
class Coin {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.status = true;
        this.owner = null;
    }
}
class Room {
    constructor(width, height, depth) {
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.createdAt = Date.now();
        this.coins = [];
    }
    generateCoins(quantity) {
        // Logic to generate coins within the room's dimensions
        for (let i = 0; i < quantity; i++) {
            const x = Math.random() * this.width;
            const y = Math.random() * this.height;
            const z = Math.random() * this.depth;
            this.coins.push(new Coin(x, y, z));
        }
    }
    reGenerateCoins(quantity) {
        this.coins = []; // Empty the list of existing coins
        this.generateCoins(quantity); // Generate new coins
    }
}
const redisUrl = 'rediss://red-cjn8ma6qdesc73fvnsi0:Q6lCaD2sgsWIbqTesSRfZT06bfsRyCA9@oregon-redis.render.com:6379';
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const server = http_1.default.createServer(app);
// @ts-ignore
const io = (0, socket_io_1.default)(server);
const redis = new ioredis_1.default(redisUrl); // Conexión to Redis
// Read file JSON
const configPath = './config.json';
const rawConfig = fs_1.default.readFileSync(configPath, 'utf-8');
const config = JSON.parse(rawConfig);
const rooms = {};
config.rooms.forEach((roomConfig) => {
    const { id, width, height, depth, coinQuantity } = roomConfig;
    rooms[id] = new Room(width, height, depth);
    regenerateCoinsPeriodically(roomConfig); // Generate coints for first time and regenerate the coints each 1 hour
});
// Functions
function regenerateCoinsPeriodically(roomConfig) {
    const { id, coinQuantity } = roomConfig;
    const room = rooms[id];
    room.reGenerateCoins(coinQuantity); // Regenerate coins based on amount in config.json
    redis.set(`coins:${id}`, JSON.stringify(room.coins)); // Update persistence on Redis
    setTimeout(() => regenerateCoinsPeriodically(roomConfig), 60 * 60 * 1000);
}
// ENDPOINTS
app.get('/api/room/:roomId/coins', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { roomId } = req.params;
    if (!rooms[roomId]) {
        res.status(404).json({ error: 'Room not found' });
        return;
    }
    res.status(200).json(rooms[roomId].coins.filter(coin => coin.status));
}));
app.get('/api/room/:roomId/coins/count', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { roomId } = req.params;
    if (!rooms[roomId]) {
        res.status(404).json({ error: 'Room not found' });
        return;
    }
    const availableCoinsCount = rooms[roomId].coins.filter(coin => coin.status).length;
    res.status(200).json({ count: availableCoinsCount });
}));
// SOCKET   
io.on('connection', (socket) => {
    // Join room
    socket.on('joinRoom', (roomId) => __awaiter(void 0, void 0, void 0, function* () {
        socket.join(roomId);
        // Getting coint of this room 
        const storedCoins = yield redis.get(`coins:${roomId}`);
        if (storedCoins) {
            rooms[roomId].coins = JSON.parse(storedCoins);
        }
        // Emit available coins to the connected client
        socket.emit('coinsAvailable', rooms[roomId].coins.filter(coin => coin.status));
    }));
    // When cient get up a coint
    socket.on('collectCoin', (param) => {
        const { coinIndex, roomId } = param;
        const room = rooms[roomId];
        const coin = room.coins[coinIndex];
        if (coin && coin.status) {
            coin.status = false;
            coin.owner = socket.id;
            // Udapte information of coint in redis
            redis.set(`coins:${roomId}`, JSON.stringify(room.coins));
            // Notify all the clients when the coint is get up
            io.to(roomId).emit('coinCollected', coinIndex);
        }
    });
});
server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
