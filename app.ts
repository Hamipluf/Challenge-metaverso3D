import express from 'express';
import http from 'http';
import socketIO from 'socket.io';
import Redis from 'ioredis';
import fs from 'fs';
interface roomConfig {
    id: number, width: number, height: number, depth: number, coinQuantity: number
}
// CLASS
class Coin {
    x: number;
    y: number;
    z: number;
    status: boolean;
    owner: null | string;

    constructor(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.status = true;
        this.owner = null;
    }
}

class Room {
    width: number;
    height: number;
    depth: number;
    createdAt: number;
    coins: Coin[];

    constructor(width: number, height: number, depth: number) {
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.createdAt = Date.now();
        this.coins = [];
    }

    generateCoins(quantity: number) {
        // Logic to generate coins within the room's dimensions
        for (let i = 0; i < quantity; i++) {
            const x = Math.random() * this.width;
            const y = Math.random() * this.height;
            const z = Math.random() * this.depth;
            this.coins.push(new Coin(x, y, z));
        }
    }
    reGenerateCoins(quantity: number) {
        this.coins = []; // Empty the list of existing coins
        this.generateCoins(quantity); // Generate new coins
    }
}

const app = express();
const server = http.createServer(app);
// @ts-ignore
const io = socketIO(server);
const redis = new Redis(); // Conexión to Redis

// Read file JSON
const configPath = './config.json';
const rawConfig = fs.readFileSync(configPath, 'utf-8');
const config = JSON.parse(rawConfig);

const rooms: { [roomId: string]: Room } = {};

config.rooms.forEach((roomConfig: roomConfig) => {
    const { id, width, height, depth, coinQuantity } = roomConfig;
    rooms[id] = new Room(width, height, depth);
    regenerateCoinsPeriodically(roomConfig); // Generate coints for first time and regenerate the coints each 1 hour
});



// Functions
function regenerateCoinsPeriodically(roomConfig: roomConfig) {
    const { id, coinQuantity } = roomConfig
    const room = rooms[id];
    room.reGenerateCoins(coinQuantity); // Regenerate coins based on amount in config.json
    redis.set(`coins:${id}`, JSON.stringify(room.coins)); // Update persistence on Redis

    setTimeout(() => regenerateCoinsPeriodically(roomConfig), 60 * 60 * 1000);
}


// ENDPOINTS
app.get('/api/room/:roomId/coins', async (req, res) => {
    const { roomId } = req.params;

    if (!rooms[roomId]) {
        res.status(404).json({ error: 'Room not found' });
        return;
    }

    res.status(200).json(rooms[roomId].coins.filter(coin => coin.status));
});
app.get('/api/room/:roomId/coins/count', async (req, res) => {
    const { roomId } = req.params;

    if (!rooms[roomId]) {
        res.status(404).json({ error: 'Room not found' });
        return;
    }

    const availableCoinsCount = rooms[roomId].coins.filter(coin => coin.status).length;
    res.status(200).json({ count: availableCoinsCount });
});

// SOCKET

io.on('connection', (socket: any) => {
    // Join room
    socket.on('joinRoom', async (roomId: string | number) => {
        socket.join(roomId);

        // Getting coint of this room 
        const storedCoins = await redis.get(`coins:${roomId}`);
        if (storedCoins) {
            rooms[roomId].coins = JSON.parse(storedCoins);
        }



        // Emit available coins to the connected client
        socket.emit('coinsAvailable', rooms[roomId].coins.filter(coin => coin.status));



    });
    // When cient get up a coint
    socket.on('collectCoin', (param: { coinIndex: number, roomId: number | string }) => {
        const { coinIndex, roomId } = param
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
