import express from 'express';
import logger from 'morgan';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';


import { Server } from 'socket.io';
import { createServer } from 'node:http';

dotenv.config()

const port = process.env.PORT ?? 3000

const app = express();
const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {}
});

const db = createClient({
    url: process.env.URL,
    authToken: process.env.DB_TOKEN
});

await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        username TEXT,
        date TEXT
    ) 
`);

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const partDay = (hours >= 12) ? 'pm' : 'am';
    
    return `${year}-${month}-${day} ${hours}:${minutes} ${partDay}`;
}

io.on('connection', async (socket) => {
    console.log('a user has connected!');

    socket.on('disconnect', () => {
        console.log('an user has disconnected!');
    });

    socket.on('chat message', async (msg) => {
        let result;
        const username = socket.handshake.auth.username ?? 'Anonymous';
        const date = formatDate(new Date());
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (content, username, date) VALUES (:msg, :username, :date)',
                args: { msg, username, date }
            })
        } catch(e) {
            console.log(e);
            return
        }

        io.emit('chat message', msg, result.lastInsertRowid.toString(), username, date);
    });

    if (!socket.recovered) {
        try {
            const results = await db.execute({
               sql: 'SELECT id, content, username, date FROM messages WHERE id > ?',
               args: [socket.handshake.auth.serverOffset ?? 0]
            });

            results.rows.forEach(row => {
                socket.emit('chat message', row.content, row.id.toString(), row.username, row.date);
            });
        } catch (e) {
            console.log(e);
        }
    }
});

app.use(logger('dev'));

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/index.html');
});


app.use('/resources', express.static('resources'));

server.listen(port, () => {
    console.log(`Server runing on port: ${port}`);
});